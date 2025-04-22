package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
	context "context"
	"github.com/jackc/pgx/v4"
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

func main() {

	//Add print to test pipeline
	log.Println("Starting new updated pipeline")

	conn, err := pgx.Connect(context.Background(), "postgresql://icesi-viajes_owner:ji6kwCcDPs5o@ep-delicate-scene-a43o2df1.us-east-1.aws.neon.tech/todo?sslmode=require")
    if err != nil {
        log.Fatalf("Unable to connect to database: %v\n", err)
    }
	defer conn.Close(context.Background())

    // Fetch configuration values from the database
    config := make(map[string]string)
    rows, err := conn.Query(context.Background(), `SELECT name, value FROM config_table`)
    if err != nil {
        log.Fatalf("Failed too fetch configuration from database: %v\n", err)
    }
    defer rows.Close()

	for rows.Next() {
        var name, value string
        if err := rows.Scan(&name, &value); err != nil {
            log.Fatalf("Failed to scan configuration row: %v\n", err)
        }
        config[name] = value
    }

	authAPIPort := config["AUTH_API_PORT"]
    userAPIAddress := config["USERS_API_ADDRESS"]
    envJwtSecret := config["JWT_SECRET"]
    zipkinURL := config["ZIPKIN_URL"]

    // Update jwtSecret if fetched from the database
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
