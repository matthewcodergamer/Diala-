  function addChat(role, text, meta = '') {
    state.chat.push({ role, text: String(text || ''), meta });
    state.chat = state.chat.slice(-80);
    saveState(); renderChat();
  }

  function responseText(response) {
    if (typeof response === 'string') return response;
    const content = response?.message?.content ?? response?.content ?? response?.text;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map(x => x?.text || '').join('');
    return String(response?.message?.text || 'Done.');
  }

  const aiTools = [
    { type: 'function', function: { name: 'find_contact', description: 'Find a contact in the current Diala contact list by name, phone, ZIP or address.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'next_lead', description: 'Get and focus the next contact in the call queue.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'prepare_message', description: 'Prepare a personalized message draft for a contact. This does not send it.', parameters: { type: 'object', properties: { contact: { type: 'string' } }, required: ['contact'] } } },
    { type: 'function', function: { name: 'open_channel', description: 'Prepare an action to open a communication channel for a contact. The user must tap Continue before the external channel opens.', parameters: { type: 'object', properties: { contact: { type: 'string' }, channel: { type: 'string', enum: ['facetime','facetime-audio','textnow','meet','jitsi','tel','sms','auto'] } }, required: ['contact','channel'] } } },
    { type: 'function', function: { name: 'show_script', description: 'Open the current call script in Diala.', parameters: { type: 'object', properties: { contact: { type: 'string' } } } } },
    { type: 'function', function: { name: 'update_disposition', description: 'Update a contact CRM disposition when the user explicitly asks to mark a result.', parameters: { type: 'object', properties: { contact: { type: 'string' }, disposition: { type: 'string', enum: ['New','Callback','No Answer','Reached','Do Not Contact'] } }, required: ['contact','disposition'] } } },
    { type: 'function', function: { name: 'generate_personalized_image', description: 'Open the personalized image workflow for a contact. This does not send the image.', parameters: { type: 'object', properties: { contact: { type: 'string' } }, required: ['contact'] } } },
    { type: 'function', function: { name: 'read_missed_calls', description: 'Summarize locally recorded missed/no-answer events from Diala. This cannot read private FaceTime or TextNow history.', parameters: { type: 'object', properties: {} } } }
  ];

  async function executeTool(name, args = {}) {
    if (name === 'find_contact') {
      const c = findContact(args.query);
      if (!c) return `No contact matched “${args.query}”.`;
      state.previewContactId = c.id; openContactSheet(c.id);
      return `${c.name}: ${c.phone || 'no phone'}, ZIP ${c.zip || 'unknown'}, status ${c.status}.`;
    }
    if (name === 'next_lead') {
      const c = nextContact(); if (!c) return 'The queue is empty.';
      state.previewContactId = c.id; openContactSheet(c.id);
      return `Next is ${c.name}, ${c.phone || 'no phone'}, ZIP ${c.zip || 'unknown'}, status ${c.status}.`;
    }
    if (name === 'prepare_message') {
      const c = findContact(args.contact); if (!c) return `No contact matched ${args.contact}.`;
      state.prepared = [{ contactId: c.id, message: template(state.messageTemplate, c), preparedAt: nowISO() }];
      state.previewContactId = c.id; saveState(); renderReview(); switchView('compose');
      $$('[data-compose-mode]').forEach(b => b.classList.toggle('active', b.dataset.composeMode === 'review'));
      $$('[data-compose-panel]').forEach(p => p.classList.toggle('active', p.dataset.composePanel === 'review'));
      return `Prepared a draft for ${c.name}. It is waiting in Review and has not been sent.`;
    }
    if (name === 'open_channel') {
      const c = findContact(args.contact); if (!c) return `No contact matched ${args.contact}.`;
      const channel = args.channel === 'auto' ? state.preferredChannel === 'auto' ? 'chooser' : state.preferredChannel : args.channel;
      state.pendingAction = { type: 'channel', contactId: c.id, channel, label: channel === 'chooser' ? `Choose how to contact ${c.name}` : `Open ${channelLabel(channel)} for ${c.name}` };
      renderPendingAction();
      return `I prepared ${channel === 'chooser' ? 'the channel chooser' : channelLabel(channel)} for ${c.name}. Tap Continue to open it.`;
    }
    if (name === 'show_script') {
      const c = args.contact ? findContact(args.contact) : null;
      switchView('script');
      if (c) {
        state.previewContactId = c.id;
        $('#scriptEditor').value = template(state.script, c);
        return `Showing the script with ${c.name}’s details filled in. The saved master template is unchanged.`;
      }
      return 'Showing your call script.';
    }
    if (name === 'update_disposition') {
      const c = findContact(args.contact); if (!c) return `No contact matched ${args.contact}.`;
      setDisposition(c.id, args.disposition);
      return `${c.name} is now marked ${args.disposition}.`;
    }
    if (name === 'generate_personalized_image') {
      const c = findContact(args.contact); if (!c) return `No contact matched ${args.contact}.`;
      state.previewContactId = c.id; switchView('compose');
      $$('[data-compose-mode]').forEach(b => b.classList.toggle('active', b.dataset.composeMode === 'image'));
      $$('[data-compose-panel]').forEach(p => p.classList.toggle('active', p.dataset.composePanel === 'image'));
      await loadStoredAIImage(c.id); await drawCard(c);
      return `Opened ${c.name}’s personalized image preview. You can render locally or generate an AI background.`;
    }
    if (name === 'read_missed_calls') {
      const misses = [];
      state.contacts.forEach(c => (c.history || []).forEach(h => { if (h.type === 'missed' || /no answer/i.test(h.text)) misses.push({ c, h }); }));
      misses.sort((a, b) => new Date(b.h.at) - new Date(a.h.at));
      if (!misses.length) return 'No missed/no-answer events are recorded in Diala.';
      return misses.slice(0, 8).map(x => `${x.c.name} at ${formatTime(x.h.at)}: ${x.h.text}`).join('\n');
    }
    return 'That action is not implemented.';
  }

  function channelLabel(channel) {
    return ({ facetime:'FaceTime', 'facetime-audio':'FaceTime Audio', textnow:'TextNow', meet:'Google Meet', jitsi:'Jitsi', tel:'Phone', sms:'Messages', provider:'provider backend' })[channel] || channel;
  }

  async function askAI(userText) {
    const text = String(userText || '').trim();
    if (!text) return;
    addChat('user', text);
    switchView('assistant');
    $('#assistantStatus').textContent = 'Thinking…';
    try {
      if (!window.puter?.ai?.chat) throw new Error('Puter unavailable');
      const system = `You are Diala, a concise professional AI call-desk assistant inside a user-controlled browser app. Be helpful and natural. Use tools when the user asks to find contacts, prepare drafts, navigate, update dispositions, or open calling/messaging channels. Do not ask for the whole contact list: contact lookup happens locally through tools. Never claim FaceTime/TextNow/private iPhone history can be read. Never claim a message or image was sent unless a configured provider explicitly returned success; prepare it instead. External calling actions require the user to tap Continue. Diala currently has ${state.contacts.length} contacts stored locally.`;
      const response = await puter.ai.chat([
        { role: 'system', content: system },
        ...state.chat.slice(-12, -1).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
        { role: 'user', content: text }
      ], { model: state.aiModel, tools: aiTools, temperature: 0.25 });

      const calls = response?.message?.tool_calls || [];
      if (calls.length) {
        const toolMessages = [];
        for (const call of calls.slice(0, 3)) {
          const args = JSON.parse(call.function.arguments || '{}');
          const result = await executeTool(call.function.name, args);
          toolMessages.push({ role: 'tool', tool_call_id: call.id, content: result });
        }
        const final = await puter.ai.chat([
          { role: 'system', content: system },
          { role: 'user', content: text },
          response.message,
          ...toolMessages
        ], { model: state.aiModel, temperature: 0.25 });
        const finalText = responseText(final) || toolMessages.map(m => m.content).join('\n');
        addChat('assistant', finalText);
        $('#assistantPrompt').textContent = finalText.split(/[.!?]/)[0].slice(0, 60) || 'Done';
        if (state.tts) speak(finalText);
      } else {
        const finalText = responseText(response);
        addChat('assistant', finalText);
        $('#assistantPrompt').textContent = finalText.split(/[.!?]/)[0].slice(0, 60) || 'Done';
        if (state.tts) speak(finalText);
      }
    } catch (err) {
      console.error(err);
      const fallback = localCommand(text);
      addChat('assistant', fallback, 'Local fallback');
      if (state.tts) speak(fallback);
    } finally {
      $('#assistantStatus').textContent = 'Tap the microphone and speak naturally.';
    }
  }

  function localCommand(text) {
    const lower = text.toLowerCase();
    if (lower.includes('next')) {
      const c = nextContact(); if (!c) return 'Your queue is empty.';
      openContactSheet(c.id); return `Next is ${c.name}.`;
    }
    if (lower.includes('script')) { switchView('script'); return 'I opened your call script.'; }
    if (lower.includes('missed')) {
      const count = state.contacts.reduce((n,c)=>n+(c.history||[]).filter(h=>h.type==='missed').length,0);
      return count ? `${count} missed events are recorded locally in Diala.` : 'No missed events are recorded locally in Diala.';
    }
    const c = state.contacts.find(contact => lower.includes(contact.name.toLowerCase().split(' ')[0]));
    if (c && (lower.includes('call') || lower.includes('facetime') || lower.includes('text'))) {
      state.pendingAction = { type:'channel', contactId:c.id, channel:'chooser', label:`Choose how to contact ${c.name}` }; renderPendingAction();
      return `I found ${c.name}. Tap Continue to choose FaceTime, TextNow, Meet, Jitsi, Phone or Messages.`;
    }
    return 'AI is unavailable right now, but the local call desk still works. You can import contacts, open a contact, prepare messages, use FaceTime/TextNow/Meet/Jitsi, and render personalized images.';
  }

  async function speak(text) {
    const clean = String(text || '').replace(/https?:\/\/\S+/g, '').slice(0, 1200);
    if (!clean) return;
    try {
      if (window.puter?.ai?.txt2speech) {
        const audio = await puter.ai.txt2speech(clean);
        if (audio?.play) { await audio.play(); return; }
      }
    } catch (err) { console.debug('Puter TTS fallback', err); }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = .96; utterance.pitch = 1;
      const voices = speechSynthesis.getVoices();
      const preferred = voices.find(v => /samantha|ava|allison|daniel|serena/i.test(v.name)) || voices.find(v => /en-US|en_GB|en-US/i.test(v.lang));
      if (preferred) utterance.voice = preferred;
      speechSynthesis.speak(utterance);
    }
  }

  function startRecognition(target = 'assistant') {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Speech recognition is unavailable in this browser. Type your request instead.'); switchView('assistant'); return; }
    try { state.recognition?.abort(); } catch (_) {}
    const recognition = new SR();
    recognition.lang = 'en-US'; recognition.interimResults = true; recognition.continuous = false;
    state.recognition = recognition; state.recognitionTarget = target;
    const voiceButtons = [$('#voiceButton'), $('#chatMicButton')];
    recognition.onstart = () => { voiceButtons.forEach(b => b?.classList.add('listening')); $('#assistantStatus').textContent = 'Listening…'; };
    recognition.onresult = event => {
      const text = [...event.results].map(r => r[0].transcript).join(' ');
      if (target === 'chat') $('#chatInput').value = text;
      $('#assistantPrompt').textContent = text || 'Listening…';
      const last = event.results[event.results.length - 1];
      if (last.isFinal) {
        if (target === 'chat') { $('#chatInput').value = ''; askAI(text); }
        else askAI(text);
      }
    };
    recognition.onerror = e => { if (e.error !== 'aborted') toast(`Voice input: ${e.error}.`); };
    recognition.onend = () => { voiceButtons.forEach(b => b?.classList.remove('listening')); $('#assistantStatus').textContent = 'Tap the microphone and speak naturally.'; };
    recognition.start();
  }

  async function updatePuterStatus() {
    const target = $('#puterStatus');
    try {
      const signed = await Promise.resolve(window.puter?.auth?.isSignedIn?.());
      target.textContent = signed ? 'Connected. AI usage is billed to your Puter account.' : 'AI will ask you to sign in when needed.';
    } catch (_) { target.textContent = 'AI will ask you to sign in when needed.'; }
  }

  async function connectPuter() {
    try {
      if (!window.puter?.auth?.signIn) return toast('Puter is still loading.');
      await puter.auth.signIn(); updatePuterStatus(); toast('Puter connected.');
    } catch (err) { console.error(err); toast('Puter sign-in was not completed.'); }
  }

  async function requestNotifications() {
    if (!('Notification' in window)) return toast('Notifications are unavailable in this browser.');
    const result = await Notification.requestPermission();
    renderSettings();
    toast(result === 'granted' ? 'Notification permission enabled. Real background push still requires a server.' : 'Notifications were not enabled.');
  }

  function runPendingAction() {
    const a = state.pendingAction; state.pendingAction = null; renderPendingAction();
    if (!a) return;
    if (a.type === 'channel') {
      if (a.channel === 'chooser') openCallChooser(a.contactId);
      else runChannel(a.contactId, a.channel);
    }
  }

