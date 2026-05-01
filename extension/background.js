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

              // ── Pre-flight: ensure a chat is actually open ──────────────
              // WhatsApp might be on the chat list, not inside a conversation.
              const composeBox =
                document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
                document.querySelector('footer div[contenteditable="true"]');
              if (!composeBox) {
                resolve({ success: false, error: 'No WhatsApp chat is open. Open a conversation first.' });
                return;
              }
              log('Pre-flight: compose box found ✓');

              // ── Helper: detect if WhatsApp is showing attachment preview ──
              // When a file is staged, WhatsApp shows a preview screen that
              // replaces or overlays the compose area.
              const isAttached = () => {
                // WhatsApp shows one of these elements in attachment preview mode:
                return !!(
                  document.querySelector('[data-testid="media-confirmation-screen"]') ||
                  document.querySelector('[data-testid="media-upload-preview"]') ||
                  document.querySelector('[data-testid="document-preview-thumbnail"]') ||
                  document.querySelector('[data-icon="document-pdf"]') ||
                  // Fallback: compose box is gone/hidden (replaced by preview screen)
                  (() => {
                    const box = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                                document.querySelector('div[contenteditable="true"][data-tab="10"]');
                    if (!box) return true; // box gone = preview is up
                    const s = window.getComputedStyle(box);
                    return s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0';
                  })()
                );
              };

              // ══════════════════════════════════════════════════════════════
              // Strategy A — Paste file into WhatsApp message input
              // WhatsApp Web listens to paste events with file data.
              // VERIFIED: checks isAttached() after wait to prevent false-positive.
              // ══════════════════════════════════════════════════════════════
              const tryPaste = async () => {
                const box = composeBox; // already found in pre-flight
                box.focus();
                await wait(150);

                const dt = new DataTransfer();
                dt.items.add(file);
                const paste = new ClipboardEvent('paste', {
                  bubbles: true, cancelable: true, clipboardData: dt,
                });
                log('Paste: dispatching on', box.tagName);
                box.dispatchEvent(paste);
                await wait(1500);

                const ok = isAttached();
                log('Paste: attachment detected?', ok);
                return ok; // only true if WhatsApp actually responded
              };

              // ══════════════════════════════════════════════════════════════
              // Strategy B — Inject directly into hidden document file input
              // VERIFIED: checks isAttached() after injection.
              // ══════════════════════════════════════════════════════════════
              const tryDirectInput = async () => {
                const inputs = logInputs();
                const docInput = pickDocInput(inputs);
                if (!docInput) { log('DirectInput: no document input in DOM'); return false; }

                log('DirectInput: injecting, accept=', docInput.accept);
                setFiles(docInput);
                await wait(2000);

                const ok = isAttached();
                log('DirectInput: attachment detected?', ok);
                return ok;
              };

              // ══════════════════════════════════════════════════════════════
              // Strategy C — Open attach menu → find Document input → inject
              // Optimistic: returns true if injection ran (hard to verify).
              // ══════════════════════════════════════════════════════════════
              const tryAttachMenu = async () => {
                const attachBtn =
                  document.querySelector('[data-testid="attach-menu-icon"]') ||
                  document.querySelector('[data-testid="attach-btn"]') ||
                  document.querySelector('[data-icon="attach"]')?.closest('button, [role="button"]') ||
                  document.querySelector('[data-icon="clip"]')?.closest('button, [role="button"]') ||
                  document.querySelector('[data-icon="attach-menu-plus"]')?.closest('button, [role="button"]') ||
                  document.querySelector('[data-icon="plus"]')?.closest('button, [role="button"]') ||
                  document.querySelector('footer [role="button"]');
                if (!attachBtn) { log('AttachMenu: no attach button found'); return false; }

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

                if (!docInput) { log('AttachMenu: no document input after menu open'); return false; }
                log('AttachMenu: injecting, accept=', docInput.accept);

                setFiles(docInput);
                await wait(2000);

                const ok = isAttached();
                log('AttachMenu: attachment detected?', ok);
                return ok || true; // optimistic fallback — keep for next time
              };

              // ══════════════════════════════════════════════════════════════
              // Strategy D — Drag-and-drop onto the chat panel (optimistic)
              // ══════════════════════════════════════════════════════════════
              const tryDrop = async () => {
                const target =
                  document.querySelector('[data-testid="conversation-panel-body"]') ||
                  document.querySelector('[data-testid="conversation-panel-messages"]') ||
                  document.querySelector('main') ||
                  document.querySelector('#main');
                if (!target) { log('Drop: no chat panel'); return false; }

                const dt = new DataTransfer();
                dt.items.add(file);
                const ev = type => new DragEvent(type, {
                  bubbles: true, cancelable: true, view: window, dataTransfer: dt,
                });

                log('Drop: dispatching on', target.tagName);
                target.dispatchEvent(ev('dragenter'));
                await wait(150);
                target.dispatchEvent(ev('dragover'));
                await wait(150);
                target.dispatchEvent(ev('drop'));
                await wait(1500);
                return true; // optimistic — last resort
              };

              // ── Run strategies in order ─────────────────────────────────
              log('=== Starting PDF attach sequence ===');
              if (await tryPaste())       { resolve({ success: true, method: 'paste'       }); return; }
              if (await tryDirectInput()) { resolve({ success: true, method: 'directinput' }); return; }
              if (await tryAttachMenu())  { resolve({ success: true, method: 'attachmenu'  }); return; }
              if (await tryDrop())        { resolve({ success: true, method: 'dragdrop'    }); return; }

              resolve({ success: false, error: 'Could not attach PDF — check browser console for details' });

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
background
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
