import { useEffect, useState } from "react";
import { api, type ChaosConfig } from "../api";

const DEFAULTS: ChaosConfig = { latencyMs: 0, errorRate: 0, split404: 50, split500: 50 };

interface Preset {
  label: string;
  desc: string;
  config: Partial<ChaosConfig>;
  tone: string;
}

const PRESETS: Preset[] = [
  {
    label: "Healthy",
    desc: "0 ms, 0% faults",
    config: { latencyMs: 0, errorRate: 0, split404: 50, split500: 50 },
    tone: "border-phosphor-green/40 hover:bg-phosphor-green/10 text-phosphor-green"
  },
  {
    label: "3G Network",
    desc: "350 ms, 3% faults",
    config: { latencyMs: 350, errorRate: 0.03, split404: 70, split500: 30 },
    tone: "border-phosphor-cyan/40 hover:bg-phosphor-cyan/10 text-phosphor-cyan"
  },
  {
    label: "Degraded",
    desc: "800 ms, 15% faults",
    config: { latencyMs: 800, errorRate: 0.15, split404: 50, split500: 50 },
    tone: "border-phosphor-amber/40 hover:bg-phosphor-amber/10 text-phosphor-amber"
  },
  {
    label: "Severe Spike",
    desc: "1500 ms, 40% faults",
    config: { latencyMs: 1500, errorRate: 0.4, split404: 30, split500: 70 },
    tone: "border-phosphor-crimson/40 hover:bg-phosphor-crimson/10 text-phosphor-crimson"
  }
];

export function ChaosPanel() {
  const [config, setConfig] = useState<ChaosConfig>(DEFAULTS);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .chaos()
      .then(setConfig)
      .catch(() => setStatus("Could not read current chaos settings."));
  }, []);

  const apply = async (customConfig?: ChaosConfig) => {
    setLoading(true);
    setStatus("Applying...");
    const target = customConfig ?? config;
    try {
      const next = await api.updateChaos(target);
      setConfig(next);
      setStatus("Applied live to all incoming requests.");
      setTimeout(() => setStatus(""), 3000);
    } catch {
      setStatus("Rejected by the server.");
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (preset: Preset) => {
    const updated = { ...config, ...preset.config };
    setConfig(updated);
    apply(updated);
  };

  const slider = (
    label: string,
    key: keyof ChaosConfig,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string
  ) => (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs font-mono uppercase tracking-wider text-slate-300">
        <span>{label}</span>
        <span className="font-bold text-signal-400">{format(config[key] as number)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={config[key] as number}
        onChange={(event) => setConfig({ ...config, [key]: Number(event.target.value) })}
        className="mt-2 w-full accent-signal-500 cursor-pointer"
      />
    </label>
  );

  return (
    <section className="card-tactical p-5 space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-phosphor-amber"></span>
            Chaos & Fault Simulation
          </h2>
          <span className="text-[10px] font-mono text-slate-500">B1.3 Engine</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Inject latency and failure probabilities into generated API routes.
        </p>
      </div>

      {/* Scenario Presets */}
      <div>
        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-2">
          One-Click Presets:
        </label>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              className={`rounded-lg border bg-obsidian-950/60 p-2 text-left transition-all ${p.tone}`}
            >
              <span className="block text-xs font-bold">{p.label}</span>
              <span className="block text-[10px] font-mono text-slate-500">{p.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-3 pt-1">
        {slider("Injected Latency", "latencyMs", 0, 3000, 50, (v) => `${v} ms`)}
        {slider("Fault Rate", "errorRate", 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
        {slider("404 Share (vs 500)", "split404", 0, 100, 5, (v) => `${v}% : ${100 - v}%`)}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => apply()}
            disabled={loading}
            className="btn-tactical-primary px-3.5 py-1.5 text-xs rounded-lg disabled:opacity-50"
          >
            {loading ? "Applying..." : "Apply Settings"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfig(DEFAULTS);
              apply(DEFAULTS);
            }}
            className="btn-tactical-secondary px-2.5 py-1.5 text-xs rounded-lg"
          >
            Reset
          </button>
        </div>

        {status && (
          <span className="text-[11px] font-mono text-phosphor-green truncate ml-2">
            {status}
          </span>
        )}
      </div>
    </section>
  );
}
