# Backend services

The backend contains a Spring Cloud API gateway, a Keycloak-backed user service, an S3-compatible resume store, and a local Keycloak/MinIO setup. Keycloak owns passwords and social identity federation; services do not store passwords or accept ID tokens as API credentials.

## Start Keycloak

Set strong local secrets, then start Keycloak and its idempotent realm/client setup:

```sh
export KEYCLOAK_ADMIN_PASSWORD='choose-a-local-admin-password'
export KEYCLOAK_CLIENT_SECRET='choose-a-separate-service-client-secret'
docker compose -f backend/docker-compose.yml up -d
```

The setup creates realm `jobs-search`, a browser client `jobs-web` using the authorization-code flow, an API audience mapper (`jobs-api`), and a confidential service client with the `manage-users` role. Configure `KEYCLOAK_CLIENT_SECRET` in the environment when starting `user-service` too.

Compose also starts MinIO and creates the `resumes` bucket for local resume uploads. The local MinIO console is at [http://localhost:9001](http://localhost:9001), using `local-minio` / `local-minio-secret` by default. These credentials are for local development only.

## Start the UI

The React/Vite app runs at `http://localhost:3000`. Start it from another terminal:

```sh
cd backend/ui
npm install
npm run dev
```

Copy `.env.example` to `.env.local` to override the Keycloak or API URLs. The default UI origin matches the Keycloak redirect URI and API gateway CORS origin.

### Google and GitHub sign-in

Create OAuth apps with Google and GitHub and set their credentials before starting Compose:

```sh
export GOOGLE_CLIENT_ID='...'
export GOOGLE_CLIENT_SECRET='...'
export GITHUB_CLIENT_ID='...'
export GITHUB_CLIENT_SECRET='...'
```

Set either provider or both. Register this callback URL in each provider's OAuth app:

```text
http://localhost:8180/realms/jobs-search/broker/google/endpoint
http://localhost:8180/realms/jobs-search/broker/github/endpoint
```

Restart `keycloak-setup` after changing provider credentials:

```sh
docker compose -f backend/docker-compose.yml up -d --force-recreate keycloak-setup
```

The UI uses Keycloak with authorization code + PKCE against realm `jobs-search`, client `jobs-web`. Keycloak's login page then offers the configured Google and GitHub providers. Register the frontend callback with Keycloak via `JOBS_WEB_REDIRECT_URI` and `JOBS_WEB_ORIGIN`. Signed-in users can upload a PDF or DOCX resume, up to 10 MB, from the **My resume** page. The authenticated request is stored in the S3-compatible bucket under a per-user opaque prefix; raw object keys are not returned to the browser. The Chat page is a static coming-soon placeholder.

## Run the services

From the repository root, in separate terminals:

```sh
export KEYCLOAK_CLIENT_SECRET='the-same-service-client-secret'
mvn -f backend/pom.xml -pl user-service spring-boot:run
mvn -f backend/pom.xml -pl api-gateway spring-boot:run
```

The gateway listens on port `8080`, the user service on `8081`, and local Keycloak on `8180`. Configure `KEYCLOAK_ISSUER_URI` to the exact public issuer URL used in Keycloak tokens when deploying elsewhere.

## API security and signup

Every gateway request is routed to the user service. The gateway and user service both validate bearer **access tokens** against Keycloak's issuer, signature, expiration, and the `jobs-api` audience. Requests without a valid access token receive `401`, except the public signup endpoint `POST /api/users`. Do not send ID tokens to APIs.

Create a user through the gateway:

```sh
curl -i http://localhost:8080/api/users \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.com","password":"a-long-local-password"}'
```

The endpoint validates the input and creates the account in Keycloak. Passwords are sent only to Keycloak and are never returned. Invalid input returns `400`; an existing email returns `409`. After signup, the user signs in through the frontend's OIDC authorization-code + PKCE flow and sends the resulting access token as `Authorization: Bearer <access-token>` on protected API requests.

The Compose Keycloak and MinIO configuration is for local development. For production, use Keycloak's production mode behind HTTPS, protect secrets with a secret manager, configure SMTP/email verification, limit signup abuse, and keep the user service private behind the gateway. Point `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` at a private production bucket; enforce encryption, lifecycle/retention, and access policies there. Restrict allowed web origins and redirect URIs to the deployed frontend.
