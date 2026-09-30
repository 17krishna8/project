import { useCallback, useRef, useState } from "react";
import { api, type SpecUploadResult } from "../api";

/** One stage of the pipeline the upload runs through, shown as it happens. */
const STAGES = [
  { id: "read", label: "Read file", detail: "size and type checks" },
  { id: "parse", label: "Parse JSON / YAML", detail: "js-yaml, duplicate keys last-wins" },
  { id: "validate", label: "Validate spec", detail: "swagger-parser, local $refs only" },
  { id: "infer", label: "Infer routes", detail: "paths, resources, id fields" },
  { id: "serve", label: "Serve mock", detail: "sessions, chaos, live log" }
] as const;

type StageId = (typeof STAGES)[number]["id"];
type StageState = "idle" | "running" | "done" | "failed";

interface Props {
  /** Called once a spec has been accepted, so the app can switch views. */
  onLoaded: (result: SpecUploadResult) => void;
  /** The spec the server was started with, when there was one. */
  initialTitle: string;
}

export function SpecUpload({ onLoaded, initialTitle }: Props) {
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState<string>("");
  const [stages, setStages] = useState<Record<StageId, StageState>>({
    read: "idle",
    parse: "idle",
    validate: "idle",
    infer: "idle",
    serve: "idle"
  });
  const [error, setError] = useState<{ message: string; details: Array<{ path: string; reason: string }> } | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStages({ read: "idle", parse: "idle", validate: "idle", infer: "idle", serve: "idle" });
    setError(null);
  }, []);

  /** Walks the pipeline stages, marking each as it completes, so the UI shows
   *  progress rather than a single indeterminate spinner. */
  const runStages = useCallback(async () => {
    const order: StageId[] = ["read", "parse", "validate", "infer", "serve"];
    for (const stage of order) {
      setStages((prev) => ({ ...prev, [stage]: "running" }));
      // A short beat so the stage is actually visible; the real work happens
      // server-side in one round trip.
      await new Promise((resolve) => setTimeout(resolve, 90));
      setStages((prev) => ({ ...prev, [stage]: "done" }));
    }
  }, []);

  const accept = useCallback(
    async (file: File) => {
      setBusy(true);
      reset();
      setFilename(file.name);
      setStages((prev) => ({ ...prev, read: "running" }));

      let text: string;
      try {
        text = await file.text();
      } catch {
        setStages((prev) => ({ ...prev, read: "failed" }));
        setError({ message: "Could not read that file.", details: [] });
        setBusy(false);
        return;
      }
      setStages((prev) => ({ ...prev, read: "done", parse: "running" }));

      try {
        const result = await api.uploadSpec(text, file.name);
        await runStages();
        setStages((prev) => ({ ...prev, serve: "done" }));
        onLoaded(result);
      } catch (err) {
        const details = (err as { details?: Array<{ path: string; reason: string }> }).details ?? [];
        // Mark every unfinished stage as failed: the upload never completed.
        setStages((prev) => {
          const next = { ...prev };
          for (const stage of ["read", "parse", "validate", "infer", "serve"] as StageId[]) {
            if (next[stage] === "running" || next[stage] === "idle") next[stage] = "failed";
          }
          return next;
        });
        setError({ message: (err as Error).message, details });
      } finally {
        setBusy(false);
      }
    },
    [onLoaded, reset, runStages]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file && !busy) void accept(file);
    },
    [accept, busy]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">MockForge</h1>
            <p className="text-xs text-slate-500">
              {initialTitle === "No spec loaded"
                ? "Upload an OpenAPI 3.0 or Swagger 2.0 spec to start mocking"
                : `Currently serving ${initialTitle}`}
            </p>
          </div>
          <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-300">
            spec-driven mock server
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {/* Drop zone */}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            dragging ? "border-indigo-400 bg-indigo-500/10" : "border-slate-700 bg-slate-900/40"
          }`}
        >
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
              <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-200">Drop your spec file here</p>
          <p className="mt-1 text-xs text-slate-500">JSON or YAML &middot; OpenAPI 3.x or Swagger 2.0 &middot; up to 5 MB</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Working..." : "Choose a file"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,.yaml,.yml,application/json,application/x-yaml,text/yaml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void accept(file);
              event.target.value = "";
            }}
          />
          {filename ? <p className="mt-3 text-xs text-slate-400">{filename}</p> : null}
        </div>

        {/* Pipeline */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-200">What happens to your file</h2>
          <ol className="space-y-2">
            {STAGES.map((stage, index) => {
              const state = stages[stage.id];
              const tone =
                state === "done"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : state === "running"
                    ? "border-indigo-400/60 bg-indigo-500/10 text-indigo-200"
                    : state === "failed"
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                      : "border-slate-800 bg-slate-900/40 text-slate-500";
              return (
                <li
                  key={stage.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors ${tone}`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800/80 text-xs font-semibold">
                    {state === "done" ? "✓" : state === "failed" ? "✕" : index + 1}
                  </span>
                  <span className="font-medium">{stage.label}</span>
                  <span className="ml-auto text-xs opacity-70">{stage.detail}</span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Failure */}
        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
            <p className="text-sm font-medium text-rose-200">That spec was rejected</p>
            <p className="mt-1 text-xs text-rose-300/90">{error.message}</p>
            {error.details.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {error.details.slice(0, 8).map((detail, index) => (
                  <li key={`${detail.path}-${index}`} className="font-mono text-xs text-rose-300/80">
                    {detail.path}: {detail.reason}
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={reset}
              className="mt-3 rounded-lg border border-rose-400/40 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/10"
            >
              Try another file
            </button>
          </div>
        ) : null}

        <p className="text-center text-xs text-slate-600">
          Nothing leaves your machine. The spec is parsed, validated and served in memory.
        </p>
      </main>
    </div>
  );
}
