  function bindEvents() {
    $$('.nav-item').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.viewTarget)));
    $$('[data-jump]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.jump)));
    $('#settingsButton').addEventListener('click', () => { renderSettings(); openSheet($('#settingsSheet')); });
    $('#sheetBackdrop').addEventListener('click', closeSheets);
    $$('[data-close-sheet]').forEach(btn => btn.addEventListener('click', closeSheets));
    $$('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));
    $('#callChooser').addEventListener('click', e => { if (e.target === $('#callChooser')) closeModal(); });
    $('#closeJitsiButton').addEventListener('click', closeJitsi);

    $('#voiceButton').addEventListener('click', () => startRecognition('assistant'));
    $('#chatMicButton').addEventListener('click', () => startRecognition('chat'));
    $('#newCallButton').addEventListener('click', () => { const c = nextContact(); c ? openCallChooser(c.id) : toast('Import contacts first.'); });

    $('#xlsxInput').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) importWorkbook(f); e.target.value = ''; });
    $('#bulkImagesInput').addEventListener('change', e => { if (e.target.files?.length) matchImages([...e.target.files]); e.target.value = ''; });
    $('#contactSearch').addEventListener('input', renderQueue);
    $('#queueFilterButton').addEventListener('click', () => {
      const cycle = ['all','new','callback','no answer','reached','do not contact'];
      state.queueFilter = cycle[(cycle.indexOf(state.queueFilter) + 1) % cycle.length];
      toast(`Filter: ${state.queueFilter}`); renderQueue();
    });
    $('#selectAllButton').addEventListener('click', () => { filteredContacts().forEach(c => state.selected.add(c.id)); renderQueue(); });
    $('#prepareSelectedButton').addEventListener('click', () => {
      if (!state.selected.size) return toast('Select at least one contact.');
      prepareContacts([...state.selected]);
    });

    $('#messageTemplate').addEventListener('input', e => { state.messageTemplate = e.target.value; const c = getContact(state.previewContactId); $('#messagePreview').textContent = c ? template(state.messageTemplate, c) : ''; });
    $('#saveTemplateButton').addEventListener('click', () => { state.messageTemplate = $('#messageTemplate').value; saveState(); renderCompose(); toast('Message template saved.'); });
    $('#previewContactSelect').addEventListener('change', async e => { state.previewContactId = e.target.value; renderCompose(); await loadStoredAIImage(state.previewContactId); });
    $$('.token-row button').forEach(btn => btn.addEventListener('click', () => {
      const ta = $('#messageTemplate'); const start = ta.selectionStart, end = ta.selectionEnd; ta.setRangeText(btn.dataset.token, start, end, 'end'); ta.dispatchEvent(new Event('input'));
    }));
    $$('[data-compose-mode]').forEach(btn => btn.addEventListener('click', () => {
      $$('[data-compose-mode]').forEach(b => b.classList.toggle('active', b === btn));
      $$('[data-compose-panel]').forEach(p => p.classList.toggle('active', p.dataset.composePanel === btn.dataset.composeMode));
    }));
    $('#renderCardButton').addEventListener('click', async () => { const c = getContact(state.previewContactId); if (!c) return toast('Choose a contact first.'); await loadStoredAIImage(c.id); await drawCard(c); });
    $('#generateAiImageButton').addEventListener('click', () => generateAIImage(getContact(state.previewContactId)));
    $('#downloadCardButton').addEventListener('click', async () => {
      const c = getContact(state.previewContactId); if (!c) return toast('Choose a contact first.');
      const blob = await makeCardBlob(c); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${safeFilename(c.name)}-diala.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    $('#shareCardButton').addEventListener('click', () => { const c = getContact(state.previewContactId); c ? sharePrepared(c.id) : toast('Choose a contact first.'); });

    $('#saveScriptButton').addEventListener('click', () => { state.script = $('#scriptEditor').value; saveState(); toast('Script saved.'); });
    $('#scriptEditor').addEventListener('change', () => { state.script = $('#scriptEditor').value; saveState(); });

    $('#chatForm').addEventListener('submit', e => { e.preventDefault(); const input = $('#chatInput'); const text = input.value.trim(); if (!text) return; input.value = ''; askAI(text); });
    $('#chatInput').addEventListener('input', e => { e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`; });
    $('#clearChatButton').addEventListener('click', () => { state.chat = structuredClone(defaults.chat); saveState(); renderChat(); });

    $('#nameSetting').addEventListener('change', e => { state.profileName = e.target.value.trim() || 'Mr. Douglas'; saveState(); updateGreeting(); });
    $('#modelSetting').addEventListener('change', e => { state.aiModel = e.target.value; saveState(); });
    $('#ttsToggle').addEventListener('change', e => { state.tts = e.target.checked; saveState(); });
    $('#preferredChannel').addEventListener('change', e => { state.preferredChannel = e.target.value; saveState(); });
    $('#paidProvidersToggle').addEventListener('change', e => { state.showPaidProviders = e.target.checked; saveState(); });
    $('#providerEndpoint').addEventListener('change', e => { state.providerEndpoint = e.target.value.trim(); saveState(); });
    $('#themeSetting').addEventListener('change', e => { state.theme = e.target.value; saveState(); applyTheme(); });
    $('#puterConnectButton').addEventListener('click', connectPuter);
    $('#notificationButton').addEventListener('click', requestNotifications);
    $('#resetDataButton').addEventListener('click', async () => {
      if (!confirm('Reset Diala local data on this device?')) return;
      localStorage.removeItem(STORAGE_KEY); await clearMedia().catch(() => {}); location.reload();
    });

    document.addEventListener('click', e => {
      const select = e.target.closest('[data-select-contact]');
      if (select) { const id = select.dataset.selectContact; state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id); renderQueue(); return; }
      const open = e.target.closest('[data-open-contact]'); if (open) { openContactSheet(open.dataset.openContact); return; }
      const call = e.target.closest('[data-call-contact]'); if (call) { openCallChooser(call.dataset.callContact); return; }
      const finish = e.target.closest('[data-line-finish]'); if (finish) { finishLine(finish.dataset.lineFinish); return; }
      const channel = e.target.closest('[data-channel]'); if (channel) { runChannel(state.activeContactId, channel.dataset.channel); return; }
      const prep = e.target.closest('[data-prepare-one]'); if (prep) { prepareContacts([prep.dataset.prepareOne]); closeSheets(); return; }
      const share = e.target.closest('[data-share-one]'); if (share) { sharePrepared(share.dataset.shareOne); return; }
      const disp = e.target.closest('[data-disposition]'); if (disp) { setDisposition(disp.dataset.id, disp.dataset.disposition); return; }
      const review = e.target.closest('[data-review-contact]'); if (review) { state.previewContactId = review.dataset.reviewContact; renderCompose(); $$('[data-compose-mode]').forEach(b => b.classList.toggle('active', b.dataset.composeMode === 'message')); $$('[data-compose-panel]').forEach(p => p.classList.toggle('active', p.dataset.composePanel === 'message')); return; }
      const sharePreparedBtn = e.target.closest('[data-share-prepared]'); if (sharePreparedBtn) { sharePrepared(sharePreparedBtn.dataset.sharePrepared); return; }
      if (e.target.closest('[data-run-action]')) { runPendingAction(); return; }
      if (e.target.closest('[data-dismiss-action]')) { state.pendingAction = null; renderPendingAction(); return; }
      const metricFilter = e.target.closest('[data-filter]'); if (metricFilter) { switchView('queue'); state.queueFilter = metricFilter.dataset.filter === 'callback' ? 'callback' : 'all'; renderQueue(); return; }
    });

    document.addEventListener('change', async e => {
      if (e.target.matches('[data-contact-photo]')) {
        const file = e.target.files?.[0]; const id = e.target.dataset.contactPhoto; const c = getContact(id);
        if (file && c) { await putMedia(`contact:${id}`, file); c.imageName = file.name; saveState(); openContactSheet(id); renderAll(); toast(`Photo assigned to ${c.name}.`); }
      }
      if (e.target.matches('[data-notes-for]')) {
        const c = getContact(e.target.dataset.notesFor); if (c) { c.notes = e.target.value; saveState(); }
      }
    });
  }

  async function initPWA() {
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./sw.js'); } catch (err) { console.debug('Service worker registration failed', err); }
    }
  }

  function init() {
    applyTheme();
    bindEvents();
    renderAll();
    initPWA();
    setInterval(() => { if (state.currentView === 'home') renderHome(); }, 30_000);
  }

  init();
