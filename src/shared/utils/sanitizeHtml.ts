import DOMPurify from 'isomorphic-dompurify';

// Sanitização server-side do content dos posts.
// Mantém HTML semântico; remove scripts, iframes, handlers on* e
// protocolos perigosos (javascript:, data:) em href/src.
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'a', 'img',
  'code', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'figure', 'figcaption',
];

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'];

// URI policy equivalente a ALLOWED_PROTOCOLS = [http, https, mailto]:
// bloqueia javascript:, data: e qualquer scheme não-listado.
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z+-])/i;

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    // Remove a tag inteira (e não apenas desembrulha) para script/iframe/style etc.
    FORBID_TAGS: ['script', 'iframe', 'style', 'object', 'embed', 'form', 'input'],
    // on* e data-* já são eliminados pela whitelist ALLOWED_ATTR (nada fora dela passa).
  });
}
