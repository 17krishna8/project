"""check_tor_exit — Tor Project real-time DNS Exit List (DNSEL) check.

Query format: <reversed-IP>.ip-port.exitlist.torproject.org
A DNS A-record response of 127.0.0.2 means the IP is an ACTIVE Tor exit
node. (127.0.0.1 = not listed.) We use the stdlib `socket` so there is no
extra dependency; dnspython is optional and unnecessary here.

IMPORTANT: a Tor exit match flags 'origin anonymized' and raises scrutiny —
it is NOT automatic proof of malicious intent (Tor is used legitimately too).
"""
from __future__ import annotations

import ipaddress
import socket
from typing import Optional

_TOR_EXIT_ANSWER = "127.0.0.2"


def _reverse_ip(ip: str) -> Optional[str]:
    """'1.2.3.4' -> '4.3.2.1' (Tor DNSEL wants reversed octets)."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None
    if addr.version != 4:
        return None  # DNSEL currently covers IPv4
    octets = ip.split(".")
    return ".".join(reversed(octets))


def check_tor_exit(ip: str) -> dict:
    rev = _reverse_ip(ip)
    if not rev:
        return {"ip": ip, "tor_exit": None, "message": "not an IPv4 address; Tor DNSEL check skipped"}

    query = f"{rev}.ip-port.exitlist.torproject.org"
    try:
        # Resolve the A record. gethostbyname is enough for this query.
        answer = socket.gethostbyname(query)
    except socket.gaierror:
        # NXDOMAIN = not a Tor exit (or DNS unreachable). Treat as not-listed.
        return {"ip": ip, "tor_exit": False, "message": "not listed in Tor exit list"}

    is_exit = answer == _TOR_EXIT_ANSWER
    return {
        "ip": ip,
        "tor_exit": is_exit,
        "dns_answer": answer,
        "query": query,
        "message": (
            "IP is an ACTIVE Tor exit node — origin anonymized (scrutiny++, not proof of guilt)"
            if is_exit
            else f"not a Tor exit node (answer {answer})"
        ),
    }
