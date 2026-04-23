// ─── Vyaap Background Service Worker ─────────────────────────────────────────
// Bridges: React Side Panel ↔ content.js (WhatsApp DOM) ↔ Go Backend
//
// New actions added for React auth:
//   vyaapLogin  → POST /login, capture Set-Cookie token → chrome.storage.local
//   vyaapLogout → GET /logout with Bearer token, clear storage

const BACKEND = 'http://localhost:8080';

// ─── Main message listener ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Vyaap BG] Incoming Action:', request.action);

  handleAction(request)
    .then(sendResponse)
    .catch(e => {
      console.error('[Vyaap BG] Error in Bridge:', e.message);
      sendResponse({ success: false, error: e.message });
    });

  return true; // Required for async sendResponse
});

// ─── Action router ────────────────────────────────────────────────────────────
async function handleAction(request) {
  switch (request.action) {

    // ── Original: extract WhatsApp chat and ingest ──────────────────────────
    case 'extractAndCreateInvoice': {
      const tab = await getWhatsAppTab();

      const chatRes = await sendToContent(tab.id, { action: 'extractCurrentChat' });
      const msgRes  = await sendToContent(tab.id, {
        action: 'extractAllMessages',
        maxScrolls: 5,
        scrollDelay: 500,
      });

      const extractedMessages = msgRes.data || [];
      console.log(`[Vyaap BG] DOM Extracted ${extractedMessages.length} messages.`);

      const payload = {
        chatName: chatRes.data?.name || 'Unknown Chat',
        messages: extractedMessages.length > 0 ? extractedMessages : [],
      };

      console.log('🚀 Pushing Payload to Go:', payload);

      // Get stored token for auth (if backend requires it in future)
      const token = await getStoredToken();
      const existingInvoices = await getInvoicesFromBackend(token);
      const existingIds = new Set(existingInvoices.map(inv => inv.id));
      const backendResponse = await postToBackend('/ingest', payload, token);
      const latestInvoice = await waitForNewInvoice(existingIds, token);

      if (latestInvoice) {
        chrome.runtime.sendMessage({
          target: 'dashboard',
          type: 'invoice_ready',
          invoice: latestInvoice,
        }).catch(() => {});
      }

      return {
        success: true,
        goResponse: backendResponse.message,
        count: extractedMessages.length,
        messageCount: extractedMessages.length,
        invoiceReady: !!latestInvoice,
      };
    }

    // ── New: Login via background (captures token from response) ───────────
    case 'vyaapLogin': {
      const { email, password } = request;
      const response = await fetch(`${BACKEND}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Email: email, Password: password }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Login failed (${response.status})`);
      }

      const data = await response.json();

      // Try to extract token from Set-Cookie header (not available in SW fetch)
      // Instead, read via chrome.cookies API which has access to all cookies
      let token = null;
      try {
        const cookie = await chrome.cookies.get({
          url: BACKEND,
          name: 'access_token',
        });
        if (cookie) {
          token = cookie.value;
          // Store in chrome.storage.local for the React side panel to read
          await chrome.storage.local.set({ vyaap_access_token: token });
          console.log('[Vyaap BG] Token captured and stored.');
        }
      } catch (cookieErr) {
        console.warn('[Vyaap BG] Could not read cookie:', cookieErr.message);
      }

      return { success: true, message: data.message, token };
    }

    // ── New: Logout via background (protected endpoint) ─────────────────────
    case 'vyaapLogout': {
      const token = await getStoredToken();
      try {
        await fetch(`${BACKEND}/logout`, {
          method: 'GET',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
        });
      } catch (e) {
        console.warn('[Vyaap BG] Logout request failed:', e.message);
      }
      await chrome.storage.local.remove(['vyaap_access_token', 'vyaap_user']);
      return { success: true };
    }

    // ── Original: get invoices from storage ─────────────────────────────────
    case 'getPendingInvoices': {
      const token = await getStoredToken();
      const backendInvoices = await getInvoicesFromBackend(token);
      return {
        success: true,
        invoices: backendInvoices,
      };
    }

    default:
      return { success: false, error: `Action "${request.action}" not handled.` };
  }
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
async function getStoredToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['vyaap_access_token'], result => {
      resolve(result.vyaap_access_token || null);
    });
  });
}

async function postToBackend(endpoint, body, token = null) {
  const url = BACKEND + endpoint;
  console.log(`[Vyaap BG] POST → ${url}`);

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Go Server Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function getInvoicesFromBackend(token = null) {
  const url = `${BACKEND}/invoices`;
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Invoice fetch failed ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const invoices = Array.isArray(data?.invoices) ? data.invoices : [];
  return invoices.map(normalizeInvoice);
}

function normalizeInvoice(inv = {}) {
  const chatName = inv.chatName || 'Unknown Chat';
  const items = Array.isArray(inv.items) ? inv.items : [];
  const createdAt = inv.processedAt || inv.order_date || new Date().toISOString();
  const senderName = inv.customer_name || inv.contact_info || inv.userId || 'Unknown';
  const totalQuantity = items.reduce((sum, item) => {
    const q = Number(item?.quantity ?? 0);
    return sum + (Number.isFinite(q) ? q : 0);
  }, 0);
  const itemsTotal = inv.total_amount ?? inv.amount_due ?? null;
  const billJson = {
    invoiceNo: inv.order_id || 'Draft',
    date: createdAt,
    senderName,
    from: chatName,
    quantity: totalQuantity,
    items,
    itemsTotal,
  };

  return {
    id: inv.order_id || `${chatName}-${createdAt}`,
    status: inv.status || 'pending_verification',
    createdAt,
    chatName,
    data: {
      orderDetails: {
        orderNumber: inv.order_id || 'Draft',
      },
      customer: {
        name: senderName,
      },
      items,
      bill: billJson,
      rawMessages: [],
      rawJson: billJson,
    },
    rawJson: billJson,
    ...inv,
  };
}

async function waitForNewInvoice(existingIds, token, timeoutMs = 30000, intervalMs = 1500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const invoices = await getInvoicesFromBackend(token);
    const created = invoices.find(inv => !existingIds.has(inv.id));
    if (created) return created;
    await sleep(intervalMs);
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Tab & injection helpers ──────────────────────────────────────────────────
async function getWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (!tabs || tabs.length === 0) {
    throw new Error('Please open WhatsApp Web first.');
  }

  const tab = tabs[0];

  const isReady = await new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, { action: 'checkReady' }, res => {
      resolve(!chrome.runtime.lastError && res?.ready === true);
    });
  });

  if (!isReady) {
    console.log('[Vyaap BG] Content script missing. Injecting…');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await new Promise(r => setTimeout(r, 600));
  }

  return tab;
}

function sendToContent(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}
