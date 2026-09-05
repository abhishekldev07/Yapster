import { Link } from "react-router";

export const AuthLayout = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <main className="yapster-auth-shell">
    <section className="yapster-auth-card">
      <div className="yapster-auth-card__accent" />
      <div className="yapster-auth-card__body">
        <Link to="/" className="yapster-auth-logo" aria-label="Yapster home">
          <img src="/yapster-mark.svg" alt="" />
          <span>Yapster</span>
        </Link>
        <h1 className="mt-7 text-center text-2xl font-extrabold text-slate-950">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-6 text-slate-500">
          Join conversations around the communities and ideas you care about.
        </p>
        <div className="mt-7">{children}</div>
      </div>
    </section>
  </main>
);

export const AuthField = ({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className="yapster-auth-field">
    {label}
    <input {...props} />
  </label>
);

export const AuthError = ({ message }: { message: string | null }) =>
  message ? (
    <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">
      {message}
    </p>
  ) : null;
