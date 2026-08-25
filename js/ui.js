  function renderHome() {
    const callbacks = state.contacts.filter(c => c.status === 'Callback').length;
    const missed = state.contacts.reduce((sum, c) => sum + (c.history || []).filter(h => h.type === 'missed').length, 0);
    const remaining = state.contacts.filter(c => !['Reached', 'Do Not Contact'].includes(c.status)).length;
    $('#metricQueue').textContent = remaining;
    $('#metricCallbacks').textContent = callbacks;
    $('#metricMissed').textContent = missed;

    const sampleOnly = state.contacts.length && state.contacts.every(c => c.sample);
    $('#homeSummary').textContent = sampleOnly
      ? `${state.contacts.length} demo contacts are loaded. Import your XLSX when you’re ready.`
      : `${remaining} contact${remaining === 1 ? '' : 's'} remain in your queue${callbacks ? `, including ${callbacks} callback${callbacks === 1 ? '' : 's'}` : ''}.`;

    const lines = $('#activeLines');
    if (!state.activeLines.length) {
      lines.innerHTML = '<div class="empty-line">No active lines. FaceTime, TextNow and phone calls remain external; Jitsi can run inside Diala.</div>';
    } else {
      lines.innerHTML = state.activeLines.slice(0, 4).map(line => {
        const c = getContact(line.contactId) || { name: line.contactName || 'Contact' };
        const stateClass = line.state === 'Connected' ? 'connected' : '';
        return `<div class="line-card" data-line-id="${escapeHtml(line.id)}">
          <div class="line-avatar" data-contact-image="${escapeHtml(c.id || '')}">${escapeHtml(initials(c.name))}</div>
          <div class="line-copy"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(line.channel)} • ${escapeHtml(line.state)} • ${formatRelative(line.startedAt)}</span></div>
          <span class="line-state ${stateClass}">${escapeHtml(line.state)}</span>
          <div class="line-actions"><button data-line-finish="${escapeHtml(line.id)}" aria-label="Finish line">×</button></div>
        </div>`;
      }).join('');
    }

    const c = nextContact();
    const target = $('#nextContactCard');
    if (!c) target.innerHTML = '<div style="color:var(--muted);font-size:13px">Import a spreadsheet to start your queue.</div>';
    else target.innerHTML = `<div class="feature-top">
        <div class="contact-avatar" data-contact-image="${escapeHtml(c.id)}">${escapeHtml(initials(c.name))}</div>
        <div class="copy"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml([c.phone, c.zip && `ZIP ${c.zip}`].filter(Boolean).join(' • '))}</span></div>
        <span class="status-tag ${statusClass(c.status)}">${escapeHtml(c.status)}</span>
      </div>
      <div class="feature-actions"><button class="secondary-button compact" data-open-contact="${escapeHtml(c.id)}" type="button">Details</button><button class="primary-button compact" data-call-contact="${escapeHtml(c.id)}" type="button">Call</button></div>`;
  }

  function statusClass(status = '') {
    const s = status.toLowerCase();
    if (s === 'callback') return 'callback';
    if (s === 'reached') return 'reached';
    if (s === 'do not contact') return 'dnc';
    return '';
  }

  function renderQueue() {
    const list = $('#contactList');
    const contacts = filteredContacts();
    if (!contacts.length) {
      list.innerHTML = '<div class="empty-line">No contacts match this view.</div>';
    } else {
      list.innerHTML = contacts.map(c => `<div class="contact-row ${state.selected.has(c.id) ? 'selected' : ''}" data-contact-row="${escapeHtml(c.id)}">
        <button class="contact-check" data-select-contact="${escapeHtml(c.id)}" type="button" aria-label="Select ${escapeHtml(c.name)}"><svg viewBox="0 0 24 24"><path d="m9.4 17.2-4.1-4.1 1.4-1.4 2.7 2.7 7.9-7.9 1.4 1.4-9.3 9.3Z"/></svg></button>
        <div class="contact-avatar" data-contact-image="${escapeHtml(c.id)}">${escapeHtml(initials(c.name))}</div>
        <button class="contact-main" data-open-contact="${escapeHtml(c.id)}" type="button"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml([c.phone, c.zip && `ZIP ${c.zip}`, c.imageName && 'Photo matched'].filter(Boolean).join(' • '))}</span></button>
        <span class="status-tag ${statusClass(c.status)}">${escapeHtml(c.status)}</span>
      </div>`).join('');
    }
    $('#selectedCount').textContent = `${state.selected.size} selected`;
    $('#queueFilterButton').title = `Filter: ${state.queueFilter}`;
    hydrateImages();
  }

  async function hydrateImages(root = document) {
    const nodes = $$('[data-contact-image]', root);
    await Promise.all(nodes.map(async el => {
      const id = el.dataset.contactImage;
      if (!id) return;
      try {
        const blob = await getMedia(`contact:${id}`);
        if (!blob || !document.body.contains(el)) return;
        const url = URL.createObjectURL(blob);
        el.innerHTML = `<img alt="" src="${url}">`;
        const img = $('img', el);
        img?.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 1000), { once: true });
      } catch (_) {}
    }));
  }

  function renderCompose() {
    $('#messageTemplate').value = state.messageTemplate;
    const select = $('#previewContactSelect');
    const validPreview = getContact(state.previewContactId) || state.contacts[0];
    if (validPreview) state.previewContactId = validPreview.id;
    select.innerHTML = state.contacts.length
      ? state.contacts.map(c => `<option value="${escapeHtml(c.id)}" ${c.id === state.previewContactId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')
      : '<option value="">No contacts</option>';
    const c = getContact(state.previewContactId);
    $('#messagePreview').textContent = c ? template(state.messageTemplate, c) : 'Import contacts to preview a message.';
    renderReview();
  }

  function renderReview() {
    const list = $('#reviewList');
    if (!state.prepared.length) {
      list.innerHTML = '<div class="empty-line">Nothing prepared yet. Select contacts in Queue and tap Prepare.</div>';
      return;
    }
    list.innerHTML = state.prepared.map(item => {
      const c = getContact(item.contactId);
      if (!c) return '';
      return `<article class="review-item"><div class="review-item-head"><strong>${escapeHtml(c.name)}</strong><span class="status-tag">${escapeHtml(c.phone || 'No phone')}</span></div><p>${escapeHtml(item.message)}</p><div class="review-actions"><button class="secondary-button compact" data-review-contact="${escapeHtml(c.id)}" type="button">Edit</button><button class="primary-button compact" data-share-prepared="${escapeHtml(c.id)}" type="button">Share / send</button></div></article>`;
    }).join('');
  }

  function renderScript() { $('#scriptEditor').value = state.script; }

  function renderChat() {
    const thread = $('#chatThread');
    thread.innerHTML = state.chat.map(m => `<div class="chat-bubble ${m.role === 'user' ? 'user' : 'assistant'}">${escapeHtml(m.text)}${m.meta ? `<div class="chat-meta">${escapeHtml(m.meta)}</div>` : ''}</div>`).join('');
    if (state.currentView === 'assistant') requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    renderPendingAction();
  }

  function renderPendingAction() {
    const bar = $('#pendingActionBar');
    const action = state.pendingAction;
    if (!action) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    bar.classList.remove('hidden');
    bar.innerHTML = `<span>${escapeHtml(action.label)}</span><button class="secondary-button compact" data-dismiss-action type="button">Cancel</button><button class="primary-button compact" data-run-action type="button">Continue</button>`;
  }

  function renderSettings() {
    $('#nameSetting').value = state.profileName;
    $('#modelSetting').value = state.aiModel;
    $('#ttsToggle').checked = !!state.tts;
    $('#preferredChannel').value = state.preferredChannel;
    $('#paidProvidersToggle').checked = !!state.showPaidProviders;
    $('#providerEndpoint').value = state.providerEndpoint || '';
    $('#themeSetting').value = state.theme;
    $('#notificationStatus').textContent = Notification.permission === 'granted' ? 'Permission granted. Server push still needs a backend.' : 'Required for future server push.';
    updatePuterStatus();
  }

  function renderAll() {
    updateGreeting();
    renderHome();
    renderQueue();
    renderCompose();
    renderScript();
    renderChat();
    renderSettings();
    hydrateImages();
  }

  function switchView(view) {
    state.currentView = view;
    $$('.view').forEach(el => el.classList.toggle('active', el.dataset.view === view));
    $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.viewTarget === view));
    if (view === 'assistant') renderChat();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function openSheet(sheet) {
    $('#sheetBackdrop').classList.remove('hidden');
    sheet.classList.remove('hidden');
    sheet.setAttribute('aria-hidden', 'false');
  }

  function closeSheets() {
    $('#sheetBackdrop').classList.add('hidden');
    $$('.sheet').forEach(s => { s.classList.add('hidden'); s.setAttribute('aria-hidden', 'true'); });
  }

  function openContactSheet(id) {
    const c = getContact(id);
    if (!c) return;
    state.activeContactId = id;
    const content = $('#contactSheetContent');
    const events = (c.history || []).slice(0, 8);
    content.innerHTML = `<div class="contact-sheet-hero"><div class="contact-avatar" data-contact-image="${escapeHtml(c.id)}">${escapeHtml(initials(c.name))}</div><div><h2>${escapeHtml(c.name)}</h2><p>${escapeHtml([c.phone, c.status].filter(Boolean).join(' • '))}</p></div></div>
      <div class="detail-grid"><div class="detail-cell"><small>Phone</small><strong>${escapeHtml(c.phone || '—')}</strong></div><div class="detail-cell"><small>ZIP</small><strong>${escapeHtml(c.zip || '—')}</strong></div><div class="detail-cell"><small>Address</small><strong>${escapeHtml(c.address || '—')}</strong></div><div class="detail-cell"><small>City / State</small><strong>${escapeHtml([c.city, c.state].filter(Boolean).join(', ') || '—')}</strong></div></div>
      <div class="contact-action-grid"><button class="primary" data-call-contact="${escapeHtml(c.id)}" type="button">Choose call method</button><button data-prepare-one="${escapeHtml(c.id)}" type="button">Prepare message</button><button data-share-one="${escapeHtml(c.id)}" type="button">Share draft</button><label class="secondary-button compact file-button" style="min-height:46px">Set photo<input data-contact-photo="${escapeHtml(c.id)}" type="file" accept="image/*" hidden></label></div>
      <p class="eyebrow" style="margin-top:14px">DISPOSITION</p><div class="disposition-row">${['New','Callback','No Answer','Reached','Do Not Contact'].map(s => `<button data-disposition="${escapeHtml(s)}" data-id="${escapeHtml(c.id)}" type="button">${escapeHtml(s)}</button>`).join('')}</div>
      <label class="field-label">Notes</label><textarea class="contact-notes" data-notes-for="${escapeHtml(c.id)}" placeholder="Notes about this contact…">${escapeHtml(c.notes || '')}</textarea>
      <p class="eyebrow" style="margin-top:16px">RECENT ACTIVITY</p><div class="timeline">${events.length ? events.map(e => `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${escapeHtml(e.text)}</strong><br>${escapeHtml(formatTime(e.at))}</div></div>`).join('') : '<div class="timeline-item">No activity yet.</div>'}</div>`;
    openSheet($('#contactSheet'));
    hydrateImages(content);
  }

  function openCallChooser(id) {
    const c = getContact(id);
    if (!c) return;
    state.activeContactId = id;
    $('#callChooserContact').innerHTML = `<strong>${escapeHtml(c.name)}</strong><div style="font-size:12px;color:var(--muted);margin-top:4px">${escapeHtml(c.phone || 'No phone number')}</div>`;
    const channels = [
      { id: 'facetime', icon: 'F', name: 'FaceTime video', note: 'Opens Apple FaceTime. Diala cannot monitor the call.' },
      { id: 'facetime-audio', icon: 'A', name: 'FaceTime audio', note: 'Opens FaceTime Audio on Apple devices.' },
      { id: 'textnow', icon: 'T', name: 'TextNow bridge', note: 'Copies the prepared draft and opens TextNow.' },
      { id: 'meet', icon: 'M', name: 'Google Meet', note: 'Opens a new Meet room in Google.' },
      { id: 'jitsi', icon: 'J', name: 'Jitsi meeting', note: 'Free web conference inside Diala.' },
      { id: 'tel', icon: '☎', name: 'Phone', note: 'Uses the device phone dialer.' },
      { id: 'sms', icon: '✉', name: 'Messages', note: 'Opens the device SMS composer with your draft.' }
    ];
    if (state.showPaidProviders) channels.push({ id: 'provider', icon: 'P', name: 'Provider backend', note: state.providerEndpoint ? 'Uses your configured backend endpoint.' : 'Configure an endpoint in Settings first.' });
    $('#callChannelList').innerHTML = channels.map(ch => `<button class="channel-button" data-channel="${escapeHtml(ch.id)}" type="button"><span class="channel-icon">${escapeHtml(ch.icon)}</span><span><strong>${escapeHtml(ch.name)}</strong><small>${escapeHtml(ch.note)}</small></span><span class="chev">›</span></button>`).join('');
    $('#callChooser').classList.remove('hidden');
  }

  function closeModal() { $('#callChooser').classList.add('hidden'); }

  function addActiveLine(contactId, channel, lineState = 'External') {
    const c = getContact(contactId);
    if (!c) return;
    state.activeLines = state.activeLines.filter(l => l.contactId !== contactId);
    state.activeLines.unshift({ id: uid(), contactId, contactName: c.name, channel, state: lineState, startedAt: nowISO() });
    state.activeLines = state.activeLines.slice(0, 4);
    addHistory(contactId, 'call', `${channel} started (${lineState.toLowerCase()}).`);
    saveState();
    renderHome();
  }

