import { useEffect, useState, useRef } from "react";
import { api, type SampleInfo, type ReloadResult } from "../api";

interface UploadSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSpecLoaded: (result: ReloadResult) => void;
}

type TabType = "file" | "samples" | "paste";

export function UploadSpecModal({ isOpen, onClose, onSpecLoaded }: UploadSpecModalProps) {
  const [tab, setTab] = useState<TabType>("file");
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [pastedSpec, setPastedSpec] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: string; content: string; lines: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Frontend auto-linker state
  const [connectFrontend, setConnectFrontend] = useState(true);
  const [frontendUrl, setFrontendUrl] = useState("http://localhost:5173");
  const [copiedEnv, setCopiedEnv] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSuccess(null);
      return;
    }

    setSamplesLoading(true);
    api
      .samples()
      .then((data) => setSamples(data))
      .catch(() => undefined)
      .finally(() => setSamplesLoading(false));
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

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

  const handleFileUpload = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (connectFrontend && frontendUrl.trim()) {
        try {
          await api.linkFrontend(frontendUrl.trim());
        } catch {
          /* non-blocking */
        }
      }
      const res = await api.uploadSpec(selectedFile.content, selectedFile.name);
      setSuccess(`Successfully loaded ${res.title} v${res.version} with ${res.routes} mock routes!`);
      onSpecLoaded(res);
      setTimeout(() => {
        onClose();
        setSelectedFile(null);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSampleSelect = async (filename: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (connectFrontend && frontendUrl.trim()) {
        try {
          await api.linkFrontend(frontendUrl.trim());
        } catch {
          /* non-blocking */
        }
      }
      const res = await api.loadSample(filename);
      setSuccess(`Switched to sample ${res.title} v${res.version} (${res.routes} routes)!`);
      onSpecLoaded(res);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePasteUpload = async () => {
    const text = pastedSpec.trim();
    if (!text) {
      setError("Please paste OpenAPI/Swagger YAML or JSON specification.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (connectFrontend && frontendUrl.trim()) {
        try {
          await api.linkFrontend(frontendUrl.trim());
        } catch {
          /* non-blocking */
        }
      }
      const res = await api.uploadSpec(text, "pasted-spec.yaml");
      setSuccess(`Successfully loaded ${res.title} v${res.version} with ${res.routes} mock routes!`);
      onSpecLoaded(res);
      setTimeout(() => {
        onClose();
        setPastedSpec("");
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Upload or Switch API Spec</h2>
              <p className="text-xs text-slate-400">Instantly generate mock routes from OpenAPI 3.0 or Swagger 2.0</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-2">
          <button
            onClick={() => { setTab("file"); setError(null); }}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === "file"
                ? "border-indigo-500 text-indigo-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            📁 Upload File
          </button>
          <button
            onClick={() => { setTab("samples"); setError(null); }}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === "samples"
                ? "border-indigo-500 text-indigo-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            ⚡ Sample Specs ({samples.length})
          </button>
          <button
            onClick={() => { setTab("paste"); setError(null); }}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === "paste"
                ? "border-indigo-500 text-indigo-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            ✍️ Paste YAML / JSON
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6">
          {/* Status alerts */}
          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
              <svg className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <strong className="font-semibold">Spec Validation Error:</strong>
                <p className="mt-0.5 break-words font-mono text-[11px] leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
              <svg className="h-4 w-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium">{success}</span>
            </div>
          )}

          {/* Frontend Auto-Connection Card */}
          <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 text-xs">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 font-semibold text-emerald-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={connectFrontend}
                  onChange={(e) => setConnectFrontend(e.target.checked)}
                  className="rounded text-emerald-500 focus:ring-emerald-400"
                />
                <span>Auto-Connect Frontend Application to this Dummy Server</span>
              </label>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                Dynamic CORS Auto-Bound
              </span>
            </div>

            {connectFrontend && (
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium text-[11px]">Frontend URL:</span>
                  <input
                    type="text"
                    value={frontendUrl}
                    onChange={(e) => setFrontendUrl(e.target.value)}
                    placeholder="http://localhost:5173"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  <div className="flex gap-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setFrontendUrl("http://localhost:5173")}
                      className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                      Vite :5173
                    </button>
                    <button
                      type="button"
                      onClick={() => setFrontendUrl("http://localhost:3000")}
                      className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                      React :3000
                    </button>
                    <button
                      type="button"
                      onClick={() => setFrontendUrl("http://localhost:3001")}
                      className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                      Next :3001
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-950/80 p-2 font-mono text-[11px] text-emerald-400 border border-emerald-500/20">
                  <code>VITE_API_URL=http://127.0.0.1:3000</code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText("VITE_API_URL=http://127.0.0.1:3000");
                      setCopiedEnv(true);
                      setTimeout(() => setCopiedEnv(false), 2000);
                    }}
                    className="text-[10px] text-emerald-300 font-semibold hover:underline"
                  >
                    {copiedEnv ? "Copied! ✓" : "Copy .env"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* TAB 1: FILE UPLOAD */}
          {tab === "file" && (
            <div className="space-y-4">
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
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-500/10 scale-[0.99]"
                    : "border-slate-700 bg-slate-950/40 hover:border-slate-500 hover:bg-slate-800/40"
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
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-indigo-400">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-200">
                  Drag and drop your OpenAPI specification file here
                </p>
                <p className="mt-1 text-xs text-slate-500">Supports .yaml, .yml, or .json up to 5 MB</p>
                <button
                  type="button"
                  className="mt-4 rounded-lg bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  Browse Files
                </button>
              </div>

              {selectedFile && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-200">{selectedFile.name}</span>
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-400">
                            {selectedFile.size} • {selectedFile.lines} lines
                          </span>
                        </div>
                        <p className="text-xs text-emerald-400">Ready to load</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      Clear
                    </button>
                  </div>

                  {/* File preview */}
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950 p-2.5 font-mono text-[11px] text-slate-400 max-h-24 overflow-y-auto">
                    {selectedFile.content.split("\n").slice(0, 8).join("\n")}
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={handleFileUpload}
                      disabled={loading}
                      className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50 transition-all"
                    >
                      {loading ? (
                        <>
                          <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                          </svg>
                          Validating & Generating Routes...
                        </>
                      ) : (
                        <>🚀 Load & Generate Mock Backend</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SAMPLE SPECS */}
          {tab === "samples" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Choose one of the bundled OpenAPI / Swagger sample specifications to switch endpoints instantly:
              </p>

              {samplesLoading && (
                <div className="py-8 text-center text-xs text-slate-500">Loading sample specs...</div>
              )}

              <div className="grid gap-3">
                {samples.map((sample) => (
                  <div
                    key={sample.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4 hover:border-slate-700 hover:bg-slate-800/20 transition-all"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-200">{sample.title}</span>
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                          v{sample.version}
                        </span>
                        <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                          {sample.routesCount} routes
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {sample.description || `Built-in spec from samples/${sample.filename}`}
                      </p>
                      <span className="mt-1 inline-block font-mono text-[10px] text-slate-500">
                        samples/{sample.filename}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSampleSelect(sample.filename)}
                      disabled={loading}
                      className="shrink-0 rounded-lg bg-indigo-600/90 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                    >
                      {loading ? "Loading..." : "⚡ Switch to Spec"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: PASTE SPEC */}
          {tab === "paste" && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-300">
                    Paste OpenAPI (3.x) or Swagger (2.0) YAML / JSON:
                  </label>
                  <span className="text-[11px] font-mono text-slate-500">
                    {pastedSpec.length} chars • {pastedSpec.split("\n").filter(Boolean).length} lines
                  </span>
                </div>
                <textarea
                  value={pastedSpec}
                  onChange={(e) => setPastedSpec(e.target.value)}
                  placeholder={`openapi: 3.0.3\ninfo:\n  title: My API\n  version: 1.0.0\npaths:\n  /items:\n    get:\n      responses:\n        '200':\n          content:\n            application/json:\n              schema:\n                type: array\n                items:\n                  type: object`}
                  rows={9}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setPastedSpec("")}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={handlePasteUpload}
                  disabled={loading || !pastedSpec.trim()}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50 transition-all"
                >
                  {loading ? (
                    <>
                      <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                      </svg>
                      Validating & Building Routes...
                    </>
                  ) : (
                    <>🚀 Validate & Load Pasted Spec</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
