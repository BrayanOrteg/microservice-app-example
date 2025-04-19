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

    try {
        const client = new AppConfigurationClient(connectionString);
        context.log("Fetching configuration from Azure App Configuration...");

        const configKeys = {
            "frontend.port": "PORT",
            "auth-api.address": "AUTH_API_ADDRESS",
            "todos-api.address": "TODOS_API_ADDRESS",
            "zipkin.url": "ZIPKIN_URL"
        };

        for (const [appConfigKey, envVarName] of Object.entries(configKeys)) {
            try {
                const setting = await client.getConfigurationSetting({ key: appConfigKey });
                if (setting && setting.value) {
                    context.log(`Fetched ${appConfigKey}: ${setting.value}`);
                    process.env[envVarName] = setting.value;
                } else {
                    context.log(`Warning: Key "${appConfigKey}" not found or has no value.`);
                }
            } catch (error) {
                context.log(`Error fetching key "${appConfigKey}": ${error.message}`);
            }
        }

        context.res = {
            status: 200,
            body: "Configuration successfully fetched and set as environment variables."
        };
    } catch (error) {
        context.log(`Error connecting to Azure App Configuration: ${error.message}`);
        context.res = {
            status: 500,
            body: "Failed to fetch configuration."
        };
    }
};