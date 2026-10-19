import { useEffect, useState } from "react";
import { formatCountdown } from "../lib/util";

export default function Countdown({ until, onExpire }: { until: number; onExpire?: () => void }) {
  const [left, setLeft] = useState(until - Date.now());
  useEffect(() => {
    setLeft(until - Date.now());
    const id = setInterval(() => {
      const l = until - Date.now();
      setLeft(l);
      if (l <= 0) { clearInterval(id); onExpire?.(); }
    }, 500);
    return () => clearInterval(id);
  }, [until]);
  return <span className="timer" aria-live="off">{formatCountdown(left)}</span>;
}
