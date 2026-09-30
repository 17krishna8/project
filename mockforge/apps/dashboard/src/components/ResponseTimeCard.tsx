import { useState, useMemo } from "react";
import type { LogEvent, ChaosConfig } from "../api";

interface ResponseTimeCardProps {
  logs: LogEvent[];
  chaos: ChaosConfig | null;
}

export function ResponseTimeCard({ logs, chaos }: ResponseTimeCardProps) {
  const [period, setPeriod] = useState<"1h" | "6h" | "24h">("1h");

  // Compute live percentiles
  const stats = useMemo(() => {
    if (logs.length === 0) {
      return {
        median: 248,
        p95: 640,
        errorRate: chaos ? Math.round(chaos.errorRate * 100) : 0,
        history: [120, 180, 240, 210, 310, 480, 260, 340, 680, 290, 220, 250]
      };
    }
    const latencies = logs.map((l) => l.latencyMs).sort((a, b) => a - b);
    const median = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? median;
    const errorCount = logs.filter((l) => l.status >= 400).length;
    const errorRate = Math.round((errorCount / logs.length) * 100);
    const history = logs.slice(0, 16).reverse().map((l) => l.latencyMs);

    return { median, p95, errorRate, history };
  }, [logs, chaos]);

  // Generate SVG smooth bezier curve
  const chartData = useMemo(() => {
    const data = stats.history;
    const width = 320;
    const height = 90;
    const max = Math.max(...data, 500);
    const step = width / (data.length - 1 || 1);

    const points = data.map((val, i) => {
      const x = i * step;
      const y = height - (val / max) * (height - 20) - 10;
      return { x, y, val };
    });

    // Peak point
    const peak = points.reduce((prev, curr) => (curr.val > prev.val ? curr : prev), points[0] ?? { x: 160, y: 30, val: 500 });

    const pathD = points.length > 1
      ? `M ${points.map((p) => `${p.x},${p.y}`).join(" L ")}`
      : `M 0,${height / 2} L ${width},${height / 2}`;

    return { pathD, peak, width, height };
  }, [stats.history]);

  return (
    <div className="card-figma p-5 flex flex-col justify-between space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Response time</h3>
          <p className="text-[11px] text-slate-500 font-medium">Last 60 minutes</p>
        </div>

        {/* Period toggle chips */}
        <div className="flex items-center rounded-lg bg-[#f1f2ec] p-0.5 text-[10px] font-mono">
          {(["1h", "6h", "24h"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded px-2 py-0.5 font-semibold transition-all ${
                period === p
                  ? "bg-[#0f3d2e] text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Key Numbers Row */}
      <div className="grid grid-cols-3 gap-2 border-b border-slate-100 pb-3">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Median</span>
          <span className="text-xl font-bold font-mono text-slate-900">{stats.median} ms</span>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">95th percentile</span>
          <span className="text-xl font-bold font-mono text-slate-900">{stats.p95} ms</span>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Simulated errors</span>
          <span className="text-xl font-bold font-mono text-amber-600">{stats.errorRate}%</span>
        </div>
      </div>

      {/* Line Chart */}
      <div className="relative h-24 w-full pt-1">
        <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${chartData.width} ${chartData.height}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="figmaChartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f3d2e" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#0f3d2e" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {/* Fill Area */}
          <path
            d={`${chartData.pathD} L ${chartData.width},${chartData.height} L 0,${chartData.height} Z`}
            fill="url(#figmaChartGradient)"
          />
          {/* Stroke Line */}
          <path
            d={chartData.pathD}
            fill="none"
            stroke="#0f3d2e"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>

        {/* Peak Callout Badge */}
        {chartData.peak && (
          <div
            className="absolute rounded bg-slate-900 text-white text-[9px] font-mono px-2 py-0.5 shadow-md -translate-x-1/2 -translate-y-full"
            style={{
              left: `${(chartData.peak.x / chartData.width) * 100}%`,
              top: `${Math.max(10, (chartData.peak.y / chartData.height) * 100)}%`
            }}
          >
            {chartData.peak.val} ms • spike
          </div>
        )}
      </div>

      {/* Legend Footer */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium pt-1">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-slate-300" /> Any latency
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#0f3d2e]" /> Outlier latency
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> Simulated error
        </span>
      </div>
    </div>
  );
}
