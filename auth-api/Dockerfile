FROM golang:1.18 AS builder
WORKDIR /app
COPY . .
RUN export GO111MODULE=on
RUN go mod init github.com/BrayanOrteg/microservice-app-example/tree/develop/auth-api
RUN go mod tidy
RUN go build

FROM debian:buster-slim
WORKDIR /root/
COPY --from=builder /app/auth-api .
CMD ["./auth-api"]

# To build and run the Docker container, use the following commands:
#   docker build -t auth-api ./auth-api
#   docker run --network app-network --name auth-api -e JWT_SECRET=PRFT -e AUTH_API_PORT=8000 -e USERS_API_ADDRESS=http://127.0.0.1:8083 -p 8000:8000 auth-api