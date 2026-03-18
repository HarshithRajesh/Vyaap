class DashboardController {
  constructor() {
    this.invoices = { pending: [], approved: [], generated: [], rejected: [] };
    this.currentView = 'list';
    this.selectedInvoice = null;
    this.init();
  }
 
  async init() {
    this.setupEventListeners();
    await this.loadInvoices();
    this.renderInvoices();
 
    chrome.runtime.onMessage.addListener((message) => {
      if (message.target === 'dashboard') {
        this.handleBackgroundMessage(message);
      }
    });
  }
 
  setupEventListeners() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchTab(e.target.closest('.tab').dataset.tab);
      });
    });
 
    const extractBtn = document.getElementById('extract-btn');
    if (extractBtn) {
      extractBtn.addEventListener('click', () => this.extractCurrentChat());
    }
  }
 
  async extractCurrentChat() {
    const btn = document.getElementById('extract-btn');
    const statusEl = document.getElementById('extract-status');
 
    btn.disabled = true;
    btn.textContent = '⏳ Extracting...';
    if (statusEl) statusEl.textContent = 'Scrolling through chat to load all messages...';
 
    try {
      const response = await chrome.runtime.sendMessage({ action: 'extractAndCreateInvoice' });
 
      if (!response || !response.success) {
        throw new Error(response?.error || 'Extraction failed');
      }
 
      if (statusEl) {
        statusEl.textContent = `✓ Extracted ${response.messageCount} messages. Invoice created!`;
        statusEl.style.color = '#25d366';
      }
 
      await this.loadInvoices();
      this.renderInvoices();
      this.switchTab('pending');
 
    } catch (error) {
      console.error('Extraction error:', error);
      if (statusEl) {
        statusEl.textContent = '✗ ' + error.message;
        statusEl.style.color = '#e53e3e';
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '📥 Extract Current Chat';
    }
  }
 
  async loadInvoices() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getPendingInvoices' });
      if (response && response.success) {
        this.categorizeInvoices(response.invoices);
      }
    } catch (error) {
      console.error('Failed to load invoices:', error);
    }
  }
 
  categorizeInvoices(invoices) {
    this.invoices = { pending: [], approved: [], generated: [], rejected: [] };
    invoices.forEach(invoice => {
      if (invoice.status === 'pending_verification') this.invoices.pending.push(invoice);
      else if (invoice.status === 'approved') this.invoices.approved.push(invoice);
      else if (invoice.status === 'generated') this.invoices.generated.push(invoice);
      else if (invoice.status === 'rejected') this.invoices.rejected.push(invoice);
    });
  }
 
  renderInvoices() {
    this.renderInvoiceList('pending', this.invoices.pending);
    this.renderInvoiceList('approved', this.invoices.approved);
    this.renderInvoiceList('generated', this.invoices.generated);
    this.renderInvoiceList('rejected', this.invoices.rejected || []);
  }
 
  renderInvoiceList(status, invoices) {
    const listElement = document.getElementById(`${status}-list`);
    if (!listElement) return;
 
    if (invoices.length === 0) {
      listElement.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">No ${status} invoices</div>
          <div class="empty-state-subtext">
            ${status === 'pending' ? 'Open a WhatsApp chat then click "Extract Current Chat"' : ''}
          </div>
        </div>`;
      return;
    }
 
    listElement.innerHTML = invoices.map(inv => this.renderInvoiceCard(inv)).join('');
    listElement.querySelectorAll('.invoice-card').forEach(card => {
      card.addEventListener('click', () => this.showInvoiceDetail(card.dataset.invoiceId));
    });
  }

  renderInvoiceCard(invoice) {
    const data = invoice.data || {};
    const statusClass = invoice.status.replace(/_/g, '-');
    const msgCount = data.rawMessages?.length || invoice.rawMessages?.length || 0;

    return `
      <div class="invoice-card ${statusClass}" data-invoice-id="${invoice.id}">
        <div class="invoice-header">
          <div class="invoice-number">${data.orderDetails?.orderNumber || invoice.chatName || 'Draft'}</div>
          <span class="status-badge ${statusClass}">${this.formatStatus(invoice.status)}</span>
        </div>
        <div class="invoice-info">
          <div class="info-item">
            <div class="info-label">Customer</div>
            <div class="info-value">${data.customer?.name || invoice.customer?.name || 'Unknown'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Date</div>
            <div class="info-value">${this.formatDate(invoice.createdAt)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Items</div>
            <div class="info-value">${data.items?.length || invoice.items?.length || 0} items</div>
          </div>
          <div class="info-item">
            <div class="info-label">Messages</div>
            <div class="info-value">${msgCount}</div>
          </div>
        </div>
      </div>`;
  }

  formatStatus(status) {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  formatDate(dateString) {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return '';
    }
  }
}

window.dashboardController = new DashboardController();