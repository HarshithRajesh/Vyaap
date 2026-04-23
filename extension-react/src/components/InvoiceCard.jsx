import styles from './InvoiceCard.module.css';
import { jsPDF } from 'jspdf';

/**
 * InvoiceCard
 * Mirrors vanilla renderInvoiceCard() logic exactly.
 */
export default function InvoiceCard({ invoice, onClick, onApprove, onEdit }) {
  const data = invoice.data || {};
  const statusClass = invoice.status?.replace(/_/g, '-') || 'pending';
  const bill = data.bill || {};
  const rawJson = data.rawJson || invoice.rawJson || bill || invoice;
  const canApprove = invoice.status === 'pending_verification' || invoice.status === 'pending';

  const formatStatus = (s = '') =>
    s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const formatDate = (d) => {
    try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
  };

  const handleApprove = (e) => {
    e.stopPropagation();
    if (onApprove) onApprove(invoice.id);
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    const senderName = prompt('Edit sender name', bill.senderName || '');
    if (senderName === null) return;
    const from = prompt('Edit from/chat', bill.from || '');
    if (from === null) return;
    const quantityInput = prompt('Edit quantity', String(bill.quantity ?? 0));
    if (quantityInput === null) return;
    const itemsTotalInput = prompt('Edit items total', String(bill.itemsTotal ?? ''));
    if (itemsTotalInput === null) return;

    const quantity = Number(quantityInput);
    const itemsTotal = Number(itemsTotalInput);

    if (onEdit) {
      onEdit(invoice.id, {
        senderName: senderName || bill.senderName || 'Unknown',
        from: from || bill.from || 'Unknown Chat',
        quantity: Number.isFinite(quantity) ? quantity : bill.quantity ?? 0,
        itemsTotal: Number.isFinite(itemsTotal) ? itemsTotal : bill.itemsTotal ?? null,
      });
    }
  };

  const handlePdf = (e) => {
    e.stopPropagation();
    const doc = new jsPDF();
    let y = 16;
    doc.setFontSize(16);
    doc.text('Invoice / Bill', 14, y);
    y += 10;
    doc.setFontSize(11);
    doc.text(`Invoice No: ${bill.invoiceNo || invoice.id || 'Draft'}`, 14, y);
    y += 7;
    doc.text(`Date: ${formatDate(bill.date || invoice.createdAt)}`, 14, y);
    y += 7;
    doc.text(`Sender Name: ${bill.senderName || 'Unknown'}`, 14, y);
    y += 7;
    doc.text(`From: ${bill.from || 'Unknown Chat'}`, 14, y);
    y += 10;
    doc.text('Items:', 14, y);
    y += 7;
    (bill.items || []).forEach((item, idx) => {
      const line = `${idx + 1}. ${item.quantity ?? 1} x ${item.description || 'Item'}`;
      doc.text(line, 16, y);
      y += 6;
      if (y > 270) {
        doc.addPage();
        y = 16;
      }
    });
    y += 4;
    doc.text(`Total Quantity: ${bill.quantity ?? 0}`, 14, y);
    y += 7;
    doc.text(`Items Total: ${bill.itemsTotal ?? 'N/A'}`, 14, y);
    doc.save(`invoice-${bill.invoiceNo || invoice.id || Date.now()}.pdf`);
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
          <div className={styles.cellLabel}>Sender Name</div>
          <div className={styles.cellValue}>
            {bill.senderName || data.customer?.name || invoice.customer?.name || 'Unknown'}
          </div>
        </div>
        <div className={styles.cell}>
          <div className={styles.cellLabel}>From</div>
          <div className={styles.cellValue}>{bill.from || invoice.chatName || 'Unknown Chat'}</div>
        </div>
        <div className={styles.cell}>
          <div className={styles.cellLabel}>Quantity</div>
          <div className={styles.cellValue}>
            {bill.quantity ?? 0}
          </div>
        </div>
        <div className={styles.cell}>
          <div className={styles.cellLabel}>Items Total</div>
          <div className={styles.cellValue}>{bill.itemsTotal ?? 'N/A'}</div>
        </div>
      </div>
      <div className={styles.actions}>
        <button className="btn btn-ghost btn-sm" onClick={handleEdit}>Edit</button>
        {canApprove && (
          <button className="btn btn-primary btn-sm" onClick={handleApprove}>Approve</button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={handlePdf}>Generate PDF</button>
      </div>
      <div className={styles.itemsSection}>
        <div className={styles.cellLabel}>Line Items</div>
        <div className={styles.itemList}>
          {(bill.items || []).length === 0 ? (
            <div className={styles.cellValue}>No items extracted</div>
          ) : (
            (bill.items || []).map((item, idx) => (
              <div key={idx} className={styles.itemRow}>
                <span className={styles.itemQty}>{item.quantity ?? 1}x</span>
                <span className={styles.itemDesc}>{item.description || 'Item'}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className={styles.jsonSection}>
        <div className={styles.cellLabel}>Invoice JSON (Share)</div>
        <pre className={styles.jsonBlock}>
          {JSON.stringify(rawJson, null, 2)}
        </pre>
      </div>
    </div>
  );
}
