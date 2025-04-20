package com.elgris.usersapi.configuration;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertiesPropertySource;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Properties;

@Component
public class DatabasePropertySourceInitializer implements EnvironmentPostProcessor {

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        // Default values (will be used if DB connection fails)
        Properties props = new Properties();
        props.put("jwt.secret", environment.getProperty("jwt.secret", "myfancysecret"));
        props.put("server.port", environment.getProperty("server.port", "8083"));
        props.put("spring.zipkin.baseUrl", environment.getProperty("spring.zipkin.baseUrl", "http://127.0.0.1:9411/"));
        props.put("spring.sleuth.sampler.percentage", environment.getProperty("spring.sleuth.sampler.percentage", "100.0"));

        try {
            // Load the PostgreSQL JDBC driver explicitly
            Class.forName("org.postgresql.Driver");
                    
            // Connect to the PostgreSQL database with proper JDBC URL format
            Connection conn = DriverManager.getConnection(
                "jdbc:postgresql://ep-delicate-scene-a43o2df1.us-east-1.aws.neon.tech/todo?sslmode=require",
                "icesi-viajes_owner", 
                "ji6kwCcDPs5o"
            );

            // Query the configuration table
            Statement stmt = conn.createStatement();
            ResultSet rs = stmt.executeQuery("SELECT name, value FROM config_table");

            // Process the results
            while (rs.next()) {
                String name = rs.getString("name");
                String value = rs.getString("value");
                
                // Map the DB column names to Spring property names
                switch (name) {
                    case "JWT_SECRET":
                        props.put("jwt.secret", value);
                        break;
                    case "SERVER_PORT":
                        props.put("server.port", value);
                        break;
                    case "ZIPKIN_URL":
                        props.put("spring.zipkin.baseUrl", value);
                        break;
                    // Add other mappings as needed
                }
            }
            
            rs.close();
            stmt.close();
            conn.close();
            
            System.out.println("Successfully loaded configuration from database");
        } catch (Exception e) {
            System.err.println("Failed to load configuration from database: " + e.getMessage());
            e.printStackTrace();
            // Continue with default values
        }

        // Add the properties to the environment
        PropertiesPropertySource propertySource = new PropertiesPropertySource("databaseProperties", props);
        environment.getPropertySources().addFirst(propertySource);
    }
}