  function addChat(role,text,meta=''){state.chat.push({role,text:String(text||''),meta});state.chat=state.chat.slice(-100);saveState();renderChat();}
  function responseText(response){if(typeof response==='string')return response;const content=response?.message?.content??response?.content??response?.text;if(typeof content==='string')return content;if(Array.isArray(content))return content.map(x=>x?.text||'').join('');return String(response?.message?.text||'Done.');}

  const aiTools=[
    {type:'function',function:{name:'find_contact',description:'Find a contact in the local Diala contact list.',parameters:{type:'object',properties:{query:{type:'string'}},required:['query']}}},
    {type:'function',function:{name:'next_lead',description:'Get and focus the next contact in the queue.',parameters:{type:'object',properties:{}}}},
    {type:'function',function:{name:'get_goal_status',description:'Read today daily outreach goal, progress, pace and finish estimate.',parameters:{type:'object',properties:{}}}},
    {type:'function',function:{name:'set_daily_goal',description:'Set today default daily contact goal.',parameters:{type:'object',properties:{target:{type:'integer',minimum:1,maximum:5000}},required:['target']}}},
    {type:'function',function:{name:'prepare_message',description:'Prepare a personalized draft for a contact. Does not send.',parameters:{type:'object',properties:{contact:{type:'string'}},required:['contact']}}},
    {type:'function',function:{name:'open_channel',description:'Prepare a calling/messaging channel for a contact. External app handoffs require user action.',parameters:{type:'object',properties:{contact:{type:'string'},channel:{type:'string',enum:['facetime','facetime-audio','textnow','textnow-call','meet','jitsi','tel','sms','auto']}},required:['contact','channel']}}},
    {type:'function',function:{name:'show_script',description:'Open the call script.',parameters:{type:'object',properties:{contact:{type:'string'}}}}},
    {type:'function',function:{name:'update_disposition',description:'Update a contact disposition.',parameters:{type:'object',properties:{contact:{type:'string'},disposition:{type:'string',enum:['New','Callback','No Answer','Reached','Do Not Contact']}},required:['contact','disposition']}}},
    {type:'function',function:{name:'generate_personalized_image',description:'Open personalized image workflow for a contact.',parameters:{type:'object',properties:{contact:{type:'string'}},required:['contact']}}},
    {type:'function',function:{name:'enrich_contact',description:'Use the configured secure people-data proxy to enrich a contact. Only use when explicitly asked.',parameters:{type:'object',properties:{contact:{type:'string'}},required:['contact']}}},
    {type:'function',function:{name:'read_missed_calls',description:'Summarize missed/no-answer events recorded inside Diala. Cannot read private FaceTime/TextNow history.',parameters:{type:'object',properties:{}}}}
  ];

  async function executeTool(name,args={}){
    if(name==='find_contact'){const c=findContact(args.query);if(!c)return`I couldn't find a contact matching ${args.query}.`;state.previewContactId=c.id;openContactSheet(c.id);return`${c.name} is in your contacts. ${c.phone?`Their number is ${c.phone}.`:''} ${c.zip?`ZIP ${c.zip}.`:''}`.trim();}
    if(name==='next_lead'){const c=nextContact();if(!c)return'Your queue is empty.';state.previewContactId=c.id;openContactSheet(c.id);return`Next is ${c.name}${c.phone?`, ${c.phone}`:''}. ${c.status==='Callback'?'They are marked for a callback.':`Status is ${c.status}.`}`;}
    if(name==='get_goal_status'){return naturalGoalSummary();}
    if(name==='set_daily_goal'){state.goalTarget=Math.max(1,Number(args.target)||100);saveState();renderGoals();renderHome();return`Okay. I set your daily goal to ${state.goalTarget} contacts.`;}
    if(name==='prepare_message'){const c=findContact(args.contact);if(!c)return`I couldn't find ${args.contact}.`;state.prepared=[{contactId:c.id,message:template(state.messageTemplate,c),preparedAt:nowISO()}];state.previewContactId=c.id;saveState();renderReview();switchView('compose');$$('[data-compose-mode]').forEach(b=>b.classList.toggle('active',b.dataset.composeMode==='review'));$$('[data-compose-panel]').forEach(p=>p.classList.toggle('active',p.dataset.composePanel==='review'));return`I prepared ${c.name}'s message and left it in Review for you.`;}
    if(name==='open_channel'){const c=findContact(args.contact);if(!c)return`I couldn't find ${args.contact}.`;const channel=args.channel==='auto'?(state.preferredChannel==='auto'?'chooser':state.preferredChannel):args.channel;state.pendingAction={type:'channel',contactId:c.id,channel,label:channel==='chooser'?`Choose how to contact ${c.name}`:`Open ${channelLabel(channel)} for ${c.name}`};renderPendingAction();return channel==='meet'?`I have ${c.name}'s number ready. Tap Continue and I'll copy it and open Google Meet so you can paste it into Search contacts.`:`I've got ${channel==='chooser'?'the contact options':channelLabel(channel)} ready for ${c.name}. Tap Continue.`;}
    if(name==='show_script'){const c=args.contact?findContact(args.contact):null;switchView('script');if(c){state.previewContactId=c.id;$('#scriptEditor').value=template(state.script,c);return`I opened your script with ${c.name}'s details filled in.`;}return'I opened your call script.';}
    if(name==='update_disposition'){const c=findContact(args.contact);if(!c)return`I couldn't find ${args.contact}.`;setDisposition(c.id,args.disposition);return`Okay. ${c.name} is marked ${args.disposition}.`;}
    if(name==='generate_personalized_image'){const c=findContact(args.contact);if(!c)return`I couldn't find ${args.contact}.`;state.previewContactId=c.id;switchView('compose');$$('[data-compose-mode]').forEach(b=>b.classList.toggle('active',b.dataset.composeMode==='image'));$$('[data-compose-panel]').forEach(p=>p.classList.toggle('active',p.dataset.composePanel==='image'));await loadStoredAIImage(c.id);await drawCard(c);return`I opened ${c.name}'s personalized image preview.`;}
    if(name==='enrich_contact'){const c=findContact(args.contact);if(!c)return`I couldn't find ${args.contact}.`;if(!state.enrichmentEndpoint)return'People enrichment is not connected yet. Add your secure enrichment proxy in Settings first.';const result=await enrichContact(c.id);if(!result)return`I couldn't enrich ${c.name} right now.`;return`I updated ${c.name}'s enrichment record. ${result.age?`The returned age is ${result.age}.`:''} I also saved any alternate emails, phones, and web profiles the provider returned. Please verify the confidence before using it.`;}
    if(name==='read_missed_calls'){const misses=[];state.contacts.forEach(c=>(c.history||[]).forEach(h=>{if(h.type==='missed'||/no answer/i.test(h.text))misses.push({c,h});}));misses.sort((a,b)=>new Date(b.h.at)-new Date(a.h.at));if(!misses.length)return"You don't have any missed or no-answer events recorded inside Diala.";return`I have ${misses.length} missed or no-answer event${misses.length===1?'':'s'} recorded. The most recent ${Math.min(3,misses.length)} ${misses.slice(0,3).map(x=>`${x.c.name} at ${formatTime(x.h.at)}`).join(', ')}.`;}
    return"I don't have that action yet.";
  }

  function channelLabel(channel){return({facetime:'FaceTime','facetime-audio':'FaceTime Audio',textnow:'TextNow message','textnow-call':'TextNow call',meet:'Google Meet',jitsi:'Jitsi',tel:'Phone',sms:'Messages',provider:'provider line'})[channel]||channel;}
  function spokenName(){return state.profileName||'Mr. Douglas';}
  function currentTimePhrase(){return new Intl.DateTimeFormat(undefined,{weekday:'long',hour:'numeric',minute:'2-digit'}).format(new Date());}
  function naturalGoalSummary(){const g=getGoalSnapshot();if(!g.remainingGoal)return`You've completed ${g.worked} contacts and hit today's goal of ${g.target}.`;return`You've completed ${g.worked} of ${g.target} today. You have ${g.remainingGoal} left for the goal. At about ${g.pacePerHour.toFixed(g.pacePerHour>=10?0:1)} contacts an hour, your estimated finish is ${g.etaLabel}.`;}

  function fastVoiceCommand(text){
    const lower=text.toLowerCase().trim();
    if(/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(lower))return`Good ${daypart()}, ${spokenName()}. I'm here. What would you like to work on?`;
    if(/(how many.*(left|done)|goal|pace|finish.*(time|today)|how long.*(finish|queue))/i.test(text))return naturalGoalSummary();
    if(/what time|time is it/i.test(text))return`It's ${new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date())}.`;
    if(/who('?s| is) next|next (number|contact|person|lead)/i.test(text)){const c=nextContact();if(!c)return'Your queue is empty.';state.previewContactId=c.id;renderHome();return`Next is ${c.name}${c.phone?`, ${c.phone}`:''}.`}
    const goalMatch=lower.match(/(?:set|make).*?(?:goal|target).*?(\d{1,4})|(?:goal|target).*?(?:to|is)\s*(\d{1,4})/i);if(goalMatch){const n=Number(goalMatch[1]||goalMatch[2]);if(n>0){state.goalTarget=n;saveState();renderGoals();renderHome();return`Okay. Today's goal is ${n} contacts.`;}}
    return null;
  }

  function setAssistantVisual(text,stateName='idle'){
    if(text&&$('#voiceReply'))$('#voiceReply').textContent=text;
    if(text&&$('#assistantPrompt'))$('#assistantPrompt').textContent=text.length>90?`${text.slice(0,88)}…`:text;
    state.assistantThinking=stateName==='thinking';state.assistantSpeaking=stateName==='speaking';renderVoiceState();
  }

