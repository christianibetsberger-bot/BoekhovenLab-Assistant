import DOMPurify from 'dompurify'

// Escape a user-controlled string for safe interpolation into an HTML string.
// Use this around any ${item.name}, ${inv.code}, etc. inside a template literal
// that will be assigned to innerHTML or passed to document.execCommand('insertHTML', ...).
export function esc(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Sanitize an HTML payload before writing it into a contenteditable element
// or before persisting it to the database. Strips script tags, event handlers,
// and any tag/attribute not on the allowlist.
//
// Allows the inv-ref chip pattern used across LabJournal/WellPlateEditor/etc.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'b', 'i', 'u', 's', 'strong', 'em', 'br', 'div', 'span', 'p',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'img', 'hr', 'blockquote', 'pre', 'code',
  ],
  ALLOWED_ATTR: [
    'class', 'style', 'contenteditable', 'data-labware',
    'href', 'target', 'rel',
    'src', 'alt', 'title',
    'colspan', 'rowspan',
  ],
  FORBID_ATTR: [
    'onclick', 'onmouseover', 'onmouseout', 'onmouseenter', 'onmouseleave',
    'onerror', 'onload', 'onfocus', 'onblur', 'oninput', 'onchange',
  ],
  ALLOW_DATA_ATTR: false,
}

export function sanitize(html) {
  if (html == null) return ''
  return DOMPurify.sanitize(String(html), SANITIZE_CONFIG)
}
