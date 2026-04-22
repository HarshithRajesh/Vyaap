import styles from './InvoiceCard.module.css';

/**
 * InvoiceCard
 * Mirrors vanilla renderInvoiceCard() logic exactly.
 */
export default function InvoiceCard({ invoice, onClick }) {
  const data = invoice.data || {};
  const statusClass = invoice.status?.replace(/_/g, '-') || 'pending';
  const msgCount = data.rawMessages?.length ?? invoice.rawMessages?.length ?? 0;

  const formatStatus = (s = '') =>
    s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const formatDate = (d) => {
    try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
  };

  const statusColors = {
    'pending-verification': styles.badgePending,
    'pending':              styles.badgePending,
    'approved':             styles.badgeApproved,
    'generated':            styles.badgeGenerated,
    'rejected':             styles.badgeRejected,
  };

  const cardBorders = {
    'pending-verification': styles.borderPending,
    'pending':              styles.borderPending,
    'approved':             styles.borderApproved,
    'generated':            styles.borderGenerated,
    'rejected':             styles.borderRejected,
  };

  return (
    <div
      className={`${styles.card} ${cardBorders[statusClass] || ''} fade-in`}
      data-invoice-id={invoice.id}
      onClick={() => onClick && onClick(invoice.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick && onClick(invoice.id)}
    >
      <div className={styles.header}>
        <div className={styles.title}>
          {data.orderDetails?.orderNumber || invoice.chatName || 'Draft'}
        </div>
        <span className={`${styles.badge} ${statusColors[statusClass] || ''}`}>
          {formatStatus(invoice.status)}
        </span>
      </div>
      <div className={styles.grid}>
        <div className={styles.cell}>
          <div className={styles.cellLabel}>Customer</div>
          <div className={styles.cellValue}>
            {data.customer?.name || invoice.customer?.name || 'Unknown'}
          </div>
        </div>
        <div className={styles.cell}>
          <div className={styles.cellLabel}>Date</div>
          <div className={styles.cellValue}>{formatDate(invoice.createdAt)}</div>
        </div>
        <div className={styles.cell}>
          <div className={styles.cellLabel}>Items</div>
          <div className={styles.cellValue}>
            {data.items?.length ?? invoice.items?.length ?? 0} items
          </div>
        </div>
        <div className={styles.cell}>
          <div className={styles.cellLabel}>Messages</div>
          <div className={styles.cellValue}>{msgCount}</div>
        </div>
      </div>
    </div>
  );
}
