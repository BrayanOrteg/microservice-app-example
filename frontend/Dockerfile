FROM node:8.17.0
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

CMD ["npm", "start"]

# To build and run the Docker container, use the following commands:
# docker build -t frontend ./frontend
# docker run --network app-network --name frontend -p 8080:8080 -e AUTH_API_ADDRESS=http://auth-api:8000 -e TODOS_API_ADDRESS=http://todos-api:8082 frontend