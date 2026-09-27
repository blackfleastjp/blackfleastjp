import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, Landmark } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { loginSchema, registrationSchema, type LoginInput } from "@erp/validation";
import type { AuthSession } from "@erp/types";
import { api, ApiError, setAccessToken } from "../lib/api-client.js";

type RegistrationInput = { email: string; name: string; companyName: string; password: string };

export function LoginPage() {
  const [registerMode, setRegisterMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const form = useForm<LoginInput & RegistrationInput>({
    resolver: zodResolver(
      registerMode ? registrationSchema : loginSchema,
    ) as unknown as Resolver<RegistrationInput>,
    defaultValues: { email: "", password: "", name: "", companyName: "" },
  });
  const authentication = useMutation({
    mutationFn: (values: LoginInput | RegistrationInput) =>
      api.post<AuthSession>(registerMode ? "/auth/register" : "/auth/login", values),
    onSuccess: async (session) => {
      setAccessToken(session.accessToken);
      await queryClient.setQueryData(["current-user"], session.user);
      navigate("/app", { replace: true });
    },
    onError: (error: Error) =>
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Unable to connect. Check your network and try again.",
      ),
  });

  function submit(values: RegistrationInput) {
    setErrorMessage(null);
    const credentials = registerMode
      ? {
          email: values.email,
          password: values.password,
          name: values.name,
          companyName: values.companyName,
        }
      : { email: values.email, password: values.password };
    authentication.mutate(credentials);
  }

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
          <p className="eyebrow">BUILT FOR THE WHOLE BUSINESS</p>
          <h1>
            Bring every part of work into <em>balance.</em>
          </h1>
          <p>
            One clear view of the people, decisions, and day-to-day operations behind your business.
          </p>
        </div>
        <div className="visual-footer">
          <span>
            <i />A calmer way to run business
          </span>
          <span>01 — 04</span>
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
              <Landmark size={20} />
            </span>
            <p className="eyebrow">
              {registerMode ? "GET YOUR WORKSPACE STARTED" : "YOUR OPERATIONS, IN FOCUS"}
            </p>
            <h2>{registerMode ? "Create your workspace" : "Welcome back"}</h2>
            <p>
              {registerMode
                ? "Set up your company and administrator account."
                : "Sign in to continue to your workspace."}
            </p>
          </div>
          <form className="auth-form" onSubmit={form.handleSubmit(submit)} noValidate>
            {registerMode && (
              <>
                <label htmlFor="full-name">Full name</label>
                <input
                  id="full-name"
                  autoComplete="name"
                  placeholder="Jordan Lee"
                  {...form.register("name")}
                />
                {form.formState.errors.name && (
                  <span className="field-error">{form.formState.errors.name.message}</span>
                )}
                <label htmlFor="company-name">Company name</label>
                <input
                  id="company-name"
                  autoComplete="organization"
                  placeholder="Northstar Studio"
                  {...form.register("companyName")}
                />
                {form.formState.errors.companyName && (
                  <span className="field-error">{form.formState.errors.companyName.message}</span>
                )}
              </>
            )}
            <label htmlFor="email-address">Work email</label>
            <input
              id="email-address"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <span className="field-error">{form.formState.errors.email.message}</span>
            )}
            <div className="password-label">
              <label htmlFor="password">Password</label>
              {!registerMode && (
                <button
                  type="button"
                  className="subtle-link"
                  onClick={() =>
                    setErrorMessage("Contact your workspace administrator to reset your password.")
                  }
                >
                  Need help?
                </button>
              )}
            </div>
            <div className="password-input">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={registerMode ? "new-password" : "current-password"}
                placeholder={registerMode ? "12+ characters" : "Enter your password"}
                {...form.register("password")}
              />
              <button
                type="button"
                className="icon-button password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {form.formState.errors.password && (
              <span className="field-error">
                {registerMode
                  ? "Use 12+ characters with upper, lower, and numeric characters."
                  : form.formState.errors.password.message}
              </span>
            )}
            {errorMessage && (
              <div className="form-alert" role="alert">
                {errorMessage}
              </div>
            )}
            <button
              className="button button-primary auth-submit"
              type="submit"
              disabled={authentication.isPending}
            >
              {authentication.isPending
                ? "Please wait…"
                : registerMode
                  ? "Create workspace"
                  : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {registerMode ? "Already have a workspace?" : "New to Ledgerline?"}{" "}
            <button
              type="button"
              className="subtle-link"
              onClick={() => {
                setRegisterMode(!registerMode);
                setErrorMessage(null);
                form.clearErrors();
              }}
            >
              {registerMode ? "Sign in" : "Create a workspace"}
            </button>
          </p>
          <div className="auth-security">
            <span className="security-mark">✓</span>
            <span>Your session is encrypted and securely managed.</span>
          </div>
        </div>
        <footer className="auth-panel-footer">
          <span>© {new Date().getFullYear()} Ledgerline</span>
          <span>Privacy&nbsp;&nbsp; · &nbsp;&nbsp;Security</span>
        </footer>
      </section>
    </main>
  );
}
