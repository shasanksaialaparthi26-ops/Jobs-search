package com.jobssearch.applications;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "job_applications", indexes = @Index(name = "idx_job_app_user", columnList = "user_id"))
public class JobApplication {
    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, length = 200)
    private String userId;

    @Column(nullable = false, length = 200)
    private String company;

    @Column(name = "job_title", nullable = false, length = 200)
    private String jobTitle;

    @Column(name = "job_url", length = 2000)
    private String jobUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ApplicationStatus status;

    @Column(name = "applied_date")
    private LocalDate appliedDate;

    @Column(length = 5000)
    private String notes;

    @Column(name = "job_description", length = 30000)
    private String jobDescription;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected JobApplication() {
    }

    public JobApplication(String userId, JobApplicationRequest request) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        update(request);
    }

    public void update(JobApplicationRequest request) {
        company = request.company().trim();
        jobTitle = request.jobTitle().trim();
        jobUrl = blankToNull(request.jobUrl());
        status = request.status();
        appliedDate = request.appliedDate();
        notes = blankToNull(request.notes());
        jobDescription = blankToNull(request.jobDescription());
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public UUID getId() { return id; }
    public String getUserId() { return userId; }
    public String getCompany() { return company; }
    public String getJobTitle() { return jobTitle; }
    public String getJobUrl() { return jobUrl; }
    public ApplicationStatus getStatus() { return status; }
    public LocalDate getAppliedDate() { return appliedDate; }
    public String getNotes() { return notes; }
    public String getJobDescription() { return jobDescription; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
