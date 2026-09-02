import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AuthError, AuthField, AuthLayout } from "../components/AuthLayout";
import { useAuth } from "../context/AuthContext";
import { getAuthErrorMessage } from "../lib/auth";
import { supabase } from "../supabase-client";

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
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setIsLoading(false);

    if (signInError) {
      const friendlyError = getAuthErrorMessage(signInError);
      if (signInError.message.toLowerCase().includes("email not confirmed")) {
        navigate("/verify-email", { state: { email: email.trim() } });
        return;
      }
      setError(friendlyError);
      return;
    }
    navigate("/");
  };

  return (
    <AuthLayout title="Welcome back">
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthError message={message} />
        <AuthError message={error} />
        <AuthField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
        <div>
          <AuthField label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          <Link to="/forgot-password" className="mt-2 block text-right text-sm font-semibold text-emerald-700 hover:text-emerald-800">Forgot password?</Link>
        </div>
        <button disabled={isLoading} className="h4up-button h4up-button--primary w-full disabled:cursor-wait disabled:opacity-60">
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
        <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" /></div>
        <button type="button" onClick={signInWithGitHub} className="h4up-button h4up-button--ghost w-full">Continue with GitHub</button>
        <p className="text-center text-sm text-slate-600">New to H4UP? <Link to="/signup" className="font-semibold text-emerald-700">Create an account</Link></p>
      </form>
    </AuthLayout>
  );
};
