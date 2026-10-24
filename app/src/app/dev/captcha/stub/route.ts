// EZD-034 Step 8 (vault/plans/EZD-034.md section 3, Stub): a stand-in for Cloudflare's Turnstile script, served
// same-origin for /dev/captcha. It never issues a token on its own: tests call window.__captchaStub.issue().
// Not found in production.

const STUB_SOURCE = `(function () {
  var widgets = {};
  var latest = null;
  var count = 0;
  var issued = 0;
  var stub = {
    renders: [],
    resets: 0,
    removes: 0,
    issue: function () {
      if (latest === null) return '';
      issued += 1;
      var token = 'stub-token-' + issued;
      latest.opts.callback(token);
      return token;
    },
  };
  window.__captchaStub = stub;
  window.turnstile = {
    render: function (el, opts) {
      count += 1;
      var id = 'stub-widget-' + count;
      var div = document.createElement('div');
      div.setAttribute('data-testid', 'captcha-stub-widget');
      div.textContent = 'Security check (test stub)';
      el.appendChild(div);
      stub.renders.push({ sitekey: opts.sitekey, language: opts.language });
      widgets[id] = { el: div, opts: opts };
      latest = widgets[id];
      return id;
    },
    reset: function (id) {
      stub.resets += 1;
    },
    remove: function (id) {
      stub.removes += 1;
      var w = widgets[id];
      if (w) {
        if (w.el.parentNode) w.el.parentNode.removeChild(w.el);
        delete widgets[id];
      }
    },
  };
})();
`;

export function GET(): Response {
  if (process.env.VERCEL_ENV === 'production') return new Response(null, { status: 404 });
  return new Response(STUB_SOURCE, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
