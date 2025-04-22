package com.elgris.usersapi;

import com.elgris.usersapi.security.JwtAuthenticationFilter;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class UsersApiApplication {

	public static void main(String[] args) {
		System.out.println("Starting Users API Application....");
		SpringApplication.run(UsersApiApplication.class, args);
	}
}
