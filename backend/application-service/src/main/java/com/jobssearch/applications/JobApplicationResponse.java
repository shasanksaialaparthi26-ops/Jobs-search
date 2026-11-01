package com.jobssearch.applications;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record JobApplicationResponse(
        UUID id,
        String company,
        String jobTitle,
        String jobUrl,
        ApplicationStatus status,
        LocalDate appliedDate,
        String notes,
        String jobDescription,
        Instant createdAt,
        Instant updatedAt) {
    public static JobApplicationResponse from(JobApplication application) {
        return new JobApplicationResponse(
                application.getId(),
                application.getCompany(),
                application.getJobTitle(),
                application.getJobUrl(),
                application.getStatus(),
                application.getAppliedDate(),
                application.getNotes(),
                application.getJobDescription(),
                application.getCreatedAt(),
                application.getUpdatedAt());
    }
}
