  async function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
      img.src = url;
    });
  }

  function drawImageCover(ctx, img, x, y, w, h) {
    const r = Math.max(w / img.width, h / img.height);
    const nw = img.width * r, nh = img.height * r;
    ctx.drawImage(img, x + (w - nw) / 2, y + (h - nh) / 2, nw, nh);
  }

  function wrapText(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  async function drawCard(contact, canvas = $('#personalizedCanvas')) {
    if (!contact || !canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f4f4f0'; ctx.fillRect(0, 0, W, H);

    let bgImage = state.aiImageElements.get(contact.id) || null;
    if (!bgImage) {
      const contactBlob = await getMedia(`contact:${contact.id}`).catch(() => null);
      if (contactBlob) bgImage = await loadImageFromBlob(contactBlob).catch(() => null);
    }
    if (bgImage) {
      drawImageCover(ctx, bgImage, 0, 0, W, H * .62);
      const fade = ctx.createLinearGradient(0, H * .30, 0, H * .68);
      fade.addColorStop(0, 'rgba(244,244,240,0)'); fade.addColorStop(1, '#f4f4f0');
      ctx.fillStyle = fade; ctx.fillRect(0, H * .30, W, H * .40);
    } else {
      const grad = ctx.createLinearGradient(0, 0, W, H * .66);
      grad.addColorStop(0, '#162447'); grad.addColorStop(.5, '#2d5ea8'); grad.addColorStop(1, '#f4f4f0');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H * .7);
      ctx.globalAlpha = .16; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(W * .75, H * .16, 140 + i * 44, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = '#15171a';
    ctx.font = '700 46px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('DIALA', 78, 90);
    ctx.font = '500 26px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#5e6268'; ctx.fillText('Prepared for', 78, H * .60);
    ctx.font = '750 76px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#15171a';
    const nameLines = wrapText(ctx, contact.name, W - 156).slice(0, 2);
    nameLines.forEach((line, i) => ctx.fillText(line, 78, H * .665 + i * 82));

    let y = H * .79;
    ctx.font = '700 30px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#1959d8'; ctx.fillText(contact.zip ? `ZIP ${contact.zip}` : 'PERSONALIZED OUTREACH', 78, y);
    y += 60;
    ctx.font = '500 34px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#34373c';
    const address = [contact.address, contact.city, contact.state].filter(Boolean).join(', ');
    const addressLines = wrapText(ctx, address || 'Contact details prepared in Diala', W - 156).slice(0, 3);
    addressLines.forEach((line, i) => ctx.fillText(line, 78, y + i * 46));

    ctx.strokeStyle = 'rgba(21,23,26,.14)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(78, H - 125); ctx.lineTo(W - 78, H - 125); ctx.stroke();
    ctx.fillStyle = '#6d7178'; ctx.font = '500 24px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Personalized in Diala • Review before sending', 78, H - 72);
    $('#canvasEmpty').classList.add('hidden');
  }

  async function makeCardBlob(contact) {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1500;
    await drawCard(contact, canvas);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png', .94));
  }

  async function generateAIImage(contact) {
    if (!contact) return toast('Choose a contact first.');
    if (!window.puter?.ai?.txt2img) return toast('Puter AI is not available yet. Check your connection.');
    const button = $('#generateAiImageButton');
    const old = button.textContent; button.textContent = 'Generating…'; button.disabled = true;
    try {
      const prompt = `${$('#imagePrompt').value.trim()}\nNo written words, letters, numbers, signatures, watermarks or logos. Leave clean negative space in the lower half for exact text overlay. Do not include any recipient-specific personal information.`;
      const image = await puter.ai.txt2img(prompt, { model: 'google/imagen-4.0' });
      state.aiImageElements.set(contact.id, image);
      await drawCard(contact);
      try {
        const response = await fetch(image.src);
        if (response.ok) await putMedia(`ai:${contact.id}`, await response.blob());
      } catch (_) {}
      toast('AI visual generated. Diala overlaid the exact contact text separately.');
    } catch (err) {
      console.error(err); toast('Image generation did not complete. Puter may ask you to sign in or approve usage.');
    } finally { button.textContent = old; button.disabled = false; }
  }

  async function loadStoredAIImage(contactId) {
    if (state.aiImageElements.has(contactId)) return;
    const blob = await getMedia(`ai:${contactId}`).catch(() => null);
    if (!blob) return;
    const img = await loadImageFromBlob(blob).catch(() => null);
    if (img) state.aiImageElements.set(contactId, img);
  }

