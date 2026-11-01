package com.jobssearch.notifications;

public record NotificationReceipt(String providerId, NotificationType channel, String status) {
}
