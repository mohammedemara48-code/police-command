(async () => {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    parts.push(await fetch(new URL('./assets/bundle.b64.' + i + '.txt', import.meta.url)).then(r => r.text()));
  }
  const bin = Uint8Array.from(atob(parts.join('')), c => c.charCodeAt(0));
  const blob = new Blob([bin], { type: 'text/javascript' });
  await import(URL.createObjectURL(blob));
})().catch(e => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', '<pre style="color:#f66;padding:12px;direction:ltr">'+e+'</pre>');
});
