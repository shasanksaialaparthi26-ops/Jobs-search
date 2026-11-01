# Application tracking service

The standalone Spring Boot application service listens on port `8083`. The API gateway routes authenticated `/api/applications/**` requests to it. It validates Keycloak access tokens independently and scopes all records to the token subject.

Applications are persisted in PostgreSQL. Local Compose starts the database (`applications` database, user `applications`, local-only password `local-applications-password`) on port `5432`; `application-service` runs separately with Maven:

```sh
mvn -f backend/pom.xml -pl application-service spring-boot:run
```

Configure `APPLICATION_DB_URL`, `APPLICATION_DB_USER`, `APPLICATION_DB_PASSWORD`, and `KEYCLOAK_ISSUER_URI` for other environments. Flyway manages the schema. Replace the local database password and use managed secrets and backups in production.

API endpoints:

- `GET /api/applications` lists the signed-in user's applications.
- `POST /api/applications` creates an entry.
- `PUT /api/applications/{id}` updates an entry, including moving it to another status.
- `DELETE /api/applications/{id}` deletes an entry owned by the signed-in user.

Supported statuses are `SAVED`, `READY_TO_APPLY`, `APPLIED`, `INTERVIEW`, `OFFER`, `REJECTED`, and `WITHDRAWN`. All endpoints require a valid access token with the `jobs-api` audience. The service never trusts a user ID supplied by the client.
