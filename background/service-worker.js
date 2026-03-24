const store = chrome.storage.session ?? chrome.storage.local;
const STORE_KEY = 'bugCapture';
const DEFAULT = { recording: false, steps: [] };

// ── storage helpers ───────────────────────────────────────────────────────────

async function getState() {
  const r = await store.get(STORE_KEY);
  return r[STORE_KEY] ?? { ...DEFAULT };
}

async function setState(s) {
  await store.set({ [STORE_KEY]: s });
}

// ── screenshot ────────────────────────────────────────────────────────────────

async function captureTab(windowId) {
  try {
    return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  } catch {
    return null;
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
    if (step.screenshot) {
      lines.push(`![Step ${i + 1}](${step.screenshot})`);
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
      const screenshot = windowId ? await captureTab(windowId) : null;
      state.steps.push({
        id: crypto.randomUUID(),
        ...msg.data,
        screenshot,
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
