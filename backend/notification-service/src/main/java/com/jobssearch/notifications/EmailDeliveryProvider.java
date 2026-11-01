package com.jobssearch.notifications;

public interface EmailDeliveryProvider {
    String send(EmailMessage message);
}
