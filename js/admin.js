/* ==========================================================================
   admin.js  -  the Admin tool (admin/index.html).

   What it does
   1. Loads data/templates.json.
   2. Lets you add / edit / hide / delete templates and manage categories.
   3. Lets you drag the Name and Mobile text on top of the image.
   4. Converts your image to a 1080x1080 WebP + a small thumbnail.
   5. Saves the result in ONE of two ways:
        A) "Download" buttons  -> you upload the files on github.com (always works)
        B) "Publish to GitHub" -> the page saves the files for you, using a GitHub
           access token that YOU paste in. GitHub itself checks the token, so this
           is real security (unlike a password box on a static page).

   Nothing is stored anywhere except your browser (this page) and your GitHub repo.
   ========================================================================== */

import { VARIABLES, previewTexts } from './variables.js';
import { SIZE, drawTemplate, loadImage, mergeFields, mergeStrip, imageToBlob, EXTENSION_FOR_TYPE } from './canvas.js';
import { h, slugify, bytesToBase64, base64ToText, textToBase64 } from './util.js';
import { downloadBlob } from './share.js';

const $ = (selector) => document.querySelector(selector);
const GH_KEY = 'ishare.admin.github.v1';
const SNAP_DISTANCE = 8;
const DEFAULT_MESSAGE = 'Hello {NAME},\n\nFor any insurance requirement, feel free to contact me.\n\n📞 {MOBILE}';
const PROPS = ['x', 'y', 'fontSize', 'maxWidth', 'fontFamily', 'fontWeight', 'color', 'align', 'prefix', 'letterSpacing'];

const state = {
  data: null,              // the whole templates.json
  localBlobs: new Map(),   // path -> Blob   (images made in this session)
  urls: new Map(),         // path -> object URL (for showing local blobs)
  pending: new Set(),      // paths that still have to be uploaded to GitHub
  dirty: false,            // unsaved changes exist
  edit: null,              // the template being edited (see openEditor)
  gh: { connected: false, cfg: null, jsonSha: null },
};
let toastTimer = null;
let redrawQueued = false;

/* ---------- small helpers ---------- */

function toast(message, ms = 4000) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (o) => JSON.parse(JSON.stringify(o));
const sameValue = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** Only the settings that differ from the defaults (keeps templates.json short and easy to read). */
function diffObject(base = {}, current = {}) {
  const out = {};
  for (const key of Object.keys(current)) if (!sameValue(current[key], base[key] ?? '')) out[key] = current[key];
  return out;
}
function diffFields(defaults = {}, full = {}) {
  const out = {};
  for (const key of Object.keys(full)) {
    const d = diffObject(defaults[key], full[key]);
    if (Object.keys(d).length) out[key] = d;
  }
  return out;
}

function categoryName(id) {
  const c = state.data.categories.find((x) => x.id === id);
  return c ? c.name : '(no category)';
}

/** Where can the browser find this image right now? (new local image, or the live site) */
function imageUrl(path) {
  if (state.localBlobs.has(path)) {
    if (!state.urls.has(path)) state.urls.set(path, URL.createObjectURL(state.localBlobs.get(path)));
    return state.urls.get(path);
  }
  return '../' + path;
}

function setPending(path, blob) {
  if (state.urls.has(path)) { URL.revokeObjectURL(state.urls.get(path)); state.urls.delete(path); }
  state.localBlobs.set(path, blob);
  state.pending.add(path);
}

function dropLocalFile(path) {
  if (state.urls.has(path)) { URL.revokeObjectURL(state.urls.get(path)); state.urls.delete(path); }
  state.localBlobs.delete(path);
  state.pending.delete(path);
}

function markDirty() {
  state.dirty = true;
  renderStatus();
}

/* ---------- start-up ---------- */

async function boot() {
  try {
    const response = await fetch('../data/templates.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    setData(await response.json());
  } catch (err) {
    $('#loading').hidden = true;
    const box = $('#fatal');
    box.hidden = false;
    box.textContent = 'data/templates.json could not be loaded. Open this page through GitHub Pages (or a local web server), not by double-clicking the file.';
    return;
  }

  buildStaticParts();
  loadSavedGitHubSettings();
  renderAll();
  $('#loading').hidden = true;
  $('#app').hidden = false;
}

function setData(json) {
  state.data = json;
  state.data.settings = state.data.settings || {};
  state.data.categories = state.data.categories || [];
  state.data.templates = state.data.templates || [];
}

function renderAll() {
  renderStatus();
  renderList();
  renderCategories();
}

/* ---------- status + save buttons ---------- */

function renderStatus() {
  const files = state.pending.size;
  let text;
  if (!state.dirty && files === 0) {
    text = 'No unsaved changes.';
  } else {
    text = 'You have unsaved changes' + (files ? ` and ${files} new image file${files > 1 ? 's' : ''}` : '') + '. ';
    text += state.gh.connected
      ? 'Click "Publish to GitHub" to save them.'
      : 'To make them live: connect GitHub below and publish, or download the files and upload them on github.com.';
  }
  $('#statusText').textContent = text;
  $('#btnPublish').disabled = !(state.gh.connected && (state.dirty || files > 0));
  $('#btnDownloadImages').disabled = files === 0;
}

$('#btnDownloadJson').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.data, null, 2) + '\n'], { type: 'application/json' });
  downloadBlob(blob, 'templates.json');
  toast('Downloaded templates.json. Upload it to the "data" folder on GitHub (replace the old one).', 6000);
});

$('#btnDownloadImages').addEventListener('click', async () => {
  for (const path of state.pending) {
    downloadBlob(state.localBlobs.get(path), path.split('/').pop());
    await sleep(700); // browsers may ask permission for multiple downloads
  }
  toast('Upload these image files to the "images/templates" folder on GitHub.', 6000);
});

window.addEventListener('beforeunload', (e) => {
  if (state.dirty || state.pending.size) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- template list ---------- */

function renderList() {
  const list = $('#tplList');
  list.replaceChildren();
  if (!state.data.templates.length) {
    list.append(h('p', { class: 'notice' }, 'No templates yet. Click "Add template".'));
    return;
  }
  for (const t of state.data.templates) {
    const activeBox = h('input', { type: 'checkbox', checked: t.active !== false, onchange: (e) => { t.active = e.target.checked; markDirty(); renderList(); } });
    list.append(
      h('div', { class: 'tpl-row' },
        h('img', { src: imageUrl(t.thumb || t.image), alt: '', width: 64, height: 64, loading: 'lazy' }),
        h('div', { class: 'tpl-info' },
          h('strong', {}, t.title,
            t.active === false ? h('span', { class: 'tpl-badge' }, 'Hidden') : null,
            state.pending.has(t.image) ? h('span', { class: 'tpl-badge new' }, 'New image') : null),
          h('span', { class: 'tpl-meta' }, `${categoryName(t.category)} — ${t.id}`)),
        h('div', { class: 'tpl-actions' },
          h('label', {}, activeBox, 'Active'),
          h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => openEditor(t.id) }, 'Edit'),
          h('button', { type: 'button', class: 'btn btn-danger', onclick: () => deleteTemplate(t.id) }, 'Delete'))));
  }
}

function deleteTemplate(id) {
  const t = state.data.templates.find((x) => x.id === id);
  if (!t) return;
  if (!confirm(`Delete "${t.title}" from the website?\n\n(The image file stays in your GitHub repository until you delete it there. That is harmless.)`)) return;
  state.data.templates = state.data.templates.filter((x) => x.id !== id);
  dropLocalFile(t.image);
  if (t.thumb) dropLocalFile(t.thumb);
  markDirty();
  renderList();
  toast('Template removed. Remember to save your changes.');
}

/* ---------- categories ---------- */

function renderCategories() {
  const box = $('#catList');
  box.replaceChildren();
  for (const c of state.data.categories) {
    const inUse = state.data.templates.some((t) => t.category === c.id);
    box.append(
      h('div', { class: 'cat-item' },
        h('span', {}, c.name),
        h('button', {
          type: 'button', class: 'btn btn-secondary',
          onclick: () => {
            const name = (prompt('New name for this category:', c.name) || '').trim();
            if (name) { c.name = name; markDirty(); renderAll(); }
          },
        }, 'Rename'),
        h('button', {
          type: 'button', class: 'btn btn-danger', disabled: inUse,
          title: inUse ? 'Move or delete the templates in this category first' : '',
          onclick: () => { state.data.categories = state.data.categories.filter((x) => x.id !== c.id); markDirty(); renderAll(); },
        }, 'Delete')));
  }
}

$('#btnAddCat').addEventListener('click', () => {
  const input = $('#newCat');
  const name = input.value.trim();
  if (!name) return;
  let id = slugify(name) || 'cat-' + Date.now().toString(36);
  while (state.data.categories.some((c) => c.id === id)) id += '-2';
  state.data.categories.push({ id, name });
  input.value = '';
  markDirty();
  renderAll();
});

/* ---------- editor: open / close ---------- */

async function openEditor(id) {
  const existing = id ? state.data.templates.find((t) => t.id === id) : null;
  const s = state.data.settings;
  const tpl = existing
    ? clone(existing)
    : { id: '', title: '', category: state.data.categories[0]?.id || '', description: '', image: '', message: DEFAULT_MESSAGE, active: true };

  state.edit = {
    isNew: !existing,
    original: existing,
    tpl,
    fields: mergeFields(s.defaultFields, tpl.fields),
    strip: mergeStrip(s.strip, tpl.strip),
    img: null,
    imgFile: null,
    imgUrl: null,
    selected: 'name',
    drag: null,
    idTouched: !!existing,
    boxes: {},
  };

  $('#editorTitle').textContent = existing ? 'Edit template' : 'Add template';
  $('#e-title').value = tpl.title;
  $('#e-id').value = tpl.id;
  $('#e-id').disabled = !!existing;
  $('#e-desc').value = tpl.description || '';
  $('#e-message').value = tpl.message;
  $('#e-active').checked = tpl.active !== false;
  $('#e-image').value = '';
  $('#imageInfo').textContent = existing ? 'Leave empty to keep the current image, or choose a new file to replace it.' : 'Choose the image made in ChatGPT (PNG, JPG or WebP, square).';
  $('#editorError').textContent = '';
  $('#btnSaveTpl').disabled = false;
  $('#btnSaveTpl').textContent = 'Save template';

  const select = $('#e-category');
  select.replaceChildren(...state.data.categories.map((c) => h('option', { value: c.id, selected: c.id === tpl.category }, c.name)));

  $('#st-repaint').checked = !!state.edit.strip.repaint;
  $('#st-color').value = (state.edit.strip.color || '#ffffff').toLowerCase();

  selectField('name');
  $('#editor').hidden = false;
  $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (existing) {
    const editing = state.edit; // remember which editor session this is (the user may close it while loading)
    try {
      const img = await loadImage(imageUrl(existing.image), false);
      if (state.edit === editing) editing.img = img;
    } catch (err) {
      if (state.edit === editing) $('#imageInfo').textContent = 'The current image could not be loaded. Choose the image file again.';
    }
  }
  redraw();
}

function closeEditor() {
  const e = state.edit;
  if (e?.imgUrl) URL.revokeObjectURL(e.imgUrl);
  state.edit = null;
  $('#editor').hidden = true;
}

$('#btnAdd').addEventListener('click', () => {
  if (!state.data.categories.length) { toast('Please add a category first (see "Categories" below).', 5000); return; }
  openEditor(null);
});
$('#btnCancelTpl').addEventListener('click', closeEditor);

/* ---------- editor: form fields ---------- */

function buildStaticParts() {
  // Buttons that insert {NAME}, {MOBILE} ... into the message
  $('#varChips').replaceChildren(
    ...VARIABLES.map((v) => h('button', {
      type: 'button', class: 'chip',
      onclick: () => insertAtCursor($('#e-message'), `{${v.key}}`),
    }, `{${v.key}}`)));

  // Field selector
  document.querySelectorAll('.seg-btn').forEach((btn) =>
    btn.addEventListener('click', () => selectField(btn.dataset.field)));

  // Numeric / text property boxes
  for (const prop of PROPS) {
    const el = $('#p-' + prop);
    el.addEventListener('input', () => {
      if (!state.edit) return;
      const f = state.edit.fields[state.edit.selected];
      f[prop] = el.type === 'number' ? (el.value === '' ? 0 : Number(el.value)) : el.value;
      queueRedraw();
    });
  }

  // Arrow buttons: move by 1 pixel
  document.querySelectorAll('[data-nudge]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (!state.edit) return;
      const [dx, dy] = btn.dataset.nudge.split(',').map(Number);
      const f = state.edit.fields[state.edit.selected];
      f.x = clamp((Number(f.x) || 0) + dx, 0, SIZE);
      f.y = clamp((Number(f.y) || 0) + dy, 0, SIZE);
      syncPositionInputs();
      queueRedraw();
    }));

  $('#btnResetPos').addEventListener('click', () => {
    if (!state.edit) return;
    state.edit.fields = mergeFields(state.data.settings.defaultFields, {});
    populateProps();
    queueRedraw();
    toast('Positions and style reset to the standard.');
  });

  $('#st-repaint').addEventListener('change', () => { if (state.edit) { state.edit.strip.repaint = $('#st-repaint').checked; queueRedraw(); } });
  $('#st-color').addEventListener('input', () => { if (state.edit) { state.edit.strip.color = $('#st-color').value; queueRedraw(); } });
  $('#s-name').addEventListener('input', queueRedraw);
  $('#s-mobile').addEventListener('input', queueRedraw);

  // Title -> ID (until the ID is typed by hand)
  $('#e-title').addEventListener('input', () => {
    const e = state.edit;
    if (e && e.isNew && !e.idTouched) $('#e-id').value = slugify($('#e-title').value);
  });
  $('#e-id').addEventListener('input', () => { if (state.edit) state.edit.idTouched = true; });

  $('#e-image').addEventListener('change', onImageChosen);
  $('#btnSaveTpl').addEventListener('click', saveTemplate);
  setupDragging();
}

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
}

async function onImageChosen(ev) {
  const e = state.edit;
  const file = ev.target.files[0];
  if (!e || !file) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url, false);
    if (e.imgUrl) URL.revokeObjectURL(e.imgUrl);
    e.img = img;
    e.imgFile = file;
    e.imgUrl = url;
    const w = img.naturalWidth, hgt = img.naturalHeight;
    let note = `Image size: ${w} × ${hgt} px. `;
    if (w !== hgt) note += 'WARNING: this is not square, it will be stretched. Please use a square image.';
    else if (w !== SIZE) note += 'It will be resized to 1080 × 1080 automatically.';
    else note += 'Perfect size.';
    $('#imageInfo').textContent = note;
  } catch (err) {
    URL.revokeObjectURL(url);
    $('#imageInfo').textContent = 'This file could not be read as an image. Please choose a PNG, JPG or WebP file.';
  }
  queueRedraw();
}

/* ---------- editor: field selection + drawing ---------- */

function selectField(key) {
  if (state.edit) state.edit.selected = key;
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.field === key));
  populateProps();
  queueRedraw();
}

function populateProps() {
  const e = state.edit;
  if (!e) return;
  const f = e.fields[e.selected] || {};
  for (const prop of PROPS) {
    const el = $('#p-' + prop);
    const value = f[prop] ?? '';
    if (el.tagName === 'SELECT' && value !== '' && ![...el.options].some((o) => o.value === String(value))) {
      el.append(h('option', { value }, String(value))); // a font/weight that is not in the list
    }
    el.value = prop === 'color' ? String(value || '#000000').toLowerCase() : value;
  }
}

function syncPositionInputs() {
  const e = state.edit;
  const f = e.fields[e.selected];
  $('#p-x').value = f.x;
  $('#p-y').value = f.y;
}

function queueRedraw() {
  if (redrawQueued) return;
  redrawQueued = true;
  requestAnimationFrame(() => { redrawQueued = false; redraw(); });
}

function redraw() {
  const e = state.edit;
  if (!e) return;
  const { texts } = previewTexts({ NAME: $('#s-name').value, MOBILE: $('#s-mobile').value }, state.data.settings, { useSamples: true });
  e.boxes = drawTemplate($('#adminCanvas'), e.img, {
    fields: e.fields, strip: e.strip, texts, guides: true, selected: e.selected,
  });
}

/* ---------- editor: dragging with mouse or finger ---------- */

function setupDragging() {
  const canvas = $('#adminCanvas');

  const toPoint = (ev) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) * SIZE) / r.width, y: ((ev.clientY - r.top) * SIZE) / r.height };
  };

  // Which text is under the pointer? (a generous 16 px margin makes touch easier)
  const hitTest = (p) => {
    const e = state.edit;
    let best = null, bestDistance = Infinity;
    for (const [key, b] of Object.entries(e.boxes)) {
      const pad = 16;
      if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad) {
        const d = Math.hypot(p.x - (b.x + b.w / 2), p.y - (b.y + b.h / 2));
        if (d < bestDistance) { best = key; bestDistance = d; }
      }
    }
    return best;
  };

  canvas.addEventListener('pointerdown', (ev) => {
    const e = state.edit;
    if (!e) return;
    const p = toPoint(ev);
    const key = hitTest(p);
    if (!key) return;
    selectField(key);
    const f = e.fields[key];
    e.drag = { key, dx: p.x - f.x, dy: p.y - f.y };
    canvas.setPointerCapture(ev.pointerId);
    canvas.style.cursor = 'grabbing';
    ev.preventDefault();
  });

  canvas.addEventListener('pointermove', (ev) => {
    const e = state.edit;
    if (!e) return;
    const p = toPoint(ev);
    if (!e.drag) { canvas.style.cursor = hitTest(p) ? 'grab' : 'default'; return; }

    const f = e.fields[e.drag.key];
    let nx = p.x - e.drag.dx;
    let ny = p.y - e.drag.dy;
    if ($('#snap').checked) {
      const std = state.data.settings.defaultFields?.[e.drag.key];
      if (std) {
        if (Math.abs(nx - std.x) <= SNAP_DISTANCE) nx = std.x;
        if (Math.abs(ny - std.y) <= SNAP_DISTANCE) ny = std.y;
      }
    }
    f.x = clamp(Math.round(nx), 0, SIZE);
    f.y = clamp(Math.round(ny), 0, SIZE);
    syncPositionInputs();
    queueRedraw();
  });

  const stop = () => { if (state.edit) state.edit.drag = null; canvas.style.cursor = 'default'; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
}

/* ---------- editor: save into the in-page data ---------- */

async function saveTemplate() {
  const e = state.edit;
  if (!e) return;
  const settings = state.data.settings;
  const errorBox = $('#editorError');
  errorBox.textContent = '';

  const title = $('#e-title').value.trim();
  const message = $('#e-message').value.replace(/\r\n/g, '\n');
  const category = $('#e-category').value;
  const description = $('#e-desc').value.trim();
  const active = $('#e-active').checked;
  let id = e.isNew ? slugify($('#e-id').value) : e.tpl.id;

  // ---- check everything first
  const problems = [];
  if (!title) problems.push('Please enter a title.');
  if (e.isNew && !id) problems.push('Please enter an ID (letters, numbers and dashes).');
  if (e.isNew && id && state.data.templates.some((t) => t.id === id)) problems.push(`The ID "${id}" is already used by another template.`);
  if (!category) problems.push('Please choose a category.');
  if (!message.trim()) problems.push('Please enter the predefined message.');
  if (e.isNew && !e.imgFile) problems.push('Please choose the image file.');
  const known = new Set(VARIABLES.map((v) => v.key));
  const unknown = [...message.matchAll(/\{([A-Za-z_]+)\}/g)].map((m) => m[1].toUpperCase()).find((k) => !known.has(k));
  if (unknown) problems.push(`The message contains {${unknown}}, which does not exist. Available: ${VARIABLES.map((v) => '{' + v.key + '}').join(', ')}.`);
  if (problems.length) { errorBox.textContent = problems.join(' '); return; }

  // ---- convert a new/replaced image to 1080 WebP + thumbnail
  let image = e.tpl.image;
  let thumb = e.tpl.thumb;
  if (e.imgFile) {
    const button = $('#btnSaveTpl');
    button.disabled = true;
    button.textContent = 'Preparing image…';
    const big = await imageToBlob(e.img, SIZE, 'image/webp', 0.9);
    const small = await imageToBlob(e.img, 480, 'image/webp', 0.82);
    button.disabled = false;
    button.textContent = 'Save template';
    if (!big || !small) { errorBox.textContent = 'The image could not be converted. Please try another file.'; return; }
    const newImage = `images/templates/${id}.${EXTENSION_FOR_TYPE[big.type] || 'png'}`;
    const newThumb = `images/templates/${id}-thumb.${EXTENSION_FOR_TYPE[small.type] || 'png'}`;
    for (const old of [image, thumb]) if (old && old !== newImage && old !== newThumb) dropLocalFile(old);
    setPending(newImage, big);
    setPending(newThumb, small);
    image = newImage;
    thumb = newThumb;
  }

  // ---- build the template entry (only non-default field settings are stored)
  const out = { ...(e.original || {}), id, title, category, description, image, thumb, message, active };
  if (!description) delete out.description;
  if (!thumb) delete out.thumb;
  const fieldChanges = diffFields(settings.defaultFields, e.fields);
  const stripChanges = diffObject(settings.strip, e.strip);
  if (Object.keys(fieldChanges).length) out.fields = fieldChanges; else delete out.fields;
  if (Object.keys(stripChanges).length) out.strip = stripChanges; else delete out.strip;

  // Keep a tidy key order in the JSON file.
  const order = ['id', 'title', 'category', 'description', 'image', 'thumb', 'message', 'active', 'fields', 'strip'];
  const ordered = {};
  for (const k of order) if (k in out) ordered[k] = out[k];
  for (const k of Object.keys(out)) if (!(k in ordered)) ordered[k] = out[k];

  if (e.isNew) state.data.templates.unshift(ordered); // newest first
  else state.data.templates = state.data.templates.map((t) => (t.id === id ? ordered : t));

  closeEditor();
  markDirty();
  renderList();
  toast('Template saved on this page. Now publish it (or download the files).', 6000);
}

/* ==========================================================================
   GitHub publishing (optional)
   Uses the GitHub "contents" API. The token never leaves this browser except
   to be sent to api.github.com.
   ========================================================================== */

function loadSavedGitHubSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(GH_KEY) || 'null');
    if (!saved) return;
    $('#gh-owner').value = saved.owner || '';
    $('#gh-repo').value = saved.repo || '';
    $('#gh-branch').value = saved.branch || 'main';
    $('#gh-token').value = saved.token || '';
    $('#gh-remember').checked = true;
  } catch (e) { /* ignore */ }
}

function readGitHubForm() {
  return {
    owner: $('#gh-owner').value.trim(),
    repo: $('#gh-repo').value.trim(),
    branch: $('#gh-branch').value.trim() || 'main',
    token: $('#gh-token').value.trim(),
  };
}

async function gh(cfg, path, { method = 'GET', body = null } = {}) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encodedPath}` +
    (method === 'GET' ? `?ref=${encodeURIComponent(cfg.branch)}` : '');
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${cfg.token}`,
  };
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function githubError(response) {
  let detail = '';
  try { detail = (await response.json()).message || ''; } catch (e) { /* ignore */ }
  const hints = {
    401: 'The token is wrong or has expired.',
    403: 'The token is not allowed to do this. It needs "Contents: Read and write" on this repository.',
    404: 'Not found. Check the user name, repository name and branch, and that the token has access to this repository.',
    409: 'The file changed on GitHub in the meantime. Click "Connect and load from GitHub" again.',
    422: `GitHub refused the change. ${detail}`,
  };
  return new Error(`${response.status} — ${hints[response.status] || detail || 'Unexpected error.'}`);
}

/** Read one file from the repository. Returns null if it does not exist. */
async function githubGet(cfg, path) {
  const response = await gh(cfg, path);
  if (response.status === 404) return null;
  if (!response.ok) throw await githubError(response);
  return response.json();
}

async function githubPut(cfg, path, base64Content, message, sha) {
  const body = { message, content: base64Content, branch: cfg.branch };
  if (sha) body.sha = sha;
  const response = await gh(cfg, path, { method: 'PUT', body });
  if (!response.ok) throw await githubError(response);
  return response.json();
}

$('#btnConnect').addEventListener('click', async () => {
  const cfg = readGitHubForm();
  const status = $('#ghStatus');
  if (!cfg.owner || !cfg.repo || !cfg.token) { status.textContent = 'Please fill in user name, repository name and token.'; return; }
  if ((state.dirty || state.pending.size) && !confirm('You have unsaved changes on this page. Loading from GitHub replaces them. Continue?')) return;

  status.textContent = 'Connecting…';
  try {
    const file = await githubGet(cfg, 'data/templates.json');
    if (!file) throw new Error('404 — data/templates.json was not found in that repository and branch.');
    if (file.encoding !== 'base64' || !file.content) throw new Error('templates.json is too large to load this way.');
    setData(JSON.parse(base64ToText(file.content)));

    for (const path of [...state.localBlobs.keys()]) dropLocalFile(path);
    state.dirty = false;
    state.gh = { connected: true, cfg, jsonSha: file.sha };

    if ($('#gh-remember').checked) localStorage.setItem(GH_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(GH_KEY);

    status.textContent = `Connected to ${cfg.owner}/${cfg.repo} (${cfg.branch}). Data loaded from GitHub.`;
    closeEditor();
    renderAll();
  } catch (err) {
    state.gh = { connected: false, cfg: null, jsonSha: null };
    status.textContent = 'Could not connect: ' + err.message;
    renderStatus();
  }
});

$('#btnPublish').addEventListener('click', async () => {
  const { cfg } = state.gh;
  if (!cfg) return;
  const log = $('#publishLog');
  const say = (line) => { log.hidden = false; log.textContent += line + '\n'; };
  log.textContent = '';
  $('#btnPublish').disabled = true;

  try {
    // Images first, then templates.json, so the live site never points to a missing image.
    for (const path of state.pending) {
      say(`Uploading ${path} …`);
      const existing = await githubGet(cfg, path);
      const bytes = new Uint8Array(await state.localBlobs.get(path).arrayBuffer());
      await githubPut(cfg, path, bytesToBase64(bytes), `Admin: upload ${path}`, existing?.sha);
    }
    say('Saving data/templates.json …');
    const json = JSON.stringify(state.data, null, 2) + '\n';
    const result = await githubPut(cfg, 'data/templates.json', textToBase64(json), 'Admin: update templates', state.gh.jsonSha);
    state.gh.jsonSha = result.content.sha;

    state.pending.clear();
    state.dirty = false;
    say('Done. GitHub Pages needs about 1–2 minutes to show the update on the website.');
    toast('Published to GitHub.');
  } catch (err) {
    say('Stopped: ' + err.message);
    toast('Publishing stopped. See the message under the buttons.', 6000);
  }
  renderAll();
});

boot();
