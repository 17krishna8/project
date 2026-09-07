"""check_reputation — VirusTotal + AbuseIPDB free-tier lookups.

Both are OPTIONAL. If a key is missing or the API is unreachable, the tool
degrades gracefully and reports "unavailable" rather than failing the run.
Only the target string (IP/domain/hash) leaves the host — never email content.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

import requests

from ..config import CONFIG

_VT_BASE = "https://www.virustotal.com/api/v3"
_ABUSEIPDB_BASE = "https://api.abuseipdb.com/api/v2"


def _virustotal(target: str, kind: str) -> Optional[Dict[str, Any]]:
    if not CONFIG.virustotal_api_key:
        return None
    headers = {"x-apikey": CONFIG.virustotal_api_key}
    endpoints = {
        "ip": f"/ip_addresses/{target}",
        "domain": f"/domains/{target}",
        "hash": f"/files/{target}",
    }
    ep = endpoints.get(kind)
    if not ep:
        return None
    try:
        r = requests.get(_VT_BASE + ep, headers=headers, timeout=5)
        if r.status_code != 200:
            return {"error": f"VT HTTP {r.status_code}"}
        data = r.json().get("data", {}).get("attributes", {})
        stats = data.get("last_analysis_stats", {})
        return {
            "source": "VirusTotal",
            "malicious": stats.get("malicious", 0),
            "suspicious": stats.get("suspicious", 0),
            "harmless": stats.get("harmless", 0),
            "undetected": stats.get("undetected", 0),
            "reputation": data.get("reputation", 0),
            "last_analysis_date": data.get("last_analysis_date"),
        }
    except requests.RequestException as e:
        return {"error": f"VT unreachable: {e}"}


def _abuseipdb(ip: str) -> Optional[Dict[str, Any]]:
    if not CONFIG.abuseipdb_api_key:
        return None
    try:
        r = requests.get(
            _ABUSEIPDB_BASE + "/check",
            params={"ipAddress": ip, "maxAgeInDays": "90", "verbose": ""},
            headers={"Key": CONFIG.abuseipdb_api_key, "Accept": "application/json"},
            timeout=5,
        )
        if r.status_code != 200:
            return {"error": f"AbuseIPDB HTTP {r.status_code}"}
        data = r.json().get("data", {})
        return {
            "source": "AbuseIPDB",
            "abuse_confidence_score": data.get("abuseConfidenceScore", 0),
            "total_reports": data.get("totalReports", 0),
            "is_whitelisted": data.get("isWhitelisted", False),
            "usage_type": data.get("usageType"),
            "domain": data.get("domain"),
        }
    except requests.RequestException as e:
        return {"error": f"AbuseIPDB unreachable: {e}"}


def check_reputation(target: str, kind: str) -> dict:
    results = {}
    if kind == "ip":
        vt = _virustotal(target, "ip")
        ab = _abuseipdb(target)
        if vt:
            results["virustotal"] = vt
        if ab:
            results["abuseipdb"] = ab
    else:
        vt = _virustotal(target, kind)
        if vt:
            results["virustotal"] = vt

    if not results:
        return {
            "target": target,
            "kind": kind,
            "available": False,
            "message": "reputation APIs unavailable (no keys set or offline) — skipping",
        }

    return {"target": target, "kind": kind, "available": True, "results": results}
