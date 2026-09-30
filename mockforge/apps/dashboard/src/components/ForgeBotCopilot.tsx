import { useState, useRef, useEffect } from "react";
import {
  api,
  type ChaosConfig,
  type ProxyConfig,
  type RouteInfo
} from "../api";

export type NavTab =
  | "overview"
  | "endpoints"
  | "playground"
  | "simulation"
  | "memory-transfer"
  | "datastore"
  | "logs"
  | "analytics";

interface ForgeBotCopilotProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  proxyConfig: ProxyConfig;
  onProxyChange: (cfg: ProxyConfig) => void;
  chaos: ChaosConfig | null;
  onChaosChange: (chaos: ChaosConfig) => void;
  targetServerUrl: string;
  onTargetServerUrlChange: (url: string) => void;
  routes: RouteInfo[];
  onRefreshAll: () => void;
}

interface ChatMessage {
  id: string;
  sender: "user" | "bot" | "tool";
  text: string;
  timestamp: string;
  toolCall?: {
    name: string;
    params: Record<string, unknown>;
    result: string;
  };
}

export function ForgeBotCopilot({
  activeTab,
  onTabChange,
  proxyConfig,
  onProxyChange,
  chaos,
  onChaosChange,
  targetServerUrl,
  onTargetServerUrlChange,
  routes,
  onRefreshAll
}: ForgeBotCopilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  // Local Model Settings
  const [endpoint, setEndpoint] = useState("http://localhost:11434/v1");
  const [modelName, setModelName] = useState("llama3.1:latest");
  const [isModelOnline, setIsModelOnline] = useState<boolean | null>(null);
  const [checkingModel, setCheckingModel] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg_init",
      sender: "bot",
      text: "👋 Hi! I am ForgeBot, your autonomous MockForge AI Copilot. I can control any feature on this website—chaos latency, memory transfers, gateway switching, mock data generation, or log analysis. Ask me anything or click a quick action below!",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Check local model connection
  const checkModelConnection = async () => {
    setCheckingModel(true);
    try {
      const baseUrl = endpoint.replace(/\/v1\/?$/, "");
      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000)
      }).catch(async () => {
        return await fetch(`${endpoint}/models`, {
          signal: AbortSignal.timeout(2000)
        });
      });
      setIsModelOnline(res.ok);
    } catch {
      setIsModelOnline(false);
    } finally {
      setCheckingModel(false);
    }
  };

  // Helper to append message
  const appendMessage = (
    sender: "user" | "bot" | "tool",
    text: string,
    toolCall?: ChatMessage["toolCall"]
  ) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        sender,
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        toolCall
      }
    ]);
  };

  // Execute website actions
  const executeAction = async (command: string): Promise<string> => {
    const lower = command.toLowerCase().trim();

    // 1. CHAOS / LATENCY COMMANDS
    if (lower.includes("latency") || lower.includes("delay") || lower.includes("chaos") || lower.includes("slow")) {
      const match = lower.match(/(\d+)\s*(ms|milliseconds)?/);
      let ms = match && match[1] ? parseInt(match[1], 10) : 300;
      if (lower.includes("reset") || lower.includes("zero") || lower.includes("normal") || lower.includes("clear")) {
        ms = 0;
      }
      const updated = await api.updateChaos({ latencyMs: ms });
      onChaosChange(updated);
      onRefreshAll();
      appendMessage("tool", `Updated chaos latency to ${ms}ms`, {
        name: "set_chaos",
        params: { latencyMs: ms },
        result: `Latency configured to ${ms}ms`
      });
      return `Done! Injected ${ms}ms latency into the MockForge server. You can see the waveform update in the Response Time Card.`;
    }

    // 2. ERROR RATE
    if (lower.includes("error") || lower.includes("500") || lower.includes("fault")) {
      const match = lower.match(/(\d+)\s*%/);
      const rate = match && match[1] ? parseInt(match[1], 10) / 100 : 0.2;
      const updated = await api.updateChaos({ errorRate: rate });
      onChaosChange(updated);
      onRefreshAll();
      appendMessage("tool", `Configured error rate to ${(rate * 100).toFixed(0)}%`, {
        name: "set_chaos_errors",
        params: { errorRate: rate },
        result: `Error rate configured to ${(rate * 100).toFixed(0)}%`
      });
      return `Done! Set chaos error rate to ${(rate * 100).toFixed(0)}%. MockForge will now simulate intermittent 500/404 server failures.`;
    }

    // 3. GATEWAY SWITCHING
    if (lower.includes("gateway") || lower.includes("mode") || lower.includes("proxy") || lower.includes("switch")) {
      if (lower.includes("hybrid") || lower.includes("circuit")) {
        const updated = await api.updateProxy({
          enabled: true,
          circuitBreaker: true,
          targetUrl: targetServerUrl
        });
        onProxyChange(updated);
        onRefreshAll();
        appendMessage("tool", "Switched gateway to Hybrid Bridge mode with Circuit Breaker", {
          name: "switch_gateway",
          params: { mode: "hybrid", circuitBreaker: true },
          result: "Active: Hybrid Bridge (Circuit Breaker ON)"
        });
        return `Gateway switched to ⚡ Hybrid Bridge mode with Circuit Breaker active. Requests to :3000 will proxy to :8080 with automatic fallback to mock data if the backend restarts.`;
      } else if (lower.includes("mock") || lower.includes("offline")) {
        const updated = await api.updateProxy({ enabled: false });
        onProxyChange(updated);
        onRefreshAll();
        appendMessage("tool", "Switched gateway to Pure Mock mode (:3000)", {
          name: "switch_gateway",
          params: { mode: "mock" },
          result: "Active: Pure Mock Server (:3000)"
        });
        return `Gateway switched to 🟡 Pure Mock mode (:3000). All client traffic is now served directly from MockForge's fast in-memory engine.`;
      } else if (lower.includes("real") || lower.includes("live") || lower.includes("direct")) {
        const updated = await api.updateProxy({
          enabled: true,
          circuitBreaker: false,
          targetUrl: targetServerUrl
        });
        onProxyChange(updated);
        onRefreshAll();
        appendMessage("tool", "Switched gateway to Real Backend mode (:8080)", {
          name: "switch_gateway",
          params: { mode: "live", circuitBreaker: false },
          result: "Active: Real Backend (:8080)"
        });
        return `Gateway switched to 🟢 Real Backend mode (:8080). All requests pass straight to the production backend.`;
      }
    }

    // 4. REVERSE MEMORY PULL (Real Backend -> Mock RAM)
    if (lower.includes("reverse") || lower.includes("pull") || lower.includes("clone") || lower.includes("snapshot") || (lower.includes("real") && lower.includes("mock"))) {
      onTabChange("memory-transfer");
      const res = await api.runHandshake({
        targetUrl: targetServerUrl || "http://real-production-backend:8080",
        sessionId: "docker-session",
        direction: "pull",
        strategy: "upsert",
        transferMemory: true,
        autoProxy: false
      });
      onRefreshAll();
      appendMessage("tool", `Reverse memory pull executed: ${res.stages.memory.entitiesCount} entities hydrated`, {
        name: "reverse_pull_memory",
        params: { direction: "pull", targetUrl: targetServerUrl },
        result: `${res.stages.memory.entitiesCount} records cloned from Real Backend (:8080) into Mock RAM (:3000)`
      });
      return `Reverse Pull COMPLETE! Successfully cloned ${res.stages.memory.entitiesCount} records from the Real Backend database into MockForge in-memory RAM. You can now test and inspect the data offline in the Memory Transfer Studio.`;
    }

    // 5. FORWARD MEMORY PUSH (Mock RAM -> Real Backend)
    if (lower.includes("push") || lower.includes("transfer") || lower.includes("migrate") || lower.includes("handshake")) {
      onTabChange("memory-transfer");
      const res = await api.runHandshake({
        targetUrl: targetServerUrl || "http://real-production-backend:8080",
        sessionId: "docker-session",
        direction: "push",
        strategy: "upsert",
        transferMemory: true,
        autoProxy: true
      });
      onRefreshAll();
      appendMessage("tool", `Forward memory transfer executed: ${res.stages.memory.entitiesCount} entities migrated`, {
        name: "forward_push_memory",
        params: { direction: "push", targetUrl: targetServerUrl },
        result: `Migrated to :8080 with token ${res.handshakeToken}`
      });
      return `Forward Transfer COMPLETE! Migrated ${res.stages.memory.entitiesCount} records across the Docker bridge into the Real Backend database. Gateway cutover activated.`;
    }

    // 6. SEED MOCK DATA
    if (lower.includes("seed") || lower.includes("create task") || lower.includes("generate data")) {
      const match = lower.match(/(\d+)\s*(tasks?|records?)?/);
      const count = match && match[1] ? Math.min(parseInt(match[1], 10), 10) : 3;
      const createdIds: string[] = [];

      for (let i = 1; i <= count; i++) {
        const payload = {
          title: `AI Synthesized Cloud Task #${Math.floor(Math.random() * 9000 + 1000)}`,
          priority: i % 2 === 0 ? "high" : "medium",
          done: i === 1,
          createdAt: new Date().toISOString()
        };
        const res = await fetch("/tasks", {
          method: "POST",
          headers: { "content-type": "application/json", "x-session-id": "docker-session" },
          body: JSON.stringify(payload)
        });
        const d = (await res.json()) as { id: string };
        if (d.id) createdIds.push(d.id);
      }

      onRefreshAll();
      appendMessage("tool", `Generated and seeded ${createdIds.length} synthetic tasks`, {
        name: "seed_mock_tasks",
        params: { count, sessionId: "docker-session" },
        result: `Created: ${createdIds.join(", ")}`
      });
      return `Successfully seeded ${createdIds.length} synthetic tasks into MockForge in-memory RAM under session 'docker-session'.`;
    }

    // 7. NAVIGATION
    if (lower.includes("go to") || lower.includes("open") || lower.includes("show") || lower.includes("navigate")) {
      if (lower.includes("analytic") || lower.includes("chart") || lower.includes("metric")) {
        onTabChange("analytics");
        return "Switched to the Analytics & Visualizations tab.";
      }
      if (lower.includes("log") || lower.includes("traffic") || lower.includes("stream")) {
        onTabChange("logs");
        return "Switched to the Live Request Logs tab.";
      }
      if (lower.includes("memory") || lower.includes("transfer") || lower.includes("datastore")) {
        onTabChange("memory-transfer");
        return "Switched to the Memory Transfer Studio tab.";
      }
      if (lower.includes("endpoint") || lower.includes("route")) {
        onTabChange("endpoints");
        return "Switched to the Endpoints Explorer tab.";
      }
      if (lower.includes("playground") || lower.includes("curl") || lower.includes("rest")) {
        onTabChange("playground");
        return "Switched to the REST Playground tab.";
      }
      if (lower.includes("simulation") || lower.includes("chaos")) {
        onTabChange("simulation");
        return "Switched to the Simulation & Fault Injection tab.";
      }
    }

    // 8. TEST GATEWAY
    if (lower.includes("test gateway") || lower.includes("test tasks") || lower.includes("probe")) {
      const start = performance.now();
      const res = await fetch("/tasks", { headers: { "x-session-id": "docker-session" } });
      const latency = Math.round(performance.now() - start);
      const src = res.headers.get("x-mockforge-source") || "mock";
      appendMessage("tool", `Issued GET /tasks to gateway (:3000)`, {
        name: "test_gateway",
        params: { endpoint: "/tasks" },
        result: `Status ${res.status} | Source: ${src} | Latency: ${latency}ms`
      });
      return `Gateway verification test completed! Status: ${res.status} OK. Traffic routed to: ${src}. Roundtrip: ${latency}ms.`;
    }

    // Default Fallback
    return `I received your command: "${command}". I can execute any of the following for you:\n• "Set latency to 250ms"\n• "Switch gateway to hybrid mode"\n• "Pull real backend memory into mock RAM"\n• "Seed 3 new high priority tasks"\n• "Navigate to Analytics"`;
  };

  // Submit Handler
  const handleSend = async (userPrompt?: string) => {
    const text = (userPrompt ?? input).trim();
    if (!text || busy) return;

    setInput("");
    appendMessage("user", text);
    setBusy(true);

    try {
      // 1. Try local LLM API if model is online
      let answeredByLLM = false;
      if (isModelOnline) {
        try {
          const llmRes = await fetch(`${endpoint}/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              model: modelName,
              messages: [
                {
                  role: "system",
                  content:
                    "You are ForgeBot, an autonomous controller for MockForge API server. When asked to change settings or navigate, state clearly what action should be taken."
                },
                { role: "user", content: text }
              ],
              temperature: 0.3,
              max_tokens: 250
            }),
            signal: AbortSignal.timeout(5000)
          });

          if (llmRes.ok) {
            const data = (await llmRes.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const reply = data.choices?.[0]?.message?.content;
            if (reply) {
              await executeAction(text);
              appendMessage("bot", reply);
              answeredByLLM = true;
            }
          }
        } catch {
          answeredByLLM = false;
        }
      }

      // 2. Deterministic execution engine
      if (!answeredByLLM) {
        const response = await executeAction(text);
        appendMessage("bot", response);
      }
    } catch (err) {
      appendMessage(
        "bot",
        `Error executing command: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Pill (Bottom Right) */}
      <div className="fixed bottom-5 right-5 z-50">
        {!isOpen ? (
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              checkModelConnection();
            }}
            className="flex items-center gap-2.5 rounded-full bg-[#0f3d2e] hover:bg-[#15533f] text-white px-4 py-2.5 shadow-xl border border-emerald-400/40 text-xs font-bold transition-all transform hover:scale-105"
            title="Open ForgeBot Autonomous AI Assistant"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
            </span>
            <span className="text-sm">✨</span>
            <span>ForgeBot AI Copilot</span>
          </button>
        ) : null}
      </div>

      {/* Floating Chat Drawer Window */}
      {isOpen && (
        <div className="fixed bottom-5 right-5 z-50 w-96 sm:w-[420px] h-[580px] bg-[#f6f6f2] rounded-2xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="bg-[#0f3d2e] text-white px-4 py-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 text-base font-bold border border-emerald-400/30">
                ✨
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm tracking-tight">ForgeBot Copilot</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 font-bold">
                    v1.0
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-200/80">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isModelOnline ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                  />
                  <span>
                    {isModelOnline
                      ? `Local Model: ${modelName}`
                      : "Local Model Offline (Smart Agent Active)"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Settings Gear */}
              <button
                type="button"
                onClick={() => setIsConfigOpen(!isConfigOpen)}
                className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-800/60 transition-colors text-xs font-bold"
                title="Configure Local PC Model (Ollama / LM Studio)"
              >
                ⚙️
              </button>
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-800/60 transition-colors text-xs font-bold"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Local Model Configuration Drawer (Collapsible) */}
          {isConfigOpen && (
            <div className="bg-white border-b border-slate-200 p-4 space-y-3 text-xs shadow-xs animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span>💻</span>
                  <span>Local PC Model Configuration</span>
                </span>
                <button
                  type="button"
                  onClick={checkModelConnection}
                  disabled={checkingModel}
                  className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300"
                >
                  {checkingModel ? "Testing..." : "Test Connection"}
                </button>
              </div>

              {/* Preset Buttons */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-medium">Provider:</span>
                <button
                  type="button"
                  onClick={() => {
                    setEndpoint("http://localhost:11434/v1");
                    setModelName("llama3.1:latest");
                  }}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                >
                  Ollama (:11434)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEndpoint("http://localhost:1234/v1");
                    setModelName("qwen2.5-coder-7b-instruct");
                  }}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100"
                >
                  LM Studio (:1234)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">
                    API Endpoint:
                  </label>
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    className="w-full font-mono text-[11px] px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-[#0f3d2e]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">
                    Model Tag:
                  </label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="w-full font-mono text-[11px] px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-[#0f3d2e]"
                  />
                </div>
              </div>

              <div className="text-[10px] text-slate-500 flex items-center justify-between">
                <span>
                  Status:{" "}
                  <strong className={isModelOnline ? "text-emerald-700" : "text-amber-700"}>
                    {isModelOnline === true
                      ? "Connected to Local LLM"
                      : isModelOnline === false
                      ? "Server Offline (Using Smart Agent)"
                      : "Unchecked"}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold"
                >
                  Save & Hide
                </button>
              </div>
            </div>
          )}

          {/* Quick Action Suggestion Chips */}
          <div className="bg-[#f1f2ec] border-b border-slate-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto text-[11px] font-medium no-scrollbar">
            <button
              type="button"
              onClick={() => handleSend("Set latency to 300ms")}
              className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white text-slate-700 hover:text-slate-950 border border-slate-200 hover:border-slate-300 shadow-2xs transition-colors"
            >
              ⚡ 300ms Delay
            </button>
            <button
              type="button"
              onClick={() => handleSend("Pull memory from real backend")}
              className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white text-sky-800 hover:text-sky-950 border border-sky-200 hover:border-sky-300 shadow-2xs transition-colors font-semibold"
            >
              📥 Pull Real DB
            </button>
            <button
              type="button"
              onClick={() => handleSend("Switch to hybrid gateway mode")}
              className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white text-emerald-800 hover:text-emerald-950 border border-emerald-200 hover:border-emerald-300 shadow-2xs transition-colors font-semibold"
            >
              🔀 Hybrid Gateway
            </button>
            <button
              type="button"
              onClick={() => handleSend("Seed 3 high priority tasks")}
              className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white text-amber-800 hover:text-amber-950 border border-amber-200 hover:border-amber-300 shadow-2xs transition-colors font-semibold"
            >
              🌱 Seed Tasks
            </button>
            <button
              type="button"
              onClick={() => handleSend("Reset latency to 0")}
              className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white text-slate-700 hover:text-slate-950 border border-slate-200 shadow-2xs transition-colors"
            >
              🔄 Reset Chaos
            </button>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === "user"
                    ? "items-end"
                    : "items-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-[#0f3d2e] text-white rounded-br-xs font-medium"
                      : msg.sender === "tool"
                      ? "bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-bl-xs border border-slate-800 w-full"
                      : "bg-white text-slate-800 rounded-bl-xs border border-slate-200"
                  }`}
                >
                  {msg.sender === "tool" && msg.toolCall ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-slate-400 text-[10px] border-b border-slate-800 pb-1">
                        <span className="font-bold text-amber-400">⚙️ TOOL CALL: {msg.toolCall.name}()</span>
                        <span>{msg.timestamp}</span>
                      </div>
                      <div className="text-slate-300 text-[10px]">
                        Params: {JSON.stringify(msg.toolCall.params)}
                      </div>
                      <div className="text-emerald-400 font-bold text-[10px]">
                        ✓ {msg.toolCall.result}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="whitespace-pre-line">{msg.text}</p>
                      <span
                        className={`text-[9px] block text-right mt-1 font-mono ${
                          msg.sender === "user" ? "text-emerald-200/80" : "text-slate-400"
                        }`}
                      >
                        {msg.timestamp}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-slate-500 text-xs italic bg-white p-2.5 rounded-xl border border-slate-200 w-fit">
                <span className="animate-spin text-sm">⚡</span>
                <span>ForgeBot is analyzing & executing action...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask ForgeBot to control any feature..."
              disabled={busy}
              className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0f3d2e] focus:bg-white transition-all shadow-inner"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="btn-figma-primary px-3.5 py-2 text-xs flex items-center justify-center disabled:opacity-40"
            >
              <span>➤</span>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
