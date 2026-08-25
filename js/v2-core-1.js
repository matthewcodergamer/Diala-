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
  const todayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

  const sampleContacts = [
    { id: uid(), name:'Douglas Williams', phone:'+1 305 555 0142', zip:'33101', address:'104 Harbor Avenue', city:'Miami', state:'FL', status:'Callback', notes:'Demo contact — import your XLSX to replace demo data.', sample:true, history:[{at:nowISO(),type:'note',text:'Demo contact loaded locally.'}] },
    { id: uid(), name:'Sarah James', phone:'+1 212 555 0118', zip:'10001', address:'28 West 30th Street', city:'New York', state:'NY', status:'New', notes:'Demo contact.', sample:true, history:[] },
    { id: uid(), name:'Michael Brown', phone:'+1 310 555 0188', zip:'90210', address:'71 Palm Drive', city:'Beverly Hills', state:'CA', status:'No Answer', notes:'Demo contact.', sample:true, history:[{at:nowISO(),type:'missed',text:'Demo: outbound call marked no answer.'}] }
  ];

  const defaults = {
    profileName: 'Mr. Douglas',
    assistantName: 'Lia',
    wakePhrase: 'Hey Lia',
    alwaysListening: true,
    requireWakePhrase: true,
    aiModel: 'gpt-5.4-nano',
    tts: true,
    ttsVoice: 'lia',
    theme: 'system',
    preferredChannel: 'auto',
    showPaidProviders: false,
    providerEndpoint: '',
    enrichmentEndpoint: '',
    goalTarget: 100,
    avgMinutesPerContact: 2.5,
    dailyStats: {},
    messageTemplate: 'Hello {{name}}, I’m reaching out regarding your area in ZIP code {{zip}}. The address we have is {{address}}.',
    script: `Opening\nHi {{name}}, this is Douglas. Is now an okay time for a quick conversation?\n\nConfirm\nI have your ZIP as {{zip}} and the address as {{address}}. Is that still correct?\n\nNext step\nPerfect. I’ll send you the image we discussed. If you have any questions, just let me know.\n\nClose\nThank you for your time. Have a great day.`,
    contacts: sampleContacts,
    activeLines: [],
    prepared: [],
    chat: [{ role:'assistant', text:'I’m Lia. I can help with your contacts, daily goal, messages, call methods, scripts, and follow-ups.' }]
  };

  function cloneDefaults() { return typeof structuredClone === 'function' ? structuredClone(defaults) : JSON.parse(JSON.stringify(defaults)); }

  const loadState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const base = cloneDefaults();
      return {
        ...base, ...saved,
        contacts: Array.isArray(saved.contacts) && saved.contacts.length ? saved.contacts.map(normalizeContact) : cloneDefaults().contacts,
        activeLines: Array.isArray(saved.activeLines) ? saved.activeLines : [],
        prepared: Array.isArray(saved.prepared) ? saved.prepared : [],
        chat: Array.isArray(saved.chat) && saved.chat.length ? saved.chat : base.chat,
        dailyStats: saved.dailyStats && typeof saved.dailyStats === 'object' ? saved.dailyStats : {}
      };
    } catch (err) {
      console.warn('Diala state reset after parse error', err);
      return cloneDefaults();
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
  state.voiceSessionActive = false;
  state.voiceSessionPaused = false;
  state.assistantSpeaking = false;
  state.assistantThinking = false;
  state.conversationUntil = 0;
  state.recognitionRestartTimer = null;
  state.currentAudio = null;
  state.voiceSessionStartedAt = null;

  const saveState = () => {
    const serializable = {
      profileName: state.profileName, assistantName: state.assistantName, wakePhrase: state.wakePhrase,
      alwaysListening: state.alwaysListening, requireWakePhrase: state.requireWakePhrase,
      aiModel: state.aiModel, tts: state.tts, ttsVoice: state.ttsVoice, theme: state.theme,
      preferredChannel: state.preferredChannel, showPaidProviders: state.showPaidProviders,
      providerEndpoint: state.providerEndpoint, enrichmentEndpoint: state.enrichmentEndpoint,
      goalTarget: state.goalTarget, avgMinutesPerContact: state.avgMinutesPerContact, dailyStats: state.dailyStats,
      messageTemplate: state.messageTemplate, script: state.script, contacts: state.contacts,
      activeLines: state.activeLines, prepared: state.prepared, chat: state.chat.slice(-100)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  };

  const formatTime = iso => new Intl.DateTimeFormat(undefined, { hour:'numeric', minute:'2-digit' }).format(new Date(iso));
  const formatRelative = iso => {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms/60_000)}m`;
    if (ms < 86_400_000) return `${Math.floor(ms/3_600_000)}h`;
    return new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric' }).format(new Date(iso));
  };

  function toast(message, timeout = 2800) {
    const region = $('#toastRegion'); if (!region) return;
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = message;
    region.appendChild(el); window.setTimeout(() => el.remove(), timeout);
  }

  async function mediaDB() {
    return new Promise((resolve,reject) => {
      const request = indexedDB.open(MEDIA_DB,1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(MEDIA_STORE)) request.result.createObjectStore(MEDIA_STORE); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  async function putMedia(key, blob) { const db=await mediaDB(); return new Promise((res,rej)=>{ const tx=db.transaction(MEDIA_STORE,'readwrite'); tx.objectStore(MEDIA_STORE).put(blob,key); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
  async function getMedia(key) { const db=await mediaDB(); return new Promise((res,rej)=>{ const tx=db.transaction(MEDIA_STORE,'readonly'); const req=tx.objectStore(MEDIA_STORE).get(key); req.onsuccess=()=>res(req.result||null); req.onerror=()=>rej(req.error); }); }
  async function clearMedia() { const db=await mediaDB(); return new Promise((res,rej)=>{ const tx=db.transaction(MEDIA_STORE,'readwrite'); tx.objectStore(MEDIA_STORE).clear(); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }

  function initials(name) { return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]?.toUpperCase()).join('') || '?'; }

  function normalizeContact(raw={}) {
    return {
      id: raw.id || uid(), name:String(raw.name||'Unnamed contact').trim(), phone:String(raw.phone||'').trim(),
      zip:String(raw.zip||'').trim(), address:String(raw.address||'').trim(), city:String(raw.city||'').trim(), state:String(raw.state||'').trim(),
      email:String(raw.email||'').trim(), status:raw.status||'New', notes:String(raw.notes||'').trim(), imageName:raw.imageName||'',
      enrichment: raw.enrichment || null, history:Array.isArray(raw.history)?raw.history:[], sample:!!raw.sample
    };
  }

  function getContact(id){ return state.contacts.find(c=>c.id===id); }
  function findContact(query){
    const q=String(query||'').trim().toLowerCase(); if(!q) return null;
    const exact=state.contacts.find(c=>c.name.toLowerCase()===q || (digits(q)&&digits(c.phone)===digits(q)));
    if(exact) return exact;
    return state.contacts.find(c=>`${c.name} ${c.phone} ${c.zip} ${c.address} ${c.city} ${c.email}`.toLowerCase().includes(q))||null;
  }

  function template(text,contact){
    const v={name:contact?.name||'',phone:contact?.phone||'',zip:contact?.zip||'',address:contact?.address||'',city:contact?.city||'',state:contact?.state||''};
    return String(text||'').replace(/{{\s*(name|phone|zip|address|city|state)\s*}}/gi,(_,k)=>v[k.toLowerCase()]||'');
  }

  function addHistory(contactId,type,text,data={}){
    const c=getContact(contactId); if(!c)return;
    c.history ||= []; c.history.unshift({at:nowISO(),type,text,...data}); c.history=c.history.slice(0,100); saveState();
  }

  function ensureTodayStats(){
    const key=todayKey();
    const existing=state.dailyStats[key] || {};
    state.dailyStats[key]={ worked: existing.worked&&typeof existing.worked==='object'?existing.worked:{}, startedAt:existing.startedAt||null };
    return state.dailyStats[key];
  }

  function markWorkedToday(contactId){
    if(!contactId)return;
    const day=ensureTodayStats(); const now=nowISO();
    if(!day.startedAt) day.startedAt=now;
    if(!day.worked[contactId]) day.worked[contactId]=now;
    saveState();
  }

  function setDisposition(contactId,disposition){
    const c=getContact(contactId); if(!c)return;
    c.status=disposition; markWorkedToday(contactId); addHistory(contactId,'disposition',`Marked ${disposition}.`);
    if(typeof renderAll==='function') renderAll();
    if($('#contactSheet') && !$('#contactSheet').classList.contains('hidden') && typeof openContactSheet==='function') openContactSheet(contactId);
  }

