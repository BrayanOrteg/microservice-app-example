'use strict';

const TodoController = require('./todoController');

// Store controller instance 
let todoController = null;

module.exports = function(app, deps) {
  const { tracer, redisAmbassador, todoController: existingController } = deps;
  
  // Use the existing controller if provided, otherwise create a new one
  if (existingController) {
    todoController = existingController;
  } else if (!todoController) {
    todoController = new TodoController({
      tracer, 
      redisAmbassador
    });
  } else {
    // Update controller with new dependencies when they change
    todoController.updateDependencies({
      tracer, 
      redisAmbassador
    });
  }

  // Define API routes
  app.route('/todos')
    .get(todoController.list.bind(todoController))
    .post(todoController.create.bind(todoController));

  app.route('/todos/:taskId')
    .delete(todoController.delete.bind(todoController));
};