  async function runChannel(contactId, channel) {
    const c = getContact(contactId);
    if (!c) return;
    closeModal();
    closeSheets();
    const phone = c.phone.trim();
    const draft = template(state.messageTemplate, c);
    try {
      if (channel === 'facetime' || channel === 'facetime-audio') {
        if (!phone && !c.email) return toast('Add a phone number or Apple-account email first.');
        const target = (phone || c.email).replace(/\s+/g, '');
        addActiveLine(c.id, channel === 'facetime' ? 'FaceTime' : 'FaceTime Audio', 'External');
        location.href = `${channel === 'facetime' ? 'facetime' : 'facetime-audio'}:${target}`;
      } else if (channel === 'textnow') {
        const textNowWindow = window.open('https://www.textnow.com/messaging', '_blank', 'noopener');
        await navigator.clipboard?.writeText(`${phone}\n\n${draft}`);
        addHistory(c.id, 'message', 'TextNow draft prepared and copied.');
        addActiveLine(c.id, 'TextNow', 'External');
        if (!textNowWindow) toast('TextNow pop-up was blocked; the draft is still copied.');
        else toast('Number and draft copied for TextNow.');
      } else if (channel === 'meet') {
        addHistory(c.id, 'meeting', 'Google Meet creation opened.');
        addActiveLine(c.id, 'Google Meet', 'External');
        window.open('https://meet.google.com/new', '_blank', 'noopener');
      } else if (channel === 'jitsi') {
        await startJitsi(c);
      } else if (channel === 'tel') {
        if (!phone) return toast('Add a phone number first.');
        addActiveLine(c.id, 'Phone', 'External');
        location.href = `tel:${phone.replace(/\s+/g, '')}`;
      } else if (channel === 'sms') {
        if (!phone) return toast('Add a phone number first.');
        addHistory(c.id, 'message', 'Native SMS draft opened.');
        location.href = `sms:${encodeURIComponent(phone)}&body=${encodeURIComponent(draft)}`;
      } else if (channel === 'provider') {
        await callProvider(c);
      }
    } catch (err) {
      console.error(err);
      toast('That channel could not be opened.');
    }
  }

  async function callProvider(contact) {
    if (!state.providerEndpoint) return toast('Add your provider backend URL in Settings first.');
    const ok = confirm(`Send a call-start request for ${contact.name} to your configured backend?`);
    if (!ok) return;
    const response = await fetch(state.providerEndpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start_call', contact: { id: contact.id, name: contact.name, phone: contact.phone } })
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    addActiveLine(contact.id, 'Provider', 'Connected');
    toast('Provider accepted the call request.');
  }

  async function ensureJitsiScript() {
    if (window.JitsiMeetExternalAPI) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function startJitsi(contact) {
    try {
      await ensureJitsiScript();
      const room = `Diala-${contact.name.replace(/[^a-z0-9]/gi, '')}-${Math.random().toString(36).slice(2, 8)}`;
      $('#jitsiTitle').textContent = contact.name;
      $('#jitsiModal').classList.remove('hidden');
      $('#jitsiModal').setAttribute('aria-hidden', 'false');
      $('#jitsiContainer').innerHTML = '';
      state.jitsiApi = new window.JitsiMeetExternalAPI('meet.jit.si', {
        roomName: room,
        parentNode: $('#jitsiContainer'),
        width: '100%', height: '100%',
        configOverwrite: { prejoinConfig: { enabled: false }, startWithAudioMuted: false, startWithVideoMuted: false },
        interfaceConfigOverwrite: { MOBILE_APP_PROMO: false }
      });
      state.jitsiApi.addEventListener('videoConferenceJoined', () => {
        addActiveLine(contact.id, 'Jitsi', 'Connected');
        toast('Jitsi meeting connected.');
      });
      state.jitsiApi.addEventListener('readyToClose', closeJitsi);
      addHistory(contact.id, 'meeting', `Jitsi room created: ${room}.`);
    } catch (err) {
      console.error(err);
      toast('Jitsi could not load. Check your connection and try again.');
    }
  }

  function closeJitsi() {
    try { state.jitsiApi?.dispose(); } catch (_) {}
    state.jitsiApi = null;
    $('#jitsiContainer').innerHTML = '';
    $('#jitsiModal').classList.add('hidden');
    $('#jitsiModal').setAttribute('aria-hidden', 'true');
    const line = state.activeLines.find(l => l.channel === 'Jitsi');
    if (line) finishLine(line.id);
  }

  function finishLine(lineId) {
    const line = state.activeLines.find(l => l.id === lineId);
    if (line) addHistory(line.contactId, 'call', `${line.channel} line finished.`);
    state.activeLines = state.activeLines.filter(l => l.id !== lineId);
    saveState();
    renderHome();
  }

  const headerAliases = {
    name: ['name','full name','customer name','contact name','client name','recipient','person'],
    first: ['first','first name','firstname','given name'], last: ['last','last name','lastname','surname'],
    phone: ['phone','phone number','phone #','mobile','mobile phone','cell','cellphone','telephone','tel','number'],
    zip: ['zip','zip code','zipcode','postal','postal code'],
    address: ['address','street','street address','mailing address','addr'],
    city: ['city','town'], state: ['state','province','region'], email: ['email','email address'],
    status: ['status','disposition','stage'], notes: ['notes','note','comments','comment'], image: ['image','image file','image filename','photo','picture','photo file']
  };
  const normHeader = s => String(s || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  function pick(row, names) {
    const keys = Object.keys(row);
    for (const alias of names) {
      const key = keys.find(k => normHeader(k) === alias);
      if (key != null && row[key] != null) return row[key];
    }
    return '';
  }

  async function importWorkbook(file) {
    if (!window.XLSX) return toast('Spreadsheet library is still loading. Try again in a moment.');
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      if (!rows.length) return toast('That sheet has no contact rows.');
      const imported = rows.map(row => {
        const first = pick(row, headerAliases.first), last = pick(row, headerAliases.last);
        const name = pick(row, headerAliases.name) || [first, last].filter(Boolean).join(' ');
        return normalizeContact({
          name: name || 'Unnamed contact', phone: pick(row, headerAliases.phone), zip: pick(row, headerAliases.zip),
          address: pick(row, headerAliases.address), city: pick(row, headerAliases.city), state: pick(row, headerAliases.state),
          email: pick(row, headerAliases.email), status: pick(row, headerAliases.status) || 'New', notes: pick(row, headerAliases.notes), imageName: pick(row, headerAliases.image)
        });
      });
      const hasReal = state.contacts.some(c => !c.sample);
      if (hasReal) {
        const existingKeys = new Set(state.contacts.map(c => `${digits(c.phone)}|${c.name.toLowerCase()}`));
        for (const c of imported) {
          const key = `${digits(c.phone)}|${c.name.toLowerCase()}`;
          if (!existingKeys.has(key)) state.contacts.push(c);
        }
      } else {
        state.contacts = imported;
      }
      state.selected.clear();
      state.previewContactId = state.contacts[0]?.id || null;
      saveState();
      renderAll();
      toast(`${imported.length} contact${imported.length === 1 ? '' : 's'} imported from ${file.name}.`);
    } catch (err) {
      console.error(err);
      toast('I could not read that spreadsheet. Check the file and try again.');
    }
  }

  function normalizedFileStem(name) { return String(name).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  async function matchImages(files) {
    let matched = 0;
    for (const file of files) {
      const stem = normalizedFileStem(file.name);
      const contact = state.contacts.find(c => {
        const nameKey = normalizedFileStem(c.name);
        const phoneKey = digits(c.phone).slice(-7);
        return (nameKey && (stem.includes(nameKey) || nameKey.includes(stem))) || (phoneKey.length >= 7 && stem.includes(phoneKey));
      });
      if (!contact) continue;
      await putMedia(`contact:${contact.id}`, file);
      contact.imageName = file.name;
      matched++;
    }
    saveState();
    renderAll();
    toast(`${matched} of ${files.length} photo${files.length === 1 ? '' : 's'} matched.`);
  }

  function prepareContacts(ids) {
    const contacts = ids.map(getContact).filter(Boolean).filter(c => c.status !== 'Do Not Contact');
    state.prepared = contacts.map(c => ({ contactId: c.id, message: template(state.messageTemplate, c), preparedAt: nowISO() }));
    saveState();
    renderReview();
    switchView('compose');
    $$('[data-compose-mode]').forEach(b => b.classList.toggle('active', b.dataset.composeMode === 'review'));
    $$('[data-compose-panel]').forEach(p => p.classList.toggle('active', p.dataset.composePanel === 'review'));
    toast(`${contacts.length} draft${contacts.length === 1 ? '' : 's'} prepared for review.`);
  }

  async function sharePrepared(contactId) {
    const c = getContact(contactId);
    if (!c) return;
    const item = state.prepared.find(p => p.contactId === contactId) || { message: template(state.messageTemplate, c) };
    try {
      const cardBlob = await makeCardBlob(c);
      const files = cardBlob && window.File ? [new File([cardBlob], `${safeFilename(c.name)}-diala.png`, { type: 'image/png' })] : [];
      const shareData = { title: c.name, text: `${c.phone}\n\n${item.message}` };
      if (files.length && navigator.canShare?.({ files })) shareData.files = files;
      if (navigator.share) {
        await navigator.share(shareData);
        addHistory(c.id, 'message', 'Draft opened in the device share sheet.');
      } else {
        await navigator.clipboard?.writeText(shareData.text);
        toast('Draft copied. Use TextNow, Messages or another app to send it.');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') console.error(err);
    }
  }

  function safeFilename(name) { return String(name || 'contact').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'contact'; }

