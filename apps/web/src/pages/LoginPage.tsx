import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { publicRequest } from '../api/client';
import { useAuthStore } from '../state/auth-store';
import type { AuthResponse } from '../types';

export function LoginPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const navigate = useNavigate();
  const loginMutation = useMutation({
    mutationFn: () =>
      publicRequest<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: (session) => {
      setSession(session.accessToken, session.user);
      navigate('/', { replace: true });
    },
  });

  if (user) return <Navigate to="/" replace />;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    loginMutation.mutate();
  }

  return (
    <main className="login-page">
      <section className="login-aside">
        <a className="brand login-brand" href="/">
          <span className="brand-mark">L</span>
          <span>
            LIFTER<span className="brand-light"> / ERP</span>
          </span>
        </a>
        <div className="aside-copy">
          <p className="eyebrow">OPERATIONS PLATFORM</p>
          <h1>Built for the work that moves us.</h1>
          <p>One clear view of the people, processes, and decisions powering Lifter Industries.</p>
        </div>
        <span className="aside-index">LI / 01</span>
      </section>
      <section className="login-main">
        <div className="login-form-wrap">
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h2>Welcome back</h2>
          <p className="form-intro">Sign in to continue to your operations workspace.</p>
          <form className="login-form" onSubmit={submit}>
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <div className="password-label-row">
              <label htmlFor="password">Password</label>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {loginMutation.isError && (
              <p className="form-error" role="alert">
                {loginMutation.error.message}
              </p>
            )}
            <button className="primary-button" type="submit" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? 'Signing in...' : 'Sign in'}{' '}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          <p className="security-note">
            <span className="security-mark">●</span> Secure access protected by your organization
          </p>
        </div>
        <span className="login-footer">LIFTER INDUSTRIES · ENTERPRISE SYSTEMS</span>
      </section>
    </main>
  );
}
