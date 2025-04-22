const redis = require("redis");

class RedisAmbassador {
    constructor(logChannel, redisOptions = {}) {
        this.logChannel = logChannel;
        this.circuitBreakerOpen = false;
        this.failureCount = 0;
        this.failureThreshold = redisOptions.failureThreshold || 5;
        this.resetTimeout = redisOptions.resetTimeout || 60000;
        this.maxRetries = redisOptions.maxRetries || 3;
        this.redisOptions = redisOptions;
        this.metrics = {
            published: 0,
            failed: 0,
            totalTimeMs: 0
        };
        this.failedMessages = [];
        this._createRedisClient();
    }

    // Create a Redis client with the given options and set up event listeners
    _createRedisClient() {
        const ambassador = this;
        const defaultOptions = {
            host: this.redisOptions.host || process.env.REDIS_HOST || 'localhost',
            port: this.redisOptions.port || process.env.REDIS_PORT || 6379,
            retry_strategy: function (options) {
                if (ambassador.circuitBreakerOpen) {
                    return new Error('Circuit breaker is open, not retrying Redis connection');
                }
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    return new Error('The server refused the connection');
                }
                if (options.total_retry_time > 1000 * 60 * 60) {
                    return new Error('Retry time exhausted');
                }
                if (options.attempt > 10) {
                    console.log('reattemtping to connect to redis, attempt #' + options.attempt)
                    return undefined;
                }
                return Math.min(options.attempt * 100, 2000);
            }
        };
        // If the redisOptions object has a url property, use it to create the client
        if (this.redisClient) {
            try {
                this.redisClient.end(true);
            } catch (e) {}
        }
        this.redisClient = redis.createClient(defaultOptions);

        // Manage the throw of the errors and events of the redis client
        this.redisClient.on('reconnecting', () => {
            console.warn('RedisAmbassador: Reconnecting to Redis...');
        });
        this.redisClient.on('error', (err) => {
            console.error('RedisAmbassador: Redis client error:', err);
        });
        this.redisClient.on('end', () => {
            console.warn('RedisAmbassador: Redis connection closed.');
        });
    }

    // Publish a message to Redis and handle circuit breaker logic
    // If the circuit breaker is open, add the message to the failed queue and return a rejected promise
    async publish(message, channel = null) {
        const targetChannel = channel || this.logChannel;
        const start = Date.now();

        if (this.circuitBreakerOpen) {
            this._addFailedMessage(message, targetChannel);
            return Promise.reject(new Error('Circuit breaker open'));
        }

        // If the redis client is not connected, try to reconnect and wait for a bit
        if (!this.redisClient.connected) {
            console.warn('RedisAmbassador: Redis client is not connected. Attempting to recreate client...');
            this._createRedisClient();

            // Wait for 5 seconds for the client to connect
            await new Promise(res => setTimeout(res, 5000));

            // Check if the client is still not connected after waiting and add to failed queue the message
            if (!this.redisClient.connected) {
                console.error('RedisAmbassador: Redis client is still not connected. Adding to failed queue.');
                this._addFailedMessage(message, targetChannel);
                this.metrics.failed++;
                this.failureCount++;
                if (this.failureCount >= this.failureThreshold) {
                    this._openCircuitBreaker();
                }
                return Promise.reject(new Error('Redis client not connected'));
            }
        }

        // If the redis client is connected, try to publish the message and retry the failed messages
        // If the publish fails, add the message to the failed queue and throw an error
        try {
            const reply = await this._publishOnce(message, targetChannel);
            console.log(`Successfully published to Redis, receivers: ${reply}`);
            this.metrics.published++;
            this.metrics.totalTimeMs += (Date.now() - start);
            this.failureCount = 0;
            this._retryFailedMessages();
            return;
        } catch (err) {
            this.metrics.failed++;
            this._addFailedMessage(message, targetChannel);
            this.failureCount++;
            if (this.failureCount >= this.failureThreshold) {
                this._openCircuitBreaker();
            }
            throw err;
        }
    }

    // Publish a message to Redis once if the client is connected and return the reply
    _publishOnce(message, channel) {
        return new Promise((resolve, reject) => {
            if (!this.redisClient.connected) {
                return reject(new Error('Redis client not connected'));
            }
            this.redisClient.publish(channel, message, (err, reply) => {
                if (err) {
                    return reject(err);
                } else {
                    return resolve(reply);
                }
            });
        });
    }

    // Add failed messages to the failed queue
    _addFailedMessage(message, channel) {
        this.failedMessages.push({message, channel, timestamp: Date.now()});
    }

    // Retry failed messages if the circuit breaker is closed, the redis client is connected and there are failed messages
    // and remove the failed messages from the failed queue when they are successfully published
    async _retryFailedMessages() {
        if (this.circuitBreakerOpen || !this.redisClient.connected || this.failedMessages.length === 0) return;
        const retryQueue = [...this.failedMessages];
        this.failedMessages = [];
        for (const {message, channel} of retryQueue) {
            try {
                await this._publishOnce(message, channel);
            } catch (err) {
                this._addFailedMessage(message, channel);
            }
        }
    }

    // get the metrics of the ambassador
    // including the number of published messages, failed messages, the average publish time , and the failed queue length
    getMetrics() {
        return {
            ...this.metrics,
            avgPublishTimeMs: this.metrics.published > 0 ? this.metrics.totalTimeMs / this.metrics.published : 0,
            failedQueueLength: this.failedMessages.length
        };
    }

    // open the circuit breaker if the failure count exceeds the threshold
    // and reset the failure count after a timeout
    // and try to retry the failed messages
    _openCircuitBreaker() {
        if (!this.circuitBreakerOpen) {
            this.circuitBreakerOpen = true;
            console.error('RedisAmbassador: Circuit breaker opened due to repeated failures.');
            setTimeout(() => {
                this.circuitBreakerOpen = false;
                this.failureCount = 0;
                console.info('RedisAmbassador: Circuit breaker reset.');
                this._retryFailedMessages();
            }, this.resetTimeout);
        }
    }
}

module.exports = RedisAmbassador;