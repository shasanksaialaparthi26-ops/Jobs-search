# Resume service

The standalone Spring Boot resume service listens on port `8082`. The API gateway routes `/api/resumes/**` requests to it. The service validates Keycloak bearer access tokens (issuer, signature, expiration, and the `jobs-api` audience) independently.

It owns resume upload and S3-compatible storage, PDF/DOCX text extraction, job-description analysis, and tailored draft generation with Ollama. All resume endpoints require an authenticated access token. Data is scoped to the user's token subject. The original uploaded resume is never overwritten; tailoring produces editable text for the user to review.

Endpoints exposed through the gateway:

- `POST /api/resumes` accepts a multipart `file` containing a PDF or DOCX up to 10 MB.
- `GET /api/resumes/latest` returns the filename for the user's most recent upload.
- `POST /api/resumes/analyze` accepts `{"jobDescription":"..."}` and returns supported skills, potential gaps, a match score, and recommendations.
- `POST /api/resumes/tailor` accepts `{"jobDescription":"...","confirmedSkills":["..."]}` and returns a draft. Users should only confirm skills they genuinely have; the model is instructed not to fabricate experience or achievements.
- `POST /api/resumes/export?format=pdf|docx` accepts `{"resumeText":"..."}` and downloads the reviewed draft as a PDF or Microsoft Word document. The UI also offers plain-text download.

Configure `KEYCLOAK_ISSUER_URI`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `OLLAMA_BASE_URL`, and `OLLAMA_MODEL` for deployment. Defaults target local Keycloak, MinIO, and Ollama (`llama3.2`). Pull the model with `ollama pull llama3.2` (or use the local Docker Compose Ollama container) before analysis. Resume text and job descriptions are sent to the configured Ollama endpoint, so only use a model endpoint appropriate for this potentially sensitive data.
