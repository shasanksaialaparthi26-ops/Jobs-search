package com.jobssearch.applications;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface JobApplicationRepository extends JpaRepository<JobApplication, UUID> {
    List<JobApplication> findAllByUserIdOrderByUpdatedAtDesc(String userId);

    Optional<JobApplication> findByIdAndUserId(UUID id, String userId);
}
