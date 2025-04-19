'use strict';
const express = require('express')
const bodyParser = require("body-parser")
const jwt = require('express-jwt')
const { AppConfigurationClient } = require("@azure/app-configuration"); // Import SDK
const port = process.env.TODO_API_PORT || 8082
// --- App Configuration Setup ---
const connectionString = process.env.APPCONFIG_CONNECTION_STRING;
let appConfigClient;
let redisHost = 'localhost'; // Default
let redisPort = 6379;      // Default
let redisChannel = 'log_channel'; // Default
let zipkinUrl = 'http://127.0.0.1:9411/api/v2/spans'; // Default
let todoApiPort = 8082;     // Default
let jwtSecret = "foo";      // Default

async function loadConfig() {
  if (!connectionString) {
    console.warn("APPCONFIG_CONNECTION_STRING is not set. Using default values.");
    return;
  }
  try {
    appConfigClient = new AppConfigurationClient(connectionString);
    console.log("Fetching configuration from Azure App Configuration...");

    const redisHostSetting = await appConfigClient.getConfigurationSetting({ key: "redis.host" });
    if (redisHostSetting && redisHostSetting.value) redisHost = redisHostSetting.value;

    const redisPortSetting = await appConfigClient.getConfigurationSetting({ key: "redis.port" });
    if (redisPortSetting && redisPortSetting.value) redisPort = parseInt(redisPortSetting.value, 10);

    const redisChannelSetting = await appConfigClient.getConfigurationSetting({ key: "redis.channel" });
    if (redisChannelSetting && redisChannelSetting.value) redisChannel = redisChannelSetting.value;

    const zipkinUrlSetting = await appConfigClient.getConfigurationSetting({ key: "zipkin.url" });
    if (zipkinUrlSetting && zipkinUrlSetting.value) zipkinUrl = zipkinUrlSetting.value;

    const portSetting = await appConfigClient.getConfigurationSetting({ key: "todos-api.port" });
    if (portSetting && portSetting.value) todoApiPort = parseInt(portSetting.value, 10); // Key name matches Terraform

    const jwtSecretSetting = await appConfigClient.getConfigurationSetting({ key: "jwt.secret" });
    if (jwtSecretSetting && jwtSecretSetting.value) jwtSecret = jwtSecretSetting.value;

    console.log("Configuration loaded successfully.");
    console.log(`Using Redis: ${redisHost}:${redisPort}, Channel: ${redisChannel}`);
    console.log(`Using Port: ${todoApiPort}, JWT Secret: [loaded], Zipkin: ${zipkinUrl}`);

  } catch (error) {
    console.error("Failed to load configuration from Azure App Configuration:", error);
    console.warn("Using default values due to configuration load failure.");
  }
}

const ZIPKIN_URL = process.env.ZIPKIN_URL || 'http://127.0.0.1:9411/api/v2/spans';
const {Tracer, 
  BatchRecorder,
  jsonEncoder: {JSON_V2}} = require('zipkin');
  const CLSContext = require('zipkin-context-cls');  
const {HttpLogger} = require('zipkin-transport-http');
const zipkinMiddleware = require('zipkin-instrumentation-express').expressMiddleware;

const logChannel = process.env.REDIS_CHANNEL || 'log_channel';
const redisClient = require("redis").createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retry_strategy: function (options) {
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
});

const app = express()

// tracing
const ctxImpl = new CLSContext('zipkin');
const recorder = new  BatchRecorder({
  logger: new HttpLogger({
    endpoint: ZIPKIN_URL,
    jsonEncoder: JSON_V2
  })
});
const localServiceName = 'todos-api';
const tracer = new Tracer({ctxImpl, recorder, localServiceName});


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
routes(app, {tracer, redisClient, logChannel})

app.listen(port, function () {
  console.log('todo list RESTful API server started on: ' + port)
})
