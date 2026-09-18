import { useState } from 'react';

export interface AuthUser {
  id: string;
  username: string;
}

interface Props {
  onAuthenticated: (user: AuthUser) => void;
}

type Mode = 'login' | 'register';

export default function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Не удалось войти');
      onAuthenticated(body.user);
    } catch (err: any) {
      setError(err.message || 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  }

  function changeMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <main className="auth-shell">
      <div className="auth-orbit orbit-one" />
      <div className="auth-orbit orbit-two" />
      <section className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">
            K
          </span>
          <div>
            <p className="auth-kicker">ПЛАНИРОВЩИК РАЗРАБОТКИ</p>
            <h1>Колбаски</h1>
          </div>
        </div>

        <div className="auth-intro">
          <span className="auth-status-dot" />
          <p>Спокойное пространство, где фичи, люди и сроки складываются в понятный план.</p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Вход или регистрация">
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => changeMode('register')}>
            Новый аккаунт
          </button>
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>
            У меня есть аккаунт
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            Логин
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={32}
              placeholder="например, kzkovich"
              required
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={128}
              placeholder="не меньше 8 символов"
              required
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-submit" disabled={submitting}>
            {submitting ? 'Подготавливаем…' : mode === 'register' ? 'Создать пространство' : 'Войти'}
          </button>
        </form>

        {mode === 'register' && (
          <p className="auth-demo-note">
            На старте добавим две демонстрационные фичи. Их можно сразу передвинуть, изменить или удалить.
          </p>
        )}
      </section>
    </main>
  );
}
