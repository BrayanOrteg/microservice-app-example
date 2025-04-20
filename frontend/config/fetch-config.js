const { Client } = require('pg');

async function fetchConfig() {
  const client = new Client({
    connectionString: "postgresql://icesi-viajes_owner:ji6kwCcDPs5o@ep-delicate-scene-a43o2df1.us-east-1.aws.neon.tech/todo",
    ssl: {
      rejectUnauthorized: false // Allow self-signed certificates
    }
  });

  try {
    await client.connect();
    const res = await client.query("SELECT name, value FROM config_table");
    res.rows.forEach(row => {
      process.env[row.name] = row.value;
    });
    await client.end();
    console.log("Configuration fetched and environment variables set.");
  } catch (err) {
    console.error("Failed to fetch configuration from database:", err);
    process.exit(1);
  }
}

fetchConfig();