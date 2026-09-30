import { useState, useEffect } from "react";
import { api, type ChaosConfig } from "../api";

interface SimulationCardProps {
  chaos: ChaosConfig | null;
  onChaosUpdated?: (updated: ChaosConfig) => void;
}

export function SimulationCard({ chaos, onChaosUpdated }: SimulationCardProps) {
  const [latencyMs, setLatencyMs] = useState(chaos?.latencyMs ?? 0);
  const [errorRate, setErrorRate] = useState(chaos?.errorRate ?? 0);
  const [e404, setE404] = useState(true);
  const [e429, setE429] = useState(false);
  const [e500, setE500] = useState(true);
  const [e503, setE503] = useState(false);
  const [statefulCrud, setStatefulCrud] = useState(true);
  const [schemaValidation, setSchemaValidation] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    if (chaos) {
      setLatencyMs(chaos.latencyMs);
      setErrorRate(chaos.errorRate);
    }
  }, [chaos]);

  const handleApply = async () => {
    setSaving(true);
    setStatusMsg("");
    try {
      const updated = await api.updateChaos({
        latencyMs,
        errorRate,
        split404: e404 ? 50 : 0,
        split500: e500 ? 50 : 0
      });
      if (onChaosUpdated) onChaosUpdated(updated);
      setStatusMsg("Changes applied live!");
      setTimeout(() => setStatusMsg(""), 2500);
    } catch {
      setStatusMsg("Failed to apply.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-figma p-5 flex flex-col justify-between space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Simulation</h3>
          <p className="text-[11px] text-slate-500 font-medium">Applies to every endpoint</p>
        </div>
        {statusMsg && (
          <span className="text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
            {statusMsg}
          </span>
        )}
      </div>

      {/* Response delay slider */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-semibold text-slate-700">
          <span>Response delay</span>
          <span className="font-mono text-[#0f3d2e]">{latencyMs} ms</span>
        </div>
        <input
          type="range"
          min={0}
          max={3000}
          step={50}
          value={latencyMs}
          onChange={(e) => setLatencyMs(Number(e.target.value))}
          className="w-full accent-[#0f3d2e] h-1.5 bg-slate-200 rounded-lg cursor-pointer"
        />
        <div className="flex justify-between text-[10px] font-mono text-slate-400">
          <span>0 ms</span>
          <span>3,000 ms</span>
        </div>
      </div>

      {/* Random errors */}
      <div className="space-y-2 pt-1 border-t border-slate-100">
        <span className="text-xs font-semibold text-slate-700 block">Random errors</span>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex items-center justify-between p-1.5 rounded-lg bg-[#f8f9fa] border border-slate-200/80 cursor-pointer">
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={e404}
                onChange={(e) => setE404(e.target.checked)}
                className="rounded text-[#0f3d2e] focus:ring-[#0f3d2e] h-3.5 w-3.5"
              />
              <span className="font-mono text-[11px] text-slate-700">404</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Not found</span>
          </label>

          <label className="flex items-center justify-between p-1.5 rounded-lg bg-[#f8f9fa] border border-slate-200/80 cursor-pointer">
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={e429}
                onChange={(e) => setE429(e.target.checked)}
                className="rounded text-[#0f3d2e] focus:ring-[#0f3d2e] h-3.5 w-3.5"
              />
              <span className="font-mono text-[11px] text-slate-700">429</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Too many req</span>
          </label>

          <label className="flex items-center justify-between p-1.5 rounded-lg bg-[#f8f9fa] border border-slate-200/80 cursor-pointer">
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={e500}
                onChange={(e) => setE500(e.target.checked)}
                className="rounded text-[#0f3d2e] focus:ring-[#0f3d2e] h-3.5 w-3.5"
              />
              <span className="font-mono text-[11px] text-slate-700">500</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Server err</span>
          </label>

          <label className="flex items-center justify-between p-1.5 rounded-lg bg-[#f8f9fa] border border-slate-200/80 cursor-pointer">
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={e503}
                onChange={(e) => setE503(e.target.checked)}
                className="rounded text-[#0f3d2e] focus:ring-[#0f3d2e] h-3.5 w-3.5"
              />
              <span className="font-mono text-[11px] text-slate-700">503</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Unavailable</span>
          </label>
        </div>
      </div>

      {/* Switches for stateful CRUD & schema validation */}
      <div className="space-y-1.5 pt-1 border-t border-slate-100 text-xs">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-slate-600 text-[11px] font-medium">Stateful CRUD (POST/PUT/DELETE change data)</span>
          <input
            type="checkbox"
            checked={statefulCrud}
            onChange={(e) => setStatefulCrud(e.target.checked)}
            className="rounded text-[#0f3d2e] focus:ring-[#0f3d2e] h-3.5 w-3.5"
          />
        </label>
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-slate-600 text-[11px] font-medium">Validate responses against schema</span>
          <input
            type="checkbox"
            checked={schemaValidation}
            onChange={(e) => setSchemaValidation(e.target.checked)}
            className="rounded text-[#0f3d2e] focus:ring-[#0f3d2e] h-3.5 w-3.5"
          />
        </label>
      </div>

      {/* Apply Button */}
      <button
        type="button"
        onClick={handleApply}
        disabled={saving}
        className="btn-figma-primary w-full py-2 text-xs font-bold text-center disabled:opacity-50"
      >
        {saving ? "Applying..." : "Apply changes"}
      </button>
    </div>
  );
}
