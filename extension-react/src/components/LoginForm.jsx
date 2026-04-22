import styles from './LoginForm.module.css';
import { useState } from 'react';

export default function LoginForm({ onLogin, onSwitch }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please fill all fields.'); return; }
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} id="login-form">
      <div className={styles.field}>
        <label className={styles.label} htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <button
        id="login-submit-btn"
        className="btn btn-primary"
        type="submit"
        disabled={loading}
        style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
      >
        {loading ? <span className="spinner" /> : null}
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
      <p className={styles.switch}>
        Don't have an account?{' '}
        <button type="button" className={styles.switchBtn} onClick={onSwitch} id="go-signup-btn">
          Sign up
        </button>
      </p>
    </form>
  );
}
