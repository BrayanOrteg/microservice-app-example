const axios = require('axios');
const fs = require('fs');
const path = require('path');

const configProviderUrl = "http://192.168.1.10:8888";

async function fetchConfig() {
  try {
    // Fetch configuration from the config provider service
    const response = await axios.get(`${configProviderUrl}/config/frontend`);
    
    if (response.status === 200) {
      const config = response.data.config;
      
      // Format as environment variables
      const envVars = Object.entries(config)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      
      // Write to .env file
      const envFilePath = path.resolve(__dirname, './.env');
      fs.writeFileSync(envFilePath, envVars);
      
      console.log("Configuration fetched and environment variables set:", envVars);
    } else {
      console.error("Failed to fetch configuration:", response.status);
      process.exit(1);
    }
  } catch (err) {
    console.error("Error fetching configuration:", err.message);
    process.exit(1);
  }
}

fetchConfig()
  .then(() => console.log("Configuration fetch complete."))
  .catch(err => console.error("Error in configuration fetch:", err));