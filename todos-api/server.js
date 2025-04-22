'use strict';
const express = require('express');
const bodyParser = require("body-parser");
const jwt = require('express-jwt');
const { Client } = require('pg'); // PostgreSQL client

// Fetch configuration from PostgreSQL
async function fetchConfig() {
  const client = new Client({
    connectionString: "postgresql://icesi-viajes_owner:ji6kwCcDPs5o@ep-delicate-scene-a43o2df1.us-east-1.aws.neon.tech/todo?sslmode=require",
    ssl: {
      rejectUnauthorized: false // Allow self-signed certificates
    }
  });

  try {
    await client.connect();
    const res = await client.query("SELECT name, value FROM config_table");
    const config = {};
    res.rows.forEach(row => {
      config[row.name] = row.value;
    });
    await client.end();
    return config;
  } catch (err) {
    console.error("Failed to fetch configuration from database:", err);
    process.exit(1);
  }
}

(async () => {
  const config = await fetchConfig();

  // Extract values from the configuration
  const ZIPKIN_URL = config.ZIPKIN_URL || 'http://127.0.0.1:9411/api/v2/spans';
  const logChannel = config.REDIS_CHANNEL || 'log_channel';
  const redisHost = config.REDIS_HOST || 'localhost';
  const redisPort = parseInt(config.REDIS_PORT, 10) || 6379;
  const port = parseInt(config.TODO_API_PORT, 10) || 8082;
  const jwtSecret = config.JWT_SECRET || "foo";

  const { Tracer, BatchRecorder, jsonEncoder: { JSON_V2 } } = require('zipkin');
  const CLSContext = require('zipkin-context-cls');
  const { HttpLogger } = require('zipkin-transport-http');
  const zipkinMiddleware = require('zipkin-instrumentation-express').expressMiddleware;

  const redisClient = require("redis").createClient({
    host: redisHost,
    port: redisPort,
    retry_strategy: function (options) {
      if (options.error && options.error.code === 'ECONNREFUSED') {
        return new Error('The server refused the connection');
      }
      if (options.total_retry_time > 1000 * 60 * 60) {
        return new Error('Retry time exhausted');
      }
      if (options.attempt > 10) {
        console.log('reattempting to connect to redis, attempt #' + options.attempt);
        return undefined;
      }
      return Math.min(options.attempt * 100, 2000);
    }
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

  app.use(jwt({ secret: jwtSecret }));
  app.use(zipkinMiddleware({ tracer }));
  app.use(function (err, req, res, next) {
    if (err.name === 'UnauthorizedError') {
      res.status(401).send({ message: 'invalid token' });
    }
  });
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());

  const routes = require('./routes');
  routes(app, { tracer, redisClient, logChannel });

  app.listen(port, function () {
    console.log("Updated server.js with PostgreSQL configuration");
    console.log('todo list RESTful API server started on: ' + port);
  });
})();