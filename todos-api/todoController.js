'use strict';
const cache = require('memory-cache');
const {Annotation, 
    jsonEncoder: {JSON_V2}} = require('zipkin');
const RedisAmbassador = require('./redisAmbassador');

const OPERATION_CREATE = 'CREATE',
      OPERATION_DELETE = 'DELETE';

class TodoController {
    constructor({tracer, redisAmbassador, logChannel}) {
        this._tracer = tracer;
        this._redisAmbassador = redisAmbassador;
        this._logChannel = logChannel || 'log_channel';
        this._redisConfig = {
            host: 'localhost',
            port: 6379
        };
    }

    // Update dependencies like tracer or redisAmbassador when they change
    updateDependencies({tracer, redisAmbassador}) {
        if (tracer) this._tracer = tracer;
        if (redisAmbassador) this._redisAmbassador = redisAmbassador;
    }

    // Handle configuration updates
    updateConfiguration(config) {
        const needRedisReconnect = 
            (config.REDIS_HOST && config.REDIS_HOST !== this._redisConfig.host) ||
            (config.REDIS_PORT && parseInt(config.REDIS_PORT, 10) !== this._redisConfig.port) ||
            (config.REDIS_CHANNEL && config.REDIS_CHANNEL !== this._logChannel);
            
        // Update Redis configuration
        if (config.REDIS_HOST) this._redisConfig.host = config.REDIS_HOST;
        if (config.REDIS_PORT) this._redisConfig.port = parseInt(config.REDIS_PORT, 10);
        if (config.REDIS_CHANNEL) this._logChannel = config.REDIS_CHANNEL;
        
        // Recreate Redis ambassador if configuration changed
        if (needRedisReconnect) {
            this._redisAmbassador = new RedisAmbassador(
                this._logChannel,
                {
                    host: this._redisConfig.host,
                    port: this._redisConfig.port,
                    connectionTimeout: 5000
                }
            );
            console.log(`Redis configuration updated in TodoController to ${this._redisConfig.host}:${this._redisConfig.port} channel:${this._logChannel}`);
        }
        
        return this._redisAmbassador;
    }

    // TODO: these methods are not concurrent-safe
    list (req, res) {
        const data = this._getTodoData(req.user.username)

        res.json(data.items)
    }

    create (req, res) {
        console.log('Creating new todo item', req.body)
        // TODO: must be transactional and protected for concurrent access, but
        // the purpose of the whole example app it's enough
        const data = this._getTodoData(req.user.username)
        const todo = {
            content: req.body.content,
            id: data.lastInsertedID
        }
        data.items[data.lastInsertedID] = todo

        data.lastInsertedID++
        this._setTodoData(req.user.username, data)

        this._logOperation(OPERATION_CREATE, req.user.username, todo.id)

        res.json(todo)
    }

    delete (req, res) {
        const data = this._getTodoData(req.user.username)
        const id = req.params.taskId
        delete data.items[id]
        this._setTodoData(req.user.username, data)

        this._logOperation(OPERATION_DELETE, req.user.username, id)

        res.status(204)
        res.send()
    }

    _logOperation (opName, username, todoId) {
        this._tracer.scoped(() => {
            const traceId = this._tracer.id;
            const message = JSON.stringify({
                zipkinSpan: traceId,
                opName: opName,
                username: username,
                todoId: todoId,
            });

            console.log(`Publishing to Redis channel via Ambassador: ${message}`);

            // Use the updated redisAmbassador
            if (this._redisAmbassador) {
                this._redisAmbassador.publish(message)
                    .then(() => {
                        console.log("metrics", this._redisAmbassador.getMetrics());
                    })
                    .catch(err => {
                        console.error('Ambassador failed to publish:', err);
                    });
                
 
            } else {
                console.error('Redis Ambassador not available');
            }
        });
    }

    _getTodoData (userID) {
        var data = cache.get(userID)
        if (data == null) {
            data = {
                items: {
                    '1': {
                        id: 1,
                        content: "Create new todo",
                    },
                    '2': {
                        id: 2,
                        content: "Update me",
                    },
                    '3': {
                        id: 3,
                        content: "Delete example ones",
                    }
                },
                lastInsertedID: 3
            }

            this._setTodoData(userID, data)
        }
        return data
    }

    _setTodoData (userID, data) {
        cache.put(userID, data)
    }
}

module.exports = TodoController