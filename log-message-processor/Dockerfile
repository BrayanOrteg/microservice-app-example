FROM python:3.6
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY main.py .

CMD ["python", "main.py"]

# To build and run the Docker container, use the following commands:
#   docker run --name redis --network app-network -d redis:7.0
#   docker build -t log-message-processor ./log-message-processor
#   docker run --network app-network --name log-message-processor -e REDIS_HOST=redis -e REDIS_PORT=6379 -e REDIS_CHANNEL=log_channel log-message-processor