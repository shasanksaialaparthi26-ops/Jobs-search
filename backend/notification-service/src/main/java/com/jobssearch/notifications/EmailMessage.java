package com.jobssearch.notifications;

import java.util.Map;

public record EmailMessage(String recipient, String templateName, Map<String, String> variables) {
}
