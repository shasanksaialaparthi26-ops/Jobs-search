package com.jobssearch.applications;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record JobApplicationRequest(
        @NotBlank @Size(max = 200) String company,
        @NotBlank @Size(max = 200) String jobTitle,
        @Size(max = 2000) @Pattern(regexp = "^https?://\\S+$") String jobUrl,
        @NotNull ApplicationStatus status,
        LocalDate appliedDate,
        @Size(max = 5000) String notes,
        @Size(max = 30000) String jobDescription) {
}
