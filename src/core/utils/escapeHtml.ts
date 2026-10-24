/**
 * Escapes a value for interpolation into a hand-built HTML string.
 *
 * Several print/export paths assemble markup as template literals and hand the result to
 * `printWindow.document.write(...)` or an `<iframe srcDoc>`. Those documents are same-origin
 * with the app, so a catalog or ledger value containing markup does not merely render wrong —
 * it executes, and the script it runs can read the JWT straight out of `localStorage`. Product
 * names in particular are not trusted input: the bulk Excel importer writes them verbatim from
 * a supplier's spreadsheet.
 *
 * Covers both text and quoted-attribute contexts. It is NOT sufficient for unquoted
 * attributes, inline event handlers, `<script>`/`<style>` bodies, or `href`/`src` values that
 * could be `javascript:` URLs — none of which the print templates use.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
