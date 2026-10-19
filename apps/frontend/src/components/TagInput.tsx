import { useId, useState } from "react";

interface Props { id?: string; label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; variant?: "amber" | "red" | "blue" | "purple"; suggestions?: string[]; max?: number }

/** Type and press Enter or comma to add. Backspace removes the last tag. Pending text is added on blur. */
export function TagInput({ id, label, value, onChange, placeholder, variant = "amber", suggestions = [], max = 30 }: Props) {
  const auto = useId();
  const inputId = id || auto;
  const [text, setText] = useState("");
  const cls = variant === "amber" ? "tag" : `tag tag--${variant}`;
  const add = (raw: string) => {
    const items = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    const next = [...value];
    for (const i of items) if (next.length < max && !next.some((x) => x.toLowerCase() === i.toLowerCase())) next.push(i.slice(0, 120));
    onChange(next); setText("");
  };
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={inputId}>{label}</label>
      <div className="tag-input">
        {value.map((t) => (
          <span key={t} className={cls}>{t}<button type="button" className="tag__remove" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>×</button></span>
        ))}
        <input id={inputId} value={text} placeholder={value.length ? "" : placeholder} list={suggestions.length ? `${inputId}-list` : undefined}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(text); }
            else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => add(text)} />
        {suggestions.length > 0 && <datalist id={`${inputId}-list`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
      </div>
      <div className="form-hint">Press Enter or comma to add</div>
    </div>
  );
}
