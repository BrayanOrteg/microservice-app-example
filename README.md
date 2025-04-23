# Taller 1: Construcción de Pipelines en Cloud

Este es el taller 1 de la materia Ingeniería de Software V de la carrera Ingeniería de sistemas de la universidad ICESI.

Realizado por
| Brayan Steven Ortega García | Andrés Camilo Romero Ruiz | 
|--|--|
| A00380171 | A00380637 |

## Cómo ejecutar?

### Localmente

En el root del proyecto se encuentra el archivo compose de docker con todas las instrucciones al igual que cada proyecto tiene su dockerfile específicado por lo que con correr el comando 

```bash
docker-compose up
```

### Desplegar en la nube

En el root del proyecto se encuentran las carpetas de ansible y terraform al igual que 2 archivos .ps1, deploy y destroy ubicados en la carpeta pipeline-infrastructure. 

#### Tome en cuenta que:

1. La infraestructura se despliega actualmente en azure, por lo que debe tener instalado **azure cli** y una **subscripción** disponible.

2. Debe dirigirse a la carpeta de **ansible** y asegurarse que exista un archivo **hosts.ini** en ansible/inventory/hosts.ini no importa si está vacío, el bash escribirá sobre el

3. Los parámetros de **deploy.ps1** son

	* **TerraformPath**  =  Dirección de windows donde se encuentra el directorio de terraform (debe acabar en /terraform)

	* **InventoryPath**  = Dirección de windows donde se encuentra el archivo hosts.ini (debe acabar en /hosts.ini)

	* **AnsiblePath**  =  Dirección de wsl donde se encuentra el directorio de ansible, comienza con /mnt (debe terminar en /ansible)

4. El parámetro de destroy.ps1 es
	* **TerraformPath**  =  Dirección de windows donde se encuentra el directorio de terraform (debe acabar en /terraform)
5. Como uno de los patrones implementados es **External Configuration Storage** todos los microservicios acceden a una db de postgresql en la nube para extraer sus variables de entornos si desea usar su propia configuración tendra que:

	* Crear una tabla con el nombre "config_table" y columnas name y value, ambas de tipo Varchar(255)
	
	* Registrar los valores de:
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
	* Dirigirse a los siguientes archivos para cambiar las urls de cada contenedor o su logíca según preferencias
		* auth-api\main.go
		* frontend\config\fetch-config.js
		* log-message-processor\main.py
		* todos-api\server.js
		* users-api\src\main\java\com\elgris\usersapi\configuration\DatabasePropertySourceInitializer.java

### Pipelines

Para la ejecución de las pipelines debe tomar en cuenta que la infraestructura ya debe de estar previamente montada, además de crear los github secrets VM_IP_KEY y VM_PASSWORD_KEY cuyos valores los podrá encontrar en hosts.ini tras ejecutar deploy.ps1.

#### Infraestructura:
*	deploy.ps1 encarga de levantar toda la infraestructura
*	destroy.ps1 encarga de bajar toda la infraestructura

#### Desarrollo
Fueron configuradas como github actions donde cada una se encarga de supervisar los cambios de su servicio en la rama main. En caso de cambio se conectarán por ssh a la vm, pulleran el repositorio y buildearan únicamente su servicio para proceder a re desplegarlo de tal forma que quede actualizado.
* auth-api.yml
* frontend.yml
* log-message-processor.yml
* todos-api.yml
* users-api.yml

## Estrategia de branching dev

Para la estrategía de branching de desarrollo elegimos gitflow ya que al ser tan solo dos personas y su caracter simple de una rama main, dev y feats se veía mucho más acorde al alcance del taller.

![Flujo de trabajo de Git: ramas de función](https://wac-cdn.atlassian.com/dam/jcr:34c86360-8dea-4be4-92f7-6597d4d5bfae/02%20Feature%20branches.svg?cdnVersion=2663)

## Estrategia de branching Ops

Ya que tan solo somos un equipo de 2 personas optamos por crear una rama desde Main llamada Ops en la cual nos encargamos de definir los archivos con la infraestructura inicial que se necesitaría para poder desplegar y testear en la nube, en este caso lo fueron terraform y ansible. Para una vez seguros de que el proyecto podía ser desplegado en la nube dar inicio al desarrollo.

## Patrones implementados

Los patrones que decidimos implementar fueron:
1. **External Configuration Storage**: donde cada microservicio se conecta a un almacenamiento externo, en este caso una db de postgresql y de extrae la información relacionada a su configuración como lo pueden ser urls de otros endpoints para mandar requests, el puerto en que se va a ejecutar, el jwt secret, entre otros. Se encuentra implementado en los archivos mencionados previamente donde todos los obtienen de forma directa a excepción
	* **users-api** donde se definió un EnvironmentPostProcessor encargado de conectarse a la db extraer las variables, mapearlas a los nombres de las propiedades de spring y agregarlas.
	* **frontend** ya que al ser un proyecto del lado el cliente y no del servidor se hizo necesario hacer un js de configuración llamado fetch-config ejecutado antes del build, encargado de leer la db y escribir un .env con los valores de las variables para que posteriormente index.js pueda leer de el.

2. **Ambassador**: donde se implementó principalmente para gestionar la comunicación con servicios externos, en este caso el cliente de Redis utilizado para la mensajería entre los microservicios principalmente de TODOS-API con redisClient. El patrón Ambassador se encarga de actuar como intermediario entre el microservicio y Redis, encargandose la lógica de conexión y el manejo de errores.

	* Dentro de la implementación del Ambassador, se integraron funcionalidades adicionales para robustecer la comunicación:
		* **Retry Strategy**: se incorporó una estrategia de reintentos automática que permite al Ambassador intentar reconectar con el cliente de Redis en caso de fallos de conexión, utilizando un número máximo de intentos configurables.
		* **Circuit Breaker**: se añadió un mecanismo de circuit breaker que monitorea los intentos fallidos de conexión y, al superar un umbral definido, abre el circuito para evitar nuevos intentos durante un periodo de tiempo determinado (60 segundos en este caso).

	* La lógica del patrón Ambassador y sus funciones adicionales se encuentra en el componente `redisAmbassador`.

## Diagrama de arquitectura

