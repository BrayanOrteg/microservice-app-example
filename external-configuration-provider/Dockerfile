FROM python:3.9-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .

# Set environment variables
ENV CONFIG_PROVIDER_PORT=8888

# Expose the application port
EXPOSE 8888

# Run the service with Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8888", "main:app"]

# To build and run the Docker container, use the following commands:
# docker build -t config-provider ./external-configuration-provider
# docker run --network app-network --name config-provider -p 8888:8888 -e DB_CONNECTION_STRING="postgresql://icesi-viajes_owner:ji6kwCcDPs5o@ep-delicate-scene-a43o2df1.us-east-1.aws.neon.tech/todo?sslmode=require" config-provider
