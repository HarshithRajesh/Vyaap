import styles from './ExtractBar.module.css';
import { useState } from 'react';

/**
 * ExtractBar
 * Mirrors vanilla dashboard.js extractCurrentChat() logic.
 * Sends { action: 'extractAndCreateInvoice' } to background.js.
 */
export default function ExtractBar({ onExtracted }) {
  const [status, setStatus]   = useState('Open a WhatsApp chat, then click Extract.');
  const [loading, setLoading] = useState(false);
  const [statusType, setStatusType] = useState('idle'); // idle | success | error

  const extract = async () => {
    setLoading(true);
    setStatus('Scrolling through chat to load all messages…');
    setStatusType('idle');

    try {
      // Same message as vanilla background.js
      const response = await chrome.runtime.sendMessage({ action: 'extractAndCreateInvoice' });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Extraction failed');
      }

      const count = response.count ?? response.messageCount ?? 0;
      if (response.invoiceReady) {
        setStatus(`✓ Extracted ${count} messages. Invoice JSON is ready.`);
      } else {
        setStatus(`✓ Extracted ${count} messages. Processing invoice...`);
      }
      setStatusType('success');

      if (onExtracted) onExtracted();
    } catch (err) {
      console.error('[Vyaap] Extraction error:', err);
      setStatus('✗ ' + err.message);
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.bar}>
      <button
        id="extract-btn"
        className={`btn btn-primary ${styles.extractBtn}`}
        onClick={extract}
        disabled={loading}
      >
        {loading ? <span className="spinner" /> : '📥'}
        {loading ? ' Extracting…' : ' Extract Current Chat'}
      </button>
      <div className={`${styles.status} ${styles[statusType]}`} id="extract-status">
        {status}
      </div>
    </div>
  );
}
