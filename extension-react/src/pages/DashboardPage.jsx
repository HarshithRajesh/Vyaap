import { useState, useEffect, useCallback } from 'react';
import styles from './DashboardPage.module.css';
import ExtractBar from '../components/ExtractBar';
import InvoiceTabs from '../components/InvoiceTabs';
import InvoiceCard from '../components/InvoiceCard';

const EMPTY_INVOICES = { pending: [], approved: [], generated: [], rejected: [] };

/**
 * DashboardPage
 * Mirrors the full vanilla DashboardController class logic in React.
 *
 * Invoice categorization:
 *   pending_verification → pending
 *   approved             → approved
 *   generated            → generated
 *   rejected             → rejected
 */
export default function DashboardPage({ user, onLogout }) {
  const [activeTab, setActiveTab]     = useState('pending');
  const [invoices, setInvoices]       = useState(EMPTY_INVOICES);
  const [loadingInv, setLoadingInv]   = useState(false);

  // ── Load invoices from background.js (mirrors loadInvoices()) ────────
  const loadInvoices = useCallback(async () => {
    setLoadingInv(true);
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const response = await chrome.runtime.sendMessage({ action: 'getPendingInvoices' });
        if (response?.success && response.invoices) {
          setInvoices(categorize(response.invoices));
        }
      }
    } catch (err) {
      console.error('[Vyaap] Failed to load invoices:', err);
    } finally {
      setLoadingInv(false);
    }
  }, []);

  // ── Categorize (mirrors vanilla categorizeInvoices()) ────────────────
  function categorize(list = []) {
    const result = { pending: [], approved: [], generated: [], rejected: [] };
    list.forEach(inv => {
      if (inv.status === 'pending_verification' || inv.status === 'pending') {
        result.pending.push(inv);
      } else if (inv.status === 'approved')   result.approved.push(inv);
      else if (inv.status === 'generated')    result.generated.push(inv);
      else if (inv.status === 'rejected')     result.rejected.push(inv);
    });
    return result;
  }

  // ── On mount + listen to background messages (mirrors init()) ────────
  useEffect(() => {
    loadInvoices();

    const handler = (message) => {
      if (message.target === 'dashboard') {
        loadInvoices();
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handler);
      return () => chrome.runtime.onMessage.removeListener(handler);
    }
  }, [loadInvoices]);

  const handleExtracted = () => {
    loadInvoices();
    setActiveTab('pending');
  };

  const currentList = invoices[activeTab] || [];
  const counts = {
    pending:   invoices.pending.length,
    approved:  invoices.approved.length,
    generated: invoices.generated.length,
    rejected:  invoices.rejected.length,
  };

  return (
    <div className={styles.layout}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}>💬</span>
          <div>
            <h1 className={styles.title}>Vyaap</h1>
            <div className={styles.subtitle}>Invoice Dashboard</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.userEmail}>{user?.email || ''}</span>
          <button
            id="logout-btn"
            className="btn btn-ghost btn-sm"
            onClick={onLogout}
            title="Log out"
          >
            ⏻ Logout
          </button>
        </div>
      </header>

      {/* ── Extract bar ─────────────────────────────────────────────── */}
      <ExtractBar onExtracted={handleExtracted} />

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <InvoiceTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        counts={counts}
      />

      {/* ── Content ─────────────────────────────────────────────────── */}
      <main className={styles.content}>
        {loadingInv ? (
          <div className={styles.centered}>
            <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
          </div>
        ) : currentList.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <div className={styles.list} id={`${activeTab}-list`}>
            {currentList.map(inv => (
              <InvoiceCard
                key={inv.id || inv.chatName || Math.random()}
                invoice={inv}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState({ tab }) {
  const configs = {
    pending:   { icon: '📭', text: 'No pending invoices', sub: 'Open a WhatsApp chat then click "Extract Current Chat"' },
    approved:  { icon: '✅', text: 'No approved invoices', sub: 'Approve invoices from the Pending tab' },
    generated: { icon: '📄', text: 'No generated invoices', sub: 'Generated PDFs will appear here' },
    rejected:  { icon: '❌', text: 'No rejected invoices', sub: '' },
  };
  const cfg = configs[tab] || configs.pending;
  return (
    <div className={styles.empty} id={`${tab}-tab`}>
      <div className={styles.emptyIcon}>{cfg.icon}</div>
      <div className={styles.emptyText}>{cfg.text}</div>
      {cfg.sub && <div className={styles.emptySub}>{cfg.sub}</div>}
    </div>
  );
}
