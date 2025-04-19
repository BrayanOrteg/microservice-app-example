const fs = require('fs');
const path = require('path');
const { AppConfigurationClient } = require("@azure/app-configuration");

const envFilePath = path.resolve(__dirname, '../.env');

async function fetchAndWriteConfig() {
    const connectionString = process.env.APPCONFIG_CONNECTION_STRING;
    if (!connectionString) {
        console.error("Error: APPCONFIG_CONNECTION_STRING environment variable not set.");
        console.log("Skipping config fetch from Azure. Using defaults or existing environment variables.");
        // Optionally create a default .env file or just let index.js use its fallbacks
        // For example, ensure a default PORT is set if none exists
        if (!process.env.PORT) {
             fs.writeFileSync(envFilePath, `PORT=8080\n`, { flag: 'a' }); // Default port
             console.log(`Wrote default PORT=8080 to ${envFilePath}`);
        }
        return; // Exit if no connection string
    }

    const client = new AppConfigurationClient(connectionString);
    let envContent = "";

    const configKeys = {
        // App Config Key : .env Variable Name
        "frontend.port": "PORT",             // Assuming you store frontend port under this key
        "auth-api.address": "AUTH_API_ADDRESS", // Assuming you store the full address
        "todos-api.address": "TODOS_API_ADDRESS",// Assuming you store the full address
        "zipkin.url": "ZIPKIN_URL"           // Key from your terraform script
        // Add other keys as needed
    };

    console.log("Fetching configuration from Azure App Configuration...");

    for (const [appConfigKey, envVarName] of Object.entries(configKeys)) {
        try {
            const setting = await client.getConfigurationSetting({ key: appConfigKey });
            if (setting && setting.value) {
                console.log(`Fetched ${appConfigKey}: ${setting.value}`);
                envContent += `${envVarName}=${setting.value}\n`;
            } else {
                console.warn(`Warning: Key "${appConfigKey}" not found or has no value in Azure App Configuration.`);
            }
        } catch (error) {
            console.error(`Error fetching key "${appConfigKey}": ${error.message}`);
            // Decide if you want to stop or continue on error
        }
    }

    try {
        const port = (await client.getConfigurationSetting({ key: "frontend.port" })).value || '8080'; // Default
        const authPort = (await client.getConfigurationSetting({ key: "auth-api.port" })).value;
        const todosPort = (await client.getConfigurationSetting({ key: "todos-api.port" })).value;
        const zipkinUrl = (await client.getConfigurationSetting({ key: "zipkin.url" })).value; // Assuming this is the full URL

        envContent += `PORT=${port}\n`;
        if (authPort) envContent += `AUTH_API_ADDRESS=http://127.0.0.1:${authPort}\n`; // Or use appropriate hostname
        if (todosPort) envContent += `TODOS_API_ADDRESS=http://127.0.0.1:${todosPort}\n`; // Or use appropriate hostname
        if (zipkinUrl) envContent += `ZIPKIN_URL=${zipkinUrl}\n`;

    } catch (error) {
        console.error(`Error fetching configuration: ${error}`);
    }


    try {
        fs.writeFileSync(envFilePath, envContent);
        console.log(`Configuration written to ${envFilePath}`);
    } catch (error) {
        console.error(`Error writing ${envFilePath}: ${error}`);
    }
}

fetchAndWriteConfig().catch(error => {
    console.error("Failed to fetch and write config:", error);
    process.exit(1);
});