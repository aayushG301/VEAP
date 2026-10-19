import { useEffect, useState } from "react";
import { formatCountdown } from "../lib/util";

/** Thin bar at the very top of the screen that drains while a verified session is active (like the original design). */
export function SessionBar({ startedAt, expiresAt, onExpire }: { startedAt: number; expiresAt: number; onExpire: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => { const n = Date.now(); setNow(n); if (n >= expiresAt) { clearInterval(id); onExpire(); } }, 500);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);
  const total = Math.max(1, expiresAt - startedAt);
  const left = Math.max(0, expiresAt - now);
  return (
    <>
      <div className="session-timer" role="progressbar" aria-label="Session time remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((left / total) * 100)}>
        <div className="session-timer__bar" style={{ width: `${(left / total) * 100}%` }} />
      </div>
      <div className={`session-timer__label ${left < 60_000 ? "is-low" : ""}`}>⏱ {formatCountdown(left)}</div>
    </>
  );
}
