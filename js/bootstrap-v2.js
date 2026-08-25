(async()=>{
  const mount=document.getElementById('dialaMount');
  const urls=['html/shell-1.html','html/shell-2.html','html/shell-3.html','html/shell-4.html','html/shell-5.html'];
  const parts=await Promise.all(urls.map(async u=>{const r=await fetch(u,{cache:'no-cache'});if(!r.ok)throw new Error(`Failed ${u}`);return r.text();}));
  mount.outerHTML=parts.join('');
  const scripts=['js/v2-core-1.js','js/v2-core-2.js','js/v2-core-3.js','js/v2-core-4.js','js/v2-core-5.js','js/v2-core-6.js','js/media.js','js/v2-app-1.js','js/v2-app-2.js','js/v2-app-3.js','js/v2-app-4.js'];
  for(const src of scripts){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.body.appendChild(s);});}
})().catch(err=>{console.error(err);document.body.innerHTML='<main style="font-family:-apple-system;padding:24px"><h1>Diala</h1><p>Version 2 could not finish loading. Refresh and try again.</p></main>';});
