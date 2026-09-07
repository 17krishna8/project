"""dnsintel — network-side intel for phishing infrastructure (HOST tools).

These run on the host (not the sandbox, which has --network none): they only
make public, read-only lookups of a domain/IP — no file bytes are touched.

    dns_lookup(domain)   : A, AAAA, MX, TXT (SPF), NS records
    whois_lookup(domain) : registration data (registrar, created/expiry,
                           privacy protection)

This supports the spec's "trace linked phishing infrastructure" pillar: when
the sender IP is unrecoverable, the attacker's fake-login domain is almost
always traceable via DNS + whois.

Uses the real `dig` / `whois` binaries when present (Parrot OS ships both),
with a stdlib-socket fallback for basic A-record resolution.
"""
from __future__ import annotations

import shutil
import socket
import subprocess
from typing import Dict, List, Optional


def _dig(domain: str, rtype: str) -> List[str]:
    if not shutil.which("dig"):
        return []
    try:
        p = subprocess.run(["dig", "+short", rtype, domain],
                           capture_output=True, text=True, timeout=10)
        return [l for l in p.stdout.splitlines() if l.strip()]
    except Exception:
        return []


def _resolve_a(domain: str) -> List[str]:
    """stdlib fallback for A records (used when dig is absent)."""
    try:
        infos = socket.getaddrinfo(domain, None)
        return sorted({i[4][0] for i in infos})
    except Exception:
        return []


def dns_lookup(domain: str) -> dict:
    domain = domain.strip().lower()
    a = _dig(domain, "A") or _resolve_a(domain)
    mx = _dig(domain, "MX")
    txt = _dig(domain, "TXT")
    ns = _dig(domain, "NS")
    return {
        "domain": domain,
        "a": a,
        "mx": mx,
        "txt": txt,       # includes SPF (v=spf1 ...) and DMARC records
        "ns": ns,
        "has_spf": any("spf1" in t for t in txt),
        "has_dmarc": any("DMARC" in t.upper() for t in txt),
        "message": f"A={len(a)} MX={len(mx)} TXT={len(txt)} NS={len(ns)}",
    }


def _whois(domain: str) -> Optional[str]:
    if not shutil.which("whois"):
        return None
    try:
        p = subprocess.run(["whois", domain], capture_output=True, text=True, timeout=15)
        return p.stdout
    except Exception:
        return None


def whois_lookup(domain: str) -> dict:
    domain = domain.strip().lower()
    out = _whois(domain)
    if out is None:
        return {"domain": domain, "available": False,
                "message": "whois binary not installed (install: apt install whois)"}

    import re

    created = re.search(r"(?:Creation Date|created|Registered on)[:\s]+([\d\-T:Z.]+)", out, re.I)
    expiry = re.search(r"(?:Registry Expiry Date|Expiry Date|expires)[:\s]+([\d\-T:Z.]+)", out, re.I)
    registrar = re.search(r"Registrar[:\s]+(.+)", out, re.I)
    # Privacy protection = attacker is hiding identity (scrutiny signal, not guilt).
    privacy = bool(re.search(r"(REDACTED FOR PRIVACY|Privacy Protect|Withheld for Privacy|GDPR)",
                             out, re.I))

    return {
        "domain": domain,
        "available": True,
        "registrar": registrar.group(1).strip() if registrar else None,
        "creation_date": created.group(1) if created else None,
        "expiry_date": expiry.group(1) if expiry else None,
        "privacy_protected": privacy,
        "message": f"registrar={registrar.group(1).strip() if registrar else '?'} "
                   f"privacy={privacy}",
    }
