import time
import redis
import os
import json
import requests
from py_zipkin.zipkin import zipkin_span, ZipkinAttrs, generate_random_64bit_string
import random
import sys
from azure.appconfiguration import AzureAppConfigurationClient # Import SDK

sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1) # Use buffering=1 for line buffering
sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', buffering=1)

print('Starting log-message-processor...')

# --- App Configuration Setup ---
connection_string = os.environ.get("APP_CONFIG_CONNECTION_STRING")
print(f"Connection string: {connection_string}")
app_config_client = None
redis_host = 'localhost' # Default
redis_port = 6379      # Default
redis_channel = 'log_channel' # Default
zipkin_url = '' # Default

if connection_string:
    try:
        print("Connecting to Azure App Configuration...")
        app_config_client = AzureAppConfigurationClient.from_connection_string(connection_string)
        print("Fetching configuration...")

        redis_host_setting = app_config_client.get_configuration_setting(key="redis.host")
        if redis_host_setting and redis_host_setting.value:
            redis_host = redis_host_setting.value

        redis_port_setting = app_config_client.get_configuration_setting(key="redis.port")
        if redis_port_setting and redis_port_setting.value:
            redis_port = int(redis_port_setting.value)

        redis_channel_setting = app_config_client.get_configuration_setting(key="redis.channel")
        if redis_channel_setting and redis_channel_setting.value:
            redis_channel = redis_channel_setting.value

        zipkin_url_setting = app_config_client.get_configuration_setting(key="zipkin.url")
        if zipkin_url_setting and zipkin_url_setting.value:
            zipkin_url = zipkin_url_setting.value

        print("Configuration loaded successfully.")
        print(f"Using Redis: {redis_host}:{redis_port}, Channel: {redis_channel}")
        print(f"Using Zipkin: {zipkin_url if zipkin_url else 'Not Configured'}")

    except Exception as e:
        print(f"ERROR: Failed to load configuration from Azure App Configuration: {e}")
        print("WARN: Using default values due to configuration load failure.")
else:
    print("WARN: APPCONFIG_CONNECTION_STRING is not set. Using default values.")
# --- End App Configuration Setup ---

def log_message(message):
    time_delay = random.randrange(0, 2000)
    time.sleep(time_delay / 1000)
    print('message received after waiting for {}ms: {}'.format(time_delay, message))

if __name__ == '__main__':
    redis_host = os.environ.get('REDIS_HOST', redis_host)
    redis_port = int(os.environ.get('REDIS_PORT', redis_port))
    redis_channel = os.environ.get('REDIS_CHANNEL', redis_channel)
    zipkin_url = os.environ.get('ZIPKIN_URL', zipkin_url)

    def http_transport(encoded_span):
        requests.post(
            zipkin_url,
            data=encoded_span,
            headers={'Content-Type': 'application/x-thrift'},
        )

    pubsub = redis.Redis(host=redis_host, port=redis_port, db=0).pubsub()
    pubsub.subscribe([redis_channel])
    for item in pubsub.listen():
        try:
            message = json.loads(str(item['data'].decode("utf-8")))
        except Exception as e:
            log_message(e)
            continue

        if not zipkin_url or 'zipkinSpan' not in message:
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




