// Prompt 43: Glimt-orben på web (konisk fargering #b23a2a → #e8794a → #f2c14e → #3fbf9a → #7a5ad6, kremfarget innside med
// rød firetakket stjerne). Brukt på «Skriv time» og «GLIMT · DAGEN DIN» i Kalender, i Media og i Claude-importen. Stil i web43.css.
const STAR = 'M12 1.5c.7 5.2 3.3 7.8 10.5 10.5-7.2 2.7-9.8 5.3-10.5 10.5-.7-5.2-3.3-7.8-10.5-10.5C8.7 9.3 11.3 6.7 12 1.5z';
/** size i px; cls f.eks. «busy» (roterer raskere mens Glimt tolker). */
export const orb43 = (size = 20, cls = '') => `<span class="w43-orb${cls ? ` ${cls}` : ''}" style="--o:${size}px" aria-hidden="true"><span class="w43-orbi"><svg viewBox="0 0 24 24" fill="#b23a2a"><path d="${STAR}"/></svg></span></span>`;
