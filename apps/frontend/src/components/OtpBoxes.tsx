import { useRef } from "react";

interface Props { value: string; onChange: (v: string) => void; length?: number; error?: boolean; onComplete?: (v: string) => void; disabled?: boolean }

/** Six single-digit boxes with auto-advance, backspace and paste support. */
export function OtpBoxes({ value, onChange, length = 6, error, onComplete, disabled }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, " ").slice(0, length).split("");
  const set = (next: string) => { const clean = next.replace(/\D/g, "").slice(0, length); onChange(clean); if (clean.length === length) onComplete?.(clean); };
  return (
    <div className="otp-container" role="group" aria-label="Verification code">
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} className={`otp-input ${d.trim() ? "is-filled" : ""} ${error ? "is-error" : ""}`}
          inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={1} aria-label={`Digit ${i + 1}`} disabled={disabled}
          value={d.trim()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (!v) return;
            const next = (value.slice(0, i) + v[v.length - 1] + value.slice(i + 1)).slice(0, length);
            set(next); refs.current[Math.min(i + 1, length - 1)]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") { e.preventDefault(); set(value.slice(0, i) + value.slice(i + 1)); refs.current[Math.max(i - 1, 0)]?.focus(); }
            if (e.key === "ArrowLeft") refs.current[Math.max(i - 1, 0)]?.focus();
            if (e.key === "ArrowRight") refs.current[Math.min(i + 1, length - 1)]?.focus();
          }}
          onPaste={(e) => { e.preventDefault(); set(e.clipboardData.getData("text")); refs.current[Math.min(e.clipboardData.getData("text").replace(/\D/g, "").length, length - 1)]?.focus(); }}
          onFocus={(e) => e.target.select()} />
      ))}
    </div>
  );
}
