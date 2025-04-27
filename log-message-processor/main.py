import time
import redis
import os
import json
import requests
import threading
import sys

sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', 1)
sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', 1)

print('Starting log-message-processor...')

# Get configuration provider URL
config_provider_url = os.environ.get('CONFIG_PROVIDER_URL', 'http://config-provider:8888')

# Default configuration values
config = {
    'REDIS_HOST': '',
    'REDIS_PORT': '',
    'REDIS_CHANNEL': '',
    'ZIPKIN_URL': ''
}

# Cache for last configuration update timestamps
last_updated = {}

# Global variables for Redis connection
pubsub = None
redis_client = None

def fetch_config():
    """Fetch configuration from the configuration provider service"""
    try:
        response = requests.get(f"{config_provider_url}/config/log-message-processor")
        if response.status_code == 200:
            data = response.json()
            new_config = data.get('config', {})
            new_last_updated = data.get('last_updated', {})
            
            # Check if there are any updates
            has_updates = False
            for key, value in new_config.items():
                if key not in config or config[key] != value:
                    config[key] = value
                    has_updates = True
                    print(f"Configuration updated: {key}={value}")
            
            # Update last_updated timestamps
            for key, value in new_last_updated.items():
                last_updated[key] = value
                
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
                    redis_client.close()
                    
                # Create new connections with updated config
                redis_client = redis.Redis(
                    host=config['REDIS_HOST'], 
                    port=int(config['REDIS_PORT']), 
                    db=0
                )
                pubsub = redis_client.pubsub()
                pubsub.subscribe([config['REDIS_CHANNEL']])
                print(f"Reconnected to Redis at {config['REDIS_HOST']}:{config['REDIS_PORT']} on channel {config['REDIS_CHANNEL']}")
            except Exception as e:
                print(f"Failed to reconnect to Redis: {e}")
        
        # Sleep for 60 seconds before checking again
        time.sleep(60)

def log_message(message):
    time_delay = random.randrange(0, 2000)
    time.sleep(time_delay / 1000)
    print('message received after waiting for {}ms: {}'.format(time_delay, message))

if __name__ == '__main__':
    import random
    
    # Fetch initial configuration
    fetch_config()
    print(f"Initial configuration: Redis {config['REDIS_HOST']}:{config['REDIS_PORT']}, channel {config['REDIS_CHANNEL']}")
    
    # Start configuration refresh thread
    refresh_thread = threading.Thread(target=config_refresher, daemon=True)
    refresh_thread.start()
    
    def http_transport(encoded_span):
        if config['ZIPKIN_URL']:
            requests.post(
                config['ZIPKIN_URL'],
                data=encoded_span,
                headers={'Content-Type': 'application/x-thrift'},
            )

    # Initial Redis connection
    redis_client = redis.Redis(
        host=config['REDIS_HOST'], 
        port=int(config['REDIS_PORT']), 
        db=0
    )
    pubsub = redis_client.pubsub()
    pubsub.subscribe([config['REDIS_CHANNEL']])
    
    # Process messages
    from py_zipkin.zipkin import zipkin_span, ZipkinAttrs, generate_random_64bit_string
    
    for item in pubsub.listen():
        try:
            message = json.loads(str(item['data'].decode("utf-8")))
        except Exception as e:
            log_message(e)
            continue

        if not config['ZIPKIN_URL'] or 'zipkinSpan' not in message:
            log_message(message)
            continue

        span_data = message['zipkinSpan']
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
                log_message(message)
        except Exception as e:
            print('did not send data to Zipkin: {}'.format(e))
            log_message(message)