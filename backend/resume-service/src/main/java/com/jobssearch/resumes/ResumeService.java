package com.jobssearch.resumes;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.S3Object;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class ResumeService {
    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024;
    private static final String PDF_TYPE = "application/pdf";
    private static final String DOCX_TYPE =
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    private final S3Client s3Client;
    private final String bucket;

    public ResumeService(S3Client s3Client, @Value("${storage.s3.bucket}") String bucket) {
        this.s3Client = s3Client;
        this.bucket = bucket;
    }

    public ResumeUploadResponse upload(String userId, MultipartFile file) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a resume file to upload");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Resume must be 10 MB or smaller");
        }
        String originalName = file.getOriginalFilename();
        if (originalName == null || originalName.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Resume filename is required");
        }
        String extension = extensionOf(originalName);
        byte[] content;
        try {
            content = file.getBytes();
            validateContent(extension, content);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read the uploaded resume");
        }

        String contentType = extension.equals("pdf") ? PDF_TYPE : DOCX_TYPE;
        String objectKey = "resumes/" + UUID.nameUUIDFromBytes(userId.getBytes(java.nio.charset.StandardCharsets.UTF_8))
                + "/" + UUID.randomUUID() + "." + extension;
        try {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(objectKey)
                            .contentType(contentType)
                            .contentLength((long) content.length)
                            .metadata(java.util.Map.of(
                                    "original-filename",
                                    Base64.getUrlEncoder().withoutPadding()
                                            .encodeToString(originalName.getBytes(StandardCharsets.UTF_8))))
                            .build(),
                    RequestBody.fromBytes(content));
        } catch (SdkException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Resume storage is unavailable");
        }
        return new ResumeUploadResponse(
                originalName, contentType, content.length, Instant.now());
    }

    public ResumeDocument latest(String userId) {
        String prefix = userPrefix(userId);
        try {
            List<S3Object> objects = s3Client.listObjectsV2(ListObjectsV2Request.builder()
                            .bucket(bucket)
                            .prefix(prefix)
                            .build())
                    .contents();
            S3Object latest = objects.stream()
                    .max(Comparator.comparing(S3Object::lastModified))
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.NOT_FOUND, "Upload a resume before tailoring it"));
            ResponseBytes<GetObjectResponse> response = s3Client.getObjectAsBytes(
                    GetObjectRequest.builder().bucket(bucket).key(latest.key()).build());
            String filename = response.response().metadata().get("original-filename");
            String originalName = filename == null
                    ? latest.key().substring(latest.key().lastIndexOf('/') + 1)
                    : new String(Base64.getUrlDecoder().decode(filename), StandardCharsets.UTF_8);
            return new ResumeDocument(originalName, latest.key().endsWith(".pdf"), response.asByteArray());
        } catch (SdkException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Resume storage is unavailable");
        }
    }

    public ResumeMetadata latestMetadata(String userId) {
        ResumeDocument document = latest(userId);
        return new ResumeMetadata(document.fileName());
    }

    private String userPrefix(String userId) {
        return "resumes/" + UUID.nameUUIDFromBytes(userId.getBytes(StandardCharsets.UTF_8)) + "/";
    }

    private String extensionOf(String filename) {
        int dot = filename.lastIndexOf('.');
        if (dot < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Upload a PDF or DOCX resume");
        }
        String extension = filename.substring(dot + 1).toLowerCase(java.util.Locale.ROOT);
        if (!extension.equals("pdf") && !extension.equals("docx")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Upload a PDF or DOCX resume");
        }
        return extension;
    }

    private void validateContent(String extension, byte[] content) {
        if (extension.equals("pdf")) {
            if (content.length < 5
                    || content[0] != '%'
                    || content[1] != 'P'
                    || content[2] != 'D'
                    || content[3] != 'F'
                    || content[4] != '-') {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This file is not a valid PDF");
            }
            return;
        }

        boolean hasContentTypes = false;
        boolean hasDocument = false;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(content))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                hasContentTypes |= entry.getName().equals("[Content_Types].xml");
                hasDocument |= entry.getName().equals("word/document.xml");
                if (hasContentTypes && hasDocument) {
                    return;
                }
            }
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This file is not a valid DOCX document");
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This file is not a valid DOCX document");
    }

    public record ResumeUploadResponse(String fileName, String contentType, long size, Instant uploadedAt) {
    }

    public record ResumeDocument(String fileName, boolean pdf, byte[] content) {
    }

    public record ResumeMetadata(String fileName) {
    }
}
