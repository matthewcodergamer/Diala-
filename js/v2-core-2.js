  function applyTheme(){ if(state.theme==='system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme=state.theme; }

  function daypart(date=new Date()) { const h=date.getHours(); return h<12?'morning':h<18?'afternoon':'evening'; }
  function updateGreeting(){
    const now=new Date(); const part=daypart(now); const greeting=`Good ${part}`;
    if($('#greetingText')) $('#greetingText').textContent=greeting;
    if($('#displayName')) $('#displayName').textContent=state.profileName;
    if($('#dayLabel')) $('#dayLabel').textContent=new Intl.DateTimeFormat(undefined,{weekday:'long',month:'short',day:'numeric'}).format(now).toUpperCase();
  }

  function filteredContacts(){
    const q=($('#contactSearch')?.value||'').trim().toLowerCase();
    return state.contacts.filter(c=>{
      const matches=!q||`${c.name} ${c.phone} ${c.zip} ${c.address} ${c.city} ${c.state} ${c.email}`.toLowerCase().includes(q);
      const f=state.queueFilter; const status=f==='all'||c.status.toLowerCase()===f;
      return matches&&status;
    });
  }
  function nextContact(){ return state.contacts.find(c=>!['Reached','Do Not Contact'].includes(c.status))||state.contacts[0]||null; }

  function getGoalSnapshot(){
    const day=ensureTodayStats();
    const entries=Object.entries(day.worked||{}).sort((a,b)=>new Date(a[1])-new Date(b[1]));
    const worked=entries.length; const target=Math.max(1,Number(state.goalTarget)||100); const remainingGoal=Math.max(0,target-worked);
    const queueRemaining=state.contacts.filter(c=>!['Reached','Do Not Contact'].includes(c.status)).length;
    const plannedMinutes=Math.max(.25,Number(state.avgMinutesPerContact)||2.5);
    let minutesPerContact=plannedMinutes; let paceSource='plan';
    if(entries.length>=3){
      const elapsed=(new Date(entries.at(-1)[1])-new Date(entries[0][1]))/60000;
      if(elapsed>=5){ minutesPerContact=Math.max(.25,elapsed/(entries.length-1)); paceSource='today'; }
    }
    const pacePerHour=60/minutesPerContact;
    const etaMs=remainingGoal*minutesPerContact*60000;
    const etaDate=remainingGoal?new Date(Date.now()+etaMs):new Date();
    const etaLabel=remainingGoal?new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(etaDate):'Goal complete';
    const pct=Math.min(100,Math.round(worked/target*100));
    const queueDays=target>0?Math.max(0,Math.ceil(queueRemaining/target*10)/10):0;
    let insight;
    if(!remainingGoal) insight=`You hit today’s goal of ${target}.`;
    else if(worked===0) insight=`Start with one contact. At about ${plannedMinutes.toFixed(1)} minutes each, ${target} contacts is roughly ${Math.round(target*plannedMinutes/60*10)/10} hours of work.`;
    else insight=`${remainingGoal} to go. At your ${paceSource==='today'?'observed':'planned'} pace, you’re on track for about ${etaLabel}.`;
    return { worked,target,remainingGoal,queueRemaining,pct,minutesPerContact,pacePerHour,etaDate,etaLabel,queueDays,insight,paceSource };
  }
  function statusClass(status='') { const s=status.toLowerCase(); if(s==='callback')return'callback';if(s==='reached')return'reached';if(s==='do not contact')return'dnc';if(s==='no answer')return'no-answer';return''; }

  function renderVoiceState(){
    const stage=$('#assistantStage'); const button=$('#voiceButton'); const status=$('#assistantStatus'); const top=$('#topStatusText'); const chip=$('#connectionButton');
    stage?.classList.toggle('listening',state.voiceSessionActive&&!state.assistantSpeaking&&!state.assistantThinking);
    stage?.classList.toggle('thinking',state.assistantThinking);
    stage?.classList.toggle('speaking',state.assistantSpeaking);
    button?.classList.toggle('active',state.voiceSessionActive); chip?.classList.toggle('listening',state.voiceSessionActive&&!state.assistantSpeaking&&!state.assistantThinking);
    if(state.assistantSpeaking){ if(status)status.textContent=`${state.assistantName} is speaking`; if(top)top.textContent='Speaking'; }
    else if(state.assistantThinking){ if(status)status.textContent='Thinking…'; if(top)top.textContent='Thinking'; }
    else if(state.voiceSessionActive){ if(status)status.textContent=state.requireWakePhrase?`Listening • say “${state.wakePhrase}”`:'Listening continuously while Diala is open'; if(top)top.textContent='Listening'; }
    else { if(status)status.textContent='Tap once for hands-free listening'; if(top)top.textContent='Ready'; }
  }

  function renderGoals(){
    const g=getGoalSnapshot();
    const pairs=[['goalProgressValue',g.worked],['goalTargetValue',g.target],['goalRingLabel',`${g.pct}%`],['goalRemaining',g.remainingGoal],['goalEta',g.etaLabel],['goalPace',`${g.pacePerHour.toFixed(g.pacePerHour>=10?0:1)}/hr`],['goalWorkedBig',g.worked],['goalTargetBig',g.target],['goalRemainingBig',g.remainingGoal],['goalPaceBig',`${g.pacePerHour.toFixed(g.pacePerHour>=10?0:1)} / hr`],['goalEtaBig',g.etaLabel],['queueDaysEstimate',g.queueDays?`${g.queueDays} day${g.queueDays===1?'':'s'}`:'—']];
    for(const [id,val] of pairs){const el=$(`#${id}`);if(el)el.textContent=val;}
    if($('#goalProgressBar'))$('#goalProgressBar').style.width=`${g.pct}%`;
    if($('#goalProgressBarBig'))$('#goalProgressBarBig').style.width=`${g.pct}%`;
    if($('#goalInsight'))$('#goalInsight').textContent=g.insight;
    if($('#dailyGoalInput'))$('#dailyGoalInput').value=g.target;
    if($('#avgMinutesInput'))$('#avgMinutesInput').value=state.avgMinutesPerContact;
    const ring=$('.mini-ring'); if(ring)ring.style.setProperty('--goal-pct',`${g.pct*3.6}deg`);
    return g;
  }

