/**
 * api/client.js
 * 
 * Centralised fetch wrapper for the Vyaap backend.
 * 
 * Auth strategy:
 *  - On login/signup: POST directly, backend sets HttpOnly cookies.
 *  - background.js captures the Set-Cookie value via webRequest and stores
 *    the raw access_token string in chrome.storage.local.
 *  - All subsequent calls attach Authorization: Bearer <token>.
 *  - If 401 → clear storage → React re-renders to AuthPage.
 */

const BACKEND = 'http://localhost:8080';

// ─── Storage helpers (graceful fallback for non-extension env) ───────────
export const storage = {
  async get(key) {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return new Promise(resolve => {
        chrome.storage.local.get([key], result => resolve(result[key]));
      });
    }
    return localStorage.getItem(key);
  },
  async set(key, value) {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return new Promise(resolve => {
        chrome.storage.local.set({ [key]: value }, resolve);
      });
    }
    localStorage.setItem(key, value);
  },
  async remove(key) {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return new Promise(resolve => {
        chrome.storage.local.remove([key], resolve);
      });
    }
    localStorage.removeItem(key);
  },
};

// ─── Message to background helper ───────────────────────────────────────
function sendToBackground(message) {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } else {
      reject(new Error('Chrome runtime not available'));
    }
  });
}

// ─── Core fetch wrapper ──────────────────────────────────────────────────
async function request(endpoint, options = {}) {
  const url = BACKEND + endpoint;
  const token = await storage.get('vyaap_access_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // also send cookies if present
  });

  if (res.status === 401) {
    // Token expired or revoked → force logout
    await storage.remove('vyaap_access_token');
    await storage.remove('vyaap_user');
    window.dispatchEvent(new CustomEvent('vyaap:unauthorized'));
    throw new Error('Session expired. Please log in again.');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

// ─── Auth API ─────────────────────────────────────────────────────────────
export const authApi = {
  /**
   * Sign up a new user.
   * Body: { name, email, password, confirm_password }
   */
  async signup(payload) {
    return request('/signup', {
      method: 'POST',
      body: JSON.stringify({
        Name: payload.name,
        Email: payload.email,
        Password: payload.password,
        ConfirmPassword: payload.confirmPassword,
      }),
    });
  },

  /**
   * Login. Backend sets HttpOnly cookies.
   * background.js (via webRequest) captures access_token → chrome.storage.local.
   * We also ask background explicitly to do a login and return the token.
   */
  async login(email, password) {
    // Route through background.js so it can capture the Set-Cookie header
    const result = await sendToBackground({
      action: 'vyaapLogin',
      email,
      password,
    });
    if (!result || !result.success) {
      throw new Error(result?.error || 'Login failed');
    }
    // background.js already stored the token; also store user info
    if (result.token) {
      await storage.set('vyaap_access_token', result.token);
    }
    // Store name returned by backend so invoices can use it as senderName
    const name = result.name || '';
    await storage.set('vyaap_user', JSON.stringify({ email, name }));
    return result;
  },

  /**
   * Logout via background.js (protected endpoint needs auth).
   */
  async logout() {
    try {
      await sendToBackground({ action: 'vyaapLogout' });
    } catch (_) {
      // ignore errors — just clear local state
    }
    await storage.remove('vyaap_access_token');
    await storage.remove('vyaap_user');
  },
};

// ─── Chat API ─────────────────────────────────────────────────────────────
export const chatApi = {
  /**
   * Ingest messages into the backend.
   * Matches backend: POST /ingest { chatName, messages: [{text, timestamp, sender}] }
   */
  async ingest(chatName, messages) {
    return request('/ingest', {
      method: 'POST',
      body: JSON.stringify({ chatName, messages }),
    });
  },
};

// ─── Health check ─────────────────────────────────────────────────────────
export const healthApi = {
  async ping() {
    return request('/health');
  },
};
