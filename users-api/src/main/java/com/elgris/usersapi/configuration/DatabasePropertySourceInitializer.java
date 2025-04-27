package com.elgris.usersapi.configuration;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertiesPropertySource;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.ResponseEntity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Properties;
import java.util.Map;

@Component
public class DatabasePropertySourceInitializer implements EnvironmentPostProcessor {
    
    private static String CONFIG_PROVIDER_URL;
    
    private static Properties currentProps = new Properties();
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final RestTemplate restTemplate = new RestTemplate();

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        // Set default values
        currentProps.put("jwt.secret", environment.getProperty("jwt.secret", ""));
        currentProps.put("server.port", environment.getProperty("server.port", ""));
        currentProps.put("spring.zipkin.baseUrl", environment.getProperty("spring.zipkin.baseUrl", ""));
        
        // Get configuration provider URL from environment
        CONFIG_PROVIDER_URL = environment.getProperty("config.provider.url", "");
        
        try {
            // Fetch configuration from Config Provider instead of directly from DB
            fetchAndUpdateConfig();
            
            // Add the properties to the environment
            PropertiesPropertySource propertySource = new PropertiesPropertySource("configProviderProperties", currentProps);
            environment.getPropertySources().addFirst(propertySource);
            
            System.out.println("Successfully loaded configuration from config provider: " + CONFIG_PROVIDER_URL);
        } catch (Exception e) {
            System.err.println("Failed to load configuration from config provider: " + e.getMessage());
            e.printStackTrace();
            // Continue with default values from environment
        }
    }

    public static void updateConfigurationFromMap(Map<String, String> configMap) throws Exception {
        if (configMap.containsKey("JWT_SECRET")) {
            currentProps.put("jwt.secret", configMap.get("JWT_SECRET"));
        }
        
        if (configMap.containsKey("USERS_API_PORT")) {
            currentProps.put("server.port", configMap.get("USERS_API_PORT"));
        }
        
        if (configMap.containsKey("ZIPKIN_URL")) {
            currentProps.put("spring.zipkin.baseUrl", configMap.get("ZIPKIN_URL"));
        }
        
        System.out.println("Updated properties: " + currentProps);
    }
    
    private static void fetchAndUpdateConfig() throws Exception {
        String url = CONFIG_PROVIDER_URL + "/config/users-api";
        ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
        
        if (response.getStatusCode().is2xxSuccessful()) {
            JsonNode rootNode = objectMapper.readTree(response.getBody());
            JsonNode configNode = rootNode.path("config");

            // Process configuration values and map them to Spring properties
            if (configNode.has("JWT_SECRET")) {
                currentProps.put("jwt.secret", configNode.get("JWT_SECRET").asText());
            }
            
            if (configNode.has("USERS_API_PORT")) {
                currentProps.put("server.port", configNode.get("USERS_API_PORT").asText());
            }
            
            if (configNode.has("ZIPKIN_URL")) {
                currentProps.put("spring.zipkin.baseUrl", configNode.get("ZIPKIN_URL").asText());
            }
            
            System.out.println("Updated properties: " + currentProps);
            
        } else {
            throw new Exception("Failed to fetch configuration: " + response.getStatusCode());
        }
    }
}
