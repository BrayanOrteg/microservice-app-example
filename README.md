# Workshop 1: Building Cloud Pipelines

This is Workshop 1 for the Software Engineering V course in the Systems Engineering program at ICESI University.

Developed by  
| Brayan Steven Ortega García | Andrés Camilo Romero Ruiz |  
|--|--|  
| A00380171 | A00380637 |

## How to run?

### Locally

At the root of the project, you will find the docker compose file with all the instructions, and each project has its own specified Dockerfile. You can simply run:

```bash
docker-compose up
```

### Deploying to the Cloud

At the root of the project, you will find the ansible and terraform folders, as well as two .ps1 files, deploy and destroy, located in the pipeline-infrastructure folder.

#### Please note:

1. The infrastructure is currently deployed on Azure, so you must have **Azure CLI** installed and an **active subscription**.

2. Go to the **ansible** folder and make sure there is a **hosts.ini** file at ansible/inventory/hosts.ini. It doesn't matter if it's empty, the script will overwrite it.

> **Note:** The `hosts.ini` file should have the following content:
> ```
> [azure_vm]
> YOUR_AZURE_VM_IP ansible_user=azureuser ansible_ssh_pass="YOUR_AZURE_VM_PASS"
> ```

3. The parameters for **deploy.ps1** are:

	* **TerraformPath**  =  Windows path to the terraform directory (must end with /terraform)
	* **InventoryPath**  = Windows path to the hosts.ini file (must end with /hosts.ini)
	* **AnsiblePath**  =  WSL path to the ansible directory, starts with /mnt (must end with /ansible)

4. The parameter for destroy.ps1 is:
	* **TerraformPath**  =  Windows path to the terraform directory (must end with /terraform)

5. Since one of the implemented patterns is **External Configuration Storage**, all microservices access a PostgreSQL database in the cloud to fetch their environment variables. If you want to use your own configuration, you will need to:

	* Create a table named "config_table" with columns name and value, both of type Varchar(255)
	* Register the following values:
		* AUTH_API_ADDRESS
		* AUTH_API_PORT
		* FRONT_PORT
		* JWT_SECRET
		* REDIS_CHANNEL
		* REDIS_HOST
		* REDIS_PORT
		* TODOS_API_ADDRESS
		* TODO_API_PORT
		* USERS_API_ADDRESS
		* USERS_API_PORT
		* ZIPKIN_URL
	* Here is an example of de sql snipept:
		> ```sql
		> DROP SCHEMA public CASCADE;
		> CREATE SCHEMA public;
  		> 
		> CREATE TABLE config_table (
		> name VARCHAR(255) PRIMARY KEY,
  		> value VARCHAR(255) NOT NULL
  		> );
  		>
  		> INSERT INTO public.config_table (name, value) VALUES
  		> ('AUTH_API_ADDRESS', 'http://127.0.0.1:8081'),
		> ('AUTH_API_PORT', '8000'),
		> ('FRONT_PORT', '8080')
		> ('JWT_SECRET', 'PRFT'),
  		> ('REDIS_CHANNEL', 'log_channel'),
		> ('REDIS_HOST', 'redis'),
		> ('REDIS_PORT', '6379'),
		> ('TODOS_API_ADDRESS', 'http://127.0.0.1:8082')
		> ('TODOS_API_PORT', '8082')
  		> ('USERS_API_ADDRESS', 'http://users-api:8083'),
		> ('USERS_API_PORT', '8083')
  		> ('ZIPKIN_URL', 'http://zipkin:9411/api/v2/spans')
		> ```
	* Go to the global compose up to change the URLs of each container
		* The variable is CONFIG_PROVIDER_URL
	* If you need to change the logic of the connection the files are:
		* auth-api\main.go
		* frontend\config\fetch-config.js
		* log-message-processor\main.py
		* todos-api\server.js
		* todos-api\todoController.js
		* users-api\src\main\java\com\elgris\usersapi\configuration\DatabasePropertySourceInitializer.java

### Pipelines

To run the pipelines, keep in mind that the infrastructure must already be deployed. You also need to create the GitHub secrets VM_IP_KEY and VM_PASSWORD_KEY, whose values can be found in hosts.ini after running deploy.ps1.

#### Infrastructure:
*	deploy.ps1 is responsible for bringing up all the infrastructure
*	destroy.ps1 is responsible for tearing down all the infrastructure

#### Development
GitHub Actions were configured so that each one monitors changes to its service in the main branch. If a change is detected, it will connect via SSH to the VM, pull the repository, build only its service, and redeploy it so that it is updated.
* auth-api.yml
* frontend.yml
* log-message-processor.yml
* todos-api.yml
* users-api.yml

## Development Branching Strategy

For the development branching strategy, we based on github flow. Since we are only two people and its simple structure of a main and feature branches were we include a dev in between to ensure everything works and is fine, fitting the scope of the workshop.

![Git Workflow: Feature Branches](https://wac-cdn.atlassian.com/dam/jcr:34c86360-8dea-4be4-92f7-6597d4d5bfae/02%20Feature%20branches.svg?cdnVersion=2663)

## Ops Branching Strategy

Since we are just a team of two, we decided to create a branch from Main called Ops, where we defined the files for the initial infrastructure needed to deploy and test in the cloud (terraform and ansible). Once we were sure the project could be deployed in the cloud, we started development.

## Implemented Patterns

The patterns we decided to implement are:
1. **External Configuration Storage**: Each microservice offers an endpoint to receive configuration where the external-configuration-provider service is responsible for connecting to a PostgreSQL database and periodically retrieving all configuration variables, such as the URLs of other endpoints for requests. Whenever it detects a change in a service’s configuration, it notifies the corresponding service through its configuration endpoint. Microservices can also request their configuration from the external-configuration-provider once during their startup.

All services get notifications from the provider except:
	* **frontend**: Since it is a client-side project, a configuration script called fetch-config is executed before the build process. This script sends a GET request to the provider and generates a .env file with the configuration variables, which index.js then reads.

2. **Ambassador**: This pattern was mainly implemented to manage communication with external services, in this case the Redis client used for messaging between microservices, mainly TODOS-API with redisClient. The Ambassador pattern acts as an intermediary between the microservice and Redis, handling connection logic and error management.

	* Additional functionalities were integrated into the Ambassador to strengthen communication:
		* **Retry Strategy**: An automatic retry strategy was incorporated, allowing the Ambassador to attempt to reconnect to the Redis client in case of connection failures, using a configurable maximum number of attempts.
		* **Circuit Breaker**: A circuit breaker mechanism was added, monitoring failed connection attempts and, after exceeding a defined threshold, opening the circuit to prevent new attempts for a set period (60 seconds in this case).

	* The logic for the Ambassador pattern and its additional functions is found in the `redisAmbassador` component.

## Architecture Diagram
![Ingesoft drawio](./Ingesoft.drawio.png)

## Ideal Architecture Diagram
![Diagrama de infrastructura ideal drawio (1)](https://github.com/user-attachments/assets/525d303d-20bb-4bcc-b934-ab64255db237)



