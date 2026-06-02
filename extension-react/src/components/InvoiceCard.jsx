import { useState } from 'react';
import styles from './InvoiceCard.module.css';
import { jsPDF } from 'jspdf';

/**
 * InvoiceCard
 * - Inline edit mode (no popup) when Edit is clicked
 * - Send Invoice to WhatsApp button
 */
export default function InvoiceCard({ invoice, onApprove, onReject, onRestore, onEdit }) {
  const data    = invoice.data || {};
  const bill    = data.bill || {};
  const rawJson = data.rawJson || invoice.rawJson || bill || invoice;

  const [editing, setEditing]   = useState(false);
  const [sendStatus, setSendStatus] = useState(''); // 'sending' | 'sent' | 'error'

  // Local editable state — initialised from invoice
  // senderName field (labeled "Customer Name") = WhatsApp contact = who we're selling to
  // from field (labeled "From / Chat") = logged-in user's signup name = the seller
  const [fields, setFields] = useState({
    brandName:   '',  // always blank
    senderName:  bill.customerName || bill.from || invoice.chatName || '',  // WhatsApp contact
    from:        bill.sellerName   || bill.senderName || '',                // logged-in user
    quantity:    String(bill.quantity   ?? ''),
    itemsTotal:  String(bill.itemsTotal ?? ''),
  });
  const [editItems, setEditItems] = useState(
    (bill.items || []).map(it => ({ ...it, price: it.price ?? '' }))
  );

  const statusClass = invoice.status?.replace(/_/g, '-') || 'pending';
  const canApprove  = invoice.status === 'pending_verification' || invoice.status === 'pending';
  const isRejected  = invoice.status === 'rejected';

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
    setEditItems(prev => [...prev, { quantity: 1, description: '', price: '' }]);
  };

  const handleRemoveItem = (e, idx) => {
    e.stopPropagation();
    setEditItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = (e) => {
    e.stopPropagation();
    const patch = {
      brandName:  fields.brandName,
      senderName: fields.senderName,
      from:       fields.from,
      quantity:   Number(fields.quantity)   || 0,
      itemsTotal: fields.itemsTotal !== '' ? Number(fields.itemsTotal) : null,
      items:      editItems.map(it => ({
        ...it,
        quantity: Number(it.quantity) || 1,
        price: it.price !== '' && it.price != null ? Number(it.price) : null,
      })),
    };
    if (onEdit) onEdit(invoice.id, patch);
    setEditing(false);
  };

  const handleCancelEdit = (e) => {
    e.stopPropagation();
    setFields({
      brandName:   '',
      senderName:  bill.customerName || bill.from || invoice.chatName || '',
      from:        bill.sellerName   || bill.senderName || '',
      quantity:    String(bill.quantity   ?? ''),
      itemsTotal:  String(bill.itemsTotal ?? ''),
    });
    setEditItems((bill.items || []).map(it => ({ ...it, price: it.price ?? '' })));
    setEditing(false);
  };

  // ── Build a professional PDF (shared by Send to WA & Download) ─────────────
  const buildInvoicePdf = () => {
    // Use the live editable state first (fields + editItems) so the PDF always
    // reflects what the user sees in the UI — even before Save is clicked.
    const invoiceNo    = bill.invoiceNo   || invoice.order_id || invoice.id || 'Draft';
    // brandName in PDF header: leave blank (show nothing / Vyaap default only as fallback)
    const brandName    = fields.brandName || '';
    // customerName = WhatsApp contact (BILLED TO in PDF)
    const customerName = fields.senderName || bill.customerName || bill.from || invoice.chatName || 'Customer';
    // sellerName = logged-in user (FROM in PDF)
    const sellerName   = fields.from || bill.sellerName || bill.senderName || '';
    const dateStr      = formatDate(bill.date || invoice.createdAt || invoice.order_date);
    // Use live editItems state; fall back to bill/invoice if empty
    const items        = editItems.length ? editItems
                       : (bill.items?.length ? bill.items : null)
                       || (data.items?.length ? data.items : null)
                       || (invoice.items?.length ? invoice.items : null)
                       || [];
    const totalQty     = (fields.quantity !== '' ? Number(fields.quantity) : null)
                       ?? items.reduce((s, it) => s + (Number(it.quantity) || 1), 0);
    const totalAmt     = (fields.itemsTotal !== '' ? Number(fields.itemsTotal) : null)
                       ?? invoice.total_amount ?? invoice.amount_due ?? null;
    const payStatus    = invoice.payment_status || 'pending';

    const doc  = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // ── Branded Header bar ──────────────────────────────────────────────────
    doc.setFillColor(30, 30, 50);
    doc.rect(0, 0, pageW, 36, 'F');

    doc.setTextColor(108, 99, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(brandName, 14, 15);

    doc.setTextColor(200, 200, 220);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('INVOICE',        pageW - 14, 12, { align: 'right' });
    doc.text(`#${invoiceNo}`,  pageW - 14, 20, { align: 'right' });
    doc.text(`Date: ${dateStr}`, pageW - 14, 28, { align: 'right' });

    // ── Customer Section ────────────────────────────────────────────────────
    let y = 46;
    doc.setTextColor(80, 80, 100);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('BILLED TO', 14, y);

    y += 6;
    doc.setTextColor(20, 20, 40);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(customerName, 14, y);

    y += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 120);
    doc.text(`WhatsApp Chat: ${customerName}`, 14, y);

    // Seller / From line
    if (sellerName) {
      y += 5;
      doc.setTextColor(80, 80, 100);
      doc.setFontSize(8);
      doc.text('FROM', 14, y);
      y += 5;
      doc.setTextColor(20, 20, 40);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(sellerName, 14, y);
      doc.setFont('helvetica', 'normal');
    }

    y += 5;
    doc.text(`Payment Status: ${payStatus.replace(/_/g, ' ').toUpperCase()}`, 14, y);

    // ── Divider ─────────────────────────────────────────────────────────────
    y += 10;
    doc.setDrawColor(200, 200, 220);
    doc.setLineWidth(0.4);
    doc.line(14, y, pageW - 14, y);
    y += 8;

    // ── Items Table Header ──────────────────────────────────────────────────
    doc.setFillColor(245, 245, 250);
    doc.rect(14, y - 5, pageW - 28, 10, 'F');

    doc.setTextColor(60, 60, 80);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('#',           16,          y);
    doc.text('Description', 28,          y);
    doc.text('Qty',         pageW - 50,  y, { align: 'right' });
    doc.text('Price',       pageW - 14,  y, { align: 'right' });
    y += 8;

    // ── Items Rows ──────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 50);

    if (items.length === 0) {
      doc.setTextColor(150, 150, 170);
      doc.text('No items listed', 28, y);
      y += 8;
    } else {
      items.forEach((item, idx) => {
        if (y > 265) { doc.addPage(); y = 20; }
        const desc    = String(item.description || 'Item');
        const qty     = Number(item.quantity) || 1;
        const price   = item.price != null && item.price !== '' ? `Rs.${Number(item.price).toFixed(2)}` : '—';
        const wrapped = doc.splitTextToSize(desc, 110);

        doc.setFontSize(9);
        doc.setTextColor(100, 100, 120);
        doc.text(String(idx + 1),     16,         y);
        doc.setTextColor(30, 30, 50);
        doc.text(wrapped,             28,         y);
        doc.text(String(qty),         pageW - 50, y, { align: 'right' });
        doc.text(price,               pageW - 14, y, { align: 'right' });
        y += 6 * wrapped.length + 2;
      });
    }

    // ── Totals ──────────────────────────────────────────────────────────────
    y += 4;
    doc.setDrawColor(200, 200, 220);
    doc.line(14, y, pageW - 14, y);
    y += 8;

    doc.setFontSize(10);
    doc.setTextColor(80, 80, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Quantity: ${totalQty}`, 14, y);

    const totalLabel = totalAmt != null ? `Rs.${Number(totalAmt).toFixed(2)}` : 'N/A';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(108, 99, 255);
    doc.text(`Total: ${totalLabel}`, pageW - 14, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    // ── Footer ──────────────────────────────────────────────────────────────
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 180);
    doc.text('Generated by Vyaap · Thank you for your order!', pageW / 2, pageH - 10, { align: 'center' });

    return { doc, filename: `invoice-${invoiceNo}.pdf` };
  };

  // ── Attach PDF to WhatsApp chat ────────────────────────────────────────────
  const handleSendToWA = async (e) => {
    e.stopPropagation();
    setSendStatus('sending');
    try {
      const { doc, filename } = buildInvoicePdf();
      const pdfBase64 = doc.output('datauristring').split(',')[1];

      const res = await chrome.runtime.sendMessage({
        action:   'sendWhatsAppPDF',
        pdfBase64,
        filename,
        chatName: invoice.chatName,
      });

      if (!res?.success) {
        console.error('[Vyaap] sendWhatsAppPDF failed:', res?.error);
      }
      // 'sent' here means PDF was staged in WhatsApp — user clicks green send
      setSendStatus(res?.success ? 'sent' : 'error');
    } catch (err) {
      console.error('[Vyaap] sendToWA error:', err);
      setSendStatus('error');
    }
    setTimeout(() => setSendStatus(''), 6000);
  };

  // ── Download PDF ────────────────────────────────────────────────────────────
  const handlePdf = (e) => {
    e.stopPropagation();
    const { doc, filename } = buildInvoicePdf();
    doc.save(filename);
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
            <label className={styles.editLabel}>Brand Name <span style={{color:'var(--text-muted)',fontWeight:400}}>(appears as header in PDF)</span></label>
            <input
              className={styles.editInput}
              value={fields.brandName}
              onChange={e => handleFieldChange('brandName', e.target.value)}
              placeholder="Your shop / business name"
            />
            <label className={styles.editLabel}>Customer Name</label>
            <input
              className={styles.editInput}
              value={fields.senderName}
              onChange={e => handleFieldChange('senderName', e.target.value)}
              placeholder="Customer name"
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
              <input
                className={`${styles.editInput} ${styles.editPriceInput}`}
                type="number"
                value={item.price ?? ''}
                onChange={e => handleItemChange(idx, 'price', e.target.value)}
                placeholder="Price (₹)"
                title="Price"
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
              <div className={styles.cellLabel}>Seller (From)</div>
              <div className={styles.cellValue}>
                {bill.sellerName || bill.senderName || '—'}
              </div>
            </div>
            <div className={styles.cell}>
              <div className={styles.cellLabel}>Customer (To)</div>
              <div className={styles.cellValue}>{bill.customerName || bill.from || invoice.chatName || 'Unknown'}</div>
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
                    <span className={styles.itemPrice}>
                      {item.price != null && item.price !== '' ? `₹${Number(item.price).toFixed(2)}` : '—'}
                    </span>
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
              onClick={e => {
                e.stopPropagation();
                setFields({
                  brandName:   '',
                  senderName:  bill.customerName || bill.from || invoice.chatName || '',
                  from:        bill.sellerName   || bill.senderName || '',
                  quantity:    String(bill.quantity   ?? ''),
                  itemsTotal:  String(bill.itemsTotal ?? ''),
                });
                setEditItems((bill.items || []).map(it => ({ ...it, price: it.price ?? '' })));
                setEditing(true);
              }}
            >
              ✏️ Edit
            </button>
            {canApprove && (
              <button
                className="btn btn-primary btn-sm"
                onClick={e => { e.stopPropagation(); onApprove && onApprove(invoice.id); }}
              >
                ✅ Approve
              </button>
            )}
            {canApprove && (
              <button
                className={`btn btn-sm ${styles.rejectBtn}`}
                onClick={e => { e.stopPropagation(); onReject && onReject(invoice.id); }}
              >
                🗑️ Reject
              </button>
            )}
            {isRejected && (
              <button
                className={`btn btn-sm ${styles.restoreBtn}`}
                onClick={e => { e.stopPropagation(); onRestore && onRestore(invoice.id); }}
              >
                🔄 Restore to Pending
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
          {sendStatus === 'sending' ? '📎 Attaching…'
            : sendStatus === 'sent'  ? '✅ PDF Ready — click ▶ in WhatsApp'
            : sendStatus === 'error' ? '❌ Failed — try again'
            : '📲 Send as PDF'}
        </button>
      </div>
    </div>
  );
}
