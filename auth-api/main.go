package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
    "context"
    "strconv"

	"github.com/Azure/azure-sdk-for-go/sdk/data/azappconfig" // Import SDK
	jwt "github.com/dgrijalva/jwt-go"
	"github.com/labstack/echo"
	"github.com/labstack/echo/middleware"
	gommonlog "github.com/labstack/gommon/log"
)

var (
	// ErrHttpGenericMessage that is returned in general case, details should be logged in such case
	ErrHttpGenericMessage = echo.NewHTTPError(http.StatusInternalServerError, "something went wrong, please try again later")

	// ErrWrongCredentials indicates that login attempt failed because of incorrect login or password
	ErrWrongCredentials = echo.NewHTTPError(http.StatusUnauthorized, "username or password is invalid")

	// Default values
    defaultJwtSecret     = "myfancysecret"
    defaultAuthApiPort   = 8000
    defaultUserApiAddr   = "" // Or a sensible default like "http://users-api:8083" if running in Docker network
    defaultZipkinUrl     = ""

    // Variables to hold loaded config
    jwtSecret     = defaultJwtSecret
    authApiPort   = defaultAuthApiPort
    userAPIAddress = defaultUserApiAddr
    zipkinURL     = defaultZipkinUrl
)

func loadConfig(ctx context.Context, logger echo.Logger) {
    connectionString := os.GetEnv("APPCONFIG_CONNECTION_STRING")
    if connectionString == "" {
        logger.Warn("APPCONFIG_CONNECTION_STRING is not set. Using default values.")
        return
    }

    client, err := azappconfig.NewClientFromConnectionString(connectionString, nil)
    if err != nil {
        logger.Errorf("Failed to create App Configuration client: %v. Using default values.", err)
        return
    }
    logger.Info("Fetching configuration from Azure App Configuration...")

    // Fetch JWT Secret
    respSecret, err := client.GetSetting(ctx, "jwt.secret", nil)
    if err == nil && respSecret.Value != nil {
        jwtSecret = *respSecret.Value
        logger.Info("Loaded jwt.secret")
    } else if err != nil {
        logger.Errorf("Failed to GetSetting jwt.secret: %v", err)
    }

    // Fetch Auth API Port
    respPort, err := client.GetSetting(ctx, "auth-api.port", nil)
    if err == nil && respPort.Value != nil {
        if port, convErr := strconv.Atoi(*respPort.Value); convErr == nil {
            authApiPort = port
            logger.Infof("Loaded auth-api.port: %d", authApiPort)
        } else {
            logger.Errorf("Failed to convert auth-api.port '%s' to int: %v", *respPort.Value, convErr)
        }
    } else if err != nil {
        logger.Errorf("Failed to GetSetting auth-api.port: %v", err)
    }

    // Fetch Users API Address (Assuming you add this key to App Config)
    // Example key name: "users-api.address"
    respUserAddr, err := client.GetSetting(ctx, "users-api.address", nil)
    if err == nil && respUserAddr.Value != nil {
        userAPIAddress = *respUserAddr.Value
        logger.Infof("Loaded users-api.address: %s", userAPIAddress)
    } else if err != nil {
        logger.Errorf("Failed to GetSetting users-api.address: %v", err)
    }

    // Fetch Zipkin URL
    respZipkin, err := client.GetSetting(ctx, "zipkin.url", nil)
    if err == nil && respZipkin.Value != nil {
        zipkinURL = *respZipkin.Value
        logger.Infof("Loaded zipkin.url: %s", zipkinURL)
    } else if err != nil {
        logger.Errorf("Failed to GetSetting zipkin.url: %v", err)
    }

    logger.Info("Configuration loading finished.")
}

func main() {
    e := echo.New()
    e.Logger.SetLevel(gommonlog.INFO)

    // Load configuration before initializing components
    loadConfig(context.Background(), e.Logger) // Use Background context for startup config

    // Use loaded config values
    hostport := ":" + strconv.Itoa(authApiPort)
    // userAPIAddress := os.GetSettingenv("USERS_API_ADDRESS") // Replaced by loaded config

    // envJwtSecret := os.GetSettingenv("JWT_SECRET") // Replaced by loaded config
    // if len(envJwtSecret) != 0 {
    // 	jwtSecret = envJwtSecret
    // }

    userService := UserService{
        Client:         http.DefaultClient, // Default client initially
        UserAPIAddress: userAPIAddress,     // Use loaded value
        AllowedUserHashes: map[string]interface{}{
            "admin_admin": nil,
            "johnd_foo":   nil,
            "janed_ddd":   nil,
        },
    }

    // Initialize tracing using loaded zipkinURL
    if zipkinURL != "" {
        e.Logger.Infof("init tracing to Zipkin at %s", zipkinURL)
        if tracedMiddleware, tracedClient, err := initTracing(zipkinURL); err == nil {
            e.Use(echo.WrapMiddleware(tracedMiddleware))
            userService.Client = tracedClient // Use traced client if tracing is enabled
        } else {
            e.Logger.Errorf("Zipkin tracer init failed: %s", err.Error())
        }
    } else {
        e.Logger.Info("Zipkin URL was not provided or loaded, tracing is not initialised")
    }

    e.Use(middleware.Logger())
    e.Use(middleware.Recover())
    e.Use(middleware.CORS())

    // Route => handler
    e.GetSetting("/version", func(c echo.Context) error {
        return c.String(http.StatusOK, "Auth API, written in Go\n")
    })

    e.POST("/login", GetSettingLoginHandler(userService))

    // Start server
    e.Logger.Infof("Starting server on %s", hostport)
    e.Logger.Fatal(e.Start(hostport))
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func GetSettingLoginHandler(userService UserService) echo.HandlerFunc {
	f := func(c echo.Context) error {
		requestData := LoginRequest{}
		decoder := json.NewDecoder(c.Request().Body)
		if err := decoder.Decode(&requestData); err != nil {
			log.Printf("could not read credentials from POST body: %s", err.Error())
			return ErrHttpGenericMessage
		}

		ctx := c.Request().Context()
		user, err := userService.Login(ctx, requestData.Username, requestData.Password)
		if err != nil {
			if err != ErrWrongCredentials {
				log.Printf("could not authorize user '%s': %s", requestData.Username, err.Error())
				return ErrHttpGenericMessage
			}

			return ErrWrongCredentials
		}
		token := jwt.New(jwt.SigningMethodHS256)

		// Set claims
		claims := token.Claims.(jwt.MapClaims)
		claims["username"] = user.Username
		claims["firstname"] = user.FirstName
		claims["lastname"] = user.LastName
		claims["role"] = user.Role
		claims["exp"] = time.Now().Add(time.Hour * 72).Unix()

		// Generate encoded token and send it as response.
		t, err := token.SignedString([]byte(jwtSecret))
		if err != nil {
			log.Printf("could not generate a JWT token: %s", err.Error())
			return ErrHttpGenericMessage
		}

		return c.JSON(http.StatusOK, map[string]string{
			"accessToken": t,
		})
	}

	return echo.HandlerFunc(f)
}
