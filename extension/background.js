// it helps to get messages from content script and also helps to store invoices in local storage and also send data to backend for processing and invoice generation
const BACKEND = 'put your endpoint here '; 


// opens extension when click
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});
async function getInvoices() {
  const result = await chrome.storage.local.get('invoices');
  return result.invoices || [];
}

// as said it is currenty storing in local storage
async function saveInvoices(invoices) {
  await chrome.storage.local.set({ invoices });
}

// function to generate unique invoices 
function generateId() {
  return 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

async function getWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (!tabs || tabs.length === 0) {
    throw new Error('WhatsApp Web is not open. Please open web.whatsapp.com first.');
  }
  const tab = tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];

  const alive = await new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, { action: 'checkReady' }, (res) => {
      resolve(!chrome.runtime.lastError && res?.ready === true);
    });
  });

  if (!alive) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    let attempts = 0, isReady = false;
    while (attempts < 10 && !isReady) {
      await new Promise(r => setTimeout(r, 800));
      isReady = await new Promise(resolve => {
        chrome.tabs.sendMessage(tab.id, { action: 'checkReady' }, (res) => {
          resolve(!chrome.runtime.lastError && res?.ready === true);
        });
      });
      attempts++;
    }
    if (!isReady) throw new Error('WhatsApp not ready. Wait for the chat to load and try again.');
  }

  return tab;
}


 // function to send message to content script ..
function sendToContent(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}
 
// auth bearer token for secure communication
async function getAuthToken() {
  const result = await chrome.storage.local.get('authToken');
  return result.authToken || null;
}


// this  function is used to send data to backend
async function postToBackend(endpoint, body) {
  const token = await getAuthToken();

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${BACKEND}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Backend error ${response.status}: ${err}`);
  }

  return response.json();
}
 

// main message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[BG] Action:', request.action);
  if (request.action === 'contentScriptReady') return false;

  handleAction(request)
    .then(sendResponse)
    .catch(e => {
      console.error('[BG] Error:', e.message);
      sendResponse({ success: false, error: e.message });
    });

  return true;
});

async function handleAction(request) {
  switch (request.action) {

    case 'getPendingInvoices': {
      const invoices = await getInvoices();
      return { success: true, invoices };
    }

    case 'extractAndCreateInvoice': {
      const tab = await getWhatsAppTab();

      const chatRes = await sendToContent(tab.id, { action: 'extractCurrentChat' });
      if (!chatRes?.success) throw new Error('Could not read chat. Open a WhatsApp chat first.');

      const msgRes = await sendToContent(tab.id, {
        action: 'extractAllMessages',
        maxScrolls: 30,
        scrollDelay: 800
      });
      if (!msgRes?.success) throw new Error('Message extraction failed: ' + (msgRes?.error || 'unknown'));

      const messages = msgRes.data || [];
      if (messages.length === 0) throw new Error('No messages found in this chat.');

      console.log(`[BG] Sending ${messages.length} messages to backend...`);

      const backendResponse = await postToBackend('/invoice/extract', {
        chatName: chatRes.data?.name || 'Unknown',
        messages: messages
      });

      if (!backendResponse.success) {
        throw new Error(backendResponse.error || 'Backend processing failed');
      }

      const invoice = {
        ...backendResponse.invoice,
        id: backendResponse.invoice.id || generateId(),
      };

      const invoices = await getInvoices();
      invoices.unshift(invoice);
      await saveInvoices(invoices);

      chrome.runtime.sendMessage({ target: 'dashboard', type: 'newInvoice', invoice }).catch(() => {});

      return {
        success: true,
        invoice,
        messageCount: messages.length
      };
    }

    case 'generateInvoice': {
      const invoices = await getInvoices();
      const idx = invoices.findIndex(inv => inv.id === request.invoiceId);
      if (idx === -1) throw new Error('Invoice not found');

      const backendResponse = await postToBackend('/invoice/generate', invoices[idx]);

      if (!backendResponse.success) {
        throw new Error(backendResponse.error || 'Invoice generation failed');
      }

      invoices[idx] = { ...backendResponse.invoice };
      await saveInvoices(invoices);

      return { success: true, invoice: invoices[idx] };
    }

    case 'updateInvoice': {
      const invoices = await getInvoices();
      const idx = invoices.findIndex(inv => inv.id === request.invoiceId);
      if (idx === -1) throw new Error('Invoice not found');
      invoices[idx].data = {
        ...invoices[idx].data,
        ...request.updates,
        rawMessages: invoices[idx].data?.rawMessages || invoices[idx].rawMessages
      };
      invoices[idx].updatedAt = new Date().toISOString();
      await saveInvoices(invoices);
      return { success: true };
    }

    case 'approveInvoice': {
      const invoices = await getInvoices();
      const idx = invoices.findIndex(inv => inv.id === request.invoiceId);
      if (idx === -1) throw new Error('Invoice not found');
      invoices[idx].status = 'approved';
      invoices[idx].approvedAt = new Date().toISOString();
      await saveInvoices(invoices);
      return { success: true };
    }

    case 'deleteInvoice': {
      let invoices = await getInvoices();
      invoices = invoices.filter(inv => inv.id !== request.invoiceId);
      await saveInvoices(invoices);
      return { success: true };
    }

    default: {
      const tab = await getWhatsAppTab();
      return await sendToContent(tab.id, request);
    }
  }
}