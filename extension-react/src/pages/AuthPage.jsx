import { useState } from 'react';
import styles from './AuthPage.module.css';
import LoginForm from '../components/LoginForm';
import SignupForm from '../components/SignupForm';

/**
 * AuthPage
 * Shown when user is not logged in.
 * Toggles between Login and Signup tabs.
 */
export default function AuthPage({ onLogin }) {
  const [tab, setTab] = useState('login'); // 'login' | 'signup'

  return (
    <div className={styles.page}>
      {/* Logo / Branding */}
      <div className={styles.brand}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>💬</span>
          <span className={styles.logoText}>Vyaap</span>
        </div>
        <p className={styles.tagline}>WhatsApp → Invoice, powered by AI</p>
      </div>

      {/* Card */}
      <div className={styles.card}>
        {/* Tab switcher */}
        <div className={styles.tabs} role="tablist">
          <button
            id="auth-tab-login"
            role="tab"
            aria-selected={tab === 'login'}
            className={`${styles.tabBtn} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => setTab('login')}
          >
            Sign In
          </button>
          <button
            id="auth-tab-signup"
            role="tab"
            aria-selected={tab === 'signup'}
            className={`${styles.tabBtn} ${tab === 'signup' ? styles.tabActive : ''}`}
            onClick={() => setTab('signup')}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <div className={styles.formWrap}>
          {tab === 'login' ? (
            <LoginForm onLogin={onLogin} onSwitch={() => setTab('signup')} />
          ) : (
            <SignupForm onSwitch={() => setTab('login')} />
          )}
        </div>
      </div>
    </div>
  );
}
