import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, KeyRound, MailCheck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from "@erp/validation";
import { api, ApiError, setAccessToken } from "../lib/api-client.js";

export function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const form = useForm<{ email: string }>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const request = useMutation({
    mutationFn: (values: { email: string }) =>
      api.post<{ resetToken?: string }>("/auth/forgot-password", values),
    onSuccess: (result) => {
      setMessage(
        "If that address belongs to an account, password reset instructions are on their way.",
      );
      setResetToken(result.resetToken ?? null);
    },
    onError: (error: Error) =>
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Password reset could not be requested. Try again.",
      ),
  });
  return (
    <AuthFrame
      eyebrow="ACCOUNT RECOVERY"
      title="Reset your password"
      description="Enter the work email for your Ledgerline account."
    >
      <form
        className="auth-form"
        onSubmit={form.handleSubmit((values) => request.mutate(values))}
        noValidate
      >
        <label htmlFor="recovery-email">Work email</label>
        <input id="recovery-email" type="email" autoComplete="email" {...form.register("email")} />
        {form.formState.errors.email && (
          <span className="field-error">{form.formState.errors.email.message}</span>
        )}
        {message && (
          <div className="form-alert" role="status">
            {message}
          </div>
        )}
        {resetToken && (
          <Link
            className="button button-secondary auth-submit"
            to={`/reset-password?token=${encodeURIComponent(resetToken)}`}
          >
            Continue to reset password
            <ArrowRight size={16} />
          </Link>
        )}
        <button className="button button-primary auth-submit" disabled={request.isPending}>
          {request.isPending ? "Sending…" : "Send reset instructions"}
          <MailCheck size={17} />
        </button>
      </form>
      <p className="auth-switch">
        <Link className="subtle-link" to="/login">
          <ArrowLeft size={13} /> Back to sign in
        </Link>
      </p>
    </AuthFrame>
  );
}

const resetFormSchema = resetPasswordSchema
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match",
  });
type ResetFormValues = z.infer<typeof resetFormSchema>;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const token = searchParams.get("token") ?? "";
  const form = useForm<ResetFormValues>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  });
  const reset = useMutation({
    mutationFn: (values: ResetFormValues) =>
      api.post<{ passwordReset: boolean }>("/auth/reset-password", {
        token: values.token,
        password: values.password,
      }),
    onSuccess: () => navigate("/login", { replace: true }),
    onError: (error: Error) =>
      setMessage(error instanceof ApiError ? error.message : "This reset link could not be used."),
  });
  return (
    <AuthFrame
      eyebrow="SECURE PASSWORD RESET"
      title="Choose a new password"
      description="Use a strong password you do not use for another account."
    >
      {!token ? (
        <div className="form-alert" role="alert">
          This reset link is missing its token. Request a new link.
        </div>
      ) : (
        <form
          className="auth-form"
          onSubmit={form.handleSubmit((values) => reset.mutate(values))}
          noValidate
        >
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <span className="field-error">{form.formState.errors.password.message}</span>
          )}
          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            {...form.register("confirmPassword")}
          />
          {form.formState.errors.confirmPassword && (
            <span className="field-error">{form.formState.errors.confirmPassword.message}</span>
          )}
          {message && (
            <div className="form-alert" role="alert">
              {message}
            </div>
          )}
          <button className="button button-primary auth-submit" disabled={reset.isPending}>
            {reset.isPending ? "Resetting…" : "Set new password"}
            <KeyRound size={16} />
          </button>
        </form>
      )}
      <p className="auth-switch">
        <Link className="subtle-link" to="/forgot-password">
          Request another reset link
        </Link>
      </p>
    </AuthFrame>
  );
}

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });
  const change = useMutation({
    mutationFn: (values: z.infer<typeof changePasswordSchema>) =>
      api.post<{ passwordChanged: boolean }>("/auth/change-password", values),
    onSuccess: () => {
      setAccessToken(null);
      navigate("/session-expired", { replace: true });
    },
    onError: (error: Error) =>
      setMessage(error instanceof ApiError ? error.message : "Password could not be changed."),
  });
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SECURITY</p>
          <h1>Change password</h1>
          <p className="page-description">
            Your active sessions will be signed out after this change.
          </p>
        </div>
      </div>
      <form
        className="management-form data-panel password-change-form"
        onSubmit={form.handleSubmit((values) => change.mutate(values))}
        noValidate
      >
        <UserPasswordField
          label="Current password"
          error={form.formState.errors.currentPassword?.message}
        >
          <input
            type="password"
            autoComplete="current-password"
            {...form.register("currentPassword")}
          />
        </UserPasswordField>
        <UserPasswordField label="New password" error={form.formState.errors.newPassword?.message}>
          <input type="password" autoComplete="new-password" {...form.register("newPassword")} />
        </UserPasswordField>
        {message && (
          <div className="form-alert" role="alert">
            {message}
          </div>
        )}
        <button className="button button-primary" disabled={change.isPending}>
          {change.isPending ? "Changing…" : "Change password"}
        </button>
      </form>
    </section>
  );
}

function UserPasswordField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="management-field">
      <span>{label}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

export function SessionExpiredPage() {
  return (
    <AuthFrame
      eyebrow="SESSION ENDED"
      title="Please sign in again"
      description="Your session has expired or your password was changed. Sign in to continue securely."
    >
      <Link className="button button-primary auth-submit" to="/login">
        Return to sign in
        <ArrowRight size={17} />
      </Link>
    </AuthFrame>
  );
}

function AuthFrame({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="Ledgerline ERP">
        <div className="auth-visual-grain" />
        <Link to="/login" className="auth-brand">
          <span className="brand-symbol">L</span>
          <span className="brand-name">
            ledgerline<span>ERP</span>
          </span>
        </Link>
        <div className="auth-visual-copy">
          <p className="eyebrow">SECURE ACCESS, BY DESIGN</p>
          <h1>
            Keep your business in <em>balance.</em>
          </h1>
          <p>Account protection for the people and operations behind your company.</p>
        </div>
        <div className="visual-footer">
          <span>
            <i />
            Encrypted account recovery
          </span>
          <span>02 — 04</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-mobile-brand">
            <span className="brand-symbol">L</span>
            <span className="brand-name">
              ledgerline<span>ERP</span>
            </span>
          </div>
          <div className="auth-heading">
            <span className="auth-icon">
              <KeyRound size={20} />
            </span>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          {children}
        </div>
        <footer className="auth-panel-footer">
          <span>© {new Date().getFullYear()} Ledgerline</span>
          <span>Privacy · Security</span>
        </footer>
      </section>
    </main>
  );
}
