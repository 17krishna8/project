"""Central configuration loader.

Reads environment variables (optionally from a `.env` file) and exposes a
single `Config` object. All values have safe local defaults so the agent
runs out-of-the-box with zero cloud dependencies.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

try:
    # Optional: load .env if present (pure-python, no heavy dep).
    from dotenv import load_dotenv  # type: ignore

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is optional
    pass


def _get(name: str, default: str) -> str:
    """Read env var, trimming whitespace; return default when unset/empty."""
    val = os.environ.get(name, "").strip()
    return val if val else default


def _get_bool(name: str, default: bool) -> bool:
    return _get(name, "1" if default else "0").lower() in {"1", "true", "yes", "on"}


def _get_int(name: str, default: int) -> int:
    try:
        return int(_get(name, str(default)))
    except ValueError:
        return default


@dataclass
class Config:
    # --- LLM ---------------------------------------------------------
    ollama_base_url: str = field(default_factory=lambda: _get("OLLAMA_BASE_URL", "http://localhost:11434"))
    ollama_model: str = field(default_factory=lambda: _get("OLLAMA_MODEL", "llama3.1:8b"))

    # --- Reputation APIs ---------------------------------------------
    virustotal_api_key: str = field(default_factory=lambda: _get("VIRUSTOTAL_API_KEY", ""))
    abuseipdb_api_key: str = field(default_factory=lambda: _get("ABUSEIPDB_API_KEY", ""))
    ipinfo_token: str = field(default_factory=lambda: _get("IPINFO_TOKEN", ""))

    # --- GeoIP offline DB --------------------------------------------
    maxmind_geolite2_path: str = field(default_factory=lambda: _get("MAXMIND_GEOLITE2_PATH", ""))

    # --- Blockchain --------------------------------------------------
    blockchain_mode: str = field(default_factory=lambda: _get("BLOCKCHAIN_MODE", "hashchain"))
    ganache_rpc_url: str = field(default_factory=lambda: _get("GANACHE_RPC_URL", "http://127.0.0.1:8545"))
    ganache_account: str = field(default_factory=lambda: _get("GANACHE_ACCOUNT", "0x0000000000000000000000000000000000000000"))
    ledger_path: str = field(default_factory=lambda: _get("LEDGER_PATH", "evidence/ledger.chain.json"))

    # --- Safety ------------------------------------------------------
    tool_timeout_seconds: int = field(default_factory=lambda: _get_int("TOOL_TIMEOUT_SECONDS", 15))
    sandbox_enabled: bool = field(default_factory=lambda: _get_bool("SANDBOX_ENABLED", True))

    # --- Directories -------------------------------------------------
    reports_dir: str = field(default_factory=lambda: "reports")

    def ensure_dirs(self) -> None:
        """Create output directories (reports, evidence) if missing."""
        for d in (self.reports_dir, str(Path(self.ledger_path).parent)):
            Path(d).mkdir(parents=True, exist_ok=True)


# Module-level singleton for convenient import.
CONFIG = Config()
