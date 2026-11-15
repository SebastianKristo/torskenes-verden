// Hjelpere for UI-komponentene. Egen fil uten sideeffekter (util.js kobler på lyttere når den lastes), så komponentene
// kan testes i Node. esc gir samme resultat som util.js.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
/** { 'data-x': '1', disabled: true, hidden: false } → ' data-x="1" disabled' */
export const attrs = (o = {}) => Object.entries(o).filter(([, v]) => v != null && v !== false).map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`)).join('');
