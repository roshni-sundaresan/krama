/** The Krama mark: two steps of process, the last step as the stem of an "i" (Idealake), the gold spark as its dot. */
const TEAL = "#0E7C7B", GOLD = "#D9951A", PAPER = "#FBFBF8";
const spark = (cx: number, cy: number, r: number) => {
  const k = r * 0.18;
  return `M${cx} ${cy - r} C${cx + k} ${cy - k} ${cx + k} ${cy - k} ${cx + r} ${cy} C${cx + k} ${cy + k} ${cx + k} ${cy + k} ${cx} ${cy + r} C${cx - k} ${cy + k} ${cx - k} ${cy + k} ${cx - r} ${cy} C${cx - k} ${cy - k} ${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
};

export function KramaIcon({ size = 34, title = "Krama" }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title} style={{ flex: `0 0 ${size}px` }}>
      <rect width="120" height="120" rx="28" fill={TEAL} />
      <g transform="translate(6 8) scale(.9)">
        <path d="M14 102 V84 Q14 80 18 80 H36 V64 Q36 60 40 60 H58 V102 Z" fill={PAPER} />
        <rect x="66" y="40" width="22" height="62" rx="11" fill={PAPER} />
        <path d={spark(77, 20, 15)} fill={GOLD} />
      </g>
    </svg>
  );
}
