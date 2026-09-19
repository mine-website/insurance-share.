/* ==========================================================================
   canvas.js  -  draws the poster: template image + bottom strip + Name/Mobile.

   The same function is used by
     - the user page (live preview AND the final image that is shared)
     - the admin tool (position editor)
   so what you see is exactly what gets shared.

   The canvas is ALWAYS 1080 x 1080 pixels internally. CSS only shrinks how it
   is displayed on screen; the exported image is never smaller.

   Coordinate rule:  x, y is the ANCHOR of the text.
     x = left edge (align "left"), right edge (align "right") or centre
     y = vertical MIDDLE of the text line
   ========================================================================== */

export const SIZE = 1080;

const imageCache = new Map();

/** Load an image (and remember it, so re-opening a template is instant). */
export function loadImage(src, useCache = true) {
  if (useCache && imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => {
      imageCache.delete(src);
      reject(new Error('Could not load image: ' + src));
    };
    img.src = src;
  });
  if (useCache) imageCache.set(src, promise);
  return promise;
}

/** Start from the site-wide defaults, then apply the template's own changes (if any). */
export function mergeFields(defaults = {}, overrides = {}) {
  const out = {};
  const keys = new Set([...Object.keys(defaults), ...Object.keys(overrides || {})]);
  for (const key of keys) out[key] = { ...(defaults[key] || {}), ...((overrides || {})[key] || {}) };
  return out;
}

export function mergeStrip(defaults = {}, overrides = {}) {
  return { ...defaults, ...(overrides || {}) };
}

// Fonts that cover Gujarati / Devanagari are appended so those letters never show as boxes.
const FALLBACK_FONTS = '"Noto Sans Gujarati","Noto Sans Devanagari","Nirmala UI","Shruti",sans-serif';

export function fontStack(family) {
  const f = String(family || 'Arial').trim();
  const first = f.includes(',') ? f : `"${f.replace(/"/g, '')}"`;
  return `${first}, Arial, ${FALLBACK_FONTS}`;
}

/** Paint the clean strip at the bottom (guarantees contrast for the dynamic text). */
function drawStrip(ctx, strip, size) {
  if (!strip || !strip.repaint) return;
  const y = Number(strip.y) || 960;
  ctx.fillStyle = strip.color || '#FFFFFF';
  ctx.fillRect(0, y, size, size - y);
  const lineHeight = Number(strip.accentHeight) || 0;
  if (lineHeight > 0 && strip.accentColor) {
    ctx.fillStyle = strip.accentColor;
    ctx.fillRect(0, y, size, lineHeight);
  }
}

/**
 * Draw one text field. Automatically shrinks the text (down to 60 %) if it
 * is wider than maxWidth, and adds "…" as a last resort.
 * Returns the box the text occupies (used by the admin tool for dragging).
 */
function drawField(ctx, f, text, dim) {
  const prefix = f.prefix || '';
  let full = prefix + text;
  let fontSize = Number(f.fontSize) || 36;
  const weight = f.fontWeight || '700';
  const stack = fontStack(f.fontFamily);
  const align = ['left', 'center', 'right'].includes(f.align) ? f.align : 'left';
  const maxWidth = Number(f.maxWidth) || 0;
  const x = Number(f.x) || 0;
  const y = Number(f.y) || 0;

  ctx.save();
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Number(f.letterSpacing) || 0}px`;
  ctx.font = `${weight} ${fontSize}px ${stack}`;

  if (maxWidth > 0) {
    const minSize = Math.max(12, Math.round(fontSize * 0.6));
    while (fontSize > minSize && ctx.measureText(full).width > maxWidth) {
      fontSize -= 1;
      ctx.font = `${weight} ${fontSize}px ${stack}`;
    }
    if (ctx.measureText(full).width > maxWidth) {
      let cut = text;
      while (cut.length > 1 && ctx.measureText(prefix + cut + '…').width > maxWidth) cut = cut.slice(0, -1);
      full = prefix + cut.trimEnd() + '…';
    }
  }

  const width = ctx.measureText(full).width;
  ctx.globalAlpha = dim ? 0.35 : 1;
  ctx.fillStyle = f.color || '#111827';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(full, x, y);
  ctx.restore();

  const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  return { x: left, y: y - fontSize * 0.65, w: width, h: fontSize * 1.3, fontSize };
}

/** Admin-only helper lines: strip area, safe areas, selected field. Never used for the shared image. */
function drawGuides(ctx, fields, strip, boxes, selected, size) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  // Reserved strip
  const y = Number(strip?.y) || 960;
  ctx.strokeStyle = 'rgba(67,56,202,0.9)';
  ctx.strokeRect(1, y, size - 2, size - y - 1);
  // Safe area of each field (its maximum width)
  ctx.strokeStyle = 'rgba(219,39,119,0.85)';
  for (const [key, f] of Object.entries(fields)) {
    const maxW = Number(f.maxWidth) || 0;
    if (!maxW) continue;
    const x = Number(f.x) || 0;
    const left = f.align === 'right' ? x - maxW : f.align === 'center' ? x - maxW / 2 : x;
    const box = boxes[key];
    const half = box ? box.h / 2 + 6 : 28;
    ctx.strokeRect(left, (Number(f.y) || 0) - half, maxW, half * 2);
  }
  ctx.setLineDash([]);
  // Selected field highlight + anchor point
  if (selected && boxes[selected]) {
    const b = boxes[selected];
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x - 6, b.y - 4, b.w + 12, b.h + 8);
    const f = fields[selected];
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(Number(f.x) || 0, Number(f.y) || 0, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draw the complete poster.
 *   canvas   the <canvas> element
 *   img      the loaded template image
 *   options  fields   merged field settings   {name:{x,y,...}, mobile:{...}}
 *            strip    merged strip settings
 *            texts    text per field          {name:"Kunal Shah", mobile:"9978964888"}
 *            ghosts   field names drawn faded (hint text before typing)
 *            guides   true = draw admin helper lines
 *            selected field name to highlight (admin)
 * Returns the boxes of all drawn fields.
 */
export function drawTemplate(canvas, img, options = {}) {
  const { fields = {}, strip = null, texts = {}, ghosts = [], guides = false, selected = null } = options;
  if (canvas.width !== SIZE) canvas.width = SIZE;
  if (canvas.height !== SIZE) canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, SIZE, SIZE);
  if (img) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, SIZE, SIZE); // scales 1024 px / any square image to exactly 1080
  }
  drawStrip(ctx, strip, SIZE);

  const boxes = {};
  for (const [key, f] of Object.entries(fields)) {
    const text = texts[key];
    if (text === undefined || text === null || text === '') continue;
    boxes[key] = drawField(ctx, f, String(text), ghosts.includes(key));
  }
  if (guides) drawGuides(ctx, fields, strip, boxes, selected, SIZE);
  return boxes;
}

/** canvas.toBlob as a Promise. */
export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

/**
 * Resize any image to size x size and encode it (WebP by default).
 * Used by the admin tool to prepare the 1080 image and the small thumbnail.
 * NOTE: Safari cannot encode WebP; it silently returns PNG. Check blob.type.
 */
export function imageToBlob(img, size, type = 'image/webp', quality = 0.9) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size, size);
  return canvasToBlob(c, type, quality);
}

export const EXTENSION_FOR_TYPE = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
