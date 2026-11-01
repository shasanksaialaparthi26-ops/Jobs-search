package com.jobssearch.notifications;

import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Component
public class MailgunEmailDeliveryProvider implements EmailDeliveryProvider {
    private final RestClient mailgun;
    private final ObjectMapper objectMapper;
    private final String domain;
    private final String apiKey;
    private final String fromAddress;

    public MailgunEmailDeliveryProvider(
            ObjectMapper objectMapper,
            @Value("${mailgun.base-url}") String baseUrl,
            @Value("${mailgun.domain}") String domain,
            @Value("${mailgun.api-key}") String apiKey,
            @Value("${mailgun.from-address}") String fromAddress) {
        this.objectMapper = objectMapper;
        this.domain = domain;
        this.apiKey = apiKey;
        this.fromAddress = fromAddress;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(5_000);
        requestFactory.setReadTimeout(15_000);
        this.mailgun = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
    }

    @Override
    public String send(EmailMessage message) {
        if (apiKey.isBlank() || domain.isBlank() || fromAddress.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "Email delivery is not configured");
        }

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("from", fromAddress);
        form.add("to", message.recipient());
        form.add("template", message.templateName());
        form.add("t:variables", serializeVariables(message.variables()));

        try {
            JsonNode response = mailgun.post()
                    .uri("/v3/{domain}/messages", domain)
                    .headers(headers -> headers.setBasicAuth("api", apiKey))
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(JsonNode.class);
            if (response == null || !response.hasNonNull("id")) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY, "The email provider returned an invalid response");
            }
            return response.get("id").asText();
        } catch (RestClientResponseException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "The email provider rejected the notification");
        } catch (RestClientException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Could not reach the email provider");
        }
    }

    private String serializeVariables(Map<String, String> variables) {
        try {
            return objectMapper.writeValueAsString(variables);
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Email template variables could not be encoded");
        }
    }
}
