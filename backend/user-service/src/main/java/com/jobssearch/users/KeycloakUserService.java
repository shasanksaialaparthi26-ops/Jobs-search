package com.jobssearch.users;

import java.net.URI;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class KeycloakUserService {
    private final RestClient restClient;
    private final String clientId;
    private final String clientSecret;
    private final URI tokenUri;
    private final URI usersUri;

    public KeycloakUserService(
            RestClient.Builder restClientBuilder,
            @Value("${keycloak.url}") String keycloakUrl,
            @Value("${keycloak.realm}") String realm,
            @Value("${keycloak.client-id}") String clientId,
            @Value("${keycloak.client-secret}") String clientSecret) {
        this.restClient = restClientBuilder.build();
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.tokenUri = UriComponentsBuilder.fromUriString(keycloakUrl)
                .pathSegment("realms", realm, "protocol", "openid-connect", "token")
                .build().toUri();
        this.usersUri = UriComponentsBuilder.fromUriString(keycloakUrl)
                .pathSegment("admin", "realms", realm, "users")
                .build().toUri();
    }

    public User createUser(CreateUserRequest request) {
        try {
            String accessToken = getAccessToken();
            URI location = restClient.post()
                    .uri(usersUri)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new KeycloakUser(
                            request.email(),
                            request.email(),
                            request.firstName(),
                            request.lastName(),
                            true,
                            List.of(new Credential("password", request.password(), false))))
                    .retrieve()
                    .toBodilessEntity()
                    .getHeaders()
                    .getLocation();

            if (location == null || location.getPath() == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY, "Identity provider returned no user identifier");
            }

            String[] pathSegments = location.getPath().split("/");
            String id = pathSegments[pathSegments.length - 1];
            if (id.isBlank()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY, "Identity provider returned no user identifier");
            }
            return new User(id, request.firstName(), request.lastName(), request.email());
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 409) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "A user with this email already exists");
            }
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Identity provider request failed");
        } catch (RestClientException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Identity provider is unavailable");
        }
    }

    private String getAccessToken() {
        LinkedMultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "client_credentials");
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);

        TokenResponse token = restClient.post()
                .uri(tokenUri)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(TokenResponse.class);
        if (token == null || token.accessToken() == null || token.accessToken().isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Identity provider returned no access token");
        }
        return token.accessToken();
    }

    private record TokenResponse(@JsonProperty("access_token") String accessToken) {
    }

    private record KeycloakUser(
            String username,
            String email,
            String firstName,
            String lastName,
            boolean enabled,
            List<Credential> credentials) {
    }

    private record Credential(String type, String value, boolean temporary) {
    }
}
