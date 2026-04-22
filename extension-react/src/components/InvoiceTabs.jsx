import styles from './InvoiceTabs.module.css';

const TABS = [
  { key: 'pending',   label: 'Pending',   emoji: '⏳' },
  { key: 'approved',  label: 'Approved',  emoji: '✅' },
  { key: 'generated', label: 'Generated', emoji: '📄' },
  { key: 'rejected',  label: 'Rejected',  emoji: '❌' },
];

/**
 * InvoiceTabs
 * Mirrors vanilla .tab / data-tab switching logic.
 */
export default function InvoiceTabs({ activeTab, onTabChange, counts = {} }) {
  return (
    <div className={styles.tabs} role="tablist">
      {TABS.map(t => (
        <button
          key={t.key}
          role="tab"
          id={`tab-${t.key}`}
          aria-selected={activeTab === t.key}
          className={`${styles.tab} ${activeTab === t.key ? styles.active : ''}`}
          onClick={() => onTabChange(t.key)}
          data-tab={t.key}
        >
          <span className={styles.emoji}>{t.emoji}</span>
          <span>{t.label}</span>
          {counts[t.key] > 0 && (
            <span className={styles.count}>{counts[t.key]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
