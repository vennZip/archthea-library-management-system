import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  BookOpen,
  ShieldCheck,
  Mail,
  LockKeyhole,
} from "lucide-react";
import { supabase, authConfigured } from "../../lib/supabase";
import { useAuth } from "./AuthProvider";
import { Brand, Field, FormError } from "../../components/ui/Common";
import { useResource } from "../../hooks/useResource";

function AuthFrame({ children }) {
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Link to="/" aria-label="Archthea home">
          <Brand light />
        </Link>
        <div>
          <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
          <h1>
            Make room
            <br />
            for discovery.
          </h1>
          <p>
            A familiar favorite. A fresh perspective. A book you didn’t know you
            needed.
          </p>
          <div className="auth-book-art" aria-hidden="true">
            <div className="art-orbit" />
            <div className="art-book">
              <span>THE ART OF</span>
              <strong>
                being
                <br />
                curious.
              </strong>
              <BookOpen size={54} strokeWidth={0.8} />
              <small>ARCHTHEA LIBRARY</small>
            </div>
          </div>
        </div>
        <p className="auth-quote">
          A place to return to. A place to discover something new.
          <small>ARCHTHEA LIBRARY</small>
        </p>
      </aside>
      <main className="auth-main">
        {children}
        <p className="auth-footer">
          <ShieldCheck size={15} /> Your library. Securely connected.
        </p>
      </main>
    </div>
  );
}

export function LoginPage() {
  const { user, loading, error: accountError, refreshProfile } = useAuth();
  const health = useResource("/health");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  if (user && !loading) return <Navigate to="/app" replace />;
  const connected = authConfigured && health.data?.configured;
  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error)
        throw new Error(
          "We couldn’t sign you in. Check your email and password and try again.",
        );
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <AuthFrame>
      <div className="auth-form-wrap">
        <Link className="auth-mobile-brand" to="/">
          <Brand />
        </Link>
        <span className="eyebrow">WELCOME TO ARCHTHEA</span>
        <h2>Your library awaits.</h2>
        <p className="muted">
          Sign in to pick up where your curiosity left off.
        </p>
        {!health.loading && !connected && (
          <div className="connection-notice" role="status">
            <strong>The library is being connected.</strong>
            <p>
              Sign-in will be available once the library administrator completes
              setup.
            </p>
            {health.error && (
              <button className="text-button" onClick={health.reload}>
                Check connection again
              </button>
            )}
          </div>
        )}
        <form onSubmit={submit}>
          <Field label="Email address">
            <div className="input-icon">
              <Mail size={18} />
              <input
                type="email"
                autoComplete="username"
                required
                placeholder="you@university.edu"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </Field>
          <Field label="Password">
            <div className="input-icon">
              <LockKeyhole size={18} />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          <div className="auth-form-meta">
            <span>Students & librarians</span>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <FormError error={error || accountError} />
          <button
            className="button primary full-width"
            disabled={!connected || pending || loading}
          >
            {pending || loading ? "Signing in…" : "Sign in to your library"}
          </button>
        </form>
        {accountError && (
          <button
            className="text-button"
            onClick={() => refreshProfile().catch(setError)}
          >
            Retry account connection
          </button>
        )}
        <div className="auth-help">
          <span>New to the library?</span>
          <p>Visit your librarian to register your student account.</p>
        </div>
        <Link className="text-link" to="/">
          Back to Archthea
        </Link>
      </div>
    </AuthFrame>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error)
        throw new Error(
          "We could not send a recovery email right now. Please try again later.",
        );
      setSent(true);
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <AuthFrame>
      <div className="auth-form-wrap">
        <span className="eyebrow">LET’S GET YOU BACK</span>
        <h2>A fresh start.</h2>
        <p className="muted">
          Enter your account email to request a password reset link.
        </p>
        {sent ? (
          <div className="connection-notice">
            <strong>Check your inbox.</strong>
            <p>
              If an account exists for this address, you’ll receive a password
              reset link shortly.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <Field label="Email address">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <FormError error={error} />
            <button
              className="button primary full-width"
              disabled={pending || !authConfigured}
            >
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <Link className="text-link" to="/login">
          Back to sign in
        </Link>
      </div>
    </AuthFrame>
  );
}

export function ResetPasswordPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(new Error("The passwords do not match."));
      return;
    }
    setPending(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSaved(true);
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <AuthFrame>
      <div className="auth-form-wrap">
        <span className="eyebrow">YOUR ACCOUNT</span>
        <h2>Choose a password.</h2>
        {saved ? (
          <>
            <p>Your password has been saved.</p>
            <button className="button primary" onClick={() => navigate("/app")}>
              Open your library
            </button>
          </>
        ) : loading ? (
          <p role="status">Checking your secure link…</p>
        ) : !session ? (
          <>
            <p className="muted">
              This link has expired or could not be verified. Request a new
              password reset link.
            </p>
            <Link className="button primary" to="/forgot-password">
              Request a new link
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <Field
              label="New password"
              hint="Use at least 12 characters. A unique passphrase works well."
            >
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field label="Confirm password">
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </Field>
            <FormError error={error} />
            <button className="button primary full-width" disabled={pending}>
              {pending ? "Saving…" : "Save password"}
            </button>
          </form>
        )}
      </div>
    </AuthFrame>
  );
}

export function AuthCallbackPage() {
  const { session, loading, error } = useAuth();
  if (!loading && session) return <Navigate to="/reset-password" replace />;
  return (
    <AuthFrame>
      <div className="auth-form-wrap">
        <h2>Opening your account…</h2>
        {error && (
          <>
            <FormError error={error} />
            <Link to="/forgot-password">Request a new link</Link>
          </>
        )}
      </div>
    </AuthFrame>
  );
}
