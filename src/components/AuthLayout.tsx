import { Link } from "react-router";

export const AuthLayout = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <main className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-md items-center justify-center py-10">
    <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <Link to="/" className="flex items-center justify-center text-2xl font-extrabold tracking-tight text-slate-900">
        <span className="text-emerald-700">H4</span>UP
      </Link>
      <h1 className="mt-6 text-center text-2xl font-bold text-slate-900">{title}</h1>
      <div className="mt-6">{children}</div>
    </section>
  </main>
);

export const AuthField = ({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className="block text-sm font-semibold text-slate-700">
    {label}
    <input
      {...props}
      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
    />
  </label>
);

export const AuthError = ({ message }: { message: string | null }) =>
  message ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null;
