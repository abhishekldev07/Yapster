import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AuthError, AuthField, AuthLayout } from "../components/AuthLayout";
import { getAuthErrorMessage } from "../lib/auth";
import { supabase } from "../supabase-client";

export const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    setIsLoading(false);
    if (resetError) {
      setError(getAuthErrorMessage(resetError));
      return;
    }
    navigate("/reset-password", { state: { email: email.trim() }, replace: true });
  };

  return (
    <AuthLayout title="Reset your password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">We will send a password reset code to your email.</p>
        <AuthError message={error} />
        <AuthField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
        <button disabled={isLoading} className="h4up-button h4up-button--primary w-full disabled:opacity-60">{isLoading ? "Sending..." : "Send reset code"}</button>
        <Link to="/login" className="block text-center text-sm text-slate-600">Back to sign in</Link>
      </form>
    </AuthLayout>
  );
};
