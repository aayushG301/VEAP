/**
 * Full-screen, non-interactive watermark with the responder's identity, repeated diagonally over the whole Level 3 screen
 * (deters screenshots being passed around). Colours come from CSS (--watermark-ink), so it stays visible in light and dark themes.
 */
export function Watermark({ lines }: { lines: string[] }) {
  return (
    <svg className="watermark" aria-hidden="true" data-testid="watermark" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <defs>
        <pattern id="veap-wm" width="470" height="190" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
          {lines.map((l, i) => <text key={i} className={i === 0 ? "watermark__title" : "watermark__line"} x="16" y={62 + i * 22}>{l}</text>)}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#veap-wm)" />
    </svg>
  );
}