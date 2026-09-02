import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AuthError, AuthField, AuthLayout } from "../components/AuthLayout";
import { getAuthErrorMessage, syncProfileFromUser } from "../lib/auth";
import { supabase } from "../supabase-client";

export const VerifyEmailPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const email = (location.state?.email as string | undefined) ?? "";
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(email ? null : "Open this page from signup or enter your email again.");
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    if (!email || !/^\d{8}$/.test(token)) {
      setError("Enter the 8-digit verification code.");
      return;
    }
    setIsLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: "email" });
      if (verifyError) {
        setError(getAuthErrorMessage(verifyError));
        return;
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session?.user) throw new Error("Your email was verified, but the session could not be started.");
      await syncProfileFromUser(sessionData.session.user);
      navigate("/", { replace: true });
    } catch (verificationError) {
      setError(getAuthErrorMessage(verificationError));
    } finally {
      setIsLoading(false);
    }
  };

  const resend = async () => {
    setError(null);
    setStatus(null);
    if (!email) return setError("Your signup email is missing. Please sign up again.");
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
    if (resendError) setError(getAuthErrorMessage(resendError));
    else setStatus("A new verification code has been sent.");
  };

  return (
    <AuthLayout title="Verify your email">
      <form onSubmit={verify} className="space-y-4">
        <p className="text-center text-sm text-slate-600">Enter the 8-digit code sent to <strong className="text-slate-900">{email || "your email"}</strong>.</p>
        <AuthError message={error} />
        {status && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>}
        <AuthField label="Verification code" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, ""))} required autoComplete="one-time-code" />
        <button disabled={isLoading} className="h4up-button h4up-button--primary w-full disabled:opacity-60">{isLoading ? "Verifying..." : "Verify email"}</button>
        <button type="button" onClick={() => void resend()} className="w-full text-sm font-semibold text-emerald-700 hover:text-emerald-800">Resend code</button>
        <Link to="/login" className="block text-center text-sm text-slate-600">Back to sign in</Link>
      </form>
    </AuthLayout>
  );
};
