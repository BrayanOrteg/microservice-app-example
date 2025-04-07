FROM node:8.17.0
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]

# To build and run the Docker container, use the following commands:
#docker build -t todos-api ./todos-api
#docker run --network app-network --name todos-api -p 8082:8082 -e JWT_SECRET=PRFT -e TODO_API_PORT=8082 -e REDIS_HOST=localhost -e REDIS_PORT=6379 -e REDIS_CHANNEL=log_channel todos-api