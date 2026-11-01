package com.jobssearch.notifications;

import org.springframework.stereotype.Component;

@Component
public class EmailNotificationChannel implements NotificationChannel {
    private final EmailDeliveryProvider deliveryProvider;

    public EmailNotificationChannel(EmailDeliveryProvider deliveryProvider) {
        this.deliveryProvider = deliveryProvider;
    }

    @Override
    public NotificationType type() {
        return NotificationType.EMAIL;
    }

    @Override
    public NotificationReceipt send(NotificationMessage message) {
        String providerId = deliveryProvider.send(
                new EmailMessage(message.recipient(), message.templateName(), message.variables()));
        return new NotificationReceipt(providerId, type(), "accepted");
    }
}
