package com.jobssearch.notifications;

import java.util.Map;

public record NotificationMessage(String recipient, String templateName, Map<String, String> variables) {
}
