export interface RowCol { key: string; label: string; placeholder?: string; options?: string[]; grow?: number }
export type Row = Record<string, string>;

/** Compact editor for a list of small records (prescriptions, surgeries, ...). The first column is the required one. */
export function RowsEditor({ id, label, rows, cols, onChange, max = 20, addLabel }: { id: string; label: string; rows: Row[]; cols: RowCol[]; onChange: (r: Row[]) => void; max?: number; addLabel: string }) {
  const blank = (): Row => Object.fromEntries(cols.map((c) => [c.key, c.options ? c.options[0] : ""]));
  const set = (i: number, k: string, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="mb-md" role="group" aria-label={label}>
      {rows.map((r, i) => (
        <div key={i} className="row mb-sm" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: 8 }}>
          {cols.map((c) => (
            <div key={c.key} style={{ flex: `${c.grow ?? 1} 1 ${c.options ? 120 : 130}px`, minWidth: 0 }}>
              {i === 0 && <label className="form-label" htmlFor={`${id}-${i}-${c.key}`}>{c.label}</label>}
              {c.options ? (
                <select id={`${id}-${i}-${c.key}`} className="form-select" aria-label={`${label} ${c.label} ${i + 1}`} value={r[c.key] ?? c.options[0]} onChange={(e) => set(i, c.key, e.target.value)}>{c.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              ) : (
                <input id={`${id}-${i}-${c.key}`} className="form-input" aria-label={`${label} ${c.label} ${i + 1}`} placeholder={c.placeholder || c.label} value={r[c.key] ?? ""} onChange={(e) => set(i, c.key, e.target.value)} />
              )}
            </div>
          ))}
          <button type="button" className="btn btn--ghost btn--sm" aria-label={`Remove ${label} ${i + 1}`} style={{ minHeight: 46 }} onClick={() => onChange(rows.filter((_, j) => j !== i))}>🗑</button>
        </div>
      ))}
      {rows.length < max && <button type="button" className="btn btn--ghost btn--sm btn--full" onClick={() => onChange([...rows, blank()])}>+ {addLabel}</button>}
    </div>
  );
}
