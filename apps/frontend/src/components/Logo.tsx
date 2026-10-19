import { useId } from "react";

/** The VEAP mark: a gradient tile with a white shield and a medical cross. */
export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={`logo ${className}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="VEAP logo">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ef4444" /><stop offset="1" stopColor="#3b82f6" /></linearGradient>
        <linearGradient id={`c${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f87171" /><stop offset="1" stopColor="#dc2626" /></linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#g${id})`} />
      <path d="M32 9.5 49.5 16v15.2c0 11.3-7.4 19.4-17.5 23.3C21.9 50.6 14.5 42.5 14.5 31.2V16z" fill="#fff" />
      <rect x="28.6" y="20.5" width="6.8" height="21" rx="2.2" fill={`url(#c${id})`} />
      <rect x="21.5" y="27.6" width="21" height="6.8" rx="2.2" fill={`url(#c${id})`} />
    </svg>
  );
}
