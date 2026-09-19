/* ==========================================================================
   app.js  -  the user-facing website (index.html).

   Flow:  Home grid  ->  pick a template  ->  type Name + Mobile
          ->  live preview + editable message  ->  Share

   Everything happens inside the visitor's browser. Name and Mobile Number are
   never sent anywhere. The only network requests are for the page files,
   data/templates.json and the template images from your own GitHub Pages site.
   ========================================================================== */

import { VARIABLES, resolveAll, previewTexts, fillMessage } from './variables.js';
import { drawTemplate, loadImage, mergeFields, mergeStrip, canvasToBlob } from './canvas.js';
import * as share from './share.js';
import { h } from './util.js';

const $ = (selector) => document.querySelector(selector);
const PROFILE_KEY = 'ishare.profile.v1'; // saved Name/Mobile on THIS device only
const REMEMBER_KEY = 'ishare.remember.v1';

const state = {
  data: null,
  settings: {},
  templates: [],        // active templates only
  category: 'all',
  template: null,       // template being edited
  img: null,
  fields: null,         // merged field settings for the current template
  strip: null,
  raw: {},              // what the user typed: { NAME: "...", MOBILE: "..." }
  resolved: null,       // validation result
  textEdited: false,    // did the user change the message by hand?
  file: null,           // the final PNG as a File, ready to share
  drawToken: 0,
  homeScroll: 0,
  navCount: 0,          // how many times the user moved around inside the app
};
let blobTimer = null;
let toastTimer = null;
let canNativeShare = false;

/* ---------- small helpers ---------- */

function toast(message, ms = 3500) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* private mode: ignore */ }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

function categoryName(id) {
  const c = (state.data.categories || []).find((x) => x.id === id);
  return c ? c.name : '';
}

function showView(name) {
  $('#view-home').hidden = name !== 'home';
  $('#view-create').hidden = name !== 'create';
}

/* ---------- start-up ---------- */

async function boot() {
  try {
    // "no-cache" = always check for a newer file, but reuse it when unchanged.
    const response = await fetch('data/templates.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    state.data = await response.json();
  } catch (err) {
    $('#loading').hidden = true;
    const box = $('#fatal');
    box.hidden = false;
    box.textContent =
      'The poster list could not be loaded. If you opened index.html by double-clicking it, that will not work — ' +
      'please open the website through GitHub Pages (or a local web server). Details are in README.md.';
    return;
  }

  state.settings = state.data.settings || {};
  state.templates = (state.data.templates || []).filter((t) => t.active !== false);

  if (state.settings.site?.title) {
    $('#brandName').textContent = state.settings.site.title;
    document.title = state.settings.site.title;
  }
  if (state.settings.site?.tagline) $('#tagline').textContent = state.settings.site.tagline;

  canNativeShare = share.canShareFile(new File(['x'], 'test.png', { type: 'image/png' }));
  $('#btnShare').hidden = !canNativeShare;

  buildForm();
  renderChips();
  renderGrid();
  $('#loading').hidden = true;

  window.addEventListener('hashchange', () => { state.navCount++; route(); });
  route();
}

/* ---------- home: category chips + template grid ---------- */

function renderChips() {
  const box = $('#chips');
  box.replaceChildren();
  const used = new Set(state.templates.map((t) => t.category));
  const categories = (state.data.categories || []).filter((c) => used.has(c.id));
  if (categories.length < 2) return; // no point showing filters for 0-1 categories

  const make = (id, label) =>
    h('button', {
      type: 'button',
      class: 'chip' + (state.category === id ? ' active' : ''),
      'aria-pressed': state.category === id ? 'true' : 'false',
      onclick: () => { state.category = id; renderChips(); renderGrid(); },
    }, label);

  box.append(make('all', 'All'), ...categories.map((c) => make(c.id, c.name)));
}

function renderGrid() {
  const grid = $('#grid');
  grid.replaceChildren();
  const list = state.templates.filter((t) => state.category === 'all' || t.category === state.category);
  $('#empty').hidden = list.length > 0;

  for (const t of list) {
    const cat = categoryName(t.category);
    grid.append(
      h('a', { class: 'card', href: '#/t/' + encodeURIComponent(t.id) },
        h('div', { class: 'card-img' },
          h('img', { src: t.thumb || t.image, alt: t.title, loading: 'lazy', decoding: 'async', width: 1080, height: 1080 })),
        h('div', { class: 'card-body' },
          h('h2', { class: 'card-title' }, t.title),
          cat ? h('p', { class: 'card-cat' }, cat) : null,
          t.description ? h('p', { class: 'card-desc' }, t.description) : null,
          h('span', { class: 'btn btn-primary card-btn' }, 'Create & Share'))));
  }
}

/* ---------- routing (#/ = home, #/t/<id> = create screen) ---------- */

function route() {
  const match = location.hash.match(/^#\/t\/(.+)$/);
  if (match) openTemplate(decodeURIComponent(match[1]));
  else showHome();
}

function showHome() {
  state.template = null;
  showView('home');
  document.title = state.settings.site?.title || document.title;
  window.scrollTo(0, state.homeScroll);
}

async function openTemplate(id) {
  const template = state.templates.find((t) => t.id === id);
  if (!template) {
    toast('That poster is not available any more.');
    location.hash = '#/';
    return;
  }
  if (!state.template) state.homeScroll = window.scrollY;

  state.template = template;
  state.fields = mergeFields(state.settings.defaultFields, template.fields);
  state.strip = mergeStrip(state.settings.strip, template.strip);
  state.img = null;
  state.file = null;
  state.textEdited = false;

  $('#createTitle').textContent = template.title;
  document.title = template.title + ' — ' + (state.settings.site?.title || '');
  $('#message').value = template.message || '';
  $('#shareHelp').hidden = true;
  showView('create');
  window.scrollTo(0, 0);

  loadSavedProfile();
  try {
    const img = await loadImage(template.image);
    if (state.template !== template) return; // user already left
    state.img = img;
  } catch (err) {
    toast('This poster image could not be loaded.', 6000);
  }
  refresh();

  // On a computer, put the cursor in the first empty box. (Not on phones: it would pop the keyboard up.)
  if (!share.isMobileDevice()) {
    const first = VARIABLES.map((v) => $('#in-' + v.key)).find((el) => el && !el.value);
    if (first) first.focus({ preventScroll: true });
  }
}

/* ---------- the form (built from the variable list) ---------- */

function buildForm() {
  const form = $('#fields');
  form.replaceChildren();
  for (const v of VARIABLES) {
    const input = h('input', {
      id: 'in-' + v.key,
      name: v.key.toLowerCase(),
      type: v.type,
      inputmode: v.inputMode,
      autocomplete: v.autocomplete,
      autocapitalize: v.autocapitalize,
      spellcheck: 'false',
      enterkeyhint: 'done',
      placeholder: v.placeholder,
      maxlength: v.maxLength(state.settings),
      'aria-describedby': 'err-' + v.key,
    });
    const prefix = v.prefixLabel ? h('span', { class: 'input-prefix' }, v.prefixLabel(state.settings)) : null;

    input.addEventListener('input', () => {
      state.raw[v.key] = input.value;
      persistProfile();
      refresh();
    });
    input.addEventListener('blur', () => {
      // Tidy what was typed: "  kunal  shah " -> "kunal shah", "+91 99789 64888" -> "9978964888"
      state.raw[v.key] = v.normalize(input.value, state.settings);
      input.value = state.raw[v.key];
      input.dataset.touched = '1';
      refresh();
    });

    form.append(
      h('div', { class: 'field' },
        h('label', { for: 'in-' + v.key }, v.label),
        h('div', { class: 'input-row' }, prefix, input),
        h('p', { class: 'error', id: 'err-' + v.key, 'aria-live': 'polite' })));
  }

  $('#detailsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (document.activeElement) document.activeElement.blur(); // hides the phone keyboard
  });

  const remember = $('#remember');
  remember.checked = storageGet(REMEMBER_KEY) !== '0';
  remember.addEventListener('change', () => {
    storageSet(REMEMBER_KEY, remember.checked ? '1' : '0');
    if (remember.checked) persistProfile(); else storageRemove(PROFILE_KEY);
  });
}

/** Name/Mobile are remembered ONLY in this browser, so a returning user does not retype them. */
function loadSavedProfile() {
  let saved = {};
  if ($('#remember').checked) {
    try { saved = JSON.parse(storageGet(PROFILE_KEY) || '{}'); } catch (e) { saved = {}; }
  }
  for (const v of VARIABLES) {
    const input = $('#in-' + v.key);
    state.raw[v.key] = saved[v.key] || state.raw[v.key] || '';
    input.value = state.raw[v.key];
    delete input.dataset.touched;
  }
}

function persistProfile() {
  if (!$('#remember').checked) return;
  storageSet(PROFILE_KEY, JSON.stringify(state.raw));
}

/* ---------- live update ---------- */

/** Called after every change: validation, message text, preview, button state. */
function refresh() {
  if (!state.template) return;
  state.resolved = resolveAll(state.raw, state.settings);

  // Error messages appear once the user has left a box (and then update live while they fix it).
  for (const v of VARIABLES) {
    const input = $('#in-' + v.key);
    const item = state.resolved.fields[v.key];
    const show = !!item.error && input.dataset.touched === '1';
    $('#err-' + v.key).textContent = show ? item.error : '';
    input.classList.toggle('invalid', show);
  }

  // Message: fill the variables unless the user has already edited the text by hand.
  if (!state.textEdited) $('#message').value = fillMessage(state.template.message, state.resolved.fields);
  $('#resetText').hidden = !state.textEdited;

  redraw();
  updateButtons();
}

function redraw() {
  if (!state.img) return;
  const { texts, ghosts } = previewTexts(state.raw, state.settings);
  drawTemplate($('#preview'), state.img, { fields: state.fields, strip: state.strip, texts, ghosts });
  scheduleBlob();
}

function fileName() {
  return share.buildFileName(state.template.title, state.resolved.fields.NAME.value);
}

/** Prepare the final PNG in advance so the Share button can react instantly (phones require this). */
function scheduleBlob() {
  state.file = null;
  clearTimeout(blobTimer);
  const token = ++state.drawToken;
  updateButtons();
  if (!state.resolved.valid) return;
  blobTimer = setTimeout(async () => {
    const blob = await canvasToBlob($('#preview'), 'image/png');
    if (!blob || token !== state.drawToken) return; // something changed meanwhile
    state.file = new File([blob], fileName(), { type: 'image/png' });
    updateButtons();
  }, 250);
}

function updateButtons() {
  const valid = !!state.resolved && state.resolved.valid;
  const ready = valid && !!state.file;
  $('#btnWhatsApp').disabled = !ready;
  $('#btnShare').disabled = !ready;
  $('#btnDownload').disabled = !ready;
  $('#btnCopy').disabled = !valid;
  $('#actionHint').hidden = valid;
}

/* ---------- message box ---------- */

$('#message').addEventListener('input', () => {
  if (!state.template) return;
  const generated = fillMessage(state.template.message, state.resolved.fields);
  state.textEdited = $('#message').value !== generated;
  $('#resetText').hidden = !state.textEdited;
});

$('#resetText').addEventListener('click', () => {
  state.textEdited = false;
  refresh();
  toast('Original text restored.');
});

/* ---------- share buttons ---------- */

// IMPORTANT: on phones the share sheet only opens if navigator.share() is called
// straight from the tap (no waiting before it). That is why the PNG is prepared in advance.

$('#btnWhatsApp').addEventListener('click', async () => {
  if (!state.file) return;
  const text = $('#message').value;
  if (share.isMobileDevice() && canNativeShare) {
    share.copyTextQuietly(text); // safety net: some WhatsApp versions drop the caption
    const result = await share.nativeShare(state.file, text);
    if (result === 'shared') toast('Done. If the caption is empty in WhatsApp, paste it — your text is already copied.', 6000);
    else if (result === 'error') toast('Sharing did not start. Tap Download Image, then attach it in WhatsApp.', 6000);
    return;
  }
  whatsAppFallback(text);
});

$('#btnShare').addEventListener('click', async () => {
  if (!state.file) return;
  const text = $('#message').value;
  share.copyTextQuietly(text);
  const result = await share.nativeShare(state.file, text);
  if (result === 'error') toast('Sharing did not start. Use Download Image instead.', 5000);
});

$('#btnDownload').addEventListener('click', () => {
  if (!state.file) return;
  share.downloadBlob(state.file, state.file.name);
  toast('Image downloaded: ' + state.file.name);
});

$('#btnCopy').addEventListener('click', async () => {
  const ok = await share.copyText($('#message').value);
  toast(ok ? 'Text copied successfully.' : 'Could not copy automatically. Please select the text and copy it.');
});

/** Computers (and phones without file sharing): save the image, open WhatsApp with the text. */
function whatsAppFallback(text) {
  share.downloadBlob(state.file, state.file.name);
  share.openWhatsAppWithText(text);

  const box = $('#shareHelp');
  box.replaceChildren(
    h('strong', {}, 'WhatsApp opened with your text.'),
    h('p', {}, 'WhatsApp cannot receive an image from a website on this device, so the image was saved to your Downloads. ' +
      'In WhatsApp, choose the contact or group, then attach the image using the paperclip (📎) button.'));
  if (share.canCopyImage()) {
    box.append(
      h('p', {}, 'On a computer you can also paste it: press the button below, then press Ctrl+V (or Cmd+V) in the WhatsApp chat.'),
      h('button', {
        type: 'button', class: 'btn btn-secondary',
        onclick: async () => toast((await share.copyImage(state.file)) ? 'Image copied. Paste it in WhatsApp.' : 'Could not copy the image. Use the downloaded file.'),
      }, 'Copy Image'));
  }
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

$('#backBtn').addEventListener('click', () => {
  // Came from the grid inside the app? Go back (keeps the scroll place). Opened a direct link? Go to the grid.
  if (state.navCount > 0) history.back();
  else location.hash = '#/';
});

boot();
