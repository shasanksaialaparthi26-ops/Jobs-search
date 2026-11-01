# Notification service

The standalone Spring Boot notification service listens on port `8084`; the API gateway routes authenticated `/api/notifications/**` calls to it. Its channel interface (`NotificationChannel`) separates notification delivery from providers, and `EmailDeliveryProvider` separates the email channel from Mailgun. SMS or other channels can be added by implementing the corresponding channel/provider interfaces without changing the API authentication or existing email adapter.

The first supported channel is email. The service does not own or store templates. Senders supply a Mailgun dynamic template name and string variables; templates can be provisioned or managed by another service directly in Mailgun. Emails are sent only to the signed-in user's **verified** Keycloak email claim, not to an arbitrary client-supplied recipient. Delivery is user-initiated; application status changes do not automatically send email.

Start the service:

```sh
mvn -f backend/pom.xml -pl notification-service spring-boot:run
```

Set `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, and `MAILGUN_FROM_ADDRESS`; optionally set `MAILGUN_BASE_URL` for the Mailgun region/account API endpoint and `KEYCLOAK_ISSUER_URI` for the token issuer. When the issuer URL is not directly reachable from the service network, set `KEYCLOAK_JWK_SET_URI` to the reachable signing-key endpoint while keeping the issuer URI equal to the token's `iss` claim. Do not commit provider credentials.

`POST /api/notifications/email` accepts `{"templateName":"application-update","variables":{"company":"Example"}}`. The request uses the named Mailgun template and passes `variables` through as `t:variables`; the email recipient is read from the verified access-token claim. A successful request returns `202 Accepted` with the Mailgun message ID and channel.
