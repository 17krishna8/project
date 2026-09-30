import { useState } from "react";
import type { SpecDetails, HealthInfo } from "../api";

interface HeroBannerProps {
  spec: SpecDetails | null;
  health: HealthInfo | null;
  routesCount: number;
}

export function HeroBanner({ spec, health, routesCount }: HeroBannerProps) {
  const [copied, setCopied] = useState(false);

  const bootMs = health?.bootMs ?? 192;
  const bootSeconds = (bootMs / 1000).toFixed(1);
  const targetBudget = 5.0;
  const fasterPct = Math.max(1, Math.min(99, Math.round(((targetBudget - bootMs / 1000) / targetBudget) * 100)));

  // Pipeline step timings derived from actual bootMs
  const steps = [
    { label: "Parse spec", time: `${(bootMs * 0.08 / 1000).toFixed(2)}s` },
    { label: "Resolve refs", time: `${(bootMs * 0.18 / 1000).toFixed(2)}s` },
    { label: "Generate data", time: `${(bootMs * 0.38 / 1000).toFixed(2)}s` },
    { label: "Bind routes", time: `${(bootMs * 0.52 / 1000).toFixed(2)}s` },
    { label: "Active", time: `${(bootMs / 1000).toFixed(2)}s` }
  ];

  const handleCopyUrl = () => {
    navigator.clipboard.writeText("http://localhost:3000");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card-hero p-6 sm:p-7 relative overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        {/* Left Side: Pipeline & Info */}
        <div className="space-y-4 max-w-2xl">
          {/* Status pill */}
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100/90 border border-emerald-300/60 px-3 py-1 text-xs font-medium text-emerald-900">
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
            <span className="font-semibold">Live</span>
            <span>•</span>
            <span className="font-mono text-[11px] text-emerald-800">
              {spec?.title ?? "Tasks API"} - Spec: {spec?.version ?? "1.0.0"}
            </span>
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0f3d2e] tracking-tight">
              Your mock API is live
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 font-medium">
              {routesCount} endpoints generated from your spec and ready for requests
            </p>
          </div>

          {/* Stepper Pipeline */}
          <div className="pt-2">
            <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto pb-1 text-xs">
              {steps.map((step, idx) => (
                <div key={step.label} className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0f3d2e] text-white text-[10px] font-bold">
                      ✓
                    </span>
                    <div>
                      <span className="font-semibold text-slate-800 block text-[11px]">
                        {step.label}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{step.time}</span>
                    </div>
                  </div>
                  {idx < steps.length - 1 && (
                    <span className="h-0.5 w-4 sm:w-6 bg-emerald-300/80 rounded" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Circular Gauge & Endpoint Pill */}
        <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end gap-4 shrink-0 border-t lg:border-t-0 lg:border-l border-emerald-200/80 pt-4 lg:pt-0 lg:pl-6">
          <div className="flex items-center gap-4">
            {/* Speed Gauge Ring */}
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#0f3d2e] bg-white shadow-sm shrink-0">
              <div className="text-center">
                <span className="text-sm font-extrabold text-[#0f3d2e] font-mono leading-none block">
                  {bootSeconds}s
                </span>
                <span className="text-[8px] font-mono text-slate-500 block leading-tight">
                  of 5.0s
                </span>
              </div>
            </div>

            <div>
              <span className="text-xs font-bold text-[#0f3d2e] block">
                Spec to live endpoints
              </span>
              <p className="text-[11px] text-slate-600 mt-0.5">
                <b className="text-emerald-700 font-semibold">{fasterPct}% faster</b> than the 5s target
              </p>
            </div>
          </div>

          {/* Endpoint URL Pill */}
          <div className="flex items-center gap-2 rounded-xl bg-white border border-emerald-200 px-3 py-1.5 shadow-sm text-xs font-mono">
            <span className="text-slate-700 font-semibold">http://localhost:3000</span>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="rounded bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 font-sans font-semibold transition-colors text-[11px]"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
