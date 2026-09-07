"""Tool registry — the single source of truth for the tool WHITELIST.

The agent (LLM) can ONLY call functions registered here. There is no
`eval`, no `exec`, no subprocess-shell fallback, and no "invent a tool"
escape hatch. Each Tool carries:

  * name / description / parameters  -> fed to Ollama as a function schema
  * fn                               -> the actual Python callable (host-side)
  * requires_confirmation            -> human must type "yes" first
  * file_touching                    -> MUST run inside the Docker sandbox

This file is deliberately the only place that maps a tool NAME to code.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List

from . import (  # noqa: F401 — import registers nothing, kept explicit below
    check_reputation,
    check_tor_exit,
    dnsintel,
    extract_urls,
    forensic,
    geolocate_ip,
    hash_evidence,
    parse_headers,
    resolve_origin,
    static_file_scan,
)


@dataclass
class Tool:
    name: str
    description: str
    parameters: Dict[str, Any]
    fn: Callable[..., Any]
    requires_confirmation: bool = False
    file_touching: bool = False

    def schema(self) -> Dict[str, Any]:
        """Ollama tool-calling schema for this tool."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


# ----------------------------------------------------------------------
# The whitelist. Order matches the documented investigation flow.
# ----------------------------------------------------------------------
TOOLS: List[Tool] = [
    Tool(
        name="hash_evidence",
        description="Compute SHA-256 of the original .eml and any attachments BEFORE analysis. "
        "Creates a timestamped audit entry. This must be the FIRST tool called.",
        parameters={
            "type": "object",
            "properties": {"email_path": {"type": "string", "description": "path to the .eml file"}},
            "required": ["email_path"],
        },
        fn=hash_evidence.hash_evidence,
    ),
    Tool(
        name="parse_headers",
        description="Parse and extract all email headers including every Received: hop, SPF, "
        "Authentication-Results, Message-ID and Date.",
        parameters={
            "type": "object",
            "properties": {"email_path": {"type": "string", "description": "path to the .eml file"}},
            "required": ["email_path"],
        },
        fn=parse_headers.parse_headers,
    ),
    Tool(
        name="resolve_origin",
        description="Determine the true sender origin IP. Walks all Received: hops bottom-to-top, "
        "skips Gmail/MS relay IPs, checks client-ip= in SPF/Auth-Results, and applies the "
        "Gmail-hiding fallback (Message-ID hostname, Date timezone). Returns a confidence.",
        parameters={
            "type": "object",
            "properties": {
                "headers": {"type": "object", "description": "result of parse_headers"},
            },
            "required": ["headers"],
        },
        fn=resolve_origin.resolve_origin,
    ),
    Tool(
        name="geolocate_ip",
        description="Multi-source geolocation of an IP (ip-api.com + ipinfo.io + optional offline "
        "GeoLite2). Cross-validates results and returns a confidence radius, never a fake pin.",
        parameters={
            "type": "object",
            "properties": {"ip": {"type": "string", "description": "IPv4 address"}},
            "required": ["ip"],
        },
        fn=geolocate_ip.geolocate_ip,
    ),
    Tool(
        name="check_tor_exit",
        description="Check whether an IP is an active Tor exit node via the Tor Project DNS Exit "
        "List. 127.0.0.2 response = active exit node (origin anonymized).",
        parameters={
            "type": "object",
            "properties": {"ip": {"type": "string", "description": "IPv4 address"}},
            "required": ["ip"],
        },
        fn=check_tor_exit.check_tor_exit,
    ),
    Tool(
        name="extract_urls",
        description="Extract all hyperlinks from the email body and detect brand/domain mismatch "
        "(phishing signal), punycode/IDN homographs, and suspicious TLDs.",
        parameters={
            "type": "object",
            "properties": {"body": {"type": "string", "description": "email body text (HTML or plain)"}},
            "required": ["body"],
        },
        fn=extract_urls.extract_urls,
    ),
    Tool(
        name="check_reputation",
        description="Query VirusTotal + AbuseIPDB free-tier APIs for IP/domain/file-hash reputation.",
        parameters={
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "IP, domain, or SHA-256 hash"},
                "kind": {"type": "string", "description": "ip|domain|hash", "enum": ["ip", "domain", "hash"]},
            },
            "required": ["target", "kind"],
        },
        fn=check_reputation.check_reputation,
    ),
    Tool(
        name="static_file_scan",
        description="SAFE non-executing analysis of an attachment: exiftool metadata, oletools "
        "macro detection, file entropy, file-type/extension mismatch. NEVER executes the file. "
        "Runs inside the Docker sandbox. REQUIRES human confirmation.",
        parameters={
            "type": "object",
            "properties": {"attachment_path": {"type": "string", "description": "path to extracted attachment"}},
            "required": ["attachment_path"],
        },
        fn=static_file_scan.static_file_scan,
        requires_confirmation=True,
        file_touching=True,
    ),
    # --- Forensic binaries (Parrot OS / REMnux class), sandboxed ---------
    Tool(
        name="binwalk_scan",
        description="Detect embedded/concatenated files inside an attachment (file carving). "
        "Sandboxed. REQUIRES human confirmation.",
        parameters={
            "type": "object",
            "properties": {"attachment_path": {"type": "string"}},
            "required": ["attachment_path"],
        },
        fn=forensic.binwalk_scan,
        requires_confirmation=True,
        file_touching=True,
    ),
    Tool(
        name="pdfid_scan",
        description="PDF exploit/anomaly detection (JavaScript, OpenAction, Launch, EmbeddedFile). "
        "Sandboxed. REQUIRES human confirmation.",
        parameters={
            "type": "object",
            "properties": {"attachment_path": {"type": "string"}},
            "required": ["attachment_path"],
        },
        fn=forensic.pdfid_scan,
        requires_confirmation=True,
        file_touching=True,
    ),
    Tool(
        name="capa_scan",
        description="Mandiant FLARE capability detection — what a binary can DO (ATT&CK techniques). "
        "Sandboxed. REQUIRES human confirmation.",
        parameters={
            "type": "object",
            "properties": {"attachment_path": {"type": "string"}},
            "required": ["attachment_path"],
        },
        fn=forensic.capa_scan,
        requires_confirmation=True,
        file_touching=True,
    ),
    Tool(
        name="strings_scan",
        description="Extract ASCII strings from an attachment and flag URLs/IPs/shell commands. "
        "Sandboxed. REQUIRES human confirmation.",
        parameters={
            "type": "object",
            "properties": {"attachment_path": {"type": "string"}},
            "required": ["attachment_path"],
        },
        fn=forensic.strings_scan,
        requires_confirmation=True,
        file_touching=True,
    ),
    Tool(
        name="yara_scan",
        description="YARA signature matching against the rules directory. "
        "Sandboxed. REQUIRES human confirmation.",
        parameters={
            "type": "object",
            "properties": {"attachment_path": {"type": "string"}},
            "required": ["attachment_path"],
        },
        fn=forensic.yara_scan,
        requires_confirmation=True,
        file_touching=True,
    ),
    Tool(
        name="pecheck_scan",
        description="PE (Windows executable) structural anomaly analysis. "
        "Sandboxed. REQUIRES human confirmation.",
        parameters={
            "type": "object",
            "properties": {"attachment_path": {"type": "string"}},
            "required": ["attachment_path"],
        },
        fn=forensic.pecheck_scan,
        requires_confirmation=True,
        file_touching=True,
    ),
    # --- Network intel (host, read-only public lookups) ------------------
    Tool(
        name="dns_lookup",
        description="Look up A/MX/TXT(SPF)/NS records for a domain (phishing-infrastructure "
        "tracing). Host-side, public read-only.",
        parameters={
            "type": "object",
            "properties": {"domain": {"type": "string"}},
            "required": ["domain"],
        },
        fn=dnsintel.dns_lookup,
    ),
    Tool(
        name="whois_lookup",
        description="WHOIS registration data for a domain (registrar, creation/expiry, privacy "
        "protection). Host-side, public read-only.",
        parameters={
            "type": "object",
            "properties": {"domain": {"type": "string"}},
            "required": ["domain"],
        },
        fn=dnsintel.whois_lookup,
    ),
]

TOOL_MAP: Dict[str, Tool] = {t.name: t for t in TOOLS}


def schemas() -> List[Dict[str, Any]]:
    """All tool schemas, for the LLM tool-calling payload."""
    return [t.schema() for t in TOOLS]


def get(name: str) -> Tool | None:
    """Look up a tool by name (returns None for unknown names — never imports)."""
    return TOOL_MAP.get(name)
