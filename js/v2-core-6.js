  async function importWorkbook(file){
    if(!window.XLSX)return toast('Spreadsheet library is still loading. Try again in a moment.');
    try{
      const data=await file.arrayBuffer();const wb=XLSX.read(data,{type:'array'});const sheet=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});if(!rows.length)return toast('That sheet has no contact rows.');
      const imported=rows.map(row=>{const first=pick(row,headerAliases.first),last=pick(row,headerAliases.last);const name=pick(row,headerAliases.name)||[first,last].filter(Boolean).join(' ');return normalizeContact({name:name||'Unnamed contact',phone:pick(row,headerAliases.phone),zip:pick(row,headerAliases.zip),address:pick(row,headerAliases.address),city:pick(row,headerAliases.city),state:pick(row,headerAliases.state),email:pick(row,headerAliases.email),status:pick(row,headerAliases.status)||'New',notes:pick(row,headerAliases.notes),imageName:pick(row,headerAliases.image)});});
      mergeImportedContacts(imported); toast(`${imported.length} contact${imported.length===1?'':'s'} imported from ${file.name}.`);
    }catch(err){console.error(err);toast('I could not read that spreadsheet. Check the file and try again.');}
  }

  function mergeImportedContacts(imported){
    const real=state.contacts.some(c=>!c.sample);
    if(!real) state.contacts=[];
    const existing=new Set(state.contacts.map(c=>`${digits(c.phone)}|${c.email.toLowerCase()}|${c.name.toLowerCase()}`));
    for(const c of imported){const key=`${digits(c.phone)}|${c.email.toLowerCase()}|${c.name.toLowerCase()}`;if(!existing.has(key)){state.contacts.push(normalizeContact(c));existing.add(key);}}
    state.selected.clear();state.previewContactId=state.contacts[0]?.id||null;saveState();renderAll();
  }

  function vcardValue(line){ return String(line||'').replace(/^[^:]*:/,'').replace(/\\n/gi,' ').replace(/\\,/g,',').replace(/\\;/g,';').trim(); }
  function parseVCards(text){
    return String(text||'').split(/END:VCARD/i).map(block=>block.trim()).filter(Boolean).map(block=>{
      const lines=block.replace(/\r?\n[ \t]/g,'').split(/\r?\n/); const find=prefix=>lines.find(l=>new RegExp(`^${prefix}(;[^:]*)?:`,'i').test(l));
      let name=vcardValue(find('FN')); if(!name){const n=vcardValue(find('N')).split(';');name=[n[1],n[0]].filter(Boolean).join(' ');}
      const adr=vcardValue(find('ADR')).split(';');
      return normalizeContact({name:name||'Unnamed contact',phone:vcardValue(find('TEL')),email:vcardValue(find('EMAIL')),address:adr[2]||'',city:adr[3]||'',state:adr[4]||'',zip:adr[5]||'',notes:'Imported from vCard.'});
    }).filter(c=>c.phone||c.email||c.name!=='Unnamed contact');
  }

  async function importVCards(files){
    const contacts=[];for(const file of files){try{contacts.push(...parseVCards(await file.text()));}catch(err){console.debug('vCard parse failed',err);}}
    if(!contacts.length)return toast('No contacts were found in that vCard file.'); mergeImportedContacts(contacts); toast(`${contacts.length} contact${contacts.length===1?'':'s'} imported from vCard.`);
  }

  async function requestDeviceContacts(){
    const picker=navigator.contacts;
    if(picker?.select){
      try{
        const props=['name','tel','email','address']; const supported=picker.getProperties?await picker.getProperties():props;
        const chosen=await picker.select(props.filter(p=>supported.includes(p)),{multiple:true});
        const imported=(chosen||[]).map(person=>normalizeContact({name:person.name?.[0]||'Unnamed contact',phone:person.tel?.[0]||'',email:person.email?.[0]||'',address:person.address?.[0]?.addressLine?.join(' ')||'',city:person.address?.[0]?.city||'',state:person.address?.[0]?.region||'',zip:person.address?.[0]?.postalCode||''}));
        if(imported.length){mergeImportedContacts(imported);toast(`${imported.length} contacts added.`);} return;
      }catch(err){if(err?.name!=='AbortError')console.debug(err);return;}
    }
    toast('iPhone Safari does not expose the Contacts picker here. Choose an exported .vcf instead.'); $('#vcfInput')?.click();
  }

  function normalizedFileStem(name){return String(name).replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
  async function matchImages(files){let matched=0;for(const file of files){const stem=normalizedFileStem(file.name);const c=state.contacts.find(x=>{const nk=normalizedFileStem(x.name),pk=digits(x.phone).slice(-7);return(nk&&(stem.includes(nk)||nk.includes(stem)))||(pk.length>=7&&stem.includes(pk));});if(!c)continue;await putMedia(`contact:${c.id}`,file);c.imageName=file.name;matched++;}saveState();renderAll();toast(`${matched} of ${files.length} photo${files.length===1?'':'s'} matched.`);}

  function prepareContacts(ids){const contacts=ids.map(getContact).filter(Boolean).filter(c=>c.status!=='Do Not Contact');state.prepared=contacts.map(c=>({contactId:c.id,message:template(state.messageTemplate,c),preparedAt:nowISO()}));saveState();renderReview();switchView('compose');$$('[data-compose-mode]').forEach(b=>b.classList.toggle('active',b.dataset.composeMode==='review'));$$('[data-compose-panel]').forEach(p=>p.classList.toggle('active',p.dataset.composePanel==='review'));toast(`${contacts.length} draft${contacts.length===1?'':'s'} prepared for review.`);}

  async function sharePrepared(contactId){
    const c=getContact(contactId);if(!c)return;const item=state.prepared.find(p=>p.contactId===contactId)||{message:template(state.messageTemplate,c)};
    try{const cardBlob=await makeCardBlob(c);const files=cardBlob&&window.File?[new File([cardBlob],`${safeFilename(c.name)}-diala.png`,{type:'image/png'})]:[];const shareData={title:c.name,text:`${c.phone}\n\n${item.message}`};if(files.length&&navigator.canShare?.({files}))shareData.files=files;if(navigator.share){await navigator.share(shareData);addHistory(c.id,'message','Draft opened in device share sheet.');}else{await copyText(shareData.text);toast('Draft copied. Open TextNow, Messages, or another app to send it.');}}catch(err){if(err?.name!=='AbortError')console.error(err);}
  }
  function safeFilename(name){return String(name||'contact').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'contact';}

  function listify(value){ if(!value)return[]; if(Array.isArray(value))return value.filter(Boolean); return [value].filter(Boolean); }
  function normalizeEnrichmentResponse(data){
    const root=data?.result||data?.data?.result||data?.data||data||{}; const person=root.person||root.profile||root;
    const emailCandidates=[...listify(person.emails),...listify(person.email_addresses),...listify(person.contact?.emails)].map(x=>typeof x==='string'?x:(x?.email||x?.address||x?.value)).filter(Boolean);
    const phoneCandidates=[...listify(person.phones),...listify(person.phone_numbers),...listify(person.contact?.phones)].map(x=>typeof x==='string'?x:(x?.phone||x?.number||x?.value)).filter(Boolean);
    const socials=[...listify(person.socials),...listify(person.social_profiles),...listify(person.profiles)].map(x=>typeof x==='string'?x:(x?.url||x?.profile_url||x?.handle)).filter(Boolean);
    return { age:person.age??person.demographics?.age??null, emails:[...new Set(emailCandidates)], phones:[...new Set(phoneCandidates)], socials:[...new Set(socials)], headline:person.headline||person.title||person.job_title||'', company:person.company?.name||person.current_company||person.organization||'', confidence:root.confidence??person.confidence??null, source:root.source||data?.provider||'enrichment provider', updatedAt:nowISO(), raw:root };
  }

  async function enrichContact(contactId){
    const c=getContact(contactId);if(!c)return;
    if(!state.enrichmentEndpoint){toast('Add a secure people-enrichment proxy URL in Settings first.');openSheet($('#settingsSheet'));return;}
    toast(`Looking up ${c.name}…`);
    try{
      const response=await fetch(state.enrichmentEndpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'enrich_person',contact:{name:c.name,phone:c.phone,email:c.email,address:c.address,city:c.city,state:c.state,zip:c.zip}})});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error||`Enrichment returned ${response.status}`);if(response.status===202||data?.data?.completed===false)throw new Error(data?.message||'The provider is still processing; try again in a moment');
      c.enrichment=normalizeEnrichmentResponse(data);addHistory(c.id,'enrichment','People-data enrichment updated.');saveState();renderAll();openContactSheet(c.id);toast(`Enrichment updated for ${c.name}. Review confidence before relying on it.`);
      return c.enrichment;
    }catch(err){console.error(err);toast(`Enrichment failed: ${err.message||'check your proxy settings'}.`,4200);}
  }
