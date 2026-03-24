let state = { recording: false, steps: [] };

const dot        = document.getElementById('dot');
const statusText = document.getElementById('statusText');
const toggleBtn  = document.getElementById('toggleBtn');
const stepBar    = document.getElementById('stepBar');
const stepCount  = document.getElementById('stepCount');
const clearBtn   = document.getElementById('clearBtn');
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

  // Step bar
  if (state.steps.length > 0) {
    stepBar.classList.add('visible');
    stepCount.textContent = `${state.steps.length} step${state.steps.length === 1 ? '' : 's'}`;
  } else {
    stepBar.classList.remove('visible');
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

function thumbSrc(step) {
  return step.screenshotMode === 'zoom'
    ? (step.screenshotZoom ?? step.screenshotFull)
    : step.screenshotFull;
}

function renderStep(step, i) {
  const total = state.steps.length;
  const item = document.createElement('div');
  item.className = 'step-item';
  item.dataset.id = step.id;

  // Thumbnail
  const src = thumbSrc(step);
  if (src) {
    const img = document.createElement('img');
    img.className = 'step-thumb';
    img.src = src;
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

  const numEl = document.createElement('div');
  numEl.className = 'step-num';
  numEl.textContent = `Step ${i + 1}`;

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'step-title-input';
  titleInput.value = step.title;
  titleInput.addEventListener('blur', () => saveField(step.id, 'title', titleInput.value));
  titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') titleInput.blur(); });

  const descInput = document.createElement('input');
  descInput.type = 'text';
  descInput.className = 'step-desc-input';
  descInput.value = step.description || '';
  descInput.placeholder = 'Add description…';
  descInput.addEventListener('blur', () => saveField(step.id, 'description', descInput.value));
  descInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') descInput.blur(); });

  // Mode dropdown
  const select = document.createElement('select');
  select.className = 'step-mode-select';
  const optZoom = new Option('Zoom', 'zoom');
  const optFull = new Option('Full', 'full');
  select.append(optZoom, optFull);
  select.value = step.screenshotMode || 'full';

  select.addEventListener('change', () => {
    const mode = select.value;
    step.screenshotMode = mode;
    const imgEl = item.querySelector('.step-thumb');
    const newSrc = thumbSrc(step);
    if (imgEl && newSrc) imgEl.src = newSrc;
    chrome.runtime.sendMessage({ type: 'SET_STEP_MODE', id: step.id, mode });
  });

  info.append(numEl, titleInput, descInput, select);
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

// ── field save ────────────────────────────────────────────────────────────────

function saveField(id, field, value) {
  const step = state.steps.find((s) => s.id === id);
  if (!step || step[field] === value) return;
  step[field] = value;
  chrome.runtime.sendMessage({ type: 'UPDATE_STEP', id, [field]: value });
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

// ── clear ─────────────────────────────────────────────────────────────────────

clearBtn.addEventListener('click', () => {
  state.steps = [];
  chrome.runtime.sendMessage({ type: 'CLEAR_STEPS' });
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
