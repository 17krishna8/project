import { useEffect, useState } from "react";
import { api, type ChaosConfig } from "../api";

const DEFAULTS: ChaosConfig = { latencyMs: 0, errorRate: 0, split404: 50, split500: 50 };

export function ChaosPanel() {
  const [config, setConfig] = useState<ChaosConfig>(DEFAULTS);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    api
      .chaos()
      .then(setConfig)
      .catch(() => setStatus("Could not read the current chaos settings."));
  }, []);

  const apply = async () => {
    setStatus("Applying...");
    try {
      const next = await api.updateChaos(config);
      setConfig(next);
      setStatus("Applied - new requests use these settings.");
    } catch {
      setStatus("Rejected by the server.");
    }
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
      <span className="flex items-baseline justify-between text-sm text-slate-300">
        {label}
        <span className="font-mono text-xs text-slate-400">{format(config[key] as number)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={config[key] as number}
        onChange={(event) => setConfig({ ...config, [key]: Number(event.target.value) })}
        className="mt-2 w-full accent-indigo-500"
      />
    </label>
  );

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="text-sm font-semibold text-slate-200">Chaos injection</h2>
      <p className="mt-1 text-xs text-slate-500">
        Applies to every generated route. Reserved paths (/__health, /__ui, /__admin/*) are never affected.
      </p>
      <div className="mt-4 space-y-4">
        {slider("Latency", "latencyMs", 0, 3000, 50, (v) => `${v} ms`)}
        {slider("Error rate", "errorRate", 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
        {slider("404 share of faults", "split404", 0, 100, 5, (v) => `${v}%`)}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void apply()}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => setConfig(DEFAULTS)}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          Reset
        </button>
        <span className="text-xs text-slate-500">{status}</span>
      </div>
    </section>
  );
}
