'use client';

import Image from 'next/image';
import { useState } from 'react';

import { useSession } from '@/components/alpha-provider';
import { Spinner } from '@/components/common';
import type { LoginResponseBody } from '@/lib/types';
import styles from './ui.module.css';

function Field({
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  autoComplete,
  right,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: 'text' | 'email' | 'password';
  inputMode?: 'email' | 'numeric' | 'text';
  autoComplete?: string;
  right?: React.ReactNode;
}) {
  return (
    <label className={styles.fieldShell}>
      <input
        className={styles.field}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      {right}
    </label>
  );
}

export function LoginScreen() {
  const { signIn } = useSession();
  const [method, setMethod] = useState<'email' | 'token'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const chooseMethod = (next: 'email' | 'token') => {
    setMethod(next);
    setError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    if (method === 'email') {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
      if (password.length < 6) return setError('Password must be at least 6 characters.');
      if (needsTwoFactor && !/^\d{6}$/.test(totp)) return setError('Enter your 6-digit code.');
    } else if (token.trim().length < 20) {
      return setError('Paste a valid Alpha Prime access token.');
    }

    setLoading(true);
    try {
      const response = await fetch(method === 'email' ? '/api/auth/login' : '/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          method === 'email'
            ? { email, password, totp: needsTwoFactor ? totp : undefined }
            : { token: token.trim() },
        ),
      });
      const result = (await response.json()) as LoginResponseBody;
      if (result.kind === 'two-factor') {
        setNeedsTwoFactor(true);
        setError(result.message);
        return;
      }
      if (result.kind === 'error') return setError(result.message);
      setPassword('');
      setTotp('');
      setToken('');
      signIn(result.session);
    } catch {
      setError('Could not reach Alpha. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const showToggle = (
    <button type="button" className={styles.showButton} onClick={() => setShowSecret((value) => !value)}>
      {showSecret ? 'hide' : 'show'}
    </button>
  );

  return (
    <main className={styles.center}>
      <form className={styles.login} onSubmit={submit} noValidate>
        <div className={styles.loginHero}>
          <div className={styles.logoRing}>
            <Image src="/logo.png" alt="Alpha" width={170} height={170} priority />
          </div>
          <h1 className={styles.loginTitle}>welcome to alpha</h1>
          <p className={styles.loginSubtitle}>Your Alpha Prime average, always within reach.</p>
        </div>

        <div className={styles.authTabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={method === 'email'}
            className={`${styles.authTab} ${method === 'email' ? styles.authTabActive : ''}`}
            onClick={() => chooseMethod('email')}>
            email
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={method === 'token'}
            className={`${styles.authTab} ${method === 'token' ? styles.authTabActive : ''}`}
            onClick={() => chooseMethod('token')}>
            access token
          </button>
        </div>

        {method === 'email' ? (
          <>
            <Field
              value={email}
              onChange={setEmail}
              placeholder="enter your email"
              type="email"
              inputMode="email"
              autoComplete="username"
            />
            <Field
              value={password}
              onChange={setPassword}
              placeholder="enter your password"
              type={showSecret ? 'text' : 'password'}
              autoComplete="current-password"
              right={showToggle}
            />
            {needsTwoFactor && (
              <Field
                value={totp}
                onChange={(value) => setTotp(value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit authentication code"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            )}
          </>
        ) : (
          <>
            <Field
              value={token}
              onChange={setToken}
              placeholder="paste your Alpha Prime token"
              type={showSecret ? 'text' : 'password'}
              autoComplete="off"
              right={showToggle}
            />
            <p className={styles.tokenHelp}>
              Alpha cannot read another site&apos;s cookies. Token connection is the secure alternative when you
              already have an Alpha Prime session.
            </p>
          </>
        )}

        {!!error && <p className={styles.errorText} role="alert">{error}</p>}
        <button type="submit" disabled={loading} className={styles.loginButton}>
          {loading ? <Spinner tone="light" /> : needsTwoFactor && method === 'email' ? 'verify & log in' : 'log in'}
        </button>
        <p className={styles.securityNote}>
          <span>◆</span>
          <span>
            Your password is sent only to Alpha Prime and is never saved. The returned token is kept in an encrypted,
            HTTP-only cookie that page scripts cannot read.
          </span>
        </p>
      </form>
    </main>
  );
}
