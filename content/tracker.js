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

  // ── recording indicator ───────────────────────────────────────────────────────

  function injectRecordingIndicator() {
    if (document.getElementById('__bugCaptureIndicator')) return;
    const style = document.createElement('style');
    style.id = '__bugCaptureIndicatorStyle';
    style.textContent = `
      @keyframes __bugCapturePulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.35; transform: scale(0.82); }
      }
      #__bugCaptureIndicator {
        position: fixed !important;
        top: 14px !important;
        right: 14px !important;
        width: 14px !important;
        height: 14px !important;
        border-radius: 50% !important;
        background: #ef4444 !important;
        z-index: 2147483647 !important;
        animation: __bugCapturePulse 1s ease-in-out infinite !important;
        pointer-events: none !important;
        box-shadow: 0 0 0 3px rgba(239,68,68,0.25) !important;
      }
    `;
    document.head.appendChild(style);
    const div = document.createElement('div');
    div.id = '__bugCaptureIndicator';
    document.body.appendChild(div);
  }

  function removeRecordingIndicator() {
    document.getElementById('__bugCaptureIndicator')?.remove();
    document.getElementById('__bugCaptureIndicatorStyle')?.remove();
  }

  // ── hover highlight (deepest element only) ───────────────────────────────────

  let _lastHighlighted = null;

  function onMouseMove(e) {
    const el = e.target;
    if (el === _lastHighlighted) return;
    _lastHighlighted?.classList.remove('__bugCaptureHighlight');
    if (el && el !== document.documentElement && el !== document.body) {
      el.classList.add('__bugCaptureHighlight');
    }
    _lastHighlighted = el;
  }

  function injectHoverHighlight() {
    if (document.getElementById('__bugCaptureHoverStyle')) return;
    const style = document.createElement('style');
    style.id = '__bugCaptureHoverStyle';
    style.textContent = `
      .__bugCaptureHighlight {
        outline: 2px solid #fbbf24 !important;
        outline-offset: 4px !important;
      }
    `;
    document.head.appendChild(style);
    document.addEventListener('mousemove', onMouseMove, true);
  }

  function removeHoverHighlight() {
    document.getElementById('__bugCaptureHoverStyle')?.remove();
    document.removeEventListener('mousemove', onMouseMove, true);
    _lastHighlighted?.classList.remove('__bugCaptureHighlight');
    _lastHighlighted = null;
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
      clientX: e.clientX,
      clientY: e.clientY,
      devicePixelRatio: window.devicePixelRatio || 1,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
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
    injectRecordingIndicator();
    injectHoverHighlight();
  }

  function stopTracking() {
    isTracking = false;
    document.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('input', onInputCapture, true);
    removeRecordingIndicator();
    removeHoverHighlight();
  }

  // ── SW messages ───────────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'START') startTracking();
    if (msg.type === 'STOP') stopTracking();
  });

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
