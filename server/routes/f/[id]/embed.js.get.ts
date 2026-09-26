// Embed snippet: <script src="https://mail.example.com/f/<id>/embed.js" async></script>
// Inserts an auto-resizing iframe right where the script tag sits.
export default defineEventHandler((event) => {
  const id = String(getRouterParam(event, 'id') || '')
  if (!/^[\w-]{6,40}$/.test(id)) {
    setResponseStatus(event, 404)
    return ''
  }
  const base = String(useServerConfig().trackingBaseUrl || getRequestURL(event).origin).replace(/\/$/, '')
  setHeader(event, 'Content-Type', 'application/javascript; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=300')
  setHeader(event, 'Cross-Origin-Resource-Policy', 'cross-origin')
  return `(function(){var s=document.currentScript;var f=document.createElement('iframe');
f.src=${JSON.stringify(`${base}/f/${id}?embed=1`)};f.title='Formulario de suscripción';f.loading='lazy';
f.style.cssText='width:100%;border:0;min-height:320px;overflow:hidden;background:transparent';f.setAttribute('scrolling','no');
window.addEventListener('message',function(e){if(e.origin!==${JSON.stringify(new URL(base).origin)})return;var d=e.data||{};if(d.tmForm===${JSON.stringify(id)}&&d.height){f.style.height=(d.height+4)+'px'}});
(s&&s.parentNode)?s.parentNode.insertBefore(f,s):document.body.appendChild(f);})();`
})
