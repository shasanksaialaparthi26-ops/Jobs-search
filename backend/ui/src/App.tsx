import { useEffect, useState } from "react";
import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? "http://localhost:8180",
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? "jobs-search",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? "jobs-web",
});

type Screen = "signin" | "signup" | "welcome" | "resume" | "chat";
type Registration = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

function App() {
  const [screen, setScreen] = useState<Screen>("signin");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  if (!ready) {
    return <main className="loading-screen"><span className="loader" />Preparing your next move</main>;
  }

  if (screen === "welcome" && keycloak.authenticated) {
    return <Welcome name={keycloak.tokenParsed?.given_name ?? "there"} onSignOut={signOut}
      onNavigate={setScreen} />;
  }

  if ((screen === "resume" || screen === "chat") && keycloak.authenticated) {
    return (
      <SignedInPage
        screen={screen}
        name={keycloak.tokenParsed?.given_name ?? "there"}
        onNavigate={setScreen}
        onSignOut={signOut}
        onUpload={uploadResume}
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
          <nav className="main-nav"><button className="nav-link" onClick={() => onNavigate("welcome")}>Home</button><button className="nav-link" onClick={() => onNavigate("resume")}>My resume</button><button className="nav-link" onClick={() => onNavigate("chat")}>Chat <span className="nav-soon">SOON</span></button></nav>
          <span className="user-avatar">{name.charAt(0).toUpperCase()}</span><button className="signout-button" onClick={onSignOut}>Sign out</button></div>
      </header>
      <section className="welcome-content">
        <p className="eyebrow"><span className="status-dot" />YOUR SPACE, YOUR PACE</p>
        <h1>Welcome in, {name}.</h1>
        <p className="welcome-subtitle">A new chapter starts with one small step. Here are a few ways to get moving.</p>
        <div className="welcome-grid">
          <article className="welcome-card card-search"><div className="welcome-card-icon">⌕</div><p className="card-label">FIND YOUR FIT</p><h2>The right role<br />is out there.</h2><p>Explore opportunities that match where you want to go.</p><span className="card-link">Explore jobs <span>↗</span></span><div className="decor-search"><i /><i /><i /></div></article>
          <button className="welcome-card card-resume card-action" onClick={() => onNavigate("resume")}><div className="welcome-card-icon">✳</div><p className="card-label">SHOW YOUR STORY</p><h2>Your experience,<br />beautifully told.</h2><p>Upload your resume and keep your story in one place.</p><span className="card-link">Upload your resume <span>↗</span></span><div className="decor-paper"><b /><i /><i /><i /><i /></div></button>
          <article className="welcome-card card-apply"><div className="welcome-card-icon">↗</div><p className="card-label">MAKE YOUR MOVE</p><h2>More time for<br />the good stuff.</h2><p>Keep your applications organized and your progress in view.</p><span className="card-link">Coming soon <span>↗</span></span><div className="decor-progress"><span /><span /><span /></div></article>
        </div>
        <div className="welcome-note"><span>✦</span><p><b>Just getting started?</b> Take your time. Your next step will be here when you’re ready.</p></div>
      </section>
      <footer className="welcome-footer"><span>northstar. &nbsp; FIND YOUR NEXT MOVE.</span><span>MADE FOR WHAT'S NEXT</span></footer>
    </main>
  );
}

function SignedInPage({ screen, name, onNavigate, onSignOut, onUpload }: {
  screen: "resume" | "chat";
  name: string;
  onNavigate: (screen: Screen) => void;
  onSignOut: () => void;
  onUpload: (file: File) => Promise<{ fileName: string; size: number }>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await onUpload(file);
      setMessage(`${result.fileName} uploaded successfully (${(result.size / 1024 / 1024).toFixed(2)} MB).`);
      setFile(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="welcome-shell">
      <header className="welcome-nav">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("welcome"); }}><span className="brand-mark">N</span><span>northstar<span className="brand-dot">.</span></span></a>
        <div className="welcome-nav-right">
          <nav className="main-nav"><button className="nav-link" onClick={() => onNavigate("welcome")}>Home</button><button className={`nav-link ${screen === "resume" ? "active" : ""}`} onClick={() => onNavigate("resume")}>My resume</button><button className={`nav-link ${screen === "chat" ? "active" : ""}`} onClick={() => onNavigate("chat")}>Chat <span className="nav-soon">SOON</span></button></nav>
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
