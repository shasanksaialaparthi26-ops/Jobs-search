# API gateway

Spring Cloud Gateway listens on port `8080` and forwards every request to the user service at `http://localhost:8081` by default. It requires a Keycloak-signed bearer access token with the configured issuer and `jobs-api` audience, except for `POST /api/users` signup.

Set `USER_SERVICE_URL` to change the upstream service URL. Set `KEYCLOAK_ISSUER_URI` to the token issuer URL when deploying outside local development.

```sh
mvn -f backend/pom.xml -pl api-gateway spring-boot:run
```
