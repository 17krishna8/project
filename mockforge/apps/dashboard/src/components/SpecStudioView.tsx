import { useEffect, useState, useRef } from "react";
import { api, type SampleInfo, type ReloadResult } from "../api";

interface SpecStudioViewProps {
  currentTitle?: string;
  currentVersion?: string;
  onSpecLoadedAndOpenDashboard: (result: ReloadResult) => void;
}

export function SpecStudioView({
  currentTitle,
  currentVersion,
  onSpecLoadedAndOpenDashboard
}: SpecStudioViewProps) {
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [pastedSpec, setPastedSpec] = useState("");
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: string;
    content: string;
    lines: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSamplesLoading(true);
    api
      .samples()
      .then((data) => setSamples(data))
      .catch(() => undefined)
      .finally(() => setSamplesLoading(false));
  }, []);

  const handleProcessFile = (file: File) => {
    setError(null);
    setSuccess(null);

    const validExts = [".yaml", ".yml", ".json"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!validExts.includes(ext)) {
      setError(`Unsupported file type (${ext}). Please select an OpenAPI/Swagger file with .yaml, .yml, or .json extension.`);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("File exceeds the 5 MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? "");
      const lines = text.split("\n").length;
      const sizeStr = file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`;
      setSelectedFile({
        name: file.name,
        size: sizeStr,
        content: text,
        lines
      });
    };
    reader.onerror = () => setError("Failed to read the selected file.");
    reader.readAsText(file);
  };

  const handleDeployFile = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);

    try {
      const res = await api.uploadSpec(selectedFile.content, selectedFile.name);
      setSuccess(`Loaded ${res.title} v${res.version} with ${res.routes} mock routes!`);
      setTimeout(() => {
        onSpecLoadedAndOpenDashboard(res);
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const handleDeploySample = async (filename: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.loadSample(filename);
      setSuccess(`Switched to sample ${res.title} v${res.version} (${res.routes} routes)!`);
      setTimeout(() => {
        onSpecLoadedAndOpenDashboard(res);
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const handleDeployPasted = async () => {
    const text = pastedSpec.trim();
    if (!text) {
      setError("Please paste your OpenAPI or Swagger YAML / JSON spec first.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await api.uploadSpec(text, "pasted-spec.yaml");
      setSuccess(`Loaded ${res.title} v${res.version} with ${res.routes} mock routes!`);
      setTimeout(() => {
        onSpecLoadedAndOpenDashboard(res);
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Studio Header */}
      <div className="card-tactical-elevated p-8 relative overflow-hidden bg-gradient-to-r from-obsidian-900 via-obsidian-850 to-obsidian-900">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-signal-500/30 bg-signal-500/10 px-3 py-1 text-xs font-mono font-medium text-signal-400 mb-4">
            <span>⚡ SPEC STUDIO</span>
            <span>•</span>
            <span>Zero-code Mock Generation</span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Upload OpenAPI Spec & Launch Mock Server
          </h2>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Drop in your OpenAPI 3.0 or Swagger 2.0 specification. MockForge parses paths,
            synthesizes stateful in-memory CRUD stores, simulates realistic semantic data, and opens
            the live dashboard instantly.
          </p>

          {currentTitle && (
            <div className="mt-4 flex items-center gap-2 text-xs font-mono text-slate-400">
              <span>Active mock:</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 font-semibold text-slate-200">
                {currentTitle} v{currentVersion}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Error or Success notification */}
      {error && (
        <div className="rounded-xl border border-phosphor-crimson/30 bg-phosphor-crimson/10 p-4 text-xs text-phosphor-crimson flex items-start gap-3">
          <span className="text-base">⚠️</span>
          <div>
            <b className="font-semibold block">Spec Validation Error:</b>
            <p className="mt-0.5 font-mono text-[11px] leading-relaxed break-words">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-phosphor-green/30 bg-phosphor-green/10 p-4 text-xs text-phosphor-green flex items-center gap-3">
          <span className="text-base">🚀</span>
          <div>
            <b className="font-semibold">{success}</b>
            <p className="text-[11px] text-slate-400">Opening Live Dashboard...</p>
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left: Drag & Drop Upload Zone */}
        <div className="lg:col-span-7 space-y-6">
          <div className="card-tactical p-6">
            <h3 className="text-sm font-semibold text-white mb-1">Option 1: Upload Spec File</h3>
            <p className="text-xs text-slate-400 mb-4">
              Select or drop your OpenAPI/Swagger file (.yaml, .yml, or .json)
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) handleProcessFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-signal-500 bg-signal-500/10 scale-[0.99]"
                  : "border-slate-800 bg-obsidian-950/60 hover:border-slate-700 hover:bg-slate-800/20"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".yaml,.yml,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleProcessFile(file);
                }}
              />
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800/80 text-signal-400 shadow-inner">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-white">
                Drag and drop your OpenAPI specification file
              </p>
              <p className="mt-1 text-xs text-slate-400">Supports .yaml, .yml, and .json up to 5 MB</p>
              <button
                type="button"
                className="btn-tactical-secondary mt-5 px-4 py-2 text-xs rounded-xl"
              >
                Browse Files
              </button>
            </div>

            {selectedFile && (
              <div className="mt-5 rounded-xl border border-slate-800 bg-obsidian-950 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📄</span>
                    <div>
                      <span className="text-sm font-semibold text-white font-mono">{selectedFile.name}</span>
                      <p className="text-xs text-slate-400 font-mono">
                        {selectedFile.size} • {selectedFile.lines} lines
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="text-xs font-mono text-slate-500 hover:text-slate-300"
                  >
                    Clear
                  </button>
                </div>

                {/* Preview code */}
                <pre className="max-h-24 overflow-y-auto p-2.5 rounded-lg bg-obsidian-900 border border-slate-800/80 font-mono text-[11px] text-slate-400">
                  {selectedFile.content.split("\n").slice(0, 8).join("\n")}
                </pre>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleDeployFile}
                    disabled={loading}
                    className="btn-tactical-primary px-5 py-2.5 text-xs rounded-xl flex items-center gap-2 disabled:opacity-50"
                  >
                    {loading ? "Validating & Building Routes..." : "🚀 Deploy & Open Dashboard ➔"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Paste Spec Option */}
          <div className="card-tactical p-6">
            <h3 className="text-sm font-semibold text-white mb-1">Option 2: Paste Raw YAML / JSON</h3>
            <p className="text-xs text-slate-400 mb-4">Paste specification text directly into the editor</p>

            <textarea
              rows={7}
              value={pastedSpec}
              onChange={(e) => setPastedSpec(e.target.value)}
              placeholder={`openapi: 3.0.3\ninfo:\n  title: My Service API\n  version: 1.0.0\npaths:\n  /items:\n    get:\n      responses:\n        '200':\n          description: Success\n          content:\n            application/json:\n              schema:\n                type: array\n                items:\n                  type: object`}
              className="w-full rounded-xl border border-slate-800 bg-obsidian-950 p-3 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-signal-500 focus:outline-none"
            />

            <div className="mt-3 flex items-center justify-between">
              <span className="font-mono text-[11px] text-slate-500">
                {pastedSpec.length} characters
              </span>
              <button
                type="button"
                onClick={handleDeployPasted}
                disabled={loading || !pastedSpec.trim()}
                className="btn-tactical-primary px-4 py-2 text-xs rounded-xl disabled:opacity-50"
              >
                {loading ? "Deploying..." : "Deploy Pasted Spec & Open Dashboard"}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Built-in Sample Gallery */}
        <div className="lg:col-span-5 space-y-6">
          <div className="card-tactical p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Option 3: Quick Samples</h3>
                <p className="text-xs text-slate-400">Pre-configured OpenAPI & Swagger specifications</p>
              </div>
              <span className="rounded bg-signal-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-signal-400">
                Ready to Run
              </span>
            </div>

            {samplesLoading && (
              <div className="py-12 text-center text-xs text-slate-500 font-mono">
                Loading bundled samples...
              </div>
            )}

            <div className="space-y-3">
              {samples.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-slate-800 bg-obsidian-950/70 p-4 hover:border-slate-700 transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{s.title}</span>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-400">
                        v{s.version}
                      </span>
                    </div>
                    <span className="rounded bg-phosphor-cyan/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-phosphor-cyan">
                      {s.routesCount} routes
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {s.description || `Bundled sample spec from samples/${s.filename}`}
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    <span className="font-mono text-[10px] text-slate-500">
                      samples/{s.filename}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeploySample(s.filename)}
                      disabled={loading}
                      className="btn-tactical-secondary px-3 py-1.5 text-xs font-semibold rounded-lg hover:border-signal-500 hover:text-signal-400 transition-all"
                    >
                      {loading ? "Loading..." : "⚡ Run & Open Dashboard"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
