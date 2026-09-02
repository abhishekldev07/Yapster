import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AuthError, AuthField, AuthLayout } from "../components/AuthLayout";
import { useAuth } from "../context/AuthContext";
import { getAuthErrorMessage, isAtLeastThirteen, isValidPassword } from "../lib/auth";
import { supabase } from "../supabase-client";

export const SignupPage = () => {
  const navigate = useNavigate();
  const { signInWithGitHub } = useAuth();
  const [form, setForm] = useState({ email: "", username: "", displayName: "", dateOfBirth: "", password: "", confirmPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const accountMayExist = error?.toLowerCase().includes("account may already exist") ?? false;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.email.trim() || !form.username.trim() || !form.dateOfBirth || !form.password || !form.confirmPassword) {
      setError("Complete all required fields.");
      return;
    }
    const username = form.username.trim();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      setError("Username must be 3-24 characters using only letters, numbers, or underscores.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!isValidPassword(form.password)) {
      setError("Password must be at least 8 characters with uppercase, lowercase, and a digit.");
      return;
    }
    if (!isAtLeastThirteen(form.dateOfBirth)) {
      setError("You must be at least 13 years old.");
      return;
    }

    setIsLoading(true);
    const { data: existingProfile, error: usernameError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (usernameError) {
      setIsLoading(false);
      setError("We could not check that username. Please try again.");
      return;
    }
    if (existingProfile) {
      setIsLoading(false);
      setError("That username is already taken. Please choose another one.");
      return;
    }
    const { error: signupError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { user_name: username, full_name: form.displayName.trim(), date_of_birth: form.dateOfBirth } },
    });
    setIsLoading(false);
    if (signupError) {
      setError(getAuthErrorMessage(signupError));
      return;
    }
    navigate("/verify-email", { state: { email: form.email.trim() }, replace: true });
  };

  return (
    <AuthLayout title="Create your account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthError message={error} />
        {accountMayExist && <div className="flex gap-3 text-sm font-semibold"><Link to="/login" className="text-emerald-700">Sign in</Link><button type="button" onClick={signInWithGitHub} className="text-emerald-700">Continue with GitHub</button></div>}
        <AuthField label="Email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} required autoComplete="email" />
        <AuthField label="Username" value={form.username} onChange={(event) => update("username", event.target.value)} required autoComplete="username" />
        <AuthField label="Display name (optional)" value={form.displayName} onChange={(event) => update("displayName", event.target.value)} autoComplete="name" />
        <AuthField label="Date of birth" type="date" value={form.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} required />
        <AuthField label="Password" type="password" value={form.password} onChange={(event) => update("password", event.target.value)} required autoComplete="new-password" />
        <AuthField label="Confirm password" type="password" value={form.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} required autoComplete="new-password" />
        <button disabled={isLoading} className="h4up-button h4up-button--primary w-full disabled:cursor-wait disabled:opacity-60">{isLoading ? "Creating account..." : "Create account"}</button>
        <p className="text-center text-sm text-slate-600">Already have an account? <Link to="/login" className="font-semibold text-emerald-700">Sign in</Link></p>
      </form>
    </AuthLayout>
  );
};
