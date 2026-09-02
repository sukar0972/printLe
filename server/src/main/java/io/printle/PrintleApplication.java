package io.printle;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class PrintleApplication {
    public static void main(String[] args) {
        SpringApplication.run(PrintleApplication.class, args);
    }
}
