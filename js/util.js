/* ==========================================================================
   util.js  -  tiny helpers used by both the user site and the admin tool.
   No libraries. Nothing here talks to the internet.
   ========================================================================== */

/**
 * Create an HTML element in one line.
 *   h('a', { class: 'card', href: '#/x' }, 'Hello', h('b', {}, 'World'))
 * - attribute "class" sets the CSS class
 * - attributes that start with "on" (onclick, oninput...) become event listeners
 * - text is always inserted as plain text (safe: it can never run as HTML)
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** "Car Insurance Renewal!" -> "car-insurance-renewal" (used for template ids). */
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Bytes (Uint8Array) -> base64 text. Done in chunks so big images do not crash. */
export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** base64 text -> bytes. */
export function base64ToBytes(b64) {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Text -> base64 (UTF-8 safe, so Gujarati/Hindi text survives). */
export function textToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}

/** base64 -> text (UTF-8). */
export function base64ToText(b64) {
  return new TextDecoder('utf-8').decode(base64ToBytes(b64));
}
