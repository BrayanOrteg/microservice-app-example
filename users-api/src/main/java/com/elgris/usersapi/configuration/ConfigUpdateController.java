package com.elgris.usersapi.configuration;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.HashMap;

@RestController
public class ConfigUpdateController {
    
    @PostMapping("/config/update")
    public Map<String, String> updateConfig(@RequestBody Map<String, Map<String, String>> request) {
        try {
            Map<String, String> configMap = request.get("config");
            if (configMap != null) {
                System.out.println("Received configuration update: " + configMap);
                DatabasePropertySourceInitializer.updateConfigurationFromMap(configMap);
                
                // Use HashMap instead of Map.of() which is Java 9+
                Map<String, String> response = new HashMap<>();
                response.put("status", "Configuration updated successfully");
                return response;
            } else {
                Map<String, String> response = new HashMap<>();
                response.put("status", "No configuration data provided");
                return response;
            }
        } catch (Exception e) {
            System.err.println("Error updating configuration: " + e.getMessage());
            Map<String, String> response = new HashMap<>();
            response.put("status", "Failed to update configuration: " + e.getMessage());
            return response;
        }
    }
}
