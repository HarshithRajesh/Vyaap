import styles from './SignupForm.module.css';
import { useState } from 'react';
import { authApi } from '../api/client';

export default function SignupForm({ onSwitch }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const { name, email, password, confirmPassword } = form;
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await authApi.signup({ name, email, password, confirmPassword });
      setSuccess('Account created! Please sign in.');
      setTimeout(() => onSwitch(), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} id="signup-form">
      <div className={styles.field}>
        <label className={styles.label} htmlFor="signup-name">Full Name</label>
        <input
          id="signup-name"
          type="text"
          placeholder="Jane Doe"
          value={form.name}
          onChange={onChange('name')}
          autoComplete="name"
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={onChange('email')}
          autoComplete="email"
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          type="password"
          placeholder="Min. 6 characters"
          value={form.password}
          onChange={onChange('password')}
          autoComplete="new-password"
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="signup-confirm">Confirm Password</label>
        <input
          id="signup-confirm"
          type="password"
          placeholder="Repeat password"
          value={form.confirmPassword}
          onChange={onChange('confirmPassword')}
          autoComplete="new-password"
        />
      </div>
      {error   && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}
      <button
        id="signup-submit-btn"
        className="btn btn-primary"
        type="submit"
        disabled={loading}
        style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
      >
        {loading ? <span className="spinner" /> : null}
        {loading ? 'Creating account…' : 'Create Account'}
      </button>
      <p className={styles.switch}>
        Already have an account?{' '}
        <button type="button" className={styles.switchBtn} onClick={onSwitch} id="go-login-btn">
          Sign in
        </button>
      </p>
    </form>
  );
}
