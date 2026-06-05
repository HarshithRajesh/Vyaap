// At first it helps prevent script from loading twice
(() => {
  if (window.__waInvoiceExtractorLoaded) return;
  window.__waInvoiceExtractorLoaded = true;

  const log = (...a) => console.log('[WA-Extractor]', ...a);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function safeQuery(root, sel) {
    try { return root.querySelector(sel); } catch { return null; }
  }
  function safeQueryAll(root, sel) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
  }
  function cleanText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\u200e/g, '').trim();
  }
  function dedup(messages) {
    const seen = new Set();
    return messages.filter(m => {
      const key = `${m.timestamp}|${m.sender}|${(m.text || '').slice(0, 60)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
 // function to find correct whatsapp chat container
  function getMain() {
    const selectors = [
      '[data-testid="conversation-panel-messages"]',
      '[data-testid="conversation-panel-body"]',
      '#main',
      'main',
      'div[role="region"]',
      '.two'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // Fallback: search for any div containing message bubbles
    const bubble = document.querySelector('.message-in, .message-out, [data-testid="msg-container"]');
    if (bubble) {
      const parentPanel = bubble.closest('[role="region"]') || bubble.closest('main') || bubble.parentElement;
      if (parentPanel) return parentPanel;
    }
    return null;
  }
 // wait for whatsapp web loads fully
  function waitForWhatsApp() {
    return new Promise(resolve => {
      const id = setInterval(() => {
        const main = getMain();
        const hasChat = main && (
          main.querySelector('div[role="row"]') || 
          main.querySelector('.message-in') ||
          main.querySelector('[data-testid="msg-container"]') ||
          main.querySelector('[class*="message-in"]')
        );
        const paneSide = document.querySelector('#pane-side') || document.querySelector('[data-testid="chat-list"]');
        if (hasChat && paneSide) {
          clearInterval(id);
          resolve();
        }
      }, 400);
    });
  }
 // first helps to extract current chat name 
  function extractCurrentChat() {
    // WhatsApp generic accessibility strings that are NOT contact names
    const IGNORED = new Set([
      'click here for contact info',
      'click here for group info',
      'type a message',
      '',
    ]);

    // Ordered list of selectors to try — most specific first
    const candidates = [
      // The chat header title span (has the actual name as `title` attr)
      () => {
        const spans = Array.from(document.querySelectorAll('header span[title]'));
        for (const el of spans) {
          const t = (el.getAttribute('title') || '').trim();
          if (t && !IGNORED.has(t.toLowerCase())) return t;
        }
        return null;
      },
      // Data-testid that WhatsApp uses for the conversation header name
      () => {
        const el = document.querySelector('[data-testid="conversation-header"] span[dir="auto"]')
                || document.querySelector('[data-testid="conversation-info-header-chat-title"]')
                || document.querySelector('[data-testid="chat-title"]');
        if (el) {
          const t = (el.getAttribute('title') || el.innerText || '').trim();
          if (t && !IGNORED.has(t.toLowerCase())) return t;
        }
        return null;
      },
      // Fallback: any header span[dir="auto"] whose text isn't a generic string
      () => {
        const spans = Array.from(document.querySelectorAll('header span[dir="auto"]'));
        for (const el of spans) {
          const t = (el.getAttribute('title') || el.innerText || el.textContent || '').replace(/\u200e/g, '').trim();
          if (t && !IGNORED.has(t.toLowerCase()) && t.length > 0 && t.length < 80) return t;
        }
        return null;
      },
    ];

    for (const fn of candidates) {
      const name = fn();
      if (name) return { name, isGroup: false, timestamp: new Date().toISOString() };
    }

    return { name: 'Unknown', isGroup: false, timestamp: new Date().toISOString() };
  }
  // helps to scroll entire chat
  function getScrollContainer() {
    const main = getMain();
    if (!main) return null;

    if (main.scrollHeight > main.clientHeight + 50) {
      return main;
    }

    const divs = Array.from(main.querySelectorAll('div'))
      .filter(d => d.scrollHeight > d.clientHeight + 50)
      .sort((a, b) => b.scrollHeight - a.scrollHeight);

    return divs[0] || main;
  }
 // for parse each messages
  function parseMessage(el) {
    const bubble = el.querySelector('.message-in') || 
                   el.querySelector('.message-out') || 
                   el.querySelector('[data-testid="msg-container"]') || 
                   el.querySelector('[class*="message-in"]') || 
                   el.querySelector('[class*="message-out"]') || 
                   el;

    const isIncoming = bubble.classList.contains('message-in') || 
                       !!bubble.closest('.message-in') || 
                       bubble.className.includes('message-in') ||
                       !!bubble.closest('[class*="message-in"]');
    const isOutgoing = !isIncoming;

    let text = '';
    let meta = '';

    const copyable = safeQuery(bubble, '.copyable-text') || safeQuery(bubble, '[class*="copyable-text"]');
    if (copyable) {
      meta = copyable.getAttribute('data-pre-plain-text') || '';
      const span = safeQuery(copyable, 'span.selectable-text') || safeQuery(copyable, '[class*="selectable-text"]');
      text = cleanText(span || copyable);
    }

    if (!text) {
      const span = safeQuery(bubble, 'span.selectable-text') || safeQuery(bubble, '[class*="selectable-text"]');
      if (span) {
        text = cleanText(span);
        if (!meta) meta = span.parentElement?.getAttribute('data-pre-plain-text') || '';
      }
    }

    if (!meta) {
      const metaEl = safeQuery(bubble, '[data-pre-plain-text]');
      if (metaEl) {
        meta = metaEl.getAttribute('data-pre-plain-text') || '';
        if (!text) text = cleanText(metaEl);
      }
    }

    if (!text) {
      const msgText = safeQuery(bubble, '[data-testid="msg-text"]');
      if (msgText) text = cleanText(msgText);
    }

    if (!text) {
      const dirEl = bubble.querySelector('[dir="ltr"]') || 
                    bubble.querySelector('[dir="rtl"]') || 
                    bubble.querySelector('[dir="auto"]');
      if (dirEl) {
        text = cleanText(dirEl);
      }
    }

    if (!text) {
      text = cleanText(bubble);
      text = text.replace(/\s*\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?$/i, '').trim();
    }

    let timestamp = null, sender = null;
    if (meta) {
      const tMatch = meta.match(/\[([^\]]+)\]/);
      if (tMatch) timestamp = tMatch[1].trim();
      const sMatch = meta.match(/\]\s*(.+?):\s*$/);
      if (sMatch) sender = sMatch[1].trim();
    }
    if (!timestamp) {
      const timeEl = safeQuery(bubble, 'span[data-testid="msg-time"]') || safeQuery(bubble, '[class*="msg-time"]');
      if (timeEl) timestamp = cleanText(timeEl);
    }

    const hasMedia = !!(
      safeQuery(el, 'img[src^="blob:"]') ||
      safeQuery(el, 'video') ||
      safeQuery(el, 'audio') ||
      safeQuery(el, '[data-testid="image-thumb"]') ||
      safeQuery(el, '[data-testid="video-thumb"]')
    );

    return { text, timestamp, sender, isOutgoing, hasMedia };
  }
 // after every scroll function to scrap all messages
  function extractMessages(limit = 500) {
    const main = getMain();
    if (!main) {
      log('No main container found');
      return [];
    }

    let rows = safeQueryAll(main, '[data-testid="msg-container"]');
    
    if (rows.length === 0) {
      rows = safeQueryAll(main, 'div.message-in, div.message-out');
    }
    if (rows.length === 0) {
      rows = safeQueryAll(main, 'div[class*="message-in"], div[class*="message-out"]');
    }
    if (rows.length === 0) {
      rows = safeQueryAll(main, 'div[role="row"]');
    }

    log(`Found ${rows.length} rows`);

    const messages = [];
    rows.slice(-limit).forEach((el, i) => {
      try {
        const msg = parseMessage(el);
        if (msg.text || msg.hasMedia) messages.push(msg);
      } catch (e) {
        console.error('[WA-Extractor] parse error at', i, e);
      }
    });

    log(`Extracted ${messages.length} messages`);
    return messages;
  }
 // extract all messages completly
  async function extractAllMessages({ maxScrolls = 30, scrollDelay = 900 } = {}) {
    let collected = [];
    const container = getScrollContainer();

    if (!container) {
      log('No scroll container — extracting visible only');
      return extractMessages();
    }

    log(`Scroll container found. scrollHeight: ${container.scrollHeight}`);

    collected = dedup([...extractMessages(), ...collected]);

    let lastHeight = -1;
    let stable = 0;

    for (let i = 0; i < maxScrolls; i++) {
      container.scrollTop = 0;
      await sleep(scrollDelay);

      const h = container.scrollHeight;
      const batch = extractMessages();
      collected = dedup([...batch, ...collected]);

      log(`Scroll ${i + 1}/${maxScrolls} | height: ${h} | total: ${collected.length}`);

      if (h === lastHeight) {
        stable++;
        if (stable >= 3) { log('Reached top of chat'); break; }
      } else {
        stable = 0;
      }
      lastHeight = h;
    }

    container.scrollTop = container.scrollHeight;
    await sleep(600);
    collected = dedup([...collected, ...extractMessages()]);

    log(`Done. ${collected.length} unique messages`);
    return collected;
  }
  // optional invoice data from regex if u dont want in this feel free to remove it
  function extractInvoiceData(messages) {
    if (!messages) messages = extractMessages();
    const data = { items: [], customerInfo: {}, orderDetails: {}, rawMessages: messages };
    const seen = new Set();

    messages.forEach(msg => {
      if (!msg.text) return;
      const t = msg.text;

      const qtyRe = /(\d+)\s*[xX×]\s*([^\n₹\d][^\n]{1,60})/g;
      let m;
      while ((m = qtyRe.exec(t))) {
        const key = `${m[1]}|${m[2].trim().toLowerCase()}`;
        if (!seen.has(key)) { seen.add(key); data.items.push({ quantity: +m[1], description: m[2].trim(), price: null }); }
      }

      const priceRe = /([A-Za-z][^\n₹\-:]{2,40})\s*[-:]\s*₹?\s*(\d[\d,.]*)/g;
      while ((m = priceRe.exec(t))) {
        const key = `${m[1].trim().toLowerCase()}|${m[2]}`;
        if (!seen.has(key)) { seen.add(key); data.items.push({ quantity: 1, description: m[1].trim(), price: parseFloat(m[2].replace(/,/g, '')) }); }
      }

      if (!data.orderDetails.total) {
        const tot = t.match(/(?:total|amount|bill)\s*[:\-]?\s*₹?\s*(\d[\d,.]*)/i);
        if (tot) data.orderDetails.total = parseFloat(tot[1].replace(/,/g, ''));
      }
      if (!data.customerInfo.email) {
        const email = t.match(/[\w.+\-]+@[\w.\-]+\.[a-zA-Z]{2,}/);
        if (email) data.customerInfo.email = email[0];
      }
      if (!data.customerInfo.phone) {
        const phone = t.match(/(?:\+91[\s\-]?)?[6-9]\d{9}|\+\d{1,3}[\s\-]?\d{6,14}/);
        if (phone) data.customerInfo.phone = phone[0];
      }
      if (!data.orderDetails.orderId) {
        const oid = t.match(/(?:order|invoice|ref)\s*(?:id|no|#)?\s*[:\-]?\s*([A-Z0-9\-/]{4,20})/i);
        if (oid) data.orderDetails.orderId = oid[1];
      }
    });

    return data;
  }

  let ready = false;
  waitForWhatsApp().then(() => {
    ready = true;
    log('Ready ');
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('Received action:', request.action);

    const handle = async () => {
      switch (request.action) {

        case 'checkReady':
          return { success: true, ready };

        case 'extractCurrentChat':
        case 'getCurrentChat':
          return { success: true, data: extractCurrentChat() };

        case 'extractMessages':
          return { success: true, data: extractMessages(request.limit || 500) };

        case 'extractAllMessages':
          return { success: true, data: await extractAllMessages({ maxScrolls: request.maxScrolls || 30, scrollDelay: request.scrollDelay || 900 }) };

        case 'extractInvoiceData':
          return { success: true, data: extractInvoiceData(extractMessages()) };

        case 'scrollToLoadMore':
          await (async () => {
            const c = getScrollContainer();
            if (!c) return;
            for (let i = 0; i < (request.scrollCount || 5); i++) { c.scrollTop = 0; await sleep(request.delay || 900); }
          })();
          return { success: true };

        default:
          return { success: false, error: `Unknown action: ${request.action}` };
      }
    };

    handle().then(sendResponse).catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  });

  chrome.runtime.sendMessage({ action: 'contentScriptReady', url: window.location.href }).catch(() => {});
  log('Injected and listening for messages');
})();