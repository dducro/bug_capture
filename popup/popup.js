let state = { recording: false, steps: [] };

const dot        = document.getElementById('dot');
const statusText = document.getElementById('statusText');
const toggleBtn  = document.getElementById('toggleBtn');
const stepList   = document.getElementById('stepList');
const emptyMsg   = document.getElementById('emptyMsg');
const titleInput = document.getElementById('titleInput');
const exportBtn  = document.getElementById('exportBtn');

// ── render ────────────────────────────────────────────────────────────────────

function render() {
  // Header
  if (state.recording) {
    dot.classList.add('recording');
    statusText.textContent = 'Recording…';
    toggleBtn.textContent = 'Stop';
    toggleBtn.classList.add('stop');
  } else {
    dot.classList.remove('recording');
    statusText.textContent = state.steps.length ? 'Stopped' : 'Idle';
    toggleBtn.textContent = 'Start';
    toggleBtn.classList.remove('stop');
  }

  // Export button
  exportBtn.disabled = state.steps.length === 0;

  // Step list
  if (state.steps.length === 0) {
    stepList.innerHTML = '';
    stepList.appendChild(emptyMsg);
    emptyMsg.style.display = '';
    return;
  }
  emptyMsg.style.display = 'none';
  stepList.innerHTML = '';
  state.steps.forEach((step, i) => renderStep(step, i));
}

function renderStep(step, i) {
  const total = state.steps.length;
  const item = document.createElement('div');
  item.className = 'step-item';
  item.dataset.id = step.id;

  // Thumbnail
  if (step.screenshot) {
    const img = document.createElement('img');
    img.className = 'step-thumb';
    img.src = step.screenshot;
    img.alt = '';
    item.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'step-thumb-empty';
    ph.textContent = '🖼';
    item.appendChild(ph);
  }

  // Info
  const info = document.createElement('div');
  info.className = 'step-info';
  info.innerHTML = `
    <div class="step-num">Step ${i + 1}</div>
    <div class="step-title" title="${esc(step.title)}">${esc(step.title)}</div>
  `;
  item.appendChild(info);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'step-actions';

  const upBtn = mkIconBtn('↑', i === 0);
  upBtn.addEventListener('click', () => move(i, -1));

  const downBtn = mkIconBtn('↓', i === total - 1);
  downBtn.addEventListener('click', () => move(i, 1));

  const delBtn = mkIconBtn('×', false);
  delBtn.classList.add('del');
  delBtn.addEventListener('click', () => deleteStep(step.id));

  actions.append(upBtn, downBtn, delBtn);
  item.appendChild(actions);
  stepList.appendChild(item);
}

function mkIconBtn(label, disabled) {
  const btn = document.createElement('button');
  btn.className = 'btn-icon';
  btn.textContent = label;
  btn.disabled = disabled;
  return btn;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── actions ───────────────────────────────────────────────────────────────────

function move(index, dir) {
  const target = index + dir;
  if (target < 0 || target >= state.steps.length) return;
  const arr = [...state.steps];
  [arr[index], arr[target]] = [arr[target], arr[index]];
  state.steps = arr;
  chrome.runtime.sendMessage({ type: 'REORDER_STEPS', ids: arr.map((s) => s.id) });
  render();
}

function deleteStep(id) {
  state.steps = state.steps.filter((s) => s.id !== id);
  chrome.runtime.sendMessage({ type: 'DELETE_STEP', id });
  render();
}

// ── toggle (start / stop) ─────────────────────────────────────────────────────

toggleBtn.addEventListener('click', async () => {
  if (state.recording) {
    await chrome.runtime.sendMessage({ type: 'STOP_SESSION' });
    state.recording = false;
  } else {
    await chrome.runtime.sendMessage({ type: 'START_SESSION' });
    state.recording = true;
    state.steps = [];
  }
  render();
});

// ── export ────────────────────────────────────────────────────────────────────

exportBtn.addEventListener('click', () => {
  const title = titleInput.value.trim() || 'Bug Report';
  chrome.runtime.sendMessage({ type: 'EXPORT', title });
});

// ── init ──────────────────────────────────────────────────────────────────────

chrome.runtime.sendMessage({ type: 'GET_STATE' }).then((s) => {
  if (s) state = s;
  render();
});
