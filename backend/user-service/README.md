# User service

The Spring Boot user service listens on port `8081`. It validates Keycloak bearer access tokens (issuer, signature, expiration, and `jobs-api` audience) for protected requests. `POST /api/users` is the public signup endpoint and creates the account in Keycloak using the configured service-account client. Resume upload, storage, analysis, and tailoring belong to the separate [`resume-service`](../resume-service/).

The resume-tailoring endpoints are not part of this service; they are owned by [`resume-service`](../resume-service/README.md).

See [`../README.md`](../README.md) for Keycloak setup, Google/GitHub identity-provider configuration, OIDC login, gateway routing, and the signup request example. Configure `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, and `KEYCLOAK_ISSUER_URI` for the deployment. Keep this service private behind the gateway in production.
