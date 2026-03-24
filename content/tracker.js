(function () {
  if (window.__bugCaptureInit) return;
  window.__bugCaptureInit = true;

  let isTracking = false;
  const inputTimers = new WeakMap();

  // ── label extraction ────────────────────────────────────────────────────────

  function getLabel(el) {
    if (!el) return 'element';
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return labelEl.textContent.trim();
    }

    const text = el.textContent?.trim();
    if (text && text.length <= 60) return text;

    if (el.placeholder) return el.placeholder;
    if (el.title) return el.title;
    if (el.name) return el.name;
    if (el.id) return `#${el.id}`;
    return el.tagName.toLowerCase();
  }

  // ── capture helpers ──────────────────────────────────────────────────────────

  function send(data) {
    chrome.runtime.sendMessage({ type: 'CAPTURE_EVENT', data }).catch(() => {});
  }

  // ── event handlers ───────────────────────────────────────────────────────────

  function onClickCapture(e) {
    if (!isTracking) return;
    send({
      type: 'click',
      title: `Click "${getLabel(e.target)}"`,
      page: document.title,
      url: location.href,
      time: new Date().toISOString(),
    });
  }

  function onInputCapture(e) {
    if (!isTracking) return;
    const el = e.target;
    if (inputTimers.has(el)) clearTimeout(inputTimers.get(el));
    const timer = setTimeout(() => {
      const value = el.type === 'password' ? '***' : (el.value || '').slice(0, 80);
      send({
        type: 'input',
        title: `Type "${value}" in "${getLabel(el)}"`,
        page: document.title,
        url: location.href,
        time: new Date().toISOString(),
      });
    }, 900);
    inputTimers.set(el, timer);
  }

  // ── navigation (SPA + full-page) ─────────────────────────────────────────────

  let lastUrl = location.href;

  function onUrlChange() {
    if (!isTracking || location.href === lastUrl) return;
    lastUrl = location.href;
    // Small delay so document.title updates after SPA navigation
    setTimeout(() => {
      send({
        type: 'navigation',
        title: `Navigate to "${document.title || location.pathname}"`,
        page: document.title,
        url: location.href,
        time: new Date().toISOString(),
      });
    }, 100);
  }

  // Patch history API
  const _push = history.pushState.bind(history);
  const _replace = history.replaceState.bind(history);
  history.pushState = (...a) => { _push(...a); onUrlChange(); };
  history.replaceState = (...a) => { _replace(...a); onUrlChange(); };
  window.addEventListener('popstate', onUrlChange);

  // ── start / stop ─────────────────────────────────────────────────────────────

  function startTracking() {
    if (isTracking) return;
    isTracking = true;
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('input', onInputCapture, true);
  }

  function stopTracking() {
    isTracking = false;
    document.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('input', onInputCapture, true);
  }

  // ── SW messages ───────────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'START') startTracking();
    if (msg.type === 'STOP') stopTracking();
  });

  // On page load: if session already recording, resume + log navigation
  chrome.runtime.sendMessage({ type: 'GET_STATE' }).then((state) => {
    if (state?.recording) {
      startTracking();
      send({
        type: 'navigation',
        title: `Navigate to "${document.title || location.pathname}"`,
        page: document.title,
        url: location.href,
        time: new Date().toISOString(),
      });
    }
  }).catch(() => {});
})();
