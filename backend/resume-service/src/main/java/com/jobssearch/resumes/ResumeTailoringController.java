package com.jobssearch.resumes;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/resumes")
public class ResumeTailoringController {
    private final ResumeService resumeService;
    private final ResumeTailoringService tailoringService;
    private final ResumeExportService exportService;

    public ResumeTailoringController(
            ResumeService resumeService,
            ResumeTailoringService tailoringService,
            ResumeExportService exportService) {
        this.resumeService = resumeService;
        this.tailoringService = tailoringService;
        this.exportService = exportService;
    }

    @GetMapping("/latest")
    public ResumeService.ResumeMetadata latest(@AuthenticationPrincipal Jwt jwt) {
        return resumeService.latestMetadata(jwt.getSubject());
    }

    @PostMapping("/analyze")
    public ResumeTailoringService.Analysis analyze(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody JobDescriptionRequest request) {
        return tailoringService.analyze(jwt.getSubject(), request.jobDescription());
    }

    @PostMapping("/tailor")
    @ResponseStatus(HttpStatus.OK)
    public ResumeTailoringService.TailoredDraft tailor(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody TailorRequest request) {
        return tailoringService.tailor(
                jwt.getSubject(), request.jobDescription(), request.confirmedSkills());
    }

    @PostMapping("/export")
    public ResponseEntity<byte[]> export(
            @Valid @RequestBody ExportRequest request,
            @RequestParam("format") String format) {
        ResumeExportService.ExportedDocument document = exportService.export(request.resumeText(), format);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(document.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + document.fileName() + "\"")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(document.content());
    }

    public record JobDescriptionRequest(
            @NotBlank @Size(max = 30_000) String jobDescription) {
    }

    public record TailorRequest(
            @NotBlank @Size(max = 30_000) String jobDescription,
            @NotNull @Size(max = 30) List<@NotBlank @Size(max = 100) String> confirmedSkills) {
    }

    public record ExportRequest(@NotBlank @Size(max = 40_000) String resumeText) {
    }
}
