import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AuthError, AuthField, AuthLayout } from "../components/AuthLayout";
import { useAuth } from "../context/AuthContext";
import { getAuthErrorMessage } from "../lib/auth";
import { supabase } from "../supabase-client";

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
    <path d="M12 .8a11.4 11.4 0 0 0-3.6 22.2c.6.1.8-.2.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.3 3.6 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.4-1.3-5.4-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11.1 11.1 0 0 1 5.8 0C14.8 5 15.8 5 15.8 5c.6 1.6.2 2.8.1 3.1.8.9 1.2 1.9 1.2 3.1 0 4.4-2.8 5.4-5.4 5.7.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.4 11.4 0 0 0 12 .8Z" />
  </svg>
);

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithGitHub } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(location.state?.message ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        if (signInError.message.toLowerCase().includes("email not confirmed")) {
          navigate("/verify-email", { state: { email: email.trim() } });
          return;
        }
        setError(getAuthErrorMessage(signInError));
        return;
      }
      navigate("/");
    } catch (signInError) {
      setError(getAuthErrorMessage(signInError));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back">
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthError message={message} />
        <AuthError message={error} />
        <AuthField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
        <div>
          <AuthField label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          <Link to="/forgot-password" className="mt-2 block text-right text-sm font-semibold text-violet-700 hover:text-violet-800">Forgot password?</Link>
        </div>
        <button disabled={isLoading} className="yapster-button yapster-button--primary w-full disabled:cursor-wait disabled:opacity-60">
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
        <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" /></div>
        <button type="button" onClick={signInWithGitHub} className="yapster-github-button w-full">
          <GitHubIcon />
          <span>Continue with GitHub</span>
        </button>
        <p className="text-center text-sm text-slate-600">New to Yapster? <Link to="/signup" className="font-semibold text-violet-700 hover:text-violet-800">Create an account</Link></p>
      </form>
    </AuthLayout>
  );
};
