  function enrichmentHtml(c){
    const e=c.enrichment;if(!e)return `<div class="enrichment-card empty"><div><strong>People enrichment</strong><span>Optional. Uses a secure API proxy you configure.</span></div><button class="secondary-button compact" data-enrich-contact="${escapeHtml(c.id)}">Enrich</button></div>`;
    const age=e.age??'—',emails=(e.emails||[]).slice(0,3).join(', ')||'—',phones=(e.phones||[]).slice(0,3).join(', ')||'—',socials=(e.socials||[]).slice(0,2).join(' • ')||'—';
    return `<div class="enrichment-card"><div class="enrichment-head"><div><strong>People enrichment</strong><span>${escapeHtml(e.source||'Provider')} ${e.confidence!=null?`• confidence ${escapeHtml(String(e.confidence))}`:''}</span></div><button class="secondary-button compact" data-enrich-contact="${escapeHtml(c.id)}">Refresh</button></div><div class="enrichment-grid"><div><small>Age</small><strong>${escapeHtml(String(age))}</strong></div><div><small>Company</small><strong>${escapeHtml(e.company||'—')}</strong></div><div class="wide"><small>Other emails</small><strong>${escapeHtml(emails)}</strong></div><div class="wide"><small>Other phones</small><strong>${escapeHtml(phones)}</strong></div><div class="wide"><small>Social / web</small><strong>${escapeHtml(socials)}</strong></div></div><p class="data-caution">Enrichment may be estimated, stale, or wrong. Review it before using it.</p></div>`;
  }

  function openContactSheet(id){
    const c=getContact(id);if(!c)return;state.activeContactId=id;const content=$('#contactSheetContent'),events=(c.history||[]).slice(0,8);
    content.innerHTML=`<div class="contact-sheet-hero"><div class="contact-avatar" data-contact-image="${escapeHtml(c.id)}">${escapeHtml(initials(c.name))}</div><div><h2>${escapeHtml(c.name)}</h2><p>${escapeHtml([c.phone,c.status].filter(Boolean).join(' • '))}</p></div></div><div class="detail-grid"><div class="detail-cell"><small>Phone</small><strong>${escapeHtml(c.phone||'—')}</strong></div><div class="detail-cell"><small>ZIP</small><strong>${escapeHtml(c.zip||'—')}</strong></div><div class="detail-cell"><small>Email</small><strong>${escapeHtml(c.email||'—')}</strong></div><div class="detail-cell"><small>Address</small><strong>${escapeHtml([c.address,c.city,c.state].filter(Boolean).join(', ')||'—')}</strong></div></div><div class="contact-action-grid"><button class="primary" data-call-contact="${escapeHtml(c.id)}">Call / Meet</button><button data-prepare-one="${escapeHtml(c.id)}">Prepare message</button><button data-share-one="${escapeHtml(c.id)}">Share draft</button><label class="secondary-button compact file-button" style="min-height:46px">Set photo<input data-contact-photo="${escapeHtml(c.id)}" type="file" accept="image/*" hidden></label></div>${enrichmentHtml(c)}<p class="eyebrow" style="margin-top:16px">DISPOSITION</p><div class="disposition-row">${['New','Callback','No Answer','Reached','Do Not Contact'].map(s=>`<button data-disposition="${escapeHtml(s)}" data-id="${escapeHtml(c.id)}">${escapeHtml(s)}</button>`).join('')}</div><label class="field-label">Notes</label><textarea class="contact-notes" data-notes-for="${escapeHtml(c.id)}" placeholder="Notes…">${escapeHtml(c.notes||'')}</textarea><p class="eyebrow" style="margin-top:16px">RECENT ACTIVITY</p><div class="timeline">${events.length?events.map(e=>`<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${escapeHtml(e.text)}</strong><br>${escapeHtml(formatTime(e.at))}</div></div>`).join(''):'<div class="timeline-item">No activity yet.</div>'}</div>`;
    openSheet($('#contactSheet'));hydrateImages(content);
  }

  function openCallChooser(id){
    const c=getContact(id);if(!c)return;state.activeContactId=id;$('#callChooserContact').innerHTML=`<strong>${escapeHtml(c.name)}</strong><div class="chooser-sub">${escapeHtml(c.phone||c.email||'No destination')}</div>`;
    const channels=[
      {id:'facetime',icon:'◉',name:'FaceTime video',note:'Opens FaceTime on iPhone.'},{id:'facetime-audio',icon:'◌',name:'FaceTime audio',note:'Opens FaceTime Audio.'},
      {id:'meet',icon:'M',name:'Google Meet',note:'Copies the number, opens Meet; paste into Search contacts.'},
      {id:'textnow',icon:'T',name:'TextNow message',note:'Copies number + draft and tries to open the TextNow app.'},{id:'textnow-call',icon:'T',name:'TextNow call',note:'Copies the number and tries to open TextNow.'},
      {id:'jitsi',icon:'J',name:'Jitsi',note:'Free conference inside Diala.'},{id:'tel',icon:'☎',name:'Phone',note:'Uses the iPhone Phone app.'},{id:'sms',icon:'✉',name:'Messages',note:'Opens Messages with a prepared draft.'}
    ];
    if(state.showPaidProviders)channels.push({id:'provider',icon:'P',name:'Provider line',note:state.providerEndpoint?'Uses your secure provider backend.':'Configure a backend in Settings.'});
    $('#callChannelList').innerHTML=channels.map(ch=>`<button class="channel-button" data-channel="${escapeHtml(ch.id)}"><span class="channel-icon">${escapeHtml(ch.icon)}</span><span><strong>${escapeHtml(ch.name)}</strong><small>${escapeHtml(ch.note)}</small></span><span class="chev">›</span></button>`).join('');$('#callChooser').classList.remove('hidden');
  }
  function closeModal(){$('#callChooser').classList.add('hidden');}
  function addActiveLine(contactId,channel,lineState='External',meta={}){const c=getContact(contactId);if(!c)return;state.activeLines=state.activeLines.filter(l=>l.contactId!==contactId);state.activeLines.unshift({id:uid(),contactId,contactName:c.name,channel,state:lineState,startedAt:nowISO(),...meta});state.activeLines=state.activeLines.slice(0,4);markWorkedToday(contactId);addHistory(contactId,'call',`${channel} started (${lineState.toLowerCase()}).`);saveState();renderHome();}
  async function openExternalApp(url, fallbackUrl, delay = 1250) {
    let hidden = false;
    const onVis = () => { if (document.visibilityState === 'hidden') hidden = true; };
    document.addEventListener('visibilitychange', onVis, { passive:true });
    location.href = url;
    window.setTimeout(() => {
      document.removeEventListener('visibilitychange', onVis);
      if (!hidden && fallbackUrl) window.open(fallbackUrl, '_blank', 'noopener');
    }, delay);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select();
      const ok=document.execCommand('copy'); ta.remove(); return ok;
    }
  }

