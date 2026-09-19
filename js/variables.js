/* ==========================================================================
   variables.js  -  the list of variables ({NAME}, {MOBILE}, ...).

   This is the ONLY place you need to touch to add a new variable later
   (for example {WEBSITE} or {AGENCY}). Each entry describes:
     key          the word used inside curly braces in messages, e.g. NAME -> {NAME}
     field        the matching drawing-field name in templates.json ("name", "mobile").
                  Use null if the variable is only used in the text, not on the image.
     label        the label shown above the input box
     placeholder  the grey hint inside the empty input box
     ghost        what is shown (faded) on the image before the user types
     sample       what the Admin tool shows while positioning
     normalize    cleans what the user typed
     validate     returns "" if OK, otherwise an error message
     format       how the value looks on the image and in the message

   The user form, the live preview, the message and the admin tool are all
   built from this list automatically.
   ========================================================================== */

export const VARIABLES = [
  {
    key: 'NAME',
    field: 'name',
    label: 'Name',
    placeholder: 'Enter Your Name',
    ghost: 'Your Name',
    sample: 'Kunal Shah',
    type: 'text',
    inputMode: 'text',
    autocomplete: 'name',
    autocapitalize: 'words',

    maxLength(settings) {
      return (settings.validation?.name?.maxLength ?? 40) + 20; // typing room; validate() is the strict check
    },

    // Remove extra spaces: "  Kunal   Shah " -> "Kunal Shah"
    normalize(raw) {
      return String(raw ?? '').replace(/\s+/g, ' ').trim();
    },

    validate(value, settings) {
      const rules = settings.validation?.name || {};
      const min = rules.minLength ?? 2;
      const max = rules.maxLength ?? 40;
      if (!value) return 'Please enter your name.';
      if (value.length < min) return `Name must have at least ${min} characters.`;
      if (value.length > max) return `Name can have at most ${max} characters.`;
      // Letters (any language), marks, digits, space and a few punctuation marks.
      if (!/^[\p{L}\p{M}\p{N}\s.'’&,()\-]+$/u.test(value) || !/\p{L}/u.test(value)) {
        return 'Please use letters only in the name.';
      }
      return '';
    },

    format(value) {
      return value;
    },
  },

  {
    key: 'MOBILE',
    field: 'mobile',
    label: 'Mobile Number',
    placeholder: 'Enter Mobile Number',
    ghost: 'XXXXX XXXXX',
    sample: '9978964888',
    type: 'tel',
    inputMode: 'numeric',
    autocomplete: 'tel-national',
    autocapitalize: 'off',
    prefixLabel: (settings) => settings.country?.code || '+91', // shown as "+91" before the input

    maxLength() {
      return 18; // allows pasting "+91 99789 64888"
    },

    // Keep digits only. Also removes a pasted country code (+91 / 91) or leading 0.
    normalize(raw, settings) {
      const digitsWanted = settings.validation?.mobile?.digits ?? 10;
      const cc = String(settings.country?.code || '+91').replace(/\D/g, '');
      let d = String(raw ?? '').replace(/\D/g, '');
      if (cc && d.length === digitsWanted + cc.length && d.startsWith(cc)) d = d.slice(cc.length);
      if (d.length === digitsWanted + 1 && d.startsWith('0')) d = d.slice(1);
      return d;
    },

    validate(value, settings) {
      const rules = settings.validation?.mobile || {};
      const digits = rules.digits ?? 10;
      const message = rules.message || `Enter a valid ${digits}-digit mobile number.`;
      if (!value) return 'Please enter your mobile number.';
      if (value.length !== digits) return message;
      if (rules.pattern && !new RegExp(rules.pattern).test(value)) return message;
      if (rules.rejectRepeatedDigits !== false && /^(\d)\1+$/.test(value)) return message; // 9999999999
      return '';
    },

    // settings.mobileFormat:  "plain" -> 9978964888
    //                         "spaced" -> 99789 64888
    //                         "international" -> +91 99789 64888
    format(value, settings) {
      const mode = settings.mobileFormat || 'plain';
      const spaced = value.length === 10 ? `${value.slice(0, 5)} ${value.slice(5)}` : value;
      if (mode === 'spaced') return spaced;
      if (mode === 'international') return `${settings.country?.code || '+91'} ${spaced}`;
      return value;
    },
  },
];

/**
 * Check everything the user typed.
 * raw = { NAME: "kunal shah ", MOBILE: "99789 64888" }
 * Returns { valid: true/false, fields: { NAME: {value, error, display}, MOBILE: {...} } }
 */
export function resolveAll(raw, settings) {
  const fields = {};
  let valid = true;
  for (const v of VARIABLES) {
    const value = v.normalize(raw[v.key] ?? '', settings);
    const error = v.validate(value, settings);
    fields[v.key] = { value, error, display: error ? '' : v.format(value, settings) };
    if (error) valid = false;
  }
  return { valid, fields };
}

/**
 * Replace {NAME}, {MOBILE}... inside the predefined message.
 * A variable that is not filled in yet stays visible as {NAME}.
 * Unknown words such as {FOO} are left untouched so the admin notices the typo.
 */
export function fillMessage(message, resolvedFields) {
  return String(message ?? '').replace(/\{([A-Za-z_]+)\}/g, (whole, key) => {
    const item = resolvedFields[key.toUpperCase()];
    return item && item.display ? item.display : whole;
  });
}

/**
 * Text to draw on the image while the user is still typing.
 * Returns { texts: {name: "..."}, ghosts: ["mobile"] }.
 * "ghosts" lists fields that are still empty (drawn faded with a hint text).
 */
export function previewTexts(raw, settings, { useSamples = false } = {}) {
  const texts = {};
  const ghosts = [];
  for (const v of VARIABLES) {
    if (!v.field) continue;
    const value = v.normalize(raw[v.key] ?? '', settings);
    if (value) {
      texts[v.field] = v.format(value, settings);
    } else {
      texts[v.field] = useSamples ? v.sample : v.ghost;
      if (!useSamples) ghosts.push(v.field);
    }
  }
  return { texts, ghosts };
}
