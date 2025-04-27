import time
import redis
import os
import json
import requests
import threading
import sys
import random
from redis.exceptions import ConnectionError, TimeoutError

sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', 1)
sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', 1)

print('Starting log-message-processor...')

# Get configuration provider URL
config_provider_url = os.environ.get('CONFIG_PROVIDER_URL', '')

# Default configuration values
config = {
    'REDIS_HOST': '',
    'REDIS_PORT': '',
    'REDIS_CHANNEL': '',
    'ZIPKIN_URL': ''
}

# Global variables for Redis connection
pubsub = None
redis_client = None
# Flag to control main processing loop
running = True

def fetch_config():
    """Fetch configuration from the configuration provider service"""
    try:
        response = requests.get(f"{config_provider_url}/config/log-message-processor")
        if response.status_code == 200:
            data = response.json()
            new_config = data.get('config', {})
            
            # Check if there are any updates
            has_updates = False
            for key, value in new_config.items():
                if key not in config or config[key] != value:
                    config[key] = value
                    has_updates = True
                    print(f"Configuration updated: {key}={value}")
                
            return has_updates
        else:
            print(f"Failed to fetch configuration: {response.status_code}")
            return False
    except Exception as e:
        print(f"Error fetching configuration: {e}")
        return False

def config_refresher():
    """Background thread to periodically refresh configuration"""
    global pubsub, redis_client
    
    while True:
        has_updates = fetch_config()
        
        # If Redis configuration has changed, reconnect
        if has_updates and redis_client is not None:
            try:
                # Close existing connections
                if pubsub:
                    pubsub.unsubscribe()
                    pubsub.close()
                if redis_client:
                    try:
                        redis_client.close()
                    except AttributeError:
                        # Para versiones anteriores de redis-py
                        redis_client.connection_pool.disconnect()
                    
                # Create new connections with updated config
                initialize_redis_connection()
                print(f"Reconnected to Redis at {config['REDIS_HOST']}:{config['REDIS_PORT']} on channel {config['REDIS_CHANNEL']}")
            except Exception as e:
                print(f"Failed to reconnect to Redis: {e}")
        
        # Sleep for 60 seconds before checking again
        time.sleep(60)

def log_message(message):
    time_delay = random.randrange(0, 2000)
    time.sleep(time_delay / 1000)
    print('message received after waiting for {}ms: {}'.format(time_delay, message))

def initialize_redis_connection():
    """Initialize or reinitialize Redis connection"""
    global redis_client, pubsub
    
    try:
        redis_client = redis.Redis(
            host=config['REDIS_HOST'], 
            port=int(config['REDIS_PORT']), 
            db=0,
            socket_timeout=5,
            socket_connect_timeout=5,
            socket_keepalive=True,
            retry_on_timeout=True
        )
        pubsub = redis_client.pubsub()
        pubsub.subscribe([config['REDIS_CHANNEL']])
        return True
    except Exception as e:
        print(f"Failed to initialize Redis connection: {e}")
        return False

def http_transport(encoded_span):
    if config['ZIPKIN_URL']:
        try:
            requests.post(
                config['ZIPKIN_URL'],
                data=encoded_span,
                headers={'Content-Type': 'application/x-thrift'},
                timeout=3
            )
        except Exception as e:
            print(f"Failed to send span to Zipkin: {e}")

def process_message_loop():
    """Process messages from Redis with error handling and reconnection"""
    global pubsub, redis_client, running
    
    from py_zipkin.zipkin import zipkin_span, ZipkinAttrs, generate_random_64bit_string
    
    while running:
        try:
            if pubsub is None:
                if not initialize_redis_connection():
                    print("Waiting 5 seconds before retrying Redis connection...")
                    time.sleep(5)
                    continue
            
            # Get a single message with timeout
            message = pubsub.get_message(timeout=1.0)
            if message and message['type'] == 'message':
                try:
                    message_data = json.loads(str(message['data'].decode("utf-8")))
                    
                    if not config['ZIPKIN_URL'] or 'zipkinSpan' not in message_data:
                        log_message(message_data)
                        continue
                    
                    span_data = message_data['zipkinSpan']
                    try:
                        with zipkin_span(
                            service_name='log-message-processor',
                            zipkin_attrs=ZipkinAttrs(
                                trace_id=span_data['_traceId']['value'],
                                span_id=generate_random_64bit_string(),
                                parent_span_id=span_data['_spanId'],
                                is_sampled=span_data['_sampled']['value'],
                                flags=None
                            ),
                            span_name='save_log',
                            transport_handler=http_transport,
                            sample_rate=100
                        ):
                            log_message(message_data)
                    except Exception as e:
                        print('did not send data to Zipkin: {}'.format(e))
                        log_message(message_data)
                except Exception as e:
                    print(f"Error processing message: {e}")
            
            # Small sleep to prevent CPU spinning
            if not message:
                time.sleep(0.1)
                
        except (ConnectionError, TimeoutError) as e:
            print(f"Redis connection error: {e}. Attempting to reconnect...")
            # Clean up existing connections
            try:
                if pubsub:
                    pubsub.close()
                if redis_client:
                    redis_client.close()
            except:
                pass
            
            pubsub = None
            redis_client = None
            time.sleep(5)  # Wait before reconnecting
        
        except Exception as e:
            print(f"Unexpected error in message processing: {e}")
            time.sleep(1)

if __name__ == '__main__':    
    # Fetch initial configuration
    fetch_config()
    print(f"Initial configuration: Redis {config['REDIS_HOST']}:{config['REDIS_PORT']}, channel {config['REDIS_CHANNEL']}")
    
    # Start configuration refresh thread
    refresh_thread = threading.Thread(target=config_refresher, daemon=True)
    refresh_thread.start()
    
    # Initialize Redis connection
    initialize_redis_connection()
    
    # Use a more robust message processing approach
    try:
        process_message_loop()
    except KeyboardInterrupt:
        print("Shutting down gracefully...")
        running = False
    except Exception as e:
        print(f"Fatal error: {e}")
        running = False