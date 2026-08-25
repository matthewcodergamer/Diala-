  function renderHome(){
    const callbacks=state.contacts.filter(c=>c.status==='Callback').length;
    const missed=state.contacts.reduce((sum,c)=>sum+(c.history||[]).filter(h=>h.type==='missed').length,0);
    const remaining=state.contacts.filter(c=>!['Reached','Do Not Contact'].includes(c.status)).length;
    $('#metricQueue').textContent=remaining;$('#metricCallbacks').textContent=callbacks;$('#metricMissed').textContent=missed;
    const g=renderGoals(); const sampleOnly=state.contacts.length&&state.contacts.every(c=>c.sample);
    $('#homeSummary').textContent=sampleOnly?`${state.contacts.length} demo contacts are ready. Import your list when you’re ready.`:`${remaining} contact${remaining===1?'':'s'} remain. ${g.remainingGoal?`${g.remainingGoal} more count toward today’s goal.`:'Today’s goal is complete.'}`;
    if(!state.voiceSessionActive&&!state.assistantThinking&&!state.assistantSpeaking){
      $('#assistantPrompt').textContent=`I’m ${state.assistantName}. What would you like to get done?`;
      $('#voiceReply').textContent='Tap the orb once, then speak naturally.';
    }

    const lines=$('#activeLines');
    if(!state.activeLines.length) lines.innerHTML='<div class="empty-line">No active lines. Provider-backed calls can support true hold and multi-line control; app handoffs remain external.</div>';
    else lines.innerHTML=state.activeLines.slice(0,4).map(line=>{const c=getContact(line.contactId)||{name:line.contactName||'Contact'};const providerControls=line.channel==='Provider'?`<button data-provider-line-action="${line.held?'resume_call':'hold_call'}" data-line-id="${escapeHtml(line.id)}">${line.held?'Resume':'Hold'}</button><button data-provider-line-action="${line.muted?'unmute_call':'mute_call'}" data-line-id="${escapeHtml(line.id)}">${line.muted?'Unmute':'Mute'}</button>`:'';return `<div class="line-card"><div class="line-avatar" data-contact-image="${escapeHtml(c.id||'')}">${escapeHtml(initials(c.name))}</div><div class="line-copy"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(line.channel)} • ${escapeHtml(line.state)}${line.muted?' • Muted':''} • ${formatRelative(line.startedAt)}</span></div><span class="line-state ${line.state==='Connected'?'connected':''}">${escapeHtml(line.state)}</span><div class="line-actions">${providerControls}<button data-line-finish="${escapeHtml(line.id)}" aria-label="Finish line">×</button></div></div>`;}).join('');

    const c=nextContact(),target=$('#nextContactCard');
    if(!c)target.innerHTML='<div class="empty-line">Import contacts to start your queue.</div>';
    else target.innerHTML=`<div class="feature-top"><div class="contact-avatar" data-contact-image="${escapeHtml(c.id)}">${escapeHtml(initials(c.name))}</div><div class="copy"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml([c.phone,c.zip&&`ZIP ${c.zip}`].filter(Boolean).join(' • '))}</span></div><span class="status-tag ${statusClass(c.status)}">${escapeHtml(c.status)}</span></div><div class="feature-actions"><button class="secondary-button compact" data-open-contact="${escapeHtml(c.id)}">Details</button><button class="primary-button compact" data-call-contact="${escapeHtml(c.id)}">Call</button></div>`;
    hydrateImages(); renderVoiceState();
  }

  function renderQueue(){
    const list=$('#contactList'),contacts=filteredContacts();
    if(!contacts.length)list.innerHTML='<div class="empty-line">No contacts match this view.</div>';
    else list.innerHTML=contacts.map(c=>`<div class="contact-row ${state.selected.has(c.id)?'selected':''}"><button class="contact-check" data-select-contact="${escapeHtml(c.id)}" aria-label="Select ${escapeHtml(c.name)}"><svg viewBox="0 0 24 24"><path d="m9.4 17.2-4.1-4.1 1.4-1.4 2.7 2.7 7.9-7.9 1.4 1.4-9.3 9.3Z"/></svg></button><div class="contact-avatar" data-contact-image="${escapeHtml(c.id)}">${escapeHtml(initials(c.name))}</div><button class="contact-main" data-open-contact="${escapeHtml(c.id)}"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml([c.phone,c.zip&&`ZIP ${c.zip}`,c.enrichment?.age&&`Age ${c.enrichment.age}`,c.imageName&&'Photo'].filter(Boolean).join(' • '))}</span></button><span class="status-tag ${statusClass(c.status)}">${escapeHtml(c.status)}</span></div>`).join('');
    $('#selectedCount').textContent=`${state.selected.size} selected`;$('#queueFilterButton').title=`Filter: ${state.queueFilter}`;hydrateImages();
  }

  async function hydrateImages(root=document){
    const nodes=$$('[data-contact-image]',root);await Promise.all(nodes.map(async el=>{const id=el.dataset.contactImage;if(!id)return;try{const blob=await getMedia(`contact:${id}`);if(!blob||!document.body.contains(el))return;const url=URL.createObjectURL(blob);el.innerHTML=`<img alt="" src="${url}">`;const img=$('img',el);img?.addEventListener('load',()=>setTimeout(()=>URL.revokeObjectURL(url),1000),{once:true});}catch(_){}}));
  }

  function renderCompose(){
    $('#messageTemplate').value=state.messageTemplate;const select=$('#previewContactSelect');const valid=getContact(state.previewContactId)||state.contacts[0];if(valid)state.previewContactId=valid.id;
    select.innerHTML=state.contacts.length?state.contacts.map(c=>`<option value="${escapeHtml(c.id)}" ${c.id===state.previewContactId?'selected':''}>${escapeHtml(c.name)}</option>`).join(''):'<option value="">No contacts</option>';
    const c=getContact(state.previewContactId);$('#messagePreview').textContent=c?template(state.messageTemplate,c):'Import contacts to preview a message.';renderReview();
  }
  function renderReview(){const list=$('#reviewList');if(!state.prepared.length){list.innerHTML='<div class="empty-line">Nothing prepared. Select contacts and tap Prepare.</div>';return;}list.innerHTML=state.prepared.map(item=>{const c=getContact(item.contactId);if(!c)return'';return `<article class="review-item"><div class="review-item-head"><strong>${escapeHtml(c.name)}</strong><span class="status-tag">${escapeHtml(c.phone||'No phone')}</span></div><p>${escapeHtml(item.message)}</p><div class="review-actions"><button class="secondary-button compact" data-review-contact="${escapeHtml(c.id)}">Edit</button><button class="primary-button compact" data-share-prepared="${escapeHtml(c.id)}">Share / send</button></div></article>`;}).join('');}
  function renderScript(){ $('#scriptEditor').value=state.script; }
  function renderChat(){const thread=$('#chatThread');thread.innerHTML=state.chat.map(m=>`<div class="chat-bubble ${m.role==='user'?'user':'assistant'}">${escapeHtml(m.text)}${m.meta?`<div class="chat-meta">${escapeHtml(m.meta)}</div>`:''}</div>`).join('');requestAnimationFrame(()=>{thread.scrollTop=thread.scrollHeight;});renderPendingAction();}
  function renderPendingAction(){const bar=$('#pendingActionBar'),a=state.pendingAction;if(!a){bar.classList.add('hidden');bar.innerHTML='';return;}bar.classList.remove('hidden');bar.innerHTML=`<span>${escapeHtml(a.label)}</span><button class="secondary-button compact" data-dismiss-action>Cancel</button><button class="primary-button compact" data-run-action>Continue</button>`;}

  function renderSettings(){
    $('#nameSetting').value=state.profileName;$('#assistantNameSetting').value=state.assistantName;$('#wakePhraseSetting').value=state.wakePhrase;
    $('#alwaysListeningToggle').checked=!!state.alwaysListening;$('#wakePhraseToggle').checked=!!state.requireWakePhrase;$('#modelSetting').value=state.aiModel;$('#ttsToggle').checked=!!state.tts;$('#ttsVoiceSetting').value=state.ttsVoice;
    $('#preferredChannel').value=state.preferredChannel;$('#paidProvidersToggle').checked=!!state.showPaidProviders;$('#providerEndpoint').value=state.providerEndpoint||'';$('#enrichmentEndpoint').value=state.enrichmentEndpoint||'';$('#themeSetting').value=state.theme;
    $('#notificationStatus').textContent=('Notification' in window&&Notification.permission==='granted')?'Permission granted. Background push still requires a sender/server.':'Install to Home Screen, then enable notifications.';updatePuterStatus();
  }
  function renderAll(){updateGreeting();renderHome();renderQueue();renderGoals();renderCompose();renderScript();renderChat();renderSettings();hydrateImages();}

  function switchView(view){state.currentView=view;$$('.view').forEach(el=>el.classList.toggle('active',el.dataset.view===view));$$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.viewTarget===view));if(view==='assistant')renderChat();const v=$(`.view[data-view="${view}"]`);if(v)v.scrollTop=0;}
  function openSheet(sheet){$('#sheetBackdrop').classList.remove('hidden');sheet.classList.remove('hidden');sheet.setAttribute('aria-hidden','false');}
  function closeSheets(){$('#sheetBackdrop').classList.add('hidden');$$('.sheet').forEach(s=>{s.classList.add('hidden');s.setAttribute('aria-hidden','true');});}

