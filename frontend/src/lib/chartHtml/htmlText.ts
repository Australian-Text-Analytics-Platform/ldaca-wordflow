/** Text helpers for the interactive HTML downloads (issues 278 and 279). */

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Script text that cannot close its <script> element early. */
export const scriptSafe = (text: string): string => text.replace(/<\/(script)/gi, '<\\/$1');

export const jsonForScript = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
