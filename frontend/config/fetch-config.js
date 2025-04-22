const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function fetchConfig() {
  // Database connection string
  const client = new Client({
    connectionString: "postgresql://icesi-viajes_owner:ji6kwCcDPs5o@ep-delicate-scene-a43o2df1.us-east-1.aws.neon.tech/todo",
    ssl: {
      rejectUnauthorized: false, // Allow self-signed certificates
    },
  });

  try {
    // Connect to the database and fetch configuration
    await client.connect();
    const res = await client.query("SELECT name, value FROM config_table");
    // Map the results to environment variables format
    const envVars = res.rows.map((row) => `${row.name}=${row.value}`).join('\n');
    // Write the environment variables to a .env file
    const envFilePath = path.resolve(__dirname, './.env');
    console.log("Environment variables fetched from database:", envVars);
    fs.writeFileSync(envFilePath, envVars);
    await client.end();
    console.log("Configuration fetched and environment variables set.");
  } catch (err) {
    console.error("Failed to fetch configuration from database:", err);
    process.exit(1);
  }
}

// Execute the function to fetch configuration
fetchConfig()
  .then(() => console.log("Configuration fetch complete."))
  .catch((err) => console.error("Error in configuration fetch:", err));