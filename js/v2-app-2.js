  async function askAI(userText,options={}){
    const text=String(userText||'').trim();if(!text)return;
    const source=options.source||'text';addChat('user',text);pauseRecognitionForResponse();
    const fast=fastVoiceCommand(text);
    if(fast){addChat('assistant',fast,'Instant');setAssistantVisual(fast,'idle');if(state.tts&&source==='voice')await speak(fast);else resumeVoiceIfNeeded();return fast;}
    setAssistantVisual('One moment…','thinking');
    try{
      if(!window.puter?.ai?.chat)throw new Error('Puter unavailable');
      const g=getGoalSnapshot();
      const system=`You are ${state.assistantName}, a warm, capable female personal assistant inside Diala, an iPhone-first call desk. Speak in natural conversational English, like a thoughtful human assistant—not a customer-service bot. Be concise because your reply will often be spoken aloud. Use contractions. Vary sentence rhythm. Address the user as ${spokenName()} sometimes, not every sentence. It is currently ${currentTimePhrase()} and the daypart is ${daypart()}. Today's goal is ${g.target}; ${g.worked} contacts are completed; ${g.remainingGoal} remain for the goal; ${g.queueRemaining} remain in the queue. Be proactive when useful: mention the next sensible action or ask one short question. Use tools for contact facts and actions. Never invent contact data. Never claim you can read private FaceTime/TextNow/iPhone call history. Never claim external apps are controlled after Diala opens them. Never claim a message was sent unless a secure configured provider explicitly returned success. If people enrichment is used, treat returned data as potentially stale or estimated.`;
      const response=await puter.ai.chat([{role:'system',content:system},...state.chat.slice(-10,-1).map(m=>({role:m.role==='user'?'user':'assistant',content:m.text})),{role:'user',content:text}],{model:state.aiModel||'gpt-5.4-nano',tools:aiTools,temperature:.55});
      const calls=response?.message?.tool_calls||[];let finalText;
      if(calls.length){const results=[];for(const call of calls.slice(0,3)){let args={};try{args=JSON.parse(call.function.arguments||'{}');}catch(_){}results.push(await executeTool(call.function.name,args));}finalText=results.filter(Boolean).join(' ');}
      else finalText=responseText(response);
      if(!finalText)finalText='Okay. What would you like me to do next?';
      addChat('assistant',finalText);setAssistantVisual(finalText,'idle');state.conversationUntil=Date.now()+65_000;
      if(state.tts&&source==='voice')await speak(finalText);else resumeVoiceIfNeeded();return finalText;
    }catch(err){
      console.error(err);const fallback=localCommand(text);addChat('assistant',fallback,'Local fallback');setAssistantVisual(fallback,'idle');if(state.tts&&source==='voice')await speak(fallback);else resumeVoiceIfNeeded();return fallback;
    }finally{state.assistantThinking=false;renderVoiceState();}
  }

  function localCommand(text){
    const lower=text.toLowerCase();const fast=fastVoiceCommand(text);if(fast)return fast;
    if(lower.includes('script')){switchView('script');return'I opened your script.';}
    if(lower.includes('missed')){const count=state.contacts.reduce((n,c)=>n+(c.history||[]).filter(h=>h.type==='missed').length,0);return count?`You have ${count} missed event${count===1?'':'s'} recorded inside Diala.`:'No missed events are recorded inside Diala.';}
    const c=state.contacts.find(contact=>lower.includes(contact.name.toLowerCase().split(' ')[0]));if(c&&(lower.includes('call')||lower.includes('facetime')||lower.includes('text')||lower.includes('meet'))){state.pendingAction={type:'channel',contactId:c.id,channel:'chooser',label:`Choose how to contact ${c.name}`};renderPendingAction();return`I found ${c.name}. Your call and messaging options are ready.`;}
    return`I'm having trouble reaching the AI service, but your local Diala tools still work. I can open contacts, track your goal, prepare drafts, and launch your calling apps.`;
  }

  function ttsOptions(){
    if(state.ttsVoice==='coral')return{provider:'openai',model:'gpt-4o-mini-tts',voice:'coral',instructions:'Warm, natural female personal assistant. Conversational, confident, relaxed, human pacing. Avoid announcer cadence.'};
    if(state.ttsVoice==='aoede')return{provider:'gemini',model:'gemini-3.1-flash-tts-preview',voice:'Aoede',instructions:'Warm natural female personal assistant. Casual and human, calm and expressive, not robotic.'};
    return{provider:'elevenlabs',model:'eleven_flash_v2_5',voice:'21m00Tcm4TlvDq8ikWAM',output_format:'mp3_44100_128',voice_settings:{stability:.48,similarity_boost:.78,speed:1.03}};
  }

  async function waitForAudio(audio){
    return new Promise(async resolve=>{
      let done=false;const finish=()=>{if(done)return;done=true;audio.removeEventListener?.('ended',finish);audio.removeEventListener?.('error',finish);resolve();};
      audio.addEventListener?.('ended',finish,{once:true});audio.addEventListener?.('error',finish,{once:true});
      try{const playResult=audio.play?.();if(playResult?.then)await playResult;if(!audio.addEventListener)setTimeout(finish,Math.max(900,(String(audio?.duration)||0)*1000));}catch(_){finish();}
      setTimeout(finish,30_000);
    });
  }

  async function speak(text){
    const clean=String(text||'').replace(/https?:\/\/\S+/g,'').slice(0,2200);if(!clean)return;
    pauseRecognitionForResponse();state.assistantSpeaking=true;state.assistantThinking=false;renderVoiceState();
    try{
      if(state.ttsVoice!=='device'&&window.puter?.ai?.txt2speech){
        let audio;try{audio=await puter.ai.txt2speech(clean,ttsOptions());}catch(primaryErr){console.debug('Primary TTS failed',primaryErr);try{audio=await puter.ai.txt2speech(clean,{provider:'openai',model:'gpt-4o-mini-tts',voice:'coral',instructions:'Natural warm female personal assistant, conversational pacing.'});}catch(secondErr){console.debug('Secondary TTS failed',secondErr);}}
        if(audio?.play){state.currentAudio=audio;await waitForAudio(audio);state.currentAudio=null;return;}
      }
      if('speechSynthesis'in window){await new Promise(resolve=>{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(clean);u.rate=1.02;u.pitch=1.02;const voices=speechSynthesis.getVoices();const preferred=voices.find(v=>/samantha|ava|allison|serena|susan|victoria/i.test(v.name))||voices.find(v=>/^en[-_]/i.test(v.lang));if(preferred)u.voice=preferred;u.onend=resolve;u.onerror=resolve;speechSynthesis.speak(u);setTimeout(resolve,25_000);});}
    }finally{state.assistantSpeaking=false;renderVoiceState();resumeVoiceIfNeeded(180);}
  }

  async function testVoice(){const part=daypart();await speak(`Good ${part}, ${spokenName()}. I'm ${state.assistantName}. I'm ready whenever you are.`);}

