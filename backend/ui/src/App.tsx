import { useEffect, useState } from "react";
import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? "http://localhost:8180",
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? "jobs-search",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? "jobs-web",
});

type Screen = "signin" | "signup" | "welcome" | "resume" | "applications" | "chat";
type Registration = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

type ResumeAnalysis = {
  summary: string;
  matchScore: number;
  matchedSkills: string[];
  skillGaps: { skill: string; importance: string }[];
  recommendations: string[];
};

type ResumeDraft = {
  resumeText: string;
  changeSummary: string;
  addedSkills: string[];
};

type ApplicationStatus = "SAVED" | "READY_TO_APPLY" | "APPLIED" | "INTERVIEW" | "OFFER" | "REJECTED" | "WITHDRAWN";
type JobApplication = {
  id: string;
  company: string;
  jobTitle: string;
  jobUrl: string | null;
  status: ApplicationStatus;
  appliedDate: string | null;
  notes: string | null;
  jobDescription: string | null;
  createdAt: string;
  updatedAt: string;
};
type ApplicationForm = {
  company: string;
  jobTitle: string;
  jobUrl: string;
  status: ApplicationStatus;
  appliedDate: string;
  notes: string;
  jobDescription: string;
};
const APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: "SAVED", label: "Saved" },
  { value: "READY_TO_APPLY", label: "Resume ready" },
  { value: "APPLIED", label: "Applied" },
  { value: "INTERVIEW", label: "Interview" },
  { value: "OFFER", label: "Offer" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];
const emptyApplicationForm = (): ApplicationForm => ({
  company: "", jobTitle: "", jobUrl: "", status: "SAVED", appliedDate: "", notes: "", jobDescription: "",
});

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

function App() {
  const [screen, setScreen] = useState<Screen>("signin");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [applicationError, setApplicationError] = useState("");

  const listApplications = async () => {
    const response = await authorizedFetch("/api/applications");
    if (!response.ok) throw new Error("We couldn't load your job tracker.");
    return response.json() as Promise<JobApplication[]>;
  };

  const saveApplication = async (application: ApplicationForm, id?: string) => {
    const response = await authorizedFetch(id ? `/api/applications/${id}` : "/api/applications", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...application,
        jobUrl: application.jobUrl || null,
        appliedDate: application.appliedDate || null,
        notes: application.notes || null,
        jobDescription: application.jobDescription || null,
      }),
    });
    if (!response.ok) throw new Error("We couldn't save this application. Check the details and retry.");
    return response.json() as Promise<JobApplication>;
  };

  const removeApplication = async (id: string) => {
    const response = await authorizedFetch(`/api/applications/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("We couldn't delete this application. Please try again.");
  };

  useEffect(() => {
    keycloak
      .init({ onLoad: "check-sso", pkceMethod: "S256" })
      .then((authenticated) => {
        setScreen(authenticated ? "welcome" : "signin");
        setReady(true);
      })
      .catch(() => {
        setError("Could not connect to sign-in. Check that the identity service is running.");
        setReady(true);
      });
  }, []);

  const signIn = (provider?: string) => {
    setError("");
    void keycloak.login(provider ? { idpHint: provider } : undefined);
  };

  const signOut = () => {
    void keycloak.logout({ redirectUri: window.location.origin });
  };

  const createAccount = async (form: Registration) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        if (response.status === 409) {
          throw new Error("An account with this email already exists. Sign in instead.");
        }
        if (response.status === 400) {
          throw new Error("Check your details. Use a valid email and a password of at least 12 characters.");
        }
        throw new Error("We couldn't create your account. Please try again.");
      }
      await keycloak.login({ loginHint: form.email });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  const uploadResume = async (file: File) => {
    await keycloak.updateToken(30);
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`${API_URL}/api/resumes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${keycloak.token}` },
      body,
    });
    if (!response.ok) {
      if (response.status === 413) throw new Error("That file is too large. Choose a file under 10 MB.");
      if (response.status === 400) throw new Error("Choose a valid PDF or DOCX resume under 10 MB.");
      if (response.status === 401) throw new Error("Your session expired. Sign in again and retry.");
      throw new Error("We couldn't save your resume. Please try again.");
    }
    return response.json() as Promise<{ fileName: string; size: number }>;
  };

  const authorizedFetch = async (path: string, init: RequestInit = {}) => {
    await keycloak.updateToken(30);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${keycloak.token ?? ""}`);
    return fetch(`${API_URL}${path}`, { ...init, headers });
  };

  const loadLatestResume = async () => {
    const response = await authorizedFetch("/api/resumes/latest");
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("We couldn't check your saved resume. Please try again.");
    return response.json() as Promise<{ fileName: string }>;
  };

  const analyzeResume = async (jobDescription: string) => {
    const response = await authorizedFetch("/api/resumes/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription }),
    });
    if (!response.ok) {
      if (response.status === 404) throw new Error("Upload a resume before analyzing a job description.");
      if (response.status === 400) throw new Error("Check the job description and make sure your resume has selectable text.");
      if (response.status === 502) throw new Error("The AI service is unavailable. Check that Ollama is running with the configured model.");
      throw new Error("We couldn't analyze this job description. Please try again.");
    }
    return response.json() as Promise<ResumeAnalysis>;
  };

  const tailorResume = async (jobDescription: string, confirmedSkills: string[]) => {
    const response = await authorizedFetch("/api/resumes/tailor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription, confirmedSkills }),
    });
    if (!response.ok) {
      if (response.status === 404) throw new Error("Upload a resume before creating a tailored draft.");
      if (response.status === 502) throw new Error("The AI service is unavailable. Check that Ollama is running with the configured model.");
      throw new Error("We couldn't create your tailored draft. Please try again.");
    }
    return response.json() as Promise<ResumeDraft>;
  };

  const exportResume = async (resumeText: string, format: "pdf" | "docx") => {
    const response = await authorizedFetch(`/api/resumes/export?format=${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText }),
    });
    if (!response.ok) {
      if (response.status === 400) throw new Error("The resume text could not be exported in that format.");
      throw new Error("We couldn't download your resume. Please try again.");
    }
    return response.blob();
  };

  if (!ready) {
    return <main className="loading-screen"><span className="loader" />Preparing your next move</main>;
  }

  if (screen === "welcome" && keycloak.authenticated) {
    return <Welcome name={keycloak.tokenParsed?.given_name ?? "there"} onSignOut={signOut}
      onNavigate={setScreen} />;
  }

  if ((screen === "resume" || screen === "applications" || screen === "chat") && keycloak.authenticated) {
    return (
      <SignedInPage
        screen={screen}
        name={keycloak.tokenParsed?.given_name ?? "there"}
        onNavigate={setScreen}
        onSignOut={signOut}
        onUpload={uploadResume}
        onLoadLatest={loadLatestResume}
        onAnalyze={analyzeResume}
        onTailor={tailorResume}
        onExport={exportResume}
        applications={applications}
        setApplications={setApplications}
        onLoadApplications={listApplications}
        onSaveApplication={saveApplication}
        onDeleteApplication={removeApplication}
        applicationError={applicationError}
        setApplicationError={setApplicationError}
      />
    );
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <a className="brand" href="/" aria-label="Northstar home">
          <span className="brand-mark">N</span><span>northstar<span className="brand-dot">.</span></span>
        </a>

        <div className="auth-content">
          <div className="mobile-kicker"><span className="status-dot" />Your next chapter starts here</div>
          <p className="eyebrow">{screen === "signup" ? "A better way to job search" : "Welcome back"}</p>
          <h1>{screen === "signup" ? <>Make your next move<br />your best one.</> : <>Your next opportunity<br />is out there.</>}</h1>
          <p className="auth-subtitle">
            {screen === "signup"
              ? "Create your free account and put your career search on a smarter path."
              : "Sign in to pick up where you left off and keep your momentum going."}
          </p>

          {error && <div className="form-error" role="alert">{error}</div>}

          <div className="social-buttons">
            <button className="social-button" onClick={() => signIn("google")} type="button">
              <GoogleIcon /> Continue with Google
            </button>
            <button className="social-button" onClick={() => signIn("github")} type="button">
              <GitHubIcon /> Continue with GitHub
            </button>
          </div>

          <div className="divider"><span />or continue with email<span /></div>

          {screen === "signup" ? (
            <SignupForm busy={busy} onSubmit={createAccount} />
          ) : (
            <div className="email-signin">
              <button className="primary-button" onClick={() => signIn()} type="button">
                Sign in with email <ArrowIcon />
              </button>
              <p className="fine-print">Secure sign-in powered by Keycloak. Your password is never stored by Northstar.</p>
            </div>
          )}

          <p className="switch-mode">
            {screen === "signup" ? "Already have an account?" : "New to Northstar?"}{" "}
            <button type="button" onClick={() => { setError(""); setScreen(screen === "signup" ? "signin" : "signup"); }}>
              {screen === "signup" ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
        <p className="legal">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
      </section>

      <aside className="visual-panel">
        <div className="visual-top"><span className="status-dot" />CAREER, IN A NEW LIGHT</div>
        <div className="visual-copy">
          <p>Less searching.<br /><span>More becoming.</span></p>
          <span className="visual-caption">A little clarity can change everything.</span>
        </div>
        <div className="orbit orbit-one" /><div className="orbit orbit-two" />
        <div className="spark spark-one">✳</div><div className="spark spark-two">✳</div>
        <div className="preview-card">
          <div className="preview-header"><span className="preview-icon">✦</span><span>YOUR CAREER, IN FOCUS</span><span className="preview-menu">···</span></div>
          <div className="preview-title">Good things are<br />taking shape.</div>
          <div className="preview-bottom"><div className="avatar-stack"><i>J</i><i>M</i><i>A</i></div><span>Built around <b>you</b></span><span className="preview-arrow">↗</span></div>
        </div>
        <div className="visual-foot"><span>01 — YOUR NEXT CHAPTER</span><span>MADE FOR THE WAY YOU WORK</span></div>
      </aside>
    </main>
  );
}

function SignupForm({ busy, onSubmit }: { busy: boolean; onSubmit: (data: Registration) => void }) {
  const [form, setForm] = useState<Registration>({ firstName: "", lastName: "", email: "", password: "" });
  const update = (field: keyof Registration) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: event.target.value });

  return (
    <form className="signup-form" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
      <div className="name-row">
        <label>First name<input autoComplete="given-name" value={form.firstName} onChange={update("firstName")} placeholder="Ada" required maxLength={100} /></label>
        <label>Last name<input autoComplete="family-name" value={form.lastName} onChange={update("lastName")} placeholder="Lovelace" required maxLength={100} /></label>
      </div>
      <label>Email address<input type="email" autoComplete="email" value={form.email} onChange={update("email")} placeholder="you@example.com" required maxLength={255} /></label>
      <label>Password<input type="password" autoComplete="new-password" value={form.password} onChange={update("password")} placeholder="At least 12 characters" required minLength={12} maxLength={128} /></label>
      <button className="primary-button" disabled={busy} type="submit">{busy ? "Creating your account..." : "Create free account"} {!busy && <ArrowIcon />}</button>
      <p className="fine-print">By creating an account, you agree to our Terms and Privacy Policy.</p>
    </form>
  );
}

function Welcome({ name, onSignOut, onNavigate }: {
  name: string;
  onSignOut: () => void;
  onNavigate: (screen: Screen) => void;
}) {
  return (
    <main className="welcome-shell">
      <header className="welcome-nav">
        <a className="brand" href="/"><span className="brand-mark">N</span><span>northstar<span className="brand-dot">.</span></span></a>
        <div className="welcome-nav-right">
          <nav className="main-nav"><button className="nav-link" onClick={() => onNavigate("welcome")}>Home</button><button className="nav-link" onClick={() => onNavigate("resume")}>My resume</button><button className="nav-link" onClick={() => onNavigate("applications")}>Applications</button><button className="nav-link" onClick={() => onNavigate("chat")}>Chat <span className="nav-soon">SOON</span></button></nav>
          <span className="user-avatar">{name.charAt(0).toUpperCase()}</span><button className="signout-button" onClick={onSignOut}>Sign out</button></div>
      </header>
      <section className="welcome-content">
        <p className="eyebrow"><span className="status-dot" />YOUR SPACE, YOUR PACE</p>
        <h1>Welcome in, {name}.</h1>
        <p className="welcome-subtitle">A new chapter starts with one small step. Here are a few ways to get moving.</p>
        <div className="welcome-grid">
          <article className="welcome-card card-search"><div className="welcome-card-icon">⌕</div><p className="card-label">FIND YOUR FIT</p><h2>The right role<br />is out there.</h2><p>Explore opportunities that match where you want to go.</p><span className="card-link">Explore jobs <span>↗</span></span><div className="decor-search"><i /><i /><i /></div></article>
          <button className="welcome-card card-resume card-action" onClick={() => onNavigate("resume")}><div className="welcome-card-icon">✳</div><p className="card-label">SHOW YOUR STORY</p><h2>Your experience,<br />beautifully told.</h2><p>Upload your resume and keep your story in one place.</p><span className="card-link">Upload your resume <span>↗</span></span><div className="decor-paper"><b /><i /><i /><i /><i /></div></button>
          <button className="welcome-card card-apply card-action" onClick={() => onNavigate("applications")}><div className="welcome-card-icon">↗</div><p className="card-label">KEEP YOUR MOMENTUM</p><h2>Your search,<br />in good order.</h2><p>Track each opportunity and move it through your own application stages.</p><span className="card-link">Open application tracker <span>↗</span></span><div className="decor-progress"><span /><span /><span /></div></button>
        </div>
        <div className="welcome-note"><span>✦</span><p><b>Just getting started?</b> Take your time. Your next step will be here when you’re ready.</p></div>
      </section>
      <footer className="welcome-footer"><span>northstar. &nbsp; FIND YOUR NEXT MOVE.</span><span>MADE FOR WHAT'S NEXT</span></footer>
    </main>
  );
}

function SignedInPage({ screen, name, onNavigate, onSignOut, onUpload, onLoadLatest, onAnalyze, onTailor, onExport,
  applications, setApplications, onLoadApplications, onSaveApplication, onDeleteApplication, applicationError, setApplicationError }: {
  screen: "resume" | "applications" | "chat";
  name: string;
  onNavigate: (screen: Screen) => void;
  onSignOut: () => void;
  onUpload: (file: File) => Promise<{ fileName: string; size: number }>;
  onLoadLatest: () => Promise<{ fileName: string } | null>;
  onAnalyze: (jobDescription: string) => Promise<ResumeAnalysis>;
  onTailor: (jobDescription: string, confirmedSkills: string[]) => Promise<ResumeDraft>;
  onExport: (resumeText: string, format: "pdf" | "docx") => Promise<Blob>;
  applications: JobApplication[];
  setApplications: React.Dispatch<React.SetStateAction<JobApplication[]>>;
  onLoadApplications: () => Promise<JobApplication[]>;
  onSaveApplication: (application: ApplicationForm, id?: string) => Promise<JobApplication>;
  onDeleteApplication: (id: string) => Promise<void>;
  applicationError: string;
  setApplicationError: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [confirmedSkills, setConfirmedSkills] = useState<string[]>([]);
  const [draft, setDraft] = useState<ResumeDraft | null>(null);
  const [applicationForm, setApplicationForm] = useState<ApplicationForm>(emptyApplicationForm);
  const [applicationFormOpen, setApplicationFormOpen] = useState(false);
  const [editingApplicationId, setEditingApplicationId] = useState<string | undefined>();
  const [applicationBusy, setApplicationBusy] = useState(false);
  const [applicationLoaded, setApplicationLoaded] = useState(false);

  useEffect(() => {
    if (screen !== "resume") return;
    void onLoadLatest().then((resume) => {
      if (resume) setResumeName(resume.fileName);
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not load your saved resume.");
    });
  }, [screen]);

  useEffect(() => {
    if (screen !== "applications" || applicationLoaded) return;
    setApplicationError("");
    void onLoadApplications().then((items) => {
      setApplications(items);
      setApplicationLoaded(true);
    }).catch((reason: unknown) => {
      setApplicationError(reason instanceof Error ? reason.message : "Could not load your applications.");
    });
  }, [screen, applicationLoaded]);

  const openNewApplication = (prefillDescription = "") => {
    setEditingApplicationId(undefined);
    setApplicationForm({
      ...emptyApplicationForm(),
      jobDescription: prefillDescription,
      status: prefillDescription ? "READY_TO_APPLY" : "SAVED",
    });
    setApplicationFormOpen(true);
    setApplicationError("");
  };

  const editApplication = (application: JobApplication) => {
    setEditingApplicationId(application.id);
    setApplicationForm({
      company: application.company,
      jobTitle: application.jobTitle,
      jobUrl: application.jobUrl ?? "",
      status: application.status,
      appliedDate: application.appliedDate ?? "",
      notes: application.notes ?? "",
      jobDescription: application.jobDescription ?? "",
    });
    setApplicationFormOpen(true);
    setApplicationError("");
  };

  const submitApplication = async (event: React.FormEvent) => {
    event.preventDefault();
    setApplicationBusy(true);
    setApplicationError("");
    try {
      const saved = await onSaveApplication(applicationForm, editingApplicationId);
      setApplications((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setApplicationFormOpen(false);
    } catch (reason) {
      setApplicationError(reason instanceof Error ? reason.message : "Could not save this application.");
    } finally {
      setApplicationBusy(false);
    }
  };

  const changeApplicationStatus = async (application: JobApplication, status: ApplicationStatus) => {
    setApplicationError("");
    try {
      const updated = await onSaveApplication({
        company: application.company,
        jobTitle: application.jobTitle,
        jobUrl: application.jobUrl ?? "",
        status,
        appliedDate: application.appliedDate ?? "",
        notes: application.notes ?? "",
        jobDescription: application.jobDescription ?? "",
      }, application.id);
      setApplications((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (reason) {
      setApplicationError(reason instanceof Error ? reason.message : "Could not update the application status.");
    }
  };

  const deleteApplication = async (application: JobApplication) => {
    if (!window.confirm(`Delete the ${application.jobTitle} application at ${application.company}?`)) return;
    setApplicationError("");
    try {
      await onDeleteApplication(application.id);
      setApplications((current) => current.filter((item) => item.id !== application.id));
    } catch (reason) {
      setApplicationError(reason instanceof Error ? reason.message : "Could not delete the application.");
    }
  };

  const retryApplicationLoad = async () => {
    setApplicationError("");
    try {
      setApplications(await onLoadApplications());
      setApplicationLoaded(true);
    } catch (reason) {
      setApplicationError(reason instanceof Error ? reason.message : "Could not load your applications.");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await onUpload(file);
      setMessage(`${result.fileName} uploaded successfully (${(result.size / 1024 / 1024).toFixed(2)} MB).`);
      setResumeName(result.fileName);
      setAnalysis(null);
      setDraft(null);
      setFile(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const analyze = async () => {
    setBusy(true);
    setError("");
    setDraft(null);
    try {
      setAnalysis(await onAnalyze(jobDescription));
      setConfirmedSkills([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Analysis failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const createDraft = async () => {
    setBusy(true);
    setError("");
    try {
      setDraft(await onTailor(jobDescription, confirmedSkills));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Draft generation failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const downloadDraft = async (format: "pdf" | "docx" | "txt") => {
    if (!draft) return;
    setError("");
    try {
      const blob = format === "txt"
        ? new Blob([draft.resumeText], { type: "text/plain;charset=utf-8" })
        : await onExport(draft.resumeText, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tailored-resume.${format}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Download failed. Please try again.");
    }
  };

  return (
    <main className="welcome-shell">
      <header className="welcome-nav">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("welcome"); }}><span className="brand-mark">N</span><span>northstar<span className="brand-dot">.</span></span></a>
        <div className="welcome-nav-right">
          <nav className="main-nav"><button className="nav-link" onClick={() => onNavigate("welcome")}>Home</button><button className={`nav-link ${screen === "resume" ? "active" : ""}`} onClick={() => onNavigate("resume")}>My resume</button><button className={`nav-link ${screen === "applications" ? "active" : ""}`} onClick={() => onNavigate("applications")}>Applications</button><button className={`nav-link ${screen === "chat" ? "active" : ""}`} onClick={() => onNavigate("chat")}>Chat <span className="nav-soon">SOON</span></button></nav>
          <span className="user-avatar">{name.charAt(0).toUpperCase()}</span><button className="signout-button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>
      {screen === "resume" ? (
        <section className="feature-page">
          <p className="eyebrow"><span className="status-dot" />YOUR STORY, SECURELY STORED</p>
          <h1>Your resume, in one place.</h1>
          <p className="welcome-subtitle">Upload the resume you want to take into your next chapter. Only PDF and DOCX files are accepted.</p>
          <form className="upload-card" onSubmit={submit}>
            <label className="drop-zone" htmlFor="resume-file">
              <span className="upload-icon">↑</span>
              <strong>{file ? file.name : "Choose a resume to upload"}</strong>
              <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF or DOCX · 10 MB maximum"}</span>
              <input id="resume-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); setMessage(""); }} />
            </label>
            {error && <p className="upload-feedback error" role="alert">{error}</p>}
            {message && <p className="upload-feedback success" role="status">{message}</p>}
            <button className="primary-button upload-submit" disabled={!file || busy} type="submit">{busy ? "Uploading securely..." : "Upload resume"} <ArrowIcon /></button>
            <p className="fine-print">Your file is stored privately and associated with your account.</p>
          </form>
          <section className="tailor-card">
            <p className="card-label">TAILOR YOUR RESUME</p>
            <h2>Start with the job description.</h2>
            <p className="tailor-help">
              {resumeName ? `Using your latest resume: ${resumeName}` : "Upload a PDF or DOCX resume first."}
              {" "}Your original file will never be overwritten.
            </p>
            <label className="job-description-label">
              Job description
              <textarea
                value={jobDescription}
                onChange={(event) => { setJobDescription(event.target.value); setAnalysis(null); setDraft(null); }}
                placeholder="Paste the job description here..."
                rows={8}
                maxLength={30000}
              />
            </label>
            {error && <p className="upload-feedback error" role="alert">{error}</p>}
            <button className="primary-button upload-submit" type="button" disabled={!jobDescription.trim() || busy} onClick={() => void analyze()}>
              {busy ? "Analyzing..." : "Analyze skill match"} <ArrowIcon />
            </button>
            {analysis && (
              <div className="analysis-results">
                <div className="analysis-heading">
                  <div><p className="card-label">ROLE MATCH</p><strong>{analysis.matchScore}%</strong></div>
                  <p>{analysis.summary}</p>
                </div>
                <div className="skill-columns">
                  <div>
                    <h3>Skills found in your resume</h3>
                    {analysis.matchedSkills.length
                      ? <div className="skill-tags">{analysis.matchedSkills.map((skill) => <span key={skill}>{skill}</span>)}</div>
                      : <p className="tailor-help">No matching skills were identified.</p>}
                  </div>
                  <div>
                    <h3>Potential gaps</h3>
                    {analysis.skillGaps.length ? analysis.skillGaps.map(({ skill, importance }) => (
                      <label className="gap-option" key={skill}>
                        <input
                          type="checkbox"
                          checked={confirmedSkills.includes(skill)}
                          onChange={(event) => setConfirmedSkills((current) =>
                            event.target.checked ? [...current, skill] : current.filter((value) => value !== skill))}
                        />
                        <span><b>{skill}</b><small>{importance} priority · select only if you genuinely have this skill</small></span>
                      </label>
                    )) : <p className="tailor-help">No significant gaps identified.</p>}
                  </div>
                </div>
                {analysis.recommendations.length > 0 && (
                  <div className="recommendations">
                    <h3>Suggestions</h3>
                    {analysis.recommendations.map((recommendation) => <p key={recommendation}>• {recommendation}</p>)}
                  </div>
                )}
                <p className="fine-print">Only select skills you genuinely have. The AI must not invent experience, qualifications, or achievements.</p>
                <button className="primary-button upload-submit" type="button" disabled={busy} onClick={() => void createDraft()}>
                  {busy ? "Preparing your draft..." : "Create tailored draft"} <ArrowIcon />
                </button>
              </div>
            )}
            {draft && (
              <div className="draft-result">
                <div className="draft-title">
                  <div><p className="card-label">YOUR EDITABLE DRAFT</p><p>{draft.changeSummary}</p></div>
                  <div className="draft-downloads">
                    <button type="button" className="signout-button" onClick={() => void downloadDraft("pdf")}>Download PDF</button>
                    <button type="button" className="signout-button" onClick={() => void downloadDraft("docx")}>Download Word</button>
                    <button type="button" className="signout-button" onClick={() => void downloadDraft("txt")}>Download TXT</button>
                  </div>
                </div>
                {draft.addedSkills.length > 0 && <p className="tailor-help">Included with your confirmation: {draft.addedSkills.join(", ")}</p>}
                <label className="job-description-label">Review and edit before using
                  <textarea className="draft-text" value={draft.resumeText} onChange={(event) => setDraft({ ...draft, resumeText: event.target.value })} rows={18} />
                </label>
                <p className="fine-print">This is a text draft for review; your uploaded resume remains unchanged.</p>
                <button className="primary-button upload-submit" type="button" onClick={() => { openNewApplication(jobDescription); onNavigate("applications"); }}>
                  Track this job application <ArrowIcon />
                </button>
              </div>
            )}
          </section>
          <button className="back-link" onClick={() => onNavigate("welcome")}>← Back to your home</button>
        </section>
      ) : screen === "applications" ? (
        <section className="feature-page applications-page">
          <p className="eyebrow"><span className="status-dot" />YOUR SEARCH, YOUR PACE</p>
          <div className="applications-title-row">
            <div>
              <h1>Application tracker</h1>
              <p className="welcome-subtitle">Keep every opportunity moving. Update a status whenever you’re ready.</p>
            </div>
            <button type="button" className="primary-button add-application-button" onClick={() => openNewApplication()}>Add an application <span>＋</span></button>
          </div>
          {applicationError && <p className="upload-feedback error" role="alert">{applicationError}</p>}
          {applicationError && !applicationLoaded && <button className="signout-button" type="button" onClick={() => void retryApplicationLoad()}>Retry loading applications</button>}
          {!applicationLoaded && !applicationError && <p className="application-loading">Loading your applications...</p>}
          {applicationFormOpen && (
            <form className="application-form" onSubmit={(event) => void submitApplication(event)}>
              <div className="application-form-heading">
                <div><p className="card-label">{editingApplicationId ? "UPDATE YOUR TRACKER" : "NEW OPPORTUNITY"}</p><h2>{editingApplicationId ? "Edit application" : "Add an application"}</h2></div>
                <button type="button" className="signout-button" onClick={() => setApplicationFormOpen(false)}>Cancel</button>
              </div>
              <div className="application-fields">
                <label>Job title<input required maxLength={200} value={applicationForm.jobTitle} onChange={(event) => setApplicationForm({ ...applicationForm, jobTitle: event.target.value })} placeholder="Software Engineer" /></label>
                <label>Company<input required maxLength={200} value={applicationForm.company} onChange={(event) => setApplicationForm({ ...applicationForm, company: event.target.value })} placeholder="Company name" /></label>
                <label>Status<select value={applicationForm.status} onChange={(event) => setApplicationForm({ ...applicationForm, status: event.target.value as ApplicationStatus })}>{APPLICATION_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
                <label>Applied date<input type="date" value={applicationForm.appliedDate} onChange={(event) => setApplicationForm({ ...applicationForm, appliedDate: event.target.value })} /></label>
                <label className="application-wide">Job posting URL<input type="url" maxLength={2000} value={applicationForm.jobUrl} onChange={(event) => setApplicationForm({ ...applicationForm, jobUrl: event.target.value })} placeholder="https://..." /></label>
                <label className="application-wide">Notes<textarea rows={3} maxLength={5000} value={applicationForm.notes} onChange={(event) => setApplicationForm({ ...applicationForm, notes: event.target.value })} placeholder="Follow-up reminders, recruiter details, or interview notes" /></label>
                <label className="application-wide">Job description<textarea rows={5} maxLength={30000} value={applicationForm.jobDescription} onChange={(event) => setApplicationForm({ ...applicationForm, jobDescription: event.target.value })} placeholder="Optional — add the job description for your records" /></label>
              </div>
              <button type="submit" className="primary-button application-save" disabled={applicationBusy}>{applicationBusy ? "Saving..." : editingApplicationId ? "Save changes" : "Add to tracker"} <ArrowIcon /></button>
            </form>
          )}
          {applicationLoaded && applications.length === 0 && !applicationFormOpen ? (
            <div className="applications-empty"><span className="welcome-card-icon">↗</span><h2>Your next move starts here.</h2><p>Add an opportunity to keep your applications and next steps in one place.</p><button className="back-link" onClick={() => openNewApplication()}>Add your first application ↗</button></div>
          ) : applicationLoaded && applications.length > 0 ? (
            <div className="application-board">
              {APPLICATION_STATUSES.map((status) => {
                const items = applications.filter((application) => application.status === status.value);
                return (
                  <section className="application-column" key={status.value}>
                    <div className="application-column-heading"><h2>{status.label}</h2><span>{items.length}</span></div>
                    {items.length === 0 ? <p className="application-column-empty">No applications</p> : items.map((application) => (
                      <article className="application-card" key={application.id}>
                        <div className="application-card-title"><h3>{application.jobTitle}</h3><button type="button" aria-label={`Edit ${application.jobTitle}`} onClick={() => editApplication(application)}>···</button></div>
                        <p className="application-company">{application.company}</p>
                        {application.appliedDate && <p className="application-date">Applied {new Date(`${application.appliedDate}T00:00:00`).toLocaleDateString()}</p>}
                        {application.jobUrl && <a className="application-link" href={application.jobUrl} target="_blank" rel="noreferrer">View job posting ↗</a>}
                        {application.notes && <p className="application-notes">{application.notes}</p>}
                        <label className="application-status-label">Move to
                          <select value={application.status} onChange={(event) => void changeApplicationStatus(application, event.target.value as ApplicationStatus)}>{APPLICATION_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                        </label>
                        <button className="application-delete" type="button" onClick={() => void deleteApplication(application)}>Delete</button>
                      </article>
                    ))}
                  </section>
                );
              })}
            </div>
          ) : null}
          <button className="back-link" onClick={() => onNavigate("welcome")}>← Back to your home</button>
        </section>
      ) : (
        <section className="feature-page chat-page">
          <div className="chat-art"><span>✦</span><i /><i /><i /></div>
          <p className="eyebrow"><span className="status-dot" />A NEW CONVERSATION IS ON THE WAY</p>
          <h1>Good things take a little time.</h1>
          <p className="welcome-subtitle">Your career companion is in the works. Soon, you’ll have a thoughtful space to get answers, explore ideas, and plan your next move.</p>
          <span className="coming-soon-pill">CHAT · COMING SOON</span>
          <button className="back-link" onClick={() => onNavigate("welcome")}>← Back to your home</button>
        </section>
      )}
      <footer className="welcome-footer"><span>northstar. &nbsp; FIND YOUR NEXT MOVE.</span><span>MADE FOR WHAT'S NEXT</span></footer>
    </main>
  );
}

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M4.5 10h11m0 0-4.5-4.5M15.5 10 11 14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function GoogleIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" width="19" height="19"><path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.36-.18-2.02H10v3.83h5.39a4.62 4.62 0 0 1-2 3.03v2.48h3.23c1.9-1.75 2.98-4.33 2.98-7.32Z" /><path fill="#34A853" d="M10 20c2.7 0 4.97-.9 6.62-2.45l-3.23-2.48c-.9.6-2.05.95-3.39.95-2.6 0-4.8-1.76-5.6-4.12H1.06v2.56A10 10 0 0 0 10 20Z" /><path fill="#FBBC05" d="M4.4 11.9a6 6 0 0 1 0-3.8V5.54H1.06a10 10 0 0 0 0 8.92L4.4 11.9Z" /><path fill="#EA4335" d="M10 3.97c1.47 0 2.8.5 3.84 1.5l2.88-2.88A9.62 9.62 0 0 0 10 0a10 10 0 0 0-8.94 5.54L4.4 8.1C5.2 5.73 7.4 3.97 10 3.97Z" /></svg>;
}

function GitHubIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" width="19" height="19" fill="currentColor"><path d="M10 .8a9.2 9.2 0 0 0-2.91 17.93c.46.08.63-.2.63-.45v-1.77c-2.56.56-3.1-1.09-3.1-1.09-.42-1.06-1.02-1.34-1.02-1.34-.84-.57.06-.56.06-.56.93.07 1.42.95 1.42.95.83 1.42 2.18 1.01 2.71.77.08-.6.33-1.01.59-1.24-2.04-.23-4.18-1.02-4.18-4.55 0-1 .36-1.82.95-2.46-.1-.23-.41-1.17.09-2.43 0 0 .77-.25 2.53.94a8.8 8.8 0 0 1 4.61 0c1.76-1.19 2.53-.94 2.53-.94.5 1.26.19 2.2.1 2.43.59.64.94 1.46.94 2.46 0 3.54-2.15 4.31-4.2 4.54.33.29.63.85.63 1.71v2.59c0 .25.17.54.64.45A9.2 9.2 0 0 0 10 .8Z" /></svg>;
}

export default App;
