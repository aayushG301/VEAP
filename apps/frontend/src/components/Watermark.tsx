/** Diagonal, non-interactive watermark carrying the responder's identity over the whole screen (deters screenshots being passed around). */
export function Watermark({ text }: { text: string }) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='220'><text x='10' y='120' transform='rotate(-24 210 110)' font-family='sans-serif' font-size='13' font-weight='600' fill='rgba(255,255,255,0.11)'>${esc}</text></svg>`;
  return <div aria-hidden="true" data-testid="watermark" style={{ position: "fixed", inset: 0, zIndex: 40, pointerEvents: "none", backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")` }} />;
}
