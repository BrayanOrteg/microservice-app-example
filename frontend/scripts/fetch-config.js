const { AppConfigurationClient } = require("@azure/app-configuration");

module.exports = async function (context, req) {
    const connectionString = process.env.APPCONFIG_CONNECTION_STRING;
    if (!connectionString) {
        context.log("Error: APPCONFIG_CONNECTION_STRING environment variable not set.");
        context.res = {
            status: 400,
            body: "APPCONFIG_CONNECTION_STRING environment variable is missing."
        };
        return;
    }

    const client = new AppConfigurationClient(connectionString);
    let envContent = "";

    const configKeys = {
        "frontend.port": "PORT",
        "auth-api.address": "AUTH_API_ADDRESS",
        "todos-api.address": "TODOS_API_ADDRESS",
        "zipkin.url": "ZIPKIN_URL"
    };

    context.log("Fetching configuration from Azure App Configuration...");

    for (const [appConfigKey, envVarName] of Object.entries(configKeys)) {
        try {
            const setting = await client.getConfigurationSetting({ key: appConfigKey });
            if (setting && setting.value) {
                context.log(`Fetched ${appConfigKey}: ${setting.value}`);
                // Setting the config values as environment variables
                process.env[envVarName] = setting.value;
            } else {
                context.warn(`Warning: Key "${appConfigKey}" not found or has no value in Azure App Configuration.`);
            }
        } catch (error) {
            context.error(`Error fetching key "${appConfigKey}": ${error.message}`);
        }
    }

    try {
        const port = (await client.getConfigurationSetting({ key: "frontend.port" })).value || '8080';
        const authPort = (await client.getConfigurationSetting({ key: "auth-api.port" })).value;
        const todosPort = (await client.getConfigurationSetting({ key: "todos-api.port" })).value;
        const zipkinUrl = (await client.getConfigurationSetting({ key: "zipkin.url" })).value;

        process.env.PORT = port;
        if (authPort) process.env.AUTH_API_ADDRESS = `http://127.0.0.1:${authPort}`;
        if (todosPort) process.env.TODOS_API_ADDRESS = `http://127.0.0.1:${todosPort}`;
        if (zipkinUrl) process.env.ZIPKIN_URL = zipkinUrl;
    } catch (error) {
        context.error(`Error fetching configuration: ${error}`);
    }

    context.res = {
        status: 200,
        body: "Configuration successfully fetched and set as environment variables."
    };
};
