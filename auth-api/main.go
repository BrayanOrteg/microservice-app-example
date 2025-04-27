package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
	"io/ioutil"
	"os"
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

	jwtSecret = "myfancysecret"
)

// FetchConfig fetches configuration from the config provider service
func FetchConfig() (map[string]string, error) {
	configProviderURL := os.Getenv("CONFIG_PROVIDER_URL")
	
	resp, err := http.Get(configProviderURL + "/config/auth-api")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	var configResp ConfigResponse
	if err := json.Unmarshal(body, &configResp); err != nil {
		return nil, err
	}
	
	return configResp.Config, nil
}

// ConfigResponse represents the response from the config provider
type ConfigResponse struct {
	Config      map[string]string `json:"config"`
}

// ConfigUpdateRequest represents the configuration update payload
type ConfigUpdateRequest struct {
	Config map[string]string `json:"config"`
}

func main() {
	log.Println("Starting auth-api service")

	// Get initial configuration
	config, err := FetchConfig()
	if err != nil {
		log.Printf("Failed to fetch initial configuration: %v", err)
		// default values
		config = map[string]string{
			"AUTH_API_PORT": "",
			"USERS_API_ADDRESS": "",
			"JWT_SECRET": "",
			"ZIPKIN_URL": "",
		}
	}

	// Set configuration values
	authAPIPort := config["AUTH_API_PORT"]
	userAPIAddress := config["USERS_API_ADDRESS"]
	envJwtSecret := config["JWT_SECRET"]
	zipkinURL := config["ZIPKIN_URL"]

	// Update jwtSecret if available
	if envJwtSecret != "" {
		jwtSecret = envJwtSecret
	}

	userService := UserService{
		Client:         http.DefaultClient,
		UserAPIAddress: userAPIAddress,
		AllowedUserHashes: map[string]interface{}{
			"admin_admin": nil,
			"johnd_foo":   nil,
			"janed_ddd":   nil,
		},
	}

	e := echo.New()
	e.Logger.SetLevel(gommonlog.INFO)

	if zipkinURL != "" {
		e.Logger.Infof("init tracing to Zipkit at %s", zipkinURL)

		if tracedMiddleware, tracedClient, err := initTracing(zipkinURL); err == nil {
			e.Use(echo.WrapMiddleware(tracedMiddleware))
			userService.Client = tracedClient
		} else {
			e.Logger.Infof("Zipkin tracer init failed: %s", err.Error())
		}
	} else {
		e.Logger.Infof("Zipkin URL was not provided, tracing is not initialised")
	}

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	// Add endpoint for configuration updates
	e.POST("/config/update", func(c echo.Context) error {
		req := new(ConfigUpdateRequest)
		if err := c.Bind(req); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "Invalid request format")
		}

		log.Println("Received updated configuration")
		
		// Update userAPIAddress if it changed
		if newUserAPIAddress, ok := req.Config["USERS_API_ADDRESS"]; ok && newUserAPIAddress != userAPIAddress {
			userAPIAddress = newUserAPIAddress
			userService.UserAPIAddress = newUserAPIAddress
			log.Printf("Updated USERS_API_ADDRESS to %s", newUserAPIAddress)
		}
		
		// Update JWT secret if it changed
		if newJwtSecret, ok := req.Config["JWT_SECRET"]; ok && newJwtSecret != jwtSecret {
			jwtSecret = newJwtSecret
			log.Println("Updated JWT_SECRET")
		}

		// Update Zipkin URL if changed
		if newZipkinURL, ok := req.Config["ZIPKIN_URL"]; ok && newZipkinURL != zipkinURL {
			zipkinURL = newZipkinURL
			log.Println("Updated ZIPKIN_URL")
			// Note: You might need to reinitialize Zipkin tracing here
		}

		return c.JSON(http.StatusOK, map[string]string{
			"status": "Configuration updated successfully",
		})
	})

	// Route => handler
	e.GET("/version", func(c echo.Context) error {
		return c.String(http.StatusOK, "Auth API, written in Go\n")
	})

	e.POST("/login", getLoginHandler(userService))

	// Start server
	hostport := ":" + authAPIPort
	e.Logger.Fatal(e.Start(hostport))
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func getLoginHandler(userService UserService) echo.HandlerFunc {
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
