/* ==========================================================================
   share.js  -  everything about sending the image + text out of the browser.

   What a website CAN and CANNOT do with WhatsApp (short version):
   - A WhatsApp link (https://wa.me/?text=...) can pre-fill TEXT only.
     It can NOT attach an image and can NOT choose the contact for you.
   - The browser "Web Share" feature (navigator.share) CAN hand an image + text
     to the phone's share sheet. The user taps WhatsApp there and then picks the
     contact / group in WhatsApp itself. This is the best experience and it
     works on most phones.
   - On a computer, WhatsApp cannot receive a file from a website. We download
     the image, open WhatsApp with the text, and the user attaches the image.
   See README.md, section "WhatsApp limitations", for the full list.
   ========================================================================== */

/** "Car Insurance!" -> "Car_Insurance". Keeps letters/numbers of ANY language (Gujarati, Hindi...). */
export function sanitizeForFile(text, fallback = 'file') {
  const cleaned = String(text || '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  return cleaned || fallback;
}

/** TemplateName_Name.png  e.g.  Car_Insurance_Renewal_Kunal_Shah.png */
export function buildFileName(templateTitle, userName, ext = 'png') {
  return `${sanitizeForFile(templateTitle, 'Poster')}_${sanitizeForFile(userName, 'Name')}.${ext}`;
}

/** True on Android phones/tablets, iPhone and iPad (including iPadOS that pretends to be a Mac). */
export function isMobileDevice() {
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** Can this browser share a FILE through the system share sheet? */
export function canShareFile(file) {
  try {
    return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
  } catch (e) {
    return false;
  }
}

/** Open the system share sheet with image + text. Returns 'shared' | 'cancelled' | 'error'. */
export async function nativeShare(file, text) {
  try {
    await navigator.share({ files: [file], text });
    return 'shared';
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled'; // user closed the sheet
    return 'error';
  }
}

/** Save a file to the phone/computer. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Copy text. Returns true/false. Works on old browsers too. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    /* fall through to the old method */
  }
  try {
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.position = 'fixed';
    box.style.opacity = '0';
    document.body.appendChild(box);
    box.select();
    box.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    box.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

/** Fire-and-forget copy (used right before the share sheet opens; never blocks it). */
export function copyTextQuietly(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  } catch (e) {
    /* ignore */
  }
}

/** Can the browser put an IMAGE on the clipboard? (desktop Chrome/Edge/Safari/Firefox recent) */
export function canCopyImage() {
  return !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem && window.isSecureContext);
}

export async function copyImage(blob) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
    return true;
  } catch (e) {
    return false;
  }
}

/** Open WhatsApp with the text pre-filled (WhatsApp then lets the user pick the contact). */
export function openWhatsAppWithText(text) {
  const url = 'https://wa.me/?text=' + encodeURIComponent(text);
  window.open(url, '_blank', 'noopener');
}
