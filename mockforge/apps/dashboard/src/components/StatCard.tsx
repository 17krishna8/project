interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad" | "signal" | "cyan";
  badge?: string;
}

const TONES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  neutral: "text-slate-100",
  good: "text-phosphor-green",
  warn: "text-phosphor-amber",
  bad: "text-phosphor-crimson",
  signal: "text-signal-400",
  cyan: "text-phosphor-cyan"
};

export function StatCard({ label, value, hint, tone = "neutral", badge }: StatCardProps) {
  return (
    <div className="card-tactical p-5 transition-all hover:border-slate-700/80">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-mono font-medium uppercase tracking-wider text-slate-400">
          {label}
        </div>
        {badge && (
          <span className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] font-mono text-slate-300">
            {badge}
          </span>
        )}
      </div>
      <div className={`mt-2 text-3xl font-bold font-mono tracking-tight tabular-nums ${TONES[tone]}`}>
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-xs text-slate-500 font-mono">{hint}</div> : null}
    </div>
  );
}
