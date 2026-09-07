"""Local LLM integration via Ollama (tool/function-calling).

Uses Ollama's native `/api/chat` HTTP endpoint with a `tools` schema — no
cloud calls, no data leakage. Ollama 0.3+ supports tool calling for Llama 3.1
and Qwen2.5. If Ollama is unreachable or `--no-llm` is set, the agent falls
back to a deterministic pipeline (same tools, same safety gates) so the
system is still fully demonstrable offline.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import requests

from .config import CONFIG


class OllamaClient:
    """Minimal, dependency-light client for Ollama's tool-calling API."""

    def __init__(self, base_url: str | None = None, model: str | None = None) -> None:
        self.base_url = (base_url or CONFIG.ollama_base_url).rstrip("/")
        self.model = model or CONFIG.ollama_model
        self.timeout = 120  # LLM generation can be slow on CPU

    # --- liveness ----------------------------------------------------
    def available(self) -> bool:
        """Cheap health check: does a local Ollama respond on /api/tags?"""
        try:
            r = requests.get(f"{self.base_url}/api/tags", timeout=2)
            return r.status_code == 200
        except requests.RequestException:
            return False

    # --- core call ---------------------------------------------------
    def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Send a chat request; return the raw Ollama response dict.

        When `tools` is provided, Ollama may respond with
        `message.tool_calls` (list of {function:{name, arguments}}) instead
        of plain text.
        """
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
        }
        if tools:
            payload["tools"] = tools
        r = requests.post(f"{self.base_url}/api/chat", json=payload, timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    @staticmethod
    def extract_tool_calls(resp: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Pull normalized tool calls out of an Ollama response.

        Returns a list of dicts: {"name": str, "arguments": dict}.
        """
        calls = []
        msg = resp.get("message", {}) or {}
        for tc in msg.get("tool_calls", []) or []:
            fn = tc.get("function", {}) or {}
            args = fn.get("arguments", {})
            if isinstance(args, str):
                # Some models return arguments as a JSON string.
                try:
                    import json

                    args = json.loads(args)
                except Exception:
                    args = {}
            calls.append({"name": fn.get("name"), "arguments": args or {}})
        return calls

    @staticmethod
    def extract_text(resp: Dict[str, Any]) -> str:
        """Pull the plain-text content out of an Ollama response."""
        msg = resp.get("message", {}) or {}
        return (msg.get("content") or "").strip()
