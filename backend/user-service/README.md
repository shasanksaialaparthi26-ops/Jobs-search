# User service

The Spring Boot user service listens on port `8081`. It validates Keycloak bearer access tokens (issuer, signature, expiration, and `jobs-api` audience) for protected requests. `POST /api/users` is the public signup endpoint and creates the account in Keycloak using the configured service-account client.

Authenticated `POST /api/resumes` accepts a multipart `file` field containing a PDF or DOCX up to 10 MB and stores it in the configured S3-compatible bucket. The object key is derived from the authenticated user's token subject and a random identifier; it is not exposed in the response.

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "ada@example.com",
  "password": "a-long-local-password"
}
```

See [`../README.md`](../README.md) for Keycloak and local MinIO setup, Google/GitHub identity-provider configuration, OIDC login, and the gateway request example. Configure `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, and `KEYCLOAK_ISSUER_URI` for the deployment. Set `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` for the resume store. Keep this service and storage private behind the gateway in production.
