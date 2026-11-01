# Backend services

The backend contains a Spring Cloud API gateway, a Keycloak-backed user service, a standalone resume service that stores and tailors resumes with Ollama, a persistent application-tracking service, and an extensible notification service. Local Compose includes Keycloak, MinIO, Ollama, PostgreSQL, and the notification service. Keycloak owns passwords and social identity federation; services do not store passwords or accept ID tokens as API credentials.

## Start Keycloak

Set strong local secrets and the Mailgun settings, then start local dependencies and Keycloak's idempotent realm/client setup:

```sh
export KEYCLOAK_ADMIN_PASSWORD='choose-a-local-admin-password'
export KEYCLOAK_CLIENT_SECRET='choose-a-separate-service-client-secret'
export MAILGUN_API_KEY='your-mailgun-api-key'
export MAILGUN_DOMAIN='mg.example.com'
export MAILGUN_FROM_ADDRESS='Northstar <notifications@mg.example.com>'
docker compose -f backend/docker-compose.yml up -d
```

The setup creates realm `jobs-search`, a browser client `jobs-web` using the authorization-code flow, an API audience mapper (`jobs-api`), and a confidential service client with the `manage-users` role. Configure `KEYCLOAK_CLIENT_SECRET` in the environment when starting `user-service` too.

Compose also starts MinIO and creates the `resumes` bucket for local resume uploads, and starts Ollama for local AI tailoring. Download the default model once:

```sh
docker compose -f backend/docker-compose.yml exec ollama ollama pull llama3.2
```

The local MinIO console is at [http://localhost:9001](http://localhost:9001), using `local-minio` / `local-minio-secret` by default. These credentials are for local development only.

Compose starts PostgreSQL for application tracking on port `5432`. Local defaults are database/user `applications` and password `local-applications-password`; configure `APPLICATION_DB_NAME`, `APPLICATION_DB_USER`, and `APPLICATION_DB_PASSWORD` before starting Compose to override them. The notification service runs on port `8084`; configure `MAILGUN_BASE_URL` for Mailgun's US or EU API endpoint, plus `MAILGUN_DOMAIN`, `MAILGUN_API_KEY`, and `MAILGUN_FROM_ADDRESS`. Use a Keycloak account with a verified email claim to authorize an email send; local signup does not mark email addresses verified.

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

The UI uses Keycloak with authorization code + PKCE against realm `jobs-search`, client `jobs-web`. Keycloak's login page then offers the configured Google and GitHub providers. Register the frontend callback with Keycloak via `JOBS_WEB_REDIRECT_URI` and `JOBS_WEB_ORIGIN`. Signed-in users can upload a PDF or DOCX resume, up to 10 MB, from the **My resume** page, paste a job description, and compare it with their latest resume using Ollama. The app shows matched skills and possible gaps, then creates an editable draft only after the user confirms which missing skills they genuinely have. Review the draft, then download it as PDF, Word (`.docx`), or plain text. The **Applications** page lets users add opportunities and move them through Saved, Resume ready, Applied, Interview, Offer, Rejected, and Withdrawn. From a tailored draft, **Track this job application** pre-fills its job description in a new tracker entry. Tracker data is stored per user in PostgreSQL. The original uploaded resume is never changed. The resume service stores files in the S3-compatible bucket under a per-user opaque prefix; raw object keys are not returned to the browser. Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` when running the resume service to select another Ollama endpoint or model. The Chat page is a static coming-soon placeholder.

## Run the services

From the repository root, in separate terminals:

```sh
export KEYCLOAK_CLIENT_SECRET='the-same-service-client-secret'
mvn -f backend/pom.xml -pl user-service spring-boot:run
mvn -f backend/pom.xml -pl api-gateway spring-boot:run
mvn -f backend/pom.xml -pl resume-service spring-boot:run
mvn -f backend/pom.xml -pl application-service spring-boot:run
mvn -f backend/pom.xml -pl notification-service spring-boot:run
```

The gateway listens on port `8080`, the user service on `8081`, the resume service on `8082`, the application service on `8083`, the notification service on `8084`, and local Keycloak on `8180`. Local PostgreSQL for tracking listens on `5432`. Configure `KEYCLOAK_ISSUER_URI` to the exact public issuer URL used in Keycloak tokens when deploying elsewhere.

For local development, the resume service connects to MinIO at `http://localhost:9000` and Ollama at `http://localhost:11434`. Set `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `OLLAMA_BASE_URL`, and `OLLAMA_MODEL` in the resume service environment as needed. The gateway routes `/api/resumes/**` to `RESUME_SERVICE_URL` (default `http://localhost:8082`); other API paths continue to route to `USER_SERVICE_URL`.

The resume service independently validates authenticated bearer access tokens (issuer, signature, expiration, and the `jobs-api` audience). Its endpoints are proxied through the gateway:

- `GET /api/resumes/latest` reports the latest uploaded resume.
- `POST /api/resumes/analyze` accepts `{"jobDescription":"..."}` and returns a match score, supported skills, potential gaps, and recommendations.
- `POST /api/resumes/tailor` accepts `{"jobDescription":"...","confirmedSkills":["..."]}` and returns an editable draft. `confirmedSkills` must only contain skills the user explicitly confirms they have.
- `POST /api/resumes/export?format=pdf|docx` exports the reviewed draft as PDF or Word. Plain text is downloaded directly by the frontend.

The default model settings are `OLLAMA_BASE_URL=http://localhost:11434` and `OLLAMA_MODEL=llama3.2`. The app needs Ollama reachable from the resume-service process, and the model must be pulled locally first.

The application tracker API is independently authenticated and stores records in PostgreSQL:

- `GET /api/applications` lists the current user's records.
- `POST /api/applications` creates an application.
- `PUT /api/applications/{id}` updates details or status.
- `DELETE /api/applications/{id}` removes an application.

Statuses are `SAVED`, `READY_TO_APPLY`, `APPLIED`, `INTERVIEW`, `OFFER`, `REJECTED`, and `WITHDRAWN`. Configure `APPLICATION_DB_URL`, `APPLICATION_DB_USER`, and `APPLICATION_DB_PASSWORD` for the application service.
The gateway routes `/api/applications/**` to `APPLICATION_SERVICE_URL` (default `http://localhost:8083`). See [`application-service/README.md`](application-service/README.md) for service configuration.

The notification service sends user-requested email via Mailgun. It accepts a dynamic template name and template variables, but does not manage or store templates. The recipient is always the authenticated user's verified Keycloak email; status updates do not send email automatically. `POST /api/notifications/email` accepts `{"templateName":"application-update","variables":{"company":"Example"}}`. The gateway routes `/api/notifications/**` to `NOTIFICATION_SERVICE_URL` (default `http://localhost:8084`). See [`notification-service/README.md`](notification-service/README.md) for configuration and extension points for future channels such as SMS.

## API security and signup

The gateway validates bearer **access tokens** against Keycloak's issuer, signature, expiration, and the `jobs-api` audience. It routes `/api/resumes/**`, `/api/applications/**`, and `/api/notifications/**` to their independently secured services and other API requests to the user service. Backend services validate access tokens independently as well. Requests without a valid access token receive `401`, except the public signup endpoint `POST /api/users`. Do not send ID tokens to APIs.

Create a user through the gateway:

```sh
curl -i http://localhost:8080/api/users \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.com","password":"a-long-local-password"}'
```

The endpoint validates the input and creates the account in Keycloak. Passwords are sent only to Keycloak and are never returned. Invalid input returns `400`; an existing email returns `409`. After signup, the user signs in through the frontend's OIDC authorization-code + PKCE flow and sends the resulting access token as `Authorization: Bearer <access-token>` on protected API requests.

The Compose Keycloak, MinIO, PostgreSQL, Ollama, and notification configuration is for local development. For production, use Keycloak's production mode behind HTTPS, protect secrets with a secret manager, configure email verification, limit signup and notification abuse, and keep backend services private behind the gateway. Point `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` at a private production bucket; enforce encryption, lifecycle/retention, and access policies there. Use managed PostgreSQL with backups and restrict allowed web origins and redirect URIs to the deployed frontend.
