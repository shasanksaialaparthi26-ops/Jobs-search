package com.jobssearch.notifications;

public interface NotificationChannel {
    NotificationType type();

    NotificationReceipt send(NotificationMessage message);
}
