const store = chrome.storage.session ?? chrome.storage.local;
const STORE_KEY = 'bugCapture';
const DEFAULT = { recording: false, steps: [] };

// ── storage helpers ───────────────────────────────────────────────────────────

async function getState() {
  const r = await store.get(STORE_KEY);
  // Merge so any missing DEFAULT fields are filled in
  return { ...DEFAULT, ...(r[STORE_KEY] ?? {}) };
}

async function setState(s) {
  await store.set({ [STORE_KEY]: s });
}

// ── screenshot capture ────────────────────────────────────────────────────────

async function captureTab(windowId) {
  try {
    return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  } catch {
    return null;
  }
}

// ── image processing ──────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function bitmapToJpeg(bitmap, w, h, sx, sy, sw, sh) {
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 });
  const base64 = arrayBufferToBase64(await blob.arrayBuffer());
  return `data:image/jpeg;base64,${base64}`;
}

// Returns { zoom: string|null, full: string }
async function processScreenshot(dataUrl, eventData) {
  if (!dataUrl) return { zoom: null, full: null };
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const { width: bw, height: bh } = bitmap;

    // Full: 50% scale
    const full = await bitmapToJpeg(bitmap, Math.round(bw * 0.5), Math.round(bh * 0.5), 0, 0, bw, bh);

    // Zoom: crop around click point (click events only)
    let zoom = null;
    if (eventData.clientX != null) {
      const dpr = eventData.devicePixelRatio || 1;
      const cropW = Math.min(Math.round(400 * dpr), bw);
      const cropH = Math.min(Math.round(280 * dpr), bh);
      const cx = Math.round(eventData.clientX * dpr);
      const cy = Math.round(eventData.clientY * dpr);
      const sx = Math.max(0, Math.min(cx - Math.floor(cropW / 2), bw - cropW));
      const sy = Math.max(0, Math.min(cy - Math.floor(cropH / 2), bh - cropH));
      zoom = await bitmapToJpeg(bitmap, cropW, cropH, sx, sy, cropW, cropH);
    }

    return { zoom, full };
  } catch (e) {
    console.warn('processScreenshot failed:', e);
    return { zoom: null, full: dataUrl };
  }
}

// ── markdown builder ──────────────────────────────────────────────────────────

function buildMarkdown(title, steps) {
  const lines = [`# ${title || 'Bug Report'}`, ''];
  steps.forEach((step, i) => {
    lines.push(`## Step ${i + 1} — ${step.title}`);
    lines.push(`**Page:** ${step.page}`);
    lines.push(`**URL:** ${step.url}`);
    lines.push(`**Time:** ${step.time}`);
    lines.push('');
    if (step.description) {
      lines.push(`> ${step.description}`);
      lines.push('');
    }
    const img = step.screenshotMode === 'zoom'
      ? (step.screenshotZoom ?? step.screenshotFull)
      : step.screenshotFull;
    if (img) {
      lines.push(`![Step ${i + 1}](${img})`);
      lines.push('');
    }
  });
  return lines.join('\n');
}

function downloadMarkdown(title, content) {
  const slug = (title || 'bug-report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const dataUrl =
    'data:text/markdown;charset=utf-8,' + encodeURIComponent(content);
  chrome.downloads.download({ url: dataUrl, filename: `${slug}.md`, saveAs: false });
}

// ── message router ────────────────────────────────────────────────────────────

async function handle(msg, sender) {
  const state = await getState();

  switch (msg.type) {
    case 'GET_STATE':
      return state;

    case 'START_SESSION': {
      const fresh = { recording: true, steps: [] };
      await setState(fresh);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) chrome.tabs.sendMessage(tab.id, { type: 'START' }).catch(() => {});
      return { ok: true };
    }

    case 'STOP_SESSION': {
      state.recording = false;
      await setState(state);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) chrome.tabs.sendMessage(tab.id, { type: 'STOP' }).catch(() => {});
      return { ok: true };
    }

    case 'CAPTURE_EVENT': {
      if (!state.recording) return {};
      const windowId = sender.tab?.windowId;
      const raw = windowId ? await captureTab(windowId) : null;
      const { zoom, full } = await processScreenshot(raw, msg.data);
      state.steps.push({
        id: crypto.randomUUID(),
        ...msg.data,
        screenshotZoom: zoom,
        screenshotFull: full,
        screenshotMode: zoom ? 'zoom' : 'full',
      });
      await setState(state);
      return { ok: true };
    }

    case 'DELETE_STEP': {
      state.steps = state.steps.filter((s) => s.id !== msg.id);
      await setState(state);
      return { ok: true };
    }

    case 'REORDER_STEPS': {
      const byId = Object.fromEntries(state.steps.map((s) => [s.id, s]));
      state.steps = msg.ids.map((id) => byId[id]).filter(Boolean);
      await setState(state);
      return { ok: true };
    }

    case 'CLEAR_STEPS': {
      state.steps = [];
      await setState(state);
      return { ok: true };
    }

    case 'UPDATE_STEP': {
      const step = state.steps.find((s) => s.id === msg.id);
      if (step) {
        if (msg.title !== undefined) step.title = msg.title;
        if (msg.description !== undefined) step.description = msg.description;
        await setState(state);
      }
      return { ok: true };
    }

    case 'SET_STEP_MODE': {
      const step = state.steps.find((s) => s.id === msg.id);
      if (step) {
        step.screenshotMode = msg.mode;
        await setState(state);
      }
      return { ok: true };
    }

    case 'EXPORT': {
      const md = buildMarkdown(msg.title, state.steps);
      downloadMarkdown(msg.title, md);
      return { ok: true };
    }

    default:
      return {};
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
  return true;
});
