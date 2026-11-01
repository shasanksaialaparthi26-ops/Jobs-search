package com.jobssearch.notifications;

import java.util.Map;
import java.util.regex.Pattern;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@Validated
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private static final Pattern TEMPLATE_NAME = Pattern.compile("[A-Za-z0-9._-]{1,100}");

    private final NotificationDispatcher dispatcher;

    public NotificationController(NotificationDispatcher dispatcher) {
        this.dispatcher = dispatcher;
    }

    @PostMapping("/email")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public NotificationReceipt sendEmail(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody EmailNotificationRequest request) {
        String email = jwt.getClaimAsString("email");
        Boolean emailVerified = jwt.getClaim("email_verified");
        if (!Boolean.TRUE.equals(emailVerified) || email == null || email.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "A verified account email is required to send notifications");
        }
        if (!TEMPLATE_NAME.matcher(request.templateName()).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid email template name");
        }
        return dispatcher.send(
                NotificationType.EMAIL,
                new NotificationMessage(email, request.templateName(), request.variables()));
    }

    public record EmailNotificationRequest(
            @NotBlank @Size(max = 100) String templateName,
            @NotNull @Size(max = 50) Map<
                    @jakarta.validation.constraints.Pattern(regexp = "[A-Za-z0-9_.-]{1,100}") String,
                    @NotNull @Size(max = 5000) String> variables) {
    }
}
