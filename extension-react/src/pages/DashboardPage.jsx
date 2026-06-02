import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './DashboardPage.module.css';
import ExtractBar from '../components/ExtractBar';
import InvoiceTabs from '../components/InvoiceTabs';
import InvoiceCard from '../components/InvoiceCard';

const EMPTY_INVOICES = { pending: [], approved: [], generated: [], rejected: [] };
const STORAGE_KEY = 'vyaap_status_overrides'; // chrome.storage.local key

/**
 * DashboardPage
 *
 * Invoice statuses:
 *   pending_verification / pending → Pending tab
 *   approved                       → Approved tab
 *   generated                      → Generated tab
 *   rejected                       → Rejected tab  (can be restored back to pending)
 *
 * Status persistence:
 *   Approve / Reject / Restore decisions are written to chrome.storage.local so
 *   they survive re-fetches (Redis always returns the original status).
 */
export default function DashboardPage({ user, onLogout }) {
  const [activeTab, setActiveTab]     = useState('pending');
  const [invoices, setInvoices]       = useState(EMPTY_INVOICES);
  const [allInvoices, setAllInvoices] = useState([]);
  const [loadingInv, setLoadingInv]   = useState(false);
  const pollRef                       = useRef(null); // active setInterval id

  // ── Persist & read status overrides in chrome.storage.local ──────────
  const readOverrides = () => new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve({});
    chrome.storage.local.get([STORAGE_KEY], result => resolve(result[STORAGE_KEY] || {}));
  });

  const saveOverride = (invoiceId, status) => new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve();
    chrome.storage.local.get([STORAGE_KEY], result => {
      const overrides = { ...(result[STORAGE_KEY] || {}), [invoiceId]: status };
      chrome.storage.local.set({ [STORAGE_KEY]: overrides }, resolve);
    });
  });

  // ── Categorize ────────────────────────────────────────────────────────
  function categorize(list = []) {
    const result = { pending: [], approved: [], generated: [], rejected: [] };
    list.forEach(inv => {
      if      (inv.status === 'rejected')                                          result.rejected.push(inv);
      else if (inv.status === 'pending_verification' || inv.status === 'pending')  result.pending.push(inv);
      else if (inv.status === 'approved')                                          result.approved.push(inv);
      else if (inv.status === 'generated')                                         result.generated.push(inv);
      else                                                                         result.pending.push(inv);
    });
    return result;
  }

  // ── Core fetch: silent=true skips spinner (used while polling) ────────
  const fetchInvoices = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoadingInv(true);
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const [response, overrides] = await Promise.all([
          chrome.runtime.sendMessage({ action: 'getPendingInvoices' }),
          readOverrides(),
        ]);
        if (response?.success && response.invoices) {
          const merged = response.invoices.map(inv => {
            const override = overrides[inv.id];
            return override ? { ...inv, status: override } : inv;
          });
          setAllInvoices(merged);
          setInvoices(categorize(merged));
          return merged;
        }
      }
    } catch (err) {
      console.error('[Vyaap] Failed to load invoices:', err);
    } finally {
      if (!silent) setLoadingInv(false);
    }
    return null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Public alias used by the background message listener (always shows spinner)
  const loadInvoices = useCallback(() => fetchInvoices({ silent: false }), [fetchInvoices]);

  // ── Local state helpers ───────────────────────────────────────────────
  const updateInvoiceLocal = (invoiceId, updater) => {
    setAllInvoices(prev => {
      const next = prev.map(inv => {
        if (inv.id !== invoiceId) return inv;
        return typeof updater === 'function' ? updater(inv) : { ...inv, ...updater };
      });
      setInvoices(categorize(next));
      return next;
    });
  };

  const handleApprove = async (invoiceId) => {
    await saveOverride(invoiceId, 'approved');
    updateInvoiceLocal(invoiceId, inv => ({ ...inv, status: 'approved' }));
  };

  // Reject → moves invoice to Rejected tab (stays in state)
  const handleReject = async (invoiceId) => {
    await saveOverride(invoiceId, 'rejected');
    updateInvoiceLocal(invoiceId, inv => ({ ...inv, status: 'rejected' }));
  };

  // Restore → moves rejected invoice back to Pending tab
  const handleRestore = async (invoiceId) => {
    await saveOverride(invoiceId, 'pending');
    updateInvoiceLocal(invoiceId, inv => ({ ...inv, status: 'pending' }));
  };

  const handleEdit = (invoiceId, patch) => {
    updateInvoiceLocal(invoiceId, inv => ({
      ...inv,
      data: {
        ...(inv.data || {}),
        bill: { ...(inv.data?.bill || {}), ...patch },
      },
      rawJson: { ...(inv.rawJson || {}), ...patch },
    }));
  };

  // ── Export approved invoices to CSV (Excel-compatible) ────────────────
  const exportToCSV = () => {
    const approved = invoices.approved;
    if (!approved.length) return;

    const headers = ['Invoice No', 'Date', 'Company Name', 'From', 'To', 'Product', 'Quantity', 'Unit Price', 'Total'];

    const rows = [];
    approved.forEach(inv => {
      const bill  = inv.data?.bill || inv.rawJson || {};
      const items = bill.items || [];

      const invoiceNo   = bill.invoiceNo  || inv.order_id || '—';
      const date        = bill.date ? new Date(bill.date).toLocaleDateString('en-IN') : '—';
      const companyName = '';                                                      // always blank
      const from        = bill.sellerName   || bill.senderName || inv.userId || '—'; // logged-in user
      const to          = bill.customerName || bill.from || inv.chatName     || '—'; // WhatsApp contact

      if (items.length === 0) {
        // Invoice with no line items — still emit one row
        rows.push([invoiceNo, date, companyName, from, to, '—', '—', '—', bill.itemsTotal ?? '—']);
      } else {
        items.forEach(item => {
          const qty   = item.quantity ?? '';
          const price = item.price    ?? '';
          const total = (qty !== '' && price !== '') ? (Number(qty) * Number(price)).toFixed(2) : '';
          rows.push([invoiceNo, date, companyName, from, to, item.description || '—', qty, price, total]);
        });
      }
    });

    // Escape a CSV cell value
    const esc = v => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const csvContent = [
      headers.map(esc).join(','),
      ...rows.map(row => row.map(esc).join(',')),
    ].join('\r\n');

    // UTF-8 BOM so Excel opens it correctly
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `vyaap_approved_invoices_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── On mount + background message listener ────────────────────────────
  useEffect(() => {
    loadInvoices();
    const handler = (message) => {
      if (message.target === 'dashboard') loadInvoices();
    };
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handler);
      return () => chrome.runtime.onMessage.removeListener(handler);
    }
  }, [loadInvoices]);

  // ── After extraction: silent-poll until a new invoice appears ─────────
  // No spinner shown during polling; stops as soon as count increases
  // or after 60 s (20 × 3 s). Prevents constant visible re-renders.
  const handleExtracted = () => {
    setActiveTab('pending');
    const countBefore = allInvoices.length;
    let attempts = 0;
    const MAX = 20;

    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      attempts++;
      const latest = await fetchInvoices({ silent: true });
      const newCount = latest ? latest.length : 0;
      if (newCount > countBefore || attempts >= MAX) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 3000);
  };

  // cleanup on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

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
      <InvoiceTabs activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />

      {/* ── Export bar — visible only on Approved tab with data ──────── */}
      {activeTab === 'approved' && invoices.approved.length > 0 && (
        <div className={styles.exportBar}>
          <span className={styles.exportInfo}>
            📋 {invoices.approved.length} approved invoice{invoices.approved.length !== 1 ? 's' : ''}
          </span>
          <button
            id="export-csv-btn"
            className={`btn btn-sm ${styles.exportBtn}`}
            onClick={exportToCSV}
            title="Download all approved invoices as Excel/CSV"
          >
            📥 Download Excel
          </button>
        </div>
      )}

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
                onApprove={handleApprove}
                onReject={handleReject}
                onRestore={handleRestore}
                onEdit={handleEdit}
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
    pending:   { icon: '📭', text: 'No pending invoices',  sub: 'Open a WhatsApp chat then click "Extract Current Chat"' },
    approved:  { icon: '✅', text: 'No approved invoices', sub: 'Approve invoices from the Pending tab' },
    generated: { icon: '📄', text: 'No generated invoices',sub: 'Generated PDFs will appear here' },
    rejected:  { icon: '🗑️', text: 'No rejected invoices', sub: 'Rejected invoices appear here — you can restore them to Pending.' },
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
