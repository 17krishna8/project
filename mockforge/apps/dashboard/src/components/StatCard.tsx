interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}

const TONES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  neutral: "text-slate-100",
  good: "text-emerald-400",
  warn: "text-amber-400",
  bad: "text-rose-400"
};

export function StatCard({ label, value, hint, tone = "neutral" }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${TONES[tone]}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}
