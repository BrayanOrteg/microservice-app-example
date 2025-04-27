package com.elgris.usersapi.configuration;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertiesPropertySource;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.ResponseEntity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Properties;
import java.util.HashMap;
import java.util.Map;

@Component
@EnableScheduling
public class DatabasePropertySourceInitializer implements EnvironmentPostProcessor {
    
    private static final String CONFIG_PROVIDER_URL = System.getenv("CONFIG_PROVIDER_URL") != null ? 
                                                       System.getenv("CONFIG_PROVIDER_URL") : 
                                                       "http://config-provider:8888";
    
    private static Properties currentProps = new Properties();
    private static Map<String, String> lastUpdated = new HashMap<>();
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final RestTemplate restTemplate = new RestTemplate();

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        // Set default values
        currentProps.put("jwt.secret", environment.getProperty("jwt.secret", ""));
        currentProps.put("server.port", environment.getProperty("server.port", ""));
        currentProps.put("spring.zipkin.baseUrl", environment.getProperty("spring.zipkin.baseUrl", ""));
        
        try {
            // Fetch configuration from Config Provider instead of directly from DB
            fetchAndUpdateConfig();
            
            // Add the properties to the environment
            PropertiesPropertySource propertySource = new PropertiesPropertySource("configProviderProperties", currentProps);
            environment.getPropertySources().addFirst(propertySource);
            
            System.out.println("Successfully loaded configuration from config provider");
        } catch (Exception e) {
            System.err.println("Failed to load configuration from config provider: " + e.getMessage());
            e.printStackTrace();
            // Continue with default values from environment
        }
    }

    @Scheduled(fixedRate = 60000) // Check every minute
    public static void refreshConfiguration() {
        try {
            fetchAndUpdateConfig();
            System.out.println("Configuration refreshed from config provider");
        } catch (Exception e) {
            System.err.println("Failed to refresh configuration: " + e.getMessage());
        }
    }
    
    private static void fetchAndUpdateConfig() throws Exception {
        String url = CONFIG_PROVIDER_URL + "/config/users-api";
        ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
        
        if (response.getStatusCode().is2xxSuccessful()) {
            JsonNode rootNode = objectMapper.readTree(response.getBody());
            JsonNode configNode = rootNode.path("config");
            JsonNode updatesNode = rootNode.path("last_updated");
            
            // Process configuration values and map them to Spring properties
            if (configNode.has("JWT_SECRET")) {
                currentProps.put("jwt.secret", configNode.get("JWT_SECRET").asText());
            }
            
            if (configNode.has("SERVER_PORT")) {
                currentProps.put("server.port", configNode.get("SERVER_PORT").asText());
            }
            
            if (configNode.has("ZIPKIN_URL")) {
                currentProps.put("spring.zipkin.baseUrl", configNode.get("ZIPKIN_URL").asText());
            }
            
            // Update last_updated timestamps
            updatesNode.fields().forEachRemaining(entry -> {
                lastUpdated.put(entry.getKey(), entry.getValue().asText());
            });
        } else {
            throw new Exception("Failed to fetch configuration: " + response.getStatusCode());
        }
    }
}