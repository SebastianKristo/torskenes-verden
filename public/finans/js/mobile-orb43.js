// Prompt 43: Glimt-orben (konisk fargering, kremfarget innside, rød firetakket stjerne) – brukt i Domener-kortet,
// Finans → Søk/Liste og Media. Ingen importer, så den kan importeres statisk fra alle mobilmodulene uten TDZ-fare.
const STAR = 'M12 1.5c.7 5.2 3.3 7.8 10.5 10.5-7.2 2.7-9.8 5.3-10.5 10.5-.7-5.2-3.3-7.8-10.5-10.5C8.7 9.3 11.3 6.7 12 1.5z';
/** size i px; cls f.eks. «busy» (roterer raskere mens Glimt svarer). */
export const glimtOrb = (size = 30, cls = '') => `<span class="p43-orb${cls ? ` ${cls}` : ''}" style="--o:${size}px" aria-hidden="true"><span class="p43-orbi"><svg width="${Math.round(size * 0.43)}" height="${Math.round(size * 0.43)}" viewBox="0 0 24 24" fill="#b23a2a"><path d="${STAR}"/></svg></span></span>`;
