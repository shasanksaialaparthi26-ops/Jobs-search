package com.jobssearch.notifications;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class NotificationDispatcher {
    private final Map<NotificationType, NotificationChannel> channels;

    public NotificationDispatcher(List<NotificationChannel> availableChannels) {
        Map<NotificationType, NotificationChannel> registry = new EnumMap<>(NotificationType.class);
        for (NotificationChannel channel : availableChannels) {
            if (registry.putIfAbsent(channel.type(), channel) != null) {
                throw new IllegalStateException("Multiple notification channels registered for " + channel.type());
            }
        }
        this.channels = Map.copyOf(registry);
    }

    public NotificationReceipt send(NotificationType type, NotificationMessage message) {
        NotificationChannel channel = channels.get(type);
        if (channel == null) {
            throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED, "This notification channel is not available");
        }
        return channel.send(message);
    }
}
