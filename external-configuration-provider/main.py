import os
import time
import threading
import json
import logging
from flask import Flask, jsonify, request
import psycopg2
from datetime import datetime
import requests

import sys

sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', 1)
sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', 1)

print('Starting external configuration provider...')

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Global configuration cache
config_cache = {}
last_updated = {}
db_check_interval = 30  # seconds

# Database connection details
DB_CONNECTION_STRING = os.environ.get(
    "DB_CONNECTION_STRING", 
    "postgresql://icesi-viajes_owner:ji6kwCcDPs5o@ep-delicate-scene-a43o2df1.us-east-1.aws.neon.tech/todo?sslmode=require"
)

# Mapping of config keys to services that use them
config_service_map = {
    "AUTH_API_PORT": ["auth-api"],
    "JWT_SECRET": ["auth-api", "users-api", "todos-api"],
    "USERS_API_ADDRESS": ["auth-api"],
    "ZIPKIN_URL": ["auth-api", "users-api", "todos-api", "log-message-processor", "frontend"],
    "USERS_API_PORT": ["users-api"],
    "SERVER_PORT": ["users-api"],
    "TODO_API_PORT": ["todos-api"],
    "REDIS_HOST": ["todos-api", "log-message-processor"],
    "REDIS_PORT": ["todos-api", "log-message-processor"],
    "REDIS_CHANNEL": ["todos-api", "log-message-processor"],
    "AUTH_API_ADDRESS": ["frontend"],
    "TODOS_API_ADDRESS": ["frontend"]
}

# Service endpoints for config notification
service_notification_endpoints = {
    "auth-api": "http://auth-api:8000/config/update",
    "users-api": "http://users-api:8083/config/update",
    "todos-api": "http://todos-api:8082/config/update",
    "log-message-processor": "http://log-message-processor:8089/config/update"
}

def fetch_all_configs(notify=True):
    """Fetch all configurations from the database"""
    try:
        conn = psycopg2.connect(DB_CONNECTION_STRING)
        cursor = conn.cursor()
        cursor.execute("SELECT name, value FROM config_table")
        rows = cursor.fetchall()
        
        # Build new configuration dictionary
        new_config = {name: value for name, value in rows}
        
        # Track which services need updates
        services_to_notify = set()
        
        # Check for changes
        changes = {}
        for key, value in new_config.items():
            if key not in config_cache or config_cache[key] != value:
                changes[key] = value
                # Add services that need to be notified about this change
                if key in config_service_map:
                    for service in config_service_map[key]:
                        services_to_notify.add(service)
        
        # Update the cache if there are changes
        if changes:
            print(f"Configuration changes detected: {list(changes.keys())}")
            config_cache.update(new_config)
            now = datetime.now().isoformat()
            for key in changes:
                last_updated[key] = now
                
            # Notify relevant services about configuration changes
            if notify:
                notify_services(services_to_notify, changes)
        else:
            print("No configuration changes detected")
        
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Failed to fetch configuration from database: {e}")
        return False
    
def config_refresh_task():
    """Background task to periodically refresh configurations"""
    while True:
        print("Refreshing configuration from database")
        fetch_all_configs()
        time.sleep(db_check_interval)

def notify_services(services, changed_configs):
    """Notify services about configuration changes"""
    for service in services:
        if service in service_notification_endpoints:
            endpoint = service_notification_endpoints[service]
            try:
                # Get service-specific config
                service_config = {}
                # Filter only the keys relevant to this service
                for key, value in changed_configs.items():
                    if key in config_service_map and service in config_service_map[key]:
                        service_config[key] = value
                
                if service_config:
                    print(f"Notifying {service} about config changes: {list(service_config.keys())}")
                    response = requests.post(
                        endpoint,
                        json={"config": service_config},
                        timeout=10,  # Increase timeout to 10 seconds
                    )
                    print(f"Notification to {service} result: {response.status_code}")
            except requests.exceptions.RequestException as e:
                print(f"Failed to notify {service}: {e}")
                print(f"Will retry notification to {service} in next refresh cycle")
                # Store the failed notification for retry in the next cycle
                # This is just a comment as implementing a proper retry queue would require more changes
            except Exception as e:
                print(f"Unexpected error notifying {service}: {e}")
                print(f"Error details: {str(e)}")

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "ok"}), 200

@app.route('/version', methods=['GET'])
def version():
    """Version endpoint"""
    return jsonify({
        "service": "External Configuration Provider",
        "version": "1.0.0"
    }), 200

@app.route('/config/<service_name>', methods=['GET'])
def get_service_config(service_name):
    """Get configuration for a specific service"""
    # Map service names to their config prefixes
    service_prefixes = {
        "auth-api": ["AUTH_API_PORT", "JWT_SECRET", "USERS_API_ADDRESS", "ZIPKIN_URL"],
        "users-api": ["USERS_API_PORT", "SERVER_PORT", "JWT_SECRET", "ZIPKIN_URL"],
        "todos-api": ["TODO_API_", "JWT_SECRET", "REDIS_", "ZIPKIN_URL"],
        "log-message-processor": ["REDIS_", "ZIPKIN_URL"],
        "frontend": ["AUTH_API_ADDRESS", "TODOS_API_ADDRESS", "ZIPKIN_URL"],
    }
    
    if service_name not in service_prefixes:
        return jsonify({"error": "Service not found"}), 404
    
    # Get the prefixes for this service
    prefixes = service_prefixes[service_name]
    
    # Filter config items that match the service's prefixes
    service_config = {}
    
    for key, value in config_cache.items():
        for prefix in prefixes:
            if key.startswith(prefix) or key == prefix:
                service_config[key] = value

    print(f"Configuration for {service_name}: {service_config}")

    return jsonify({
        "config": service_config
    }), 200

@app.route('/config', methods=['GET'])
def get_all_config():
    """Get all configuration (admin endpoint)"""
    return jsonify({
        "config": config_cache,
        "last_updated": last_updated
    }), 200

def initialize_app():
    # Initial configuration load
    if fetch_all_configs(notify=False):
        print(f"Initial configuration loaded: {len(config_cache)} items")
    else:
        print("Failed to load initial configuration")
    
    # Start the background refresh task
    refresh_thread = threading.Thread(target=config_refresh_task, daemon=True)
    refresh_thread.start()


initialize_app()