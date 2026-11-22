/* Put Meet the CEO inside any web page or web app with one line:
     <script src="https://YOUR-CEO-ADDRESS/embed.js" async></script>
   Optional: the language, and a new hire to welcome (the page can still change them):
     data-lang="es" data-name="Sam Rivera" data-role="Customer success manager" data-team="Customer success" data-start="2026-12-01"
   It adds the CEO in a frame where the line is (no style clash with your page), keeps the frame's
   height right, and passes events on to your page as window "spatius:event" (for your analytics). */
(function () {
  var me = document.currentScript;
  if (!me) return;
  var base = me.src.replace(/embed\.js(\?.*)?$/, '');
  var q = [];
  ['lang', 'name', 'role', 'team', 'start'].forEach(function (k) { var v = me.getAttribute('data-' + k); if (v) q.push(k + '=' + encodeURIComponent(v)); });
  var frame = document.createElement('iframe');
  frame.src = base + (q.length ? '?' + q.join('&') : '');
  frame.title = 'Meet the CEO';
  frame.allow = 'microphone; autoplay';
  frame.style.cssText = 'display:block;width:100%;border:0;height:1100px;background:transparent';
  me.parentNode.insertBefore(frame, me);
  window.addEventListener('message', function (e) {
    if (e.source !== frame.contentWindow || !e.data) return;
    if (e.data.type === 'spatius-embed-height') frame.style.height = e.data.height + 'px';
    if (e.data.type === 'spatius-event') window.dispatchEvent(new CustomEvent('spatius:event', { detail: e.data }));
  });
})();
