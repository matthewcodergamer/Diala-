  function wakeRegex(){const phrase=String(state.wakePhrase||`Hey ${state.assistantName}`).trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`(?:^|\\b)${phrase}(?:\\b|[,.!?])`,'i');}
  function stripWakePhrase(text){return String(text||'').replace(wakeRegex(),'').replace(/^[\s,.:;-]+/,'').trim();}
  function isWakePhrase(text){return wakeRegex().test(String(text||''));}

  function pauseRecognitionForResponse(){state.voiceSessionPaused=true;clearTimeout(state.recognitionRestartTimer);try{state.recognition?.abort();}catch(_){}state.recognition=null;}
  function resumeVoiceIfNeeded(delay=250){state.voiceSessionPaused=false;if(state.voiceSessionActive&&state.alwaysListening&&document.visibilityState==='visible'&&!state.assistantSpeaking&&!state.assistantThinking){clearTimeout(state.recognitionRestartTimer);state.recognitionRestartTimer=setTimeout(()=>startHandsFreeRecognition(),delay);}renderVoiceState();}

  function processVoiceTranscript(raw){
    let text=String(raw||'').trim();if(!text)return;
    const withinConversation=Date.now()<state.conversationUntil;
    if(state.requireWakePhrase&&!withinConversation){
      if(!isWakePhrase(text)){setAssistantVisual(`Listening for “${state.wakePhrase}”…`,'idle');resumeVoiceIfNeeded(150);return;}
      text=stripWakePhrase(text);state.conversationUntil=Date.now()+65_000;
      if(!text){const answer='Yes?';addChat('assistant',answer);setAssistantVisual(answer,'idle');speak(answer);return;}
    } else if(isWakePhrase(text)) text=stripWakePhrase(text)||'Hello';
    askAI(text,{source:'voice'});
  }

  function configureRecognition(recognition,continuous){recognition.lang='en-US';recognition.interimResults=true;recognition.continuous=continuous;recognition.maxAlternatives=1;}

  function startHandsFreeRecognition(){
    if(!state.voiceSessionActive||state.voiceSessionPaused||state.assistantSpeaking||state.assistantThinking||document.visibilityState!=='visible')return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){state.voiceSessionActive=false;renderVoiceState();toast('Continuous speech recognition is unavailable in this browser. Use the text box instead.');return;}
    try{state.recognition?.abort();}catch(_){}
    const r=new SR();configureRecognition(r,true);state.recognition=r;state.recognitionTarget='assistant';
    r.onstart=()=>{renderVoiceState();};
    r.onresult=event=>{
      let interim='',final='';for(let i=event.resultIndex;i<event.results.length;i++){const t=event.results[i][0].transcript;if(event.results[i].isFinal)final+=t;else interim+=t;}
      if(interim&&!state.assistantThinking&&!state.assistantSpeaking)$('#assistantPrompt').textContent=interim;
      if(final){state.voiceSessionPaused=true;try{r.stop();}catch(_){}processVoiceTranscript(final);}
    };
    r.onerror=e=>{if(['aborted','no-speech'].includes(e.error))return;if(e.error==='not-allowed'||e.error==='service-not-allowed'){state.voiceSessionActive=false;toast('Microphone access was not allowed. Enable microphone permission, then tap the orb again.',4200);}else if(e.error!=='audio-capture')console.debug('Speech recognition',e.error);renderVoiceState();};
    r.onend=()=>{if(state.recognition===r)state.recognition=null;if(state.voiceSessionActive&&!state.voiceSessionPaused&&!state.assistantSpeaking&&!state.assistantThinking&&document.visibilityState==='visible')resumeVoiceIfNeeded(220);};
    try{r.start();}catch(err){console.debug('Recognition start',err);resumeVoiceIfNeeded(500);}
  }

  async function startVoiceSession(){
    if(state.voiceSessionActive){stopVoiceSession();return;}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast('Speech recognition is unavailable in this Safari version.');switchView('assistant');return;}
    state.voiceSessionActive=true;state.voiceSessionPaused=true;state.voiceSessionStartedAt=nowISO();state.conversationUntil=Date.now()+30_000;renderVoiceState();
    const g=getGoalSnapshot();const greeting=`Good ${daypart()}, ${spokenName()}. I'm ${state.assistantName}. ${g.worked?`You've done ${g.worked} of ${g.target} today.`:`What would you like to get done today?`} You can ask me for a contact, a call, or your goal.`;
    addChat('assistant',greeting,'Voice session');setAssistantVisual(greeting,'idle');
    if(state.tts)await speak(greeting);else resumeVoiceIfNeeded(50);
  }
  function stopVoiceSession(){state.voiceSessionActive=false;state.voiceSessionPaused=false;state.conversationUntil=0;clearTimeout(state.recognitionRestartTimer);try{state.recognition?.abort();}catch(_){}state.recognition=null;try{state.currentAudio?.pause?.();}catch(_){}state.currentAudio=null;state.assistantSpeaking=false;state.assistantThinking=false;setAssistantVisual(`I'm here when you need me.`,'idle');renderVoiceState();}

  function startOneShotRecognition(target='chat'){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast('Speech recognition is unavailable. Type your request instead.');return;}
    try{state.recognition?.abort();}catch(_){}const r=new SR();configureRecognition(r,false);state.recognition=r;state.recognitionTarget=target;
    r.onstart=()=>{if($('#chatMicButton'))$('#chatMicButton').classList.add('listening');};
    r.onresult=e=>{const text=[...e.results].map(x=>x[0].transcript).join(' ');if(target==='chat')$('#chatInput').value=text;const last=e.results[e.results.length-1];if(last.isFinal){if(target==='chat'){$('#chatInput').value='';askAI(text,{source:'voice'});}else processVoiceTranscript(text);}};
    r.onerror=e=>{if(e.error!=='aborted')toast(`Voice input: ${e.error}.`);};r.onend=()=>$('#chatMicButton')?.classList.remove('listening');r.start();
  }

  function handleVisibilityForVoice(){
    if(document.visibilityState==='hidden'){clearTimeout(state.recognitionRestartTimer);try{state.recognition?.abort();}catch(_){}state.recognition=null;}
    else if(state.voiceSessionActive&&!state.assistantSpeaking&&!state.assistantThinking){state.voiceSessionPaused=false;resumeVoiceIfNeeded(350);}
    renderVoiceState();
  }

  async function updatePuterStatus(){const target=$('#puterStatus');try{const signed=await Promise.resolve(window.puter?.auth?.isSignedIn?.());target.textContent=signed?'Connected. AI and premium voice use your Puter account.':'Sign in when Diala first uses AI or premium voice.';}catch(_){target.textContent='Sign in when Diala first uses AI or premium voice.';}}
  async function connectPuter(){try{if(!window.puter?.auth?.signIn)return toast('Puter is still loading.');await puter.auth.signIn();updatePuterStatus();toast('Puter connected.');}catch(err){console.error(err);toast('Puter sign-in was not completed.');}}
  async function requestNotifications(){if(!('Notification'in window))return toast('Notifications are unavailable in this browser.');const result=await Notification.requestPermission();renderSettings();toast(result==='granted'?'Notifications enabled. A push sender/server is still needed for alerts while Diala is closed.':'Notifications were not enabled.');}
  function runPendingAction(){const a=state.pendingAction;state.pendingAction=null;renderPendingAction();if(!a)return;if(a.type==='channel'){if(a.channel==='chooser')openCallChooser(a.contactId);else runChannel(a.contactId,a.channel);}}
