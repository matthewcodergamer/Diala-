  async function runChannel(contactId, channel) {
    const c=getContact(contactId); if(!c)return;
    closeModal(); closeSheets();
    const phone=c.phone.trim(); const compactPhone=phone.replace(/\s+/g,''); const draft=template(state.messageTemplate,c);
    try {
      if(channel==='facetime'||channel==='facetime-audio'){
        if(!phone&&!c.email)return toast('Add a phone number or Apple-account email first.');
        const target=(phone||c.email).replace(/\s+/g,''); markWorkedToday(c.id);
        addActiveLine(c.id,channel==='facetime'?'FaceTime':'FaceTime Audio','External');
        location.href=`${channel==='facetime'?'facetime':'facetime-audio'}:${target}`;
      } else if(channel==='textnow'||channel==='textnow-call'){
        if(!phone)return toast('Add a phone number first.');
        const payload=channel==='textnow' ? `${phone}\n\n${draft}` : phone;
        await copyText(payload); markWorkedToday(c.id);
        addHistory(c.id,channel==='textnow'?'message':'call',channel==='textnow'?'TextNow message prepared; number and draft copied.':'TextNow call prepared; number copied.');
        addActiveLine(c.id,'TextNow','External');
        toast(channel==='textnow'?'Copied. Opening the TextNow app — paste if needed.':'Number copied. Opening TextNow — paste if needed.');
        await openExternalApp(channel==='textnow'?'textnow://new_msg':'textnow://new_call','https://www.textnow.com/');
      } else if(channel==='meet'){
        if(!phone&&!c.email)return toast('Add a phone number or email first.');
        const lookup=phone||c.email; await copyText(lookup); markWorkedToday(c.id);
        addHistory(c.id,'meeting',`Google Meet opened; ${phone?'phone number':'email'} copied for Search contacts.`);
        addActiveLine(c.id,'Google Meet','External');
        toast('Contact copied. In Meet, paste it into Search contacts.');
        await openExternalApp('gmeet://','https://meet.google.com/');
      } else if(channel==='jitsi') await startJitsi(c);
      else if(channel==='tel'){
        if(!phone)return toast('Add a phone number first.'); markWorkedToday(c.id); addActiveLine(c.id,'Phone','External'); location.href=`tel:${compactPhone}`;
      } else if(channel==='sms'){
        if(!phone)return toast('Add a phone number first.'); markWorkedToday(c.id); addHistory(c.id,'message','Native Messages draft opened.');
        location.href=`sms:${encodeURIComponent(phone)}&body=${encodeURIComponent(draft)}`;
      } else if(channel==='provider') await callProvider(c);
    } catch(err){ console.error(err); toast('That channel could not be opened.'); }
  }

  async function callProvider(contact){
    if(!state.providerEndpoint)return toast('Add your provider backend URL in Settings first.');
    const ok=confirm(`Send a call-start request for ${contact.name} to your configured backend?`); if(!ok)return;
    const response=await fetch(state.providerEndpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'start_call',contact:{id:contact.id,name:contact.name,phone:contact.phone}})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.error||`Provider returned ${response.status}`);
    markWorkedToday(contact.id); addActiveLine(contact.id,'Provider',data.state||'Connected',{providerCallId:data.call_id||data.callId||data.id||null,muted:false,held:false}); toast('Provider accepted the call request.');
  }

  async function providerLineAction(lineId, action){
    const line=state.activeLines.find(l=>l.id===lineId);if(!line||line.channel!=='Provider')return;
    if(!state.providerEndpoint)return toast('Provider backend is not configured.');
    try{
      const response=await fetch(state.providerEndpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,call_id:line.providerCallId,line_id:line.id,contact_id:line.contactId})});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error||`Provider returned ${response.status}`);
      if(action==='hold_call'){line.held=true;line.state='On hold';}
      if(action==='resume_call'){line.held=false;line.state='Connected';}
      if(action==='mute_call')line.muted=true;
      if(action==='unmute_call')line.muted=false;
      if(action==='end_call'){finishLine(line.id);return;}
      saveState();renderHome();
    }catch(err){console.error(err);toast(`Provider control failed: ${err.message||'unknown error'}.`);}
  }

  async function ensureJitsiScript(){
    if(window.JitsiMeetExternalAPI)return;
    await new Promise((resolve,reject)=>{ const s=document.createElement('script');s.src='https://meet.jit.si/external_api.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s); });
  }
  async function startJitsi(contact){
    try{
      await ensureJitsiScript(); const room=`Diala-${contact.name.replace(/[^a-z0-9]/gi,'')}-${Math.random().toString(36).slice(2,8)}`;
      $('#jitsiTitle').textContent=contact.name; $('#jitsiModal').classList.remove('hidden'); $('#jitsiModal').setAttribute('aria-hidden','false'); $('#jitsiContainer').innerHTML='';
      state.jitsiApi=new window.JitsiMeetExternalAPI('meet.jit.si',{roomName:room,parentNode:$('#jitsiContainer'),width:'100%',height:'100%',configOverwrite:{prejoinConfig:{enabled:false},startWithAudioMuted:false,startWithVideoMuted:false},interfaceConfigOverwrite:{MOBILE_APP_PROMO:false}});
      state.jitsiApi.addEventListener('videoConferenceJoined',()=>{ markWorkedToday(contact.id); addActiveLine(contact.id,'Jitsi','Connected'); toast('Jitsi connected.'); });
      state.jitsiApi.addEventListener('readyToClose',closeJitsi); addHistory(contact.id,'meeting',`Jitsi room created: ${room}.`);
    }catch(err){console.error(err);toast('Jitsi could not load. Check your connection and try again.');}
  }
  function closeJitsi(){ try{state.jitsiApi?.dispose();}catch(_){} state.jitsiApi=null; if($('#jitsiContainer'))$('#jitsiContainer').innerHTML=''; $('#jitsiModal')?.classList.add('hidden'); $('#jitsiModal')?.setAttribute('aria-hidden','true'); const line=state.activeLines.find(l=>l.channel==='Jitsi'); if(line)finishLine(line.id); }
  function finishLine(lineId){ const line=state.activeLines.find(l=>l.id===lineId); if(line)addHistory(line.contactId,'call',`${line.channel} line finished.`); state.activeLines=state.activeLines.filter(l=>l.id!==lineId);saveState();renderHome(); }

  const headerAliases={
    name:['name','full name','customer name','contact name','client name','recipient','person'],first:['first','first name','firstname','given name'],last:['last','last name','lastname','surname'],
    phone:['phone','phone number','phone #','mobile','mobile phone','cell','cellphone','telephone','tel','number'],zip:['zip','zip code','zipcode','postal','postal code'],
    address:['address','street','street address','mailing address','addr'],city:['city','town'],state:['state','province','region'],email:['email','email address'],status:['status','disposition','stage'],notes:['notes','note','comments','comment'],image:['image','image file','image filename','photo','picture','photo file']
  };
  const normHeader=s=>String(s||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  function pick(row,names){ const keys=Object.keys(row);for(const alias of names){const key=keys.find(k=>normHeader(k)===alias);if(key!=null&&row[key]!=null)return row[key];}return''; }

