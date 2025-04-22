const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function fetchConfig() {
  const client = new Client({
    connectionString: "postgresql://icesi-viajes_owner:ji6kwCcDPs5o@ep-delicate-scene-a43o2df1.us-east-1.aws.neon.tech/todo",
    ssl: {
      rejectUnauthorized: false, // Allow self-signed certificates
    },
  });

  try {
    await client.connect();
    const res = await client.query("SELECT name, value FROM config_table");
    const envVars = res.rows.map((row) => `${row.name}=${row.value}`).join('\n');
    const envFilePath = path.resolve(__dirname, './.env'); // Adjusted path to save in the config folder
    console.log("Environment variables fetched from database:", envVars);
    fs.writeFileSync(envFilePath, envVars); // Write environment variables to .env file
    await client.end();
    console.log("Configuration fetched and environment variables set.");
  } catch (err) {
    console.error("Failed to fetch configuration from database:", err);
    process.exit(1);
  }
}

fetchConfig()
  .then(() => console.log("Configuration fetch complete."))
  .catch((err) => console.error("Error in configuration fetch:", err));