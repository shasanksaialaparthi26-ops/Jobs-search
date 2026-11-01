CREATE TABLE job_applications (
    id UUID PRIMARY KEY,
    user_id VARCHAR(200) NOT NULL,
    company VARCHAR(200) NOT NULL,
    job_title VARCHAR(200) NOT NULL,
    job_url VARCHAR(2000),
    status VARCHAR(32) NOT NULL,
    applied_date DATE,
    notes VARCHAR(5000),
    job_description VARCHAR(30000),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_job_app_user ON job_applications (user_id);
