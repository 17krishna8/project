"""resolve_origin — the heart of the Gmail/webmail IP-hiding problem.

When an email is sent via Gmail/Outlook webmail, the true personal IP is
usually absent — only Google's/Microsoft's relay IP appears. This module
implements the layered fallback specified in the project brief:

  1. Walk ALL Received: hops bottom (oldest/true origin) -> top, skipping
     internal Google/MS relay IPs.
  2. Check Received-SPF / Authentication-Results for `client-ip=` — this
     sometimes retains the real sending IP even when the top header doesn't.
  3. If the personal IP is genuinely unrecoverable, DO NOT fake a location.
     Degrade to fallback signals and clearly LOWER confidence:
        a. linked phishing-infrastructure IP (usually fully traceable),
        b. Message-ID hostname leaks,
        c. Date-header timezone offset as a soft geographic hint,
        d. (advanced) tracking pixel in auto-reply — flagged, not auto-sent.
"""
from __future__ import annotations

import ipaddress
import re
import socket
from typing import Dict, List, Optional, Tuple

# ----------------------------------------------------------------------
# Relay detection helpers
# ----------------------------------------------------------------------

# RFC1918 + loopback + link-local + CGNAT: never a public origin.
_PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),  # CGNAT
]

# Known Google mail-relay ranges (AS15169). Sending via Gmail webmail puts
# one of these in the headers INSTEAD of the user's real IP.
_GOOGLE_NETS = [
    ipaddress.ip_network("209.85.0.0/16"),
    ipaddress.ip_network("66.102.0.0/16"),
    ipaddress.ip_network("74.125.0.0/16"),
    ipaddress.ip_network("172.217.0.0/16"),
    ipaddress.ip_network("173.194.0.0/16"),
    ipaddress.ip_network("216.58.192.0/19"),
    ipaddress.ip_network("66.249.80.0/20"),
    ipaddress.ip_network("108.177.8.0/21"),
    ipaddress.ip_network("142.250.0.0/15"),
    ipaddress.ip_network("172.253.0.0/16"),
]

# Relay hostname keywords (matches even when an IP isn't in a known range).
_RELAY_KEYWORDS = (
    "google", "gmail", "outlook", "office365", "microsoft", "hotmail",
    "amazonses", "mailchimp", "sendgrid", "protonmail", "zoho", "yahoo",
    "sparkpost", "mailgun", "postfix-local", "localhost", "internal",
)

_IP_RE = re.compile(r"\b(\d{1,3}(?:\.\d{1,3}){3})\b")


def _is_private(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


def _is_relay_ip(ip: str) -> bool:
    """True if the IP is a private address or a known mail-relay range."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True  # unparseable -> not a usable public origin
    if any(addr in net for net in _PRIVATE_NETS):
        return True
    if any(addr in net for net in _GOOGLE_NETS):
        return True
    return False


def _looks_relay_hostname(host: str) -> bool:
    low = host.lower()
    return any(k in low for k in _RELAY_KEYWORDS)


def _host_from_received(line: str) -> Optional[str]:
    """Best-effort hostname from a Received header ('from X (host [ip])')."""
    m = re.search(r"from\s+([^\s]+)\s", line)
    if m:
        return m.group(1).strip("([")
    # fallback: the reverse-DNS block in parentheses like (unknown [1.2.3.4])
    m2 = re.search(r"\(([^)]*)\s*\[(\d{1,3}(?:\.\d{1,3}){3})\]\)", line)
    if m2:
        return m2.group(1).strip() or None
    return None


# ----------------------------------------------------------------------
# Core resolution
# ----------------------------------------------------------------------

def _extract_client_ip(headers: Dict) -> Optional[Tuple[str, str]]:
    """Look for client-ip= in Received-SPF / Authentication-Results."""
    spf = headers.get("Received-SPF", [])
    auth = headers.get("Authentication-Results", [])
    if isinstance(spf, str):
        spf = [spf]
    if isinstance(auth, str):
        auth = [auth]
    for field, lines in (("Received-SPF", spf), ("Authentication-Results", auth)):
        for line in lines:
            m = re.search(r"client-ip=(\d{1,3}(?:\.\d{1,3}){3})", line)
            if m:
                return m.group(1), field
    return None


def _walk_received_hops(received: List[str]) -> List[Tuple[str, str, str]]:
    """Return [(ip, hostname, raw_line), ...] walking bottom->top.

    `received` is top-down (closest hop first), so the TRUE origin is at the
    END of the list. We reverse it so we walk from oldest -> newest.
    """
    hops = []
    for line in reversed(received):  # bottom (oldest) first
        ips = _IP_RE.findall(line)
        host = _host_from_received(line)
        for ip in ips:
            if not _is_private(ip) and not _is_relay_ip(ip):
                hops.append((ip, host or "", line))
    return hops


def _message_id_signal(headers: Dict) -> Optional[str]:
    """Message-ID hostname leak (e.g. <abc123@internal.corp.example.com>)."""
    mid = headers.get("Message-ID", "")
    m = re.search(r"@([^\s>]+)>?$", mid)
    if m:
        host = m.group(1)
        if host and not _looks_relay_hostname(host):
            return host
    return None


def _date_tz_signal(headers: Dict) -> Optional[dict]:
    """Date-header UTC offset as a soft geographic hint."""
    date = headers.get("Date", "")
    m = re.search(r"([+-]\d{4})\s*$", date)
    if m:
        offset = m.group(1)
        sign = 1 if offset[0] == "+" else -1
        hours = sign * int(offset[1:3])
        minutes = sign * int(offset[3:5])
        return {"offset": offset, "utc_offset_minutes": hours * 60 + minutes}
    return None


def resolve_origin(headers: Dict) -> dict:
    """Determine the sender origin with honest, confidence-scored fallback."""
    received = headers.get("Received", []) or []
    result: dict = {
        "origin_ip": None,
        "method": "none",
        "confidence": 0.0,
        "relay_skipped": [],
        "fallback_signals": [],
        "message": "",
    }

    # 1) client-ip= retains the real IP even when top headers don't.
    client_ip = _extract_client_ip(headers)
    if client_ip:
        ip, field = client_ip
        if not _is_relay_ip(ip):
            result["origin_ip"] = ip
            result["method"] = f"client-ip in {field}"
            result["confidence"] = 0.85
            result["message"] = f"Real sending IP recovered from {field} client-ip={ip}."
            return result

    # 2) Walk all Received: hops bottom -> top, skipping relays.
    hops = _walk_received_hops(received)
    for ip, host, line in hops:
        if not _looks_relay_hostname(host):
            result["origin_ip"] = ip
            result["method"] = "received-hop-walk"
            result["confidence"] = 0.7
            result["message"] = f"First non-relay hop from bottom: {ip} (host {host or '?'})."
            return result
        result["relay_skipped"].append({"ip": ip, "host": host})

    # 3) Genuinely unrecoverable (pure Gmail webmail compose). Degrade honestly.
    fallbacks = []
    mid_host = _message_id_signal(headers)
    if mid_host:
        fallbacks.append({"signal": "message_id_hostname", "value": mid_host})

    tz = _date_tz_signal(headers)
    if tz:
        fallbacks.append({"signal": "date_timezone", "value": tz})

    result["method"] = "fallback"
    result["confidence"] = 0.15  # deliberately LOW — we are not fabricating
    result["fallback_signals"] = fallbacks
    result["message"] = (
        "Sender personal IP unrecoverable (Gmail/Outlook webmail relay only). "
        "No precise location will be asserted. Use linked phishing-infrastructure "
        "IP and fallback signals instead (see fallback_signals)."
    )
    return result
