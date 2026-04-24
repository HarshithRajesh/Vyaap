import { useState } from 'react';
import styles from './InvoiceCard.module.css';
import { jsPDF } from 'jspdf';

/**
 * InvoiceCard
 * - Inline edit mode (no popup) when Edit is clicked
 * - Send Invoice to WhatsApp button
 */
export default function InvoiceCard({ invoice, onApprove, onEdit }) {
  const data    = invoice.data || {};
  const bill    = data.bill || {};
  const rawJson = data.rawJson || invoice.rawJson || bill || invoice;

  const [editing, setEditing]   = useState(false);
  const [sendStatus, setSendStatus] = useState(''); // 'sending' | 'sent' | 'error'

  // Local editable state — initialised from invoice
  const [fields, setFields] = useState({
    senderName:  bill.senderName || data.customer?.name || '',
    from:        bill.from       || invoice.chatName    || '',
    quantity:    String(bill.quantity   ?? ''),
    itemsTotal:  String(bill.itemsTotal ?? ''),
  });
  const [editItems, setEditItems] = useState(
    (bill.items || []).map(it => ({ ...it }))
  );

  const statusClass = invoice.status?.replace(/_/g, '-') || 'pending';
  const canApprove  = invoice.status === 'pending_verification' || invoice.status === 'pending';

  const formatStatus = (s = '') =>
    s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const formatDate = (d) => {
    try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
  };

  // ── Edit handlers ─────────────────────────────────────────────────────────
  const handleFieldChange = (key, value) =>
    setFields(prev => ({ ...prev, [key]: value }));

  const handleItemChange = (idx, key, value) =>
    setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: value } : it));

  const handleAddItem = (e) => {
    e.stopPropagation();
    setEditItems(prev => [...prev, { quantity: 1, description: '' }]);
  };

  const handleRemoveItem = (e, idx) => {
    e.stopPropagation();
    setEditItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = (e) => {
    e.stopPropagation();
    const patch = {
      senderName: fields.senderName,
      from:       fields.from,
      quantity:   Number(fields.quantity)   || 0,
      itemsTotal: fields.itemsTotal !== '' ? Number(fields.itemsTotal) : null,
      items:      editItems.map(it => ({
        ...it,
        quantity: Number(it.quantity) || 1,
      })),
    };
    if (onEdit) onEdit(invoice.id, patch);
    setEditing(false);
  };

  const handleCancelEdit = (e) => {
    e.stopPropagation();
    // Reset to current invoice data
    setFields({
      senderName: bill.senderName || data.customer?.name || '',
      from:       bill.from       || invoice.chatName    || '',
      quantity:   String(bill.quantity   ?? ''),
      itemsTotal: String(bill.itemsTotal ?? ''),
    });
    setEditItems((bill.items || []).map(it => ({ ...it })));
    setEditing(false);
  };

  // ── Send PDF directly to WhatsApp chat ─────────────────────────────
  const handleSendToWA = async (e) => {
    e.stopPropagation();
    setSendStatus('sending');

    try {
      // 1. Build PDF
      const doc = new jsPDF();
      let y = 16;
      doc.setFontSize(16);
      doc.text('Invoice / Bill', 14, y); y += 10;
      doc.setFontSize(11);
      doc.text(`Invoice No: ${bill.invoiceNo || invoice.id || 'Draft'}`, 14, y); y += 7;
      doc.text(`Date: ${formatDate(invoice.createdAt)}`, 14, y); y += 7;
      doc.text(`Customer: ${bill.senderName || 'Unknown'}`, 14, y); y += 7;
      doc.text(`From: ${bill.from || invoice.chatName || 'Unknown Chat'}`, 14, y); y += 10;
      doc.text('Items:', 14, y); y += 7;
      (bill.items || []).forEach((item, idx) => {
        const line = `${idx + 1}. ${item.quantity ?? 1} x ${item.description || 'Item'}${
          item.price != null ? `  - Rs.${item.price}` : ''
        }`;
        const wrapped = doc.splitTextToSize(line, 180);
        doc.text(wrapped, 16, y);
        y += 6 * wrapped.length;
        if (y > 270) { doc.addPage(); y = 16; }
      });
      y += 4;
      doc.text(`Total Quantity: ${bill.quantity ?? 0}`, 14, y); y += 7;
      doc.text(`Items Total: ${bill.itemsTotal != null ? 'Rs.' + bill.itemsTotal : 'N/A'}`, 14, y); y += 7;
      doc.text('Thank you for your order!', 14, y);

      const filename = `invoice-${bill.invoiceNo || invoice.id || Date.now()}.pdf`;
      // Get base64 (without the data URI prefix)
      const pdfBase64 = doc.output('datauristring').split(',')[1];

      // 2. Send directly to WhatsApp via background
      const res = await chrome.runtime.sendMessage({
        action:   'sendWhatsAppPDF',
        pdfBase64,
        filename,
        chatName: invoice.chatName,
      });

      setSendStatus(res?.success ? 'sent' : 'error');
    } catch (err) {
      console.error('[Vyaap] sendToWA error:', err);
      setSendStatus('error');
    }
    setTimeout(() => setSendStatus(''), 4000);
  };

  // ── PDF handler (unchanged) ───────────────────────────────────────────────
  const handlePdf = (e) => {
    e.stopPropagation();
    const doc = new jsPDF();
    let y = 16;
    doc.setFontSize(16);
    doc.text('Invoice / Bill', 14, y); y += 10;
    doc.setFontSize(11);
    doc.text(`Invoice No: ${bill.invoiceNo || invoice.id || 'Draft'}`, 14, y); y += 7;
    doc.text(`Date: ${formatDate(bill.date || invoice.createdAt)}`, 14, y); y += 7;
    doc.text(`Sender Name: ${bill.senderName || 'Unknown'}`, 14, y); y += 7;
    doc.text(`From: ${bill.from || 'Unknown Chat'}`, 14, y); y += 10;
    doc.text('Items:', 14, y); y += 7;
    (bill.items || []).forEach((item, idx) => {
      const line = `${idx + 1}. ${item.quantity ?? 1} x ${item.description || 'Item'}`;
      doc.text(line, 16, y); y += 6;
      if (y > 270) { doc.addPage(); y = 16; }
    });
    y += 4;
    doc.text(`Total Quantity: ${bill.quantity ?? 0}`, 14, y); y += 7;
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className={`${styles.card} ${cardBorders[statusClass] || ''} fade-in`}
      data-invoice-id={invoice.id}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.title}>
          {data.orderDetails?.orderNumber || invoice.chatName || 'Draft'}
        </div>
        <span className={`${styles.badge} ${statusColors[statusClass] || ''}`}>
          {formatStatus(invoice.status)}
        </span>
      </div>

      {/* ── EDIT MODE ─────────────────────────────────────────────── */}
      {editing ? (
        <div className={styles.editSection} onClick={e => e.stopPropagation()}>
          <div className={styles.editGrid}>
            <label className={styles.editLabel}>Sender Name</label>
            <input
              className={styles.editInput}
              value={fields.senderName}
              onChange={e => handleFieldChange('senderName', e.target.value)}
              placeholder="Sender name"
            />
            <label className={styles.editLabel}>From / Chat</label>
            <input
              className={styles.editInput}
              value={fields.from}
              onChange={e => handleFieldChange('from', e.target.value)}
              placeholder="Chat name"
            />
            <label className={styles.editLabel}>Quantity</label>
            <input
              className={styles.editInput}
              type="number"
              value={fields.quantity}
              onChange={e => handleFieldChange('quantity', e.target.value)}
              placeholder="0"
            />
            <label className={styles.editLabel}>Items Total (₹)</label>
            <input
              className={styles.editInput}
              type="number"
              value={fields.itemsTotal}
              onChange={e => handleFieldChange('itemsTotal', e.target.value)}
              placeholder="e.g. 500"
            />
          </div>

          {/* Items list editable */}
          <div className={styles.editItemsHeader}>
            <span className={styles.cellLabel}>Line Items</span>
            <button className={`btn btn-ghost btn-sm ${styles.addItemBtn}`} onClick={handleAddItem}>
              + Add Item
            </button>
          </div>
          {editItems.map((item, idx) => (
            <div key={idx} className={styles.editItemRow}>
              <input
                className={`${styles.editInput} ${styles.editQtyInput}`}
                type="number"
                value={item.quantity}
                onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                placeholder="Qty"
                title="Quantity"
              />
              <input
                className={`${styles.editInput} ${styles.editDescInput}`}
                value={item.description}
                onChange={e => handleItemChange(idx, 'description', e.target.value)}
                placeholder="Description"
              />
              <button
                className={styles.removeItemBtn}
                onClick={e => handleRemoveItem(e, idx)}
                title="Remove item"
              >✕</button>
            </div>
          ))}

          {/* Save / Cancel */}
          <div className={styles.editActions}>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>💾 Save</button>
            <button className="btn btn-ghost btn-sm" onClick={handleCancelEdit}>✕ Cancel</button>
          </div>
        </div>
      ) : (
        /* ── VIEW MODE ──────────────────────────────────────────────── */
        <>
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
              <div className={styles.cellValue}>{bill.quantity ?? 0}</div>
            </div>
            <div className={styles.cell}>
              <div className={styles.cellLabel}>Items Total</div>
              <div className={styles.cellValue}>{bill.itemsTotal != null ? `₹${bill.itemsTotal}` : 'N/A'}</div>
            </div>
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
            <pre className={styles.jsonBlock}>{JSON.stringify(rawJson, null, 2)}</pre>
          </div>
        </>
      )}

      {/* ── Action buttons (always visible) ─────────────────────────── */}
      <div className={styles.actions} onClick={e => e.stopPropagation()}>
        {editing ? null : (
          <>
            <button
              className="btn btn-ghost btn-sm"
              onClick={e => { e.stopPropagation(); setEditing(true); }}
            >
              ✏️ Edit
            </button>
            {canApprove && (
              <button
                className="btn btn-primary btn-sm"
                onClick={e => { e.stopPropagation(); onApprove && onApprove(invoice.id); }}
              >
                Approve
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={handlePdf}>
              Generate PDF
            </button>
          </>
        )}
        {/* Send to WA — always shown */}
        <button
          className={`btn btn-sm ${styles.sendWaBtn}`}
          onClick={handleSendToWA}
          disabled={sendStatus === 'sending'}
          title="Send invoice PDF to this WhatsApp chat"
        >
          {sendStatus === 'sending' ? '⏳ Sending…'
            : sendStatus === 'sent'  ? '✅ PDF Sent!'
            : sendStatus === 'error' ? '❌ Failed'
            : '📲 Send as PDF'}
        </button>
      </div>
    </div>
  );
}
