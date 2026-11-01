package com.jobssearch.applications;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/applications")
public class JobApplicationController {
    private final JobApplicationRepository repository;

    public JobApplicationController(JobApplicationRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<JobApplicationResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return repository.findAllByUserIdOrderByUpdatedAtDesc(jwt.getSubject()).stream()
                .map(JobApplicationResponse::from)
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public JobApplicationResponse create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody JobApplicationRequest request) {
        return JobApplicationResponse.from(repository.save(new JobApplication(jwt.getSubject(), request)));
    }

    @PutMapping("/{id}")
    public JobApplicationResponse update(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody JobApplicationRequest request) {
        JobApplication application = findOwned(id, jwt.getSubject());
        application.update(request);
        return JobApplicationResponse.from(repository.save(application));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        repository.delete(findOwned(id, jwt.getSubject()));
    }

    private JobApplication findOwned(UUID id, String userId) {
        return repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Application not found"));
    }
}
