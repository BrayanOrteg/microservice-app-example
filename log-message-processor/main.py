import time
import redis
import os
import json
import requests
import psycopg2
from py_zipkin.zipkin import zipkin_span, ZipkinAttrs, generate_random_64bit_string
import random
import sys

sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', 1)
sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', 1)

print('Starting log-message-processor...')
print('Updated log-message-processor...')

# Connect to PostgreSQL and fetch configuration valuess
def fetch_config():
    try:
        conn = psycopg2.connect(
            "postgresql://icesi-viajes_owner:ji6kwCcDPs5o@ep-delicate-scene-a43o2df1.us-east-1.aws.neon.tech/todo?sslmode=require&options=endpoint%3Dep-delicate-scene-a43o2df1"
        )
        cursor = conn.cursor()
        cursor.execute("SELECT name, value FROM config_table")
        rows = cursor.fetchall()
        config = {name: value for name, value in rows}
        cursor.close()
        conn.close()
        return config
    except Exception as e:
        print(f"Failed to fetch configuration from database: {e}")
        sys.exit(1)

config = fetch_config()

# Extract values from the configurationN
redis_host = config.get('REDIS_HOST', 'localhost')
redis_port = int(config.get('REDIS_PORT', 6379))
redis_channel = config.get('REDIS_CHANNEL', 'default_channel')
zipkin_url = config.get('ZIPKIN_URL', '')

print(f'Redis host: {redis_host}')
print(f'Redis port: {redis_port}')
print(f'Redis channel: {redis_channel}')
print(f'Zipkin URL: {zipkin_url}')

def log_message(message):
    time_delay = random.randrange(0, 2000)
    time.sleep(time_delay / 1000)
    print('message received after waiting for {}ms: {}'.format(time_delay, message))

if __name__ == '__main__':
    def http_transport(encoded_span):
        if zipkin_url:
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