import os
import time
import threading
import json
import logging
from flask import Flask, jsonify
import psycopg2
from datetime import datetime

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

def fetch_all_configs():
    """Fetch all configurations from the database"""
    try:
        conn = psycopg2.connect(DB_CONNECTION_STRING)
        cursor = conn.cursor()
        cursor.execute("SELECT name, value FROM config_table")
        rows = cursor.fetchall()
        
        # Build new configuration dictionary
        new_config = {name: value for name, value in rows}
        
        # Check for changes
        changes = {}
        for key, value in new_config.items():
            if key not in config_cache or config_cache[key] != value:
                changes[key] = value
        
        # Update the cache if there are changes
        if changes:
            logger.info(f"Configuration changes detected: {list(changes.keys())}")
            config_cache.update(new_config)
            now = datetime.now().isoformat()
            for key in changes:
                last_updated[key] = now
        else:
            logger.info("No configuration changes detected")
        
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Failed to fetch configuration from database: {e}")
        return False

def config_refresh_task():
    """Background task to periodically refresh configurations"""
    while True:
        logger.info("Refreshing configuration from database")
        fetch_all_configs()
        time.sleep(db_check_interval)

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
        "auth-api": ["AUTH_API_", "JWT_SECRET", "USERS_API_ADDRESS", "ZIPKIN_URL"],
        "users-api": ["SERVER_PORT", "JWT_SECRET", "ZIPKIN_URL"],
        "todos-api": ["TODO_API_", "JWT_SECRET", "REDIS_", "ZIPKIN_URL"],
        "log-message-processor": ["REDIS_", "ZIPKIN_URL"],
        "frontend": ["AUTH_API_ADDRESS", "TODOS_API_ADDRESS"]
    }
    
    if service_name not in service_prefixes:
        return jsonify({"error": "Service not found"}), 404
    
    # Get the prefixes for this service
    prefixes = service_prefixes[service_name]
    
    # Filter config items that match the service's prefixes
    service_config = {}
    updates = {}
    
    for key, value in config_cache.items():
        for prefix in prefixes:
            if key.startswith(prefix) or key == prefix:
                service_config[key] = value
                if key in last_updated:
                    updates[key] = last_updated[key]
                break
    
    return jsonify({
        "config": service_config,
        "last_updated": updates
    }), 200

@app.route('/config', methods=['GET'])
def get_all_config():
    """Get all configuration (admin endpoint)"""
    return jsonify({
        "config": config_cache,
        "last_updated": last_updated
    }), 200

if __name__ == '__main__':
    # Initial configuration load
    if fetch_all_configs():
        logger.info(f"Initial configuration loaded: {len(config_cache)} items")
    else:
        logger.error("Failed to load initial configuration")
    
    # Start the background refresh task
    refresh_thread = threading.Thread(target=config_refresh_task, daemon=True)
    refresh_thread.start()
    
    # Start the Flask server
    port = int(os.environ.get("CONFIG_PROVIDER_PORT", 8888))
    logger.info(f"Starting configuration provider service on port {port}")
    app.run(host='0.0.0.0', port=port)
