// 1. Target your Go Backend (ensure no trailing slash)
const BACKEND = 'http://localhost:8080';

// --- 1. THE MAIN MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Vyaap BG] Incoming Action:', request.action);

  handleAction(request)
    .then(sendResponse)
    .catch(e => {
      console.error('[Vyaap BG] Error in Bridge:', e.message);
      sendResponse({ success: false, error: e.message });
    });

  return true; // Required for async fetch
});

// --- 2. THE ACTION ROUTER ---
async function handleAction(request) {
  switch (request.action) {
    case 'extractAndCreateInvoice': {
      const tab = await getWhatsAppTab();

      // Step A: Extract from DOM
      const chatRes = await sendToContent(tab.id, { action: 'extractCurrentChat' });
      const msgRes = await sendToContent(tab.id, {
        action: 'extractAllMessages',
        maxScrolls: 5,
        scrollDelay: 500
      });

      // Step B: LOG THE DATA (Check your Service Worker Console for this!)
      const extractedMessages = msgRes.data || [];
      console.log(`[Vyaap BG] DOM Extracted ${extractedMessages.length} messages.`);

      // Step C: THE HANDSHAKE (Sending to Go)
      // We send a mix of real data and a test string to verify the bridge
      const payload = {
        chatName: chatRes.data?.name || "Neo Test Chat",
        messages: extractedMessages.length > 0 ? extractedMessages : ["Bridge Test: DOM was empty"]
      };

      console.log("🚀 Pushing Payload to Go:", payload);
      const backendResponse = await postToBackend('/ingest', payload);

      return {
        success: true,
        goResponse: backendResponse.message,
        count: extractedMessages.length
      };
    }

    default:
      return { success: false, error: `Action ${request.action} not handled.` };
  }
}
async function postToBackend(endpoint, body) {
  // HARD-CODED FOR DEBUGGING
  const url = "http://localhost:8080/ingest";

  console.log(`[Vyaap] Knocking on door: ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Go Server Error ${response.status}: ${errorText}`);
  }

  return response.json();
}
// --- 3. THE FETCH HELPER ---
// async function postToBackend(endpoint, body) {
//   // const url = BACKEND + endpoint;
//   const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
//   const fullUrl = BACKEND + path;
//
//   console.log(`[Vyaap BG] POSTING TO: ${fullUrl}`);
//   const response = await fetch(fullUrl, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify(body)
//   });
//
//   if (!response.ok) {
//     const errorText = await response.text();
//     throw new Error(`Go Server Error ${response.status}: ${errorText}`);
//   }
//
//   return response.json();
// }

// --- 4. THE TAB & INJECTION HELPERS ---
async function getWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (!tabs || tabs.length === 0) {
    throw new Error('Please open WhatsApp Web first.');
  }

  const tab = tabs[0];

  // Ping to see if content.js is awake
  const isReady = await new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, { action: 'checkReady' }, (res) => {
      resolve(!chrome.runtime.lastError && res?.ready === true);
    });
  });

  if (!isReady) {
    console.log("[Vyaap BG] Content Script missing. Forcing injection...");
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await new Promise(r => setTimeout(r, 600));
  }

  return tab;
}

function sendToContent(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}
