'use strict';
const express = require('express');
const bodyParser = require("body-parser");
const jwt = require('express-jwt');
const axios = require('axios'); // Make sure to add axios to your dependencies
const TodoController = require('./todoController');
const RedisAmbassador = require('./redisAmbassador');

// Configuration provider client
const configProviderUrl = process.env.CONFIG_PROVIDER_URL;

// Get configuration from the configuration provider
async function fetchConfig() {
  try {
    const response = await axios.get(`${configProviderUrl}/config/todos-api`);
    return response.data.config;
  } catch (err) {
    console.error("Failed to fetch configuration from provider:", err);
    return {
      TODO_API_PORT: process.env.TODO_API_PORT || 8082,
      JWT_SECRET: process.env.JWT_SECRET || "foo",
      REDIS_CHANNEL: process.env.REDIS_CHANNEL || 'log_channel',
      REDIS_HOST: process.env.REDIS_HOST || 'localhost',
      REDIS_PORT: process.env.REDIS_PORT || 6379,
      ZIPKIN_URL: process.env.ZIPKIN_URL || 'http://127.0.0.1:9411/api/v2/spans'
    };
  }
}

(async () => {
  // Initial config fetch
  let config = await fetchConfig();
  
  // Extract values from the configuration
  let ZIPKIN_URL = config.ZIPKIN_URL || 'http://127.0.0.1:9411/api/v2/spans';
  let logChannel = config.REDIS_CHANNEL || 'log_channel';
  let redisHost = config.REDIS_HOST || 'localhost';
  let redisPort = parseInt(config.REDIS_PORT, 10) || 6379;
  let port = parseInt(config.TODO_API_PORT, 10) || 8082;
  let jwtSecret = config.JWT_SECRET || "foo";

  const { Tracer, BatchRecorder, jsonEncoder: { JSON_V2 } } = require('zipkin');
  const CLSContext = require('zipkin-context-cls');
  const { HttpLogger } = require('zipkin-transport-http');
  const zipkinMiddleware = require('zipkin-instrumentation-express').expressMiddleware;

  // Initialize redis ambassador
  let redisAmbassador = new RedisAmbassador(
    logChannel,
    {
      host: redisHost,
      port: redisPort
    }
  );

  // Initialize the todo controller
  const todoController = new TodoController({
    tracer: null, // Will be set after creating the tracer
    redisAmbassador,
    logChannel
  });

  const app = express();

  // Tracing
  const ctxImpl = new CLSContext('zipkin');
  const recorder = new BatchRecorder({
    logger: new HttpLogger({
      endpoint: ZIPKIN_URL,
      jsonEncoder: JSON_V2
    })
  });
  const localServiceName = 'todos-api';
  const tracer = new Tracer({ ctxImpl, recorder, localServiceName });
  
  // Update the tracer in todoController
  todoController.updateDependencies({ tracer });

  // Add a route to handle configuration updates
  app.post('/config/update', bodyParser.json(), (req, res) => {
    console.log('Received configuration update:', req.body.config);
    const newConfig = req.body.config;
    
    // Update Redis configuration through the TodoController
    if (newConfig.REDIS_HOST || newConfig.REDIS_PORT || newConfig.REDIS_CHANNEL) {
      redisAmbassador = todoController.updateConfiguration(newConfig);
    }
    
    // Update JWT secret if changed
    if (newConfig.JWT_SECRET && newConfig.JWT_SECRET !== jwtSecret) {
      jwtSecret = newConfig.JWT_SECRET;
      console.log('JWT Secret updated');
    }
    
    // Update Zipkin URL if changed
    if (newConfig.ZIPKIN_URL && newConfig.ZIPKIN_URL !== ZIPKIN_URL) {
      ZIPKIN_URL = newConfig.ZIPKIN_URL;
      // Note: You might need to recreate the Zipkin tracer here
      console.log(`Zipkin URL updated to ${ZIPKIN_URL}`);
    }
    
    return res.status(200).json({ status: 'Configuration updated successfully' });
  });

  app.use(jwt({ secret: jwtSecret }))
  app.use(zipkinMiddleware({tracer}));
  app.use(function (err, req, res, next) {
    if (err.name === 'UnauthorizedError') {
      res.status(401).send({ message: 'invalid token' })
    }
  })
  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(bodyParser.json())

  const routes = require('./routes')
  // Pass the todoController to routes instead of creating a new one
  routes(app, {tracer, redisAmbassador, todoController}) 

  app.listen(port, function () {
    console.log('todo list RESTful API server started on: ' + port)
  });
})();

