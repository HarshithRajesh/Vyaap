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

      return { success: true, message: data.message, token, name: data.name || '' };
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

    // ── Attach PDF to WhatsApp chat (user clicks green send manually) ────────
    case 'sendWhatsAppPDF': {
      const tab = await getWhatsAppTab();
      const { pdfBase64, filename } = request;

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world:  'MAIN',
        func: (b64, fname) => {
          return new Promise(async (resolve) => {
            try {
              const wait = ms => new Promise(r => setTimeout(r, ms));
              const log  = (...a) => console.log('[Vyaap]', ...a);

              // ── Build the PDF File ────────────────────────────────────
              const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
              const blob  = new Blob([bytes], { type: 'application/pdf' });
              const file  = new File([blob], fname, { type: 'application/pdf' });
              log('PDF built:', fname, file.size, 'bytes');

              // ── Pre-flight: check WhatsApp conversation is open ───────
              // Use #main — it's always present when a chat is open.
              // We do NOT gate on the compose box here because its selectors
              // change with every WhatsApp release.
              const chatPanel =
                document.querySelector('[data-testid="conversation-panel-body"]') ||
                document.querySelector('[data-testid="conversation-panel-messages"]') ||
                document.querySelector('#main') ||
                document.querySelector('main');
              if (!chatPanel) {
                resolve({ success: false, error: 'No WhatsApp chat is open. Please open a conversation first.' });
                return;
              }
              log('Pre-flight: chat panel found ✓', chatPanel.id || chatPanel.tagName);

              // ── Helper: inject a File into a file input ───────────────
              const setFiles = (input) => {
                const dt = new DataTransfer();
                dt.items.add(file);
                Object.defineProperty(input, 'files', {
                  configurable: true,
                  get() { return dt.files; },
                });
                input.dispatchEvent(new Event('input',  { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                log('Injected file, accept=', input.accept || '(all)');
              };

              // ── Helper: enumerate file inputs in DOM ──────────────────
              const logInputs = () => {
                const all = Array.from(document.querySelectorAll('input[type="file"]'));
                log(`File inputs in DOM: ${all.length}`);
                all.forEach((inp, i) => log(`  [${i}] accept="${inp.accept}"`));
                return all;
              };

              // ── Helper: pick a document-accepting input ───────────────
              // Rejects image/video-only inputs to avoid "file not supported"
              const pickDocInput = (inputs) => inputs.find(inp => {
                const a = (inp.accept || '').toLowerCase();
                if (a === '' || a === '*') return true;
                if (a.includes('application/pdf')) return true;
                if (a.includes('application/')) return true;
                const onlyImageVideo = a.split(',').every(t =>
                  t.trim().startsWith('image/') || t.trim().startsWith('video/'));
                return !onlyImageVideo;
              });

              // ── Diagnostic: can we detect attachment preview? ─────────
              const isAttached = () => !!(
                document.querySelector('[data-testid="media-confirmation-screen"]') ||
                document.querySelector('[data-testid="media-upload-preview"]') ||
                document.querySelector('[data-testid="document-preview-thumbnail"]') ||
                document.querySelector('[data-icon="document-pdf"]')
              );

              // ══════════════════════════════════════════════════════════
              // Strategy A — Paste file into WhatsApp message compose box
              // ══════════════════════════════════════════════════════════
              const tryPaste = async () => {
                // Try many selectors — WhatsApp changes these every release
                const box =
                  document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                  document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
                  document.querySelector('div[contenteditable="true"][data-tab="6"]') ||
                  document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                  document.querySelector('footer div[contenteditable="true"]') ||
                  chatPanel.querySelector('div[contenteditable="true"]');
                if (!box) { log('Paste: no compose box found'); return false; }

                box.focus();
                await wait(150);

                const dt = new DataTransfer();
                dt.items.add(file);
                box.dispatchEvent(new ClipboardEvent('paste', {
                  bubbles: true, cancelable: true, clipboardData: dt,
                }));
                await wait(1500);

                const ok = isAttached();
                log('Paste: done, preview visible?', ok);
                return true; // optimistic — let next strategies run if this failed
              };

              // ══════════════════════════════════════════════════════════
              // Strategy B — Inject directly into a hidden document input
              // WhatsApp always has hidden file inputs in the DOM.
              // ══════════════════════════════════════════════════════════
              const tryDirectInput = async () => {
                const inputs = logInputs();
                const docInput = pickDocInput(inputs);
                if (!docInput) { log('DirectInput: no document input found'); return false; }

                log('DirectInput: injecting, accept=', docInput.accept);
                setFiles(docInput);
                await wait(2000);

                const ok = isAttached();
                log('DirectInput: done, preview visible?', ok);
                return ok; // only counts as success if WhatsApp shows preview
              };

              // ══════════════════════════════════════════════════════════
              // Strategy C — Open attach menu → Document input injection
              // ══════════════════════════════════════════════════════════
              const tryAttachMenu = async () => {
                const attachBtn =
                  document.querySelector('[data-testid="attach-menu-icon"]') ||
                  document.querySelector('[data-testid="attach-btn"]') ||
                  document.querySelector('[data-icon="attach"]')?.closest('button,[role="button"]') ||
                  document.querySelector('[data-icon="clip"]')?.closest('button,[role="button"]') ||
                  document.querySelector('[data-icon="attach-menu-plus"]')?.closest('button,[role="button"]') ||
                  document.querySelector('[data-icon="plus"]')?.closest('button,[role="button"]') ||
                  chatPanel.querySelector('[role="button"]');
                if (!attachBtn) { log('AttachMenu: no attach button'); return false; }

                log('AttachMenu: clicking attach button');
                attachBtn.click();
                await wait(1200);

                const docItem =
                  document.querySelector('[data-testid="mi-attach-document"]') ||
                  document.querySelector('[data-testid="attach-document"]') ||
                  document.querySelector('[for*="doc"]') ||
                  document.querySelector('label[aria-label*="ocument"]') ||
                  document.querySelector('[aria-label*="Document"]');

                const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
                log('AttachMenu: inputs after menu open:', inputs.length);

                let docInput =
                  docItem?.querySelector('input[type="file"]') ||
                  docItem?.closest('label')?.querySelector('input[type="file"]') ||
                  docItem?.parentElement?.querySelector('input[type="file"]') ||
                  pickDocInput(inputs);

                if (!docInput) { log('AttachMenu: no document input found'); return false; }

                log('AttachMenu: injecting, accept=', docInput.accept);
                setFiles(docInput);
                await wait(2000);

                const ok = isAttached();
                log('AttachMenu: done, preview visible?', ok);
                return true; // optimistic — injection ran
              };

              // ══════════════════════════════════════════════════════════
              // Strategy D — Drag-and-drop onto the chat panel (optimistic)
              // ══════════════════════════════════════════════════════════
              const tryDrop = async () => {
                const dt = new DataTransfer();
                dt.items.add(file);
                const ev = type => new DragEvent(type, {
                  bubbles: true, cancelable: true, view: window, dataTransfer: dt,
                });

                log('Drop: firing events on', chatPanel.tagName, chatPanel.id);
                chatPanel.dispatchEvent(ev('dragenter'));
                await wait(150);
                chatPanel.dispatchEvent(ev('dragover'));
                await wait(150);
                chatPanel.dispatchEvent(ev('drop'));
                await wait(1500);

                const ok = isAttached();
                log('Drop: done, preview visible?', ok);
                return true; // optimistic — always runs as final fallback
              };

              // ── Run strategies ────────────────────────────────────────
              log('=== PDF attach sequence START ===');
              if (await tryPaste())       { resolve({ success: true, method: 'paste'       }); return; }
              if (await tryDirectInput()) { resolve({ success: true, method: 'directinput' }); return; }
              if (await tryAttachMenu())  { resolve({ success: true, method: 'attachmenu'  }); return; }
              if (await tryDrop())        { resolve({ success: true, method: 'dragdrop'    }); return; }

              resolve({ success: false, error: 'All 4 attach strategies failed — open WhatsApp console for details' });


            } catch (err) {
              console.error('[Vyaap] Error:', err);
              resolve({ success: false, error: err.message });
            }
          });
        },
        args: [pdfBase64, filename],
      });

      const res = results?.[0]?.result;
      console.log('[Vyaap BG] sendWhatsAppPDF result:', res);
      return res || { success: false, error: 'script returned no result' };
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
  return Promise.all(invoices.map(inv => normalizeInvoice(inv)));
}

async function normalizeInvoice(inv = {}) {
  // Read the logged-in user's name from storage
  const userStr = await new Promise(resolve =>
    chrome.storage.local.get(['vyaap_user'], r => resolve(r.vyaap_user || null))
  );
  const loggedInName = userStr ? (JSON.parse(userStr).name || '') : '';

  const chatName = inv.chatName || 'Unknown Chat';
  const items = Array.isArray(inv.items) ? inv.items : [];
  const createdAt = inv.processedAt || inv.order_date || new Date().toISOString();

  // sellerName  = the logged-in Vyaap user (the one sending the invoice)
  // customerName = the WhatsApp contact (the person being invoiced)
  const sellerName   = loggedInName || '';
  const customerName = chatName;

  const totalQuantity = items.reduce((sum, item) => {
    const q = Number(item?.quantity ?? 0);
    return sum + (Number.isFinite(q) ? q : 0);
  }, 0);
  const itemsTotal = inv.total_amount ?? inv.amount_due ?? null;

  const billJson = {
    invoiceNo:    inv.order_id || 'Draft',
    date:         createdAt,
    sellerName,       // logged-in user (FROM field in UI/PDF)
    customerName,     // WhatsApp contact (CUSTOMER NAME / BILLED TO in PDF)
    brandName:    '',  // blank — user does not want this filled
    // keep legacy aliases so old code doesn't break
    senderName:   sellerName,
    from:         customerName,
    quantity:     totalQuantity,
    items,
    itemsTotal,
  };

  return {
    id: inv.order_id || `${chatName}-${createdAt}`,
    status: inv.status || 'pending_verification',
    createdAt,
    chatName,
    data: {
      orderDetails: { orderNumber: inv.order_id || 'Draft' },
      customer: { name: customerName },
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
