import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AuthError, AuthField, AuthLayout } from "../components/AuthLayout";
import { getAuthErrorMessage, isValidPassword } from "../lib/auth";
import { supabase } from "../supabase-client";

export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const email = (location.state?.email as string | undefined) ?? "";
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(email ? null : "Open this page from the password reset form.");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email || !/^\d{8}$/.test(token)) return setError("Enter the 8-digit reset code.");
    if (!isValidPassword(password)) return setError("Password must be at least 8 characters with uppercase, lowercase, and a digit.");
    if (password !== confirmPassword) return setError("Passwords do not match.");

    setIsLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
    if (verifyError) {
      setIsLoading(false);
      setError(getAuthErrorMessage(verifyError));
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (updateError) {
      setError(getAuthErrorMessage(updateError));
      return;
    }
    navigate("/login", { state: { message: "Your password was reset. You can now sign in." }, replace: true });
  };

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">Enter the reset code sent to <strong className="text-slate-900">{email || "your email"}</strong>.</p>
        <AuthError message={error} />
        <AuthField label="Reset code" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, ""))} required autoComplete="one-time-code" />
        <AuthField label="New password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" />
        <AuthField label="Confirm new password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required autoComplete="new-password" />
        <button disabled={isLoading} className="h4up-button h4up-button--primary w-full disabled:opacity-60">{isLoading ? "Updating..." : "Reset password"}</button>
        <Link to="/login" className="block text-center text-sm text-slate-600">Back to sign in</Link>
      </form>
    </AuthLayout>
  );
};
