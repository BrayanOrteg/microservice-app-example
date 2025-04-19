'use strict';
const TodoController = require('./todoController');
module.exports = function (app, {tracer, redisClient, logChannel}) {
  const todoController = new TodoController({tracer, redisClient, logChannel});
  app.route('/health')
    .get(function(req, resp) {
      const redisStatus = redisClient.connected ? "UP" : "DOWN";
      resp.json({
        status: "UP",
        redis: redisStatus,
        timestamp: new Date().toISOString()
      });
    });
  app.route('/todos')
    .get(function(req,resp) {return todoController.list(req,resp)})
    .post(function(req,resp) {return todoController.create(req,resp)});

  app.route('/todos/:taskId')
    .delete(function(req,resp) {return todoController.delete(req,resp)});
};