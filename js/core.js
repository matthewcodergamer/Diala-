  'use strict';

  const STORAGE_KEY = 'diala-state-v1';
  const MEDIA_DB = 'diala-media-v1';
  const MEDIA_STORE = 'media';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const digits = value => String(value || '').replace(/\D/g, '');
  const nowISO = () => new Date().toISOString();

  const sampleContacts = [
    {
      id: uid(), name: 'Douglas Williams', phone: '+1 305 555 0142', zip: '33101', address: '104 Harbor Avenue',
      city: 'Miami', state: 'FL', status: 'Callback', notes: 'Demo contact — import your XLSX to replace demo data.', sample: true,
      history: [{ at: nowISO(), type: 'note', text: 'Demo contact loaded locally.' }]
    },
    {
      id: uid(), name: 'Sarah James', phone: '+1 212 555 0118', zip: '10001', address: '28 West 30th Street',
      city: 'New York', state: 'NY', status: 'New', notes: 'Demo contact.', sample: true, history: []
    },
    {
      id: uid(), name: 'Michael Brown', phone: '+1 310 555 0188', zip: '90210', address: '71 Palm Drive',
      city: 'Beverly Hills', state: 'CA', status: 'No Answer', notes: 'Demo contact.', sample: true,
      history: [{ at: nowISO(), type: 'missed', text: 'Demo: outbound call marked no answer.' }]
    }
  ];

  const defaults = {
    profileName: 'Mr. Douglas',
    aiModel: 'gpt-5-nano',
    tts: true,
    theme: 'system',
    preferredChannel: 'auto',
    showPaidProviders: false,
    providerEndpoint: '',
    messageTemplate: 'Hello {{name}}, I’m reaching out regarding your area in ZIP code {{zip}}. The address we have is {{address}}.',
    script: `Opening\nHi {{name}}, this is Douglas. Is now an okay time for a quick conversation?\n\nConfirm\nI have your ZIP as {{zip}} and the address as {{address}}. Is that still correct?\n\nNext step\nPerfect. I’ll send you the image we discussed. If you have any questions, just let me know.\n\nClose\nThank you for your time. Have a great day.`,
    contacts: sampleContacts,
    activeLines: [],
    prepared: [],
    chat: [
      { role: 'assistant', text: 'I’m ready. You can ask me to find a contact, prepare a message, open FaceTime or TextNow, start a Jitsi meeting, show your script, or tell you who is next.' }
    ]
  };

  const loadState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        ...structuredClone(defaults),
        ...saved,
        contacts: Array.isArray(saved.contacts) && saved.contacts.length ? saved.contacts : structuredClone(sampleContacts),
        activeLines: Array.isArray(saved.activeLines) ? saved.activeLines : [],
        prepared: Array.isArray(saved.prepared) ? saved.prepared : [],
        chat: Array.isArray(saved.chat) && saved.chat.length ? saved.chat : structuredClone(defaults.chat)
      };
    } catch (err) {
      console.warn('Diala state reset after parse error', err);
      return structuredClone(defaults);
    }
  };

  const state = loadState();
  state.selected = new Set();
  state.currentView = 'home';
  state.queueFilter = 'all';
  state.previewContactId = state.contacts[0]?.id || null;
  state.activeContactId = null;
  state.pendingAction = null;
  state.aiImageElements = new Map();
  state.jitsiApi = null;
  state.recognition = null;
  state.recognitionTarget = null;

  const saveState = () => {
    const serializable = {
      profileName: state.profileName,
      aiModel: state.aiModel,
      tts: state.tts,
      theme: state.theme,
      preferredChannel: state.preferredChannel,
      showPaidProviders: state.showPaidProviders,
      providerEndpoint: state.providerEndpoint,
      messageTemplate: state.messageTemplate,
      script: state.script,
      contacts: state.contacts,
      activeLines: state.activeLines,
      prepared: state.prepared,
      chat: state.chat.slice(-80)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  };

  const formatTime = iso => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const formatRelative = iso => {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));
  };

  function toast(message, timeout = 2800) {
    const region = $('#toastRegion');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    region.appendChild(el);
    window.setTimeout(() => el.remove(), timeout);
  }

  async function mediaDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MEDIA_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(MEDIA_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function putMedia(key, blob) {
    const db = await mediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      tx.objectStore(MEDIA_STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getMedia(key) {
    const db = await mediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const req = tx.objectStore(MEDIA_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function clearMedia() {
    const db = await mediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      tx.objectStore(MEDIA_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
  }

  function normalizeContact(raw = {}) {
    return {
      id: raw.id || uid(),
      name: String(raw.name || 'Unnamed contact').trim(),
      phone: String(raw.phone || '').trim(),
      zip: String(raw.zip || '').trim(),
      address: String(raw.address || '').trim(),
      city: String(raw.city || '').trim(),
      state: String(raw.state || '').trim(),
      email: String(raw.email || '').trim(),
      status: raw.status || 'New',
      notes: String(raw.notes || '').trim(),
      imageName: raw.imageName || '',
      history: Array.isArray(raw.history) ? raw.history : [],
      sample: !!raw.sample
    };
  }

  function getContact(id) { return state.contacts.find(c => c.id === id); }
  function findContact(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return null;
    const exact = state.contacts.find(c => c.name.toLowerCase() === q || digits(c.phone) === digits(q));
    if (exact) return exact;
    return state.contacts.find(c => `${c.name} ${c.phone} ${c.zip} ${c.address}`.toLowerCase().includes(q)) || null;
  }

  function template(text, contact) {
    const values = {
      name: contact?.name || '', phone: contact?.phone || '', zip: contact?.zip || '',
      address: contact?.address || '', city: contact?.city || '', state: contact?.state || ''
    };
    return String(text || '').replace(/{{\s*(name|phone|zip|address|city|state)\s*}}/gi, (_, key) => values[key.toLowerCase()] || '');
  }

  function addHistory(contactId, type, text) {
    const contact = getContact(contactId);
    if (!contact) return;
    contact.history ||= [];
    contact.history.unshift({ at: nowISO(), type, text });
    contact.history = contact.history.slice(0, 80);
    saveState();
  }

  function setDisposition(contactId, disposition) {
    const contact = getContact(contactId);
    if (!contact) return;
    contact.status = disposition;
    addHistory(contactId, 'disposition', `Marked ${disposition}.`);
    renderAll();
    if (!$('#contactSheet').classList.contains('hidden')) openContactSheet(contactId);
  }

  function applyTheme() {
    if (state.theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = state.theme;
  }

  function updateGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    $('#greetingText').textContent = greeting;
    $('#displayName').textContent = state.profileName;
    $('#dayLabel').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(now).toUpperCase();
  }

  function filteredContacts() {
    const q = ($('#contactSearch')?.value || '').trim().toLowerCase();
    return state.contacts.filter(c => {
      const matchesSearch = !q || `${c.name} ${c.phone} ${c.zip} ${c.address} ${c.city} ${c.state}`.toLowerCase().includes(q);
      const filter = state.queueFilter;
      const matchesStatus = filter === 'all' || c.status.toLowerCase() === filter;
      return matchesSearch && matchesStatus;
    });
  }

  function nextContact() {
    return state.contacts.find(c => !['Reached', 'Do Not Contact'].includes(c.status)) || state.contacts[0] || null;
  }

