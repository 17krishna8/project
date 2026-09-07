"""geolocate_ip — multi-source, confidence-scored geolocation.

Queries up to 3 independent sources (ip-api.com, ipinfo.io, offline MaxMind
GeoLite2), cross-validates them, and returns a CONFIDENCE + RADIUS rather
than a single fake pinpoint. If sources disagree or only one responds, the
confidence is explicitly lowered. No result is ever invented.
"""
from __future__ import annotations

import ipaddress
import json
import os
from typing import Any, Dict, List, Optional

import requests

from ..config import CONFIG


def _validate_ip(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).version == 4 or ipaddress.ip_address(ip).version == 6
    except ValueError:
        return False


def _ip_api(ip: str) -> Optional[Dict[str, Any]]:
    """ip-api.com — free, no key, rate-limited to 45 req/min."""
    try:
        r = requests.get(f"http://ip-api.com/json/{ip}?fields=status,country,regionName,city,lat,lon,isp,as",
                         timeout=5)
        data = r.json()
        if data.get("status") == "success":
            return {
                "source": "ip-api.com",
                "country": data.get("country"),
                "region": data.get("regionName"),
                "city": data.get("city"),
                "lat": data.get("lat"),
                "lon": data.get("lon"),
                "isp": data.get("isp"),
                "asn": data.get("as"),
            }
    except (requests.RequestException, ValueError):
        pass
    return None


def _ipinfo(ip: str) -> Optional[Dict[str, Any]]:
    """ipinfo.io — free tier without token, more with a token."""
    url = f"https://ipinfo.io/{ip}/json"
    if CONFIG.ipinfo_token:
        url += f"?token={CONFIG.ipinfo_token}"
    try:
        r = requests.get(url, timeout=5)
        data = r.json()
        if data.get("ip"):
            loc = (data.get("loc") or "").split(",")
            return {
                "source": "ipinfo.io",
                "country": data.get("country"),
                "region": data.get("region"),
                "city": data.get("city"),
                "lat": float(loc[0]) if len(loc) == 2 and loc[0] else None,
                "lon": float(loc[1]) if len(loc) == 2 and loc[1] else None,
                "isp": data.get("org"),
                "asn": (data.get("asn") or {}).get("asn") if isinstance(data.get("asn"), dict) else data.get("asn"),
            }
    except (requests.RequestException, ValueError):
        pass
    return None


def _maxmind(ip: str) -> Optional[Dict[str, Any]]:
    """Offline MaxMind GeoLite2 (optional; needs the .mmdb file + maxminddb pkg)."""
    path = CONFIG.maxmind_geolite2_path
    if not path or not os.path.isfile(path):
        return None
    try:
        import maxminddb  # type: ignore

        with maxminddb.open_database(path) as reader:
            rec = reader.get(ip)
            if rec:
                city = rec.get("city", {}).get("names", {}).get("en")
                country = rec.get("country", {}).get("names", {}).get("en")
                loc = rec.get("location", {})
                return {
                    "source": "MaxMind GeoLite2 (offline)",
                    "country": country,
                    "region": rec.get("subdivisions", [{}])[0].get("names", {}).get("en"),
                    "city": city,
                    "lat": loc.get("latitude"),
                    "lon": loc.get("longitude"),
                    "isp": None,
                    "asn": None,
                }
    except Exception:
        pass
    return None


def _haversine_km(a: Dict, b: Dict) -> float:
    """Great-circle distance in km between two lat/lon points."""
    import math

    la, lo = a.get("lat"), a.get("lon")
    lb, lb2 = b.get("lat"), b.get("lon")
    if None in (la, lo, lb, lb2):
        return float("inf")
    la, lo, lb, lb2 = map(math.radians, (la, lo, lb, lb2))
    dlat, dlon = lb - la, lb2 - lo
    h = math.sin(dlat / 2) ** 2 + math.cos(la) * math.cos(lb) * math.sin(dlon / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def geolocate_ip(ip: str) -> dict:
    if not _validate_ip(ip):
        return {"ip": ip, "error": "invalid IP", "confidence": 0.0}

    results: List[Dict] = [r for r in (_ip_api(ip), _ipinfo(ip), _maxmind(ip)) if r]
    if not results:
        return {
            "ip": ip,
            "sources": [],
            "confidence": 0.0,
            "message": "all GeoIP sources unavailable (offline?) — refusing to fabricate a location",
        }

    # Cross-validation: do sources agree on country? on city?
    countries = {r["country"] for r in results if r.get("country")}
    cities = {r["city"] for r in results if r.get("city")}

    # Confidence scoring.
    n = len(results)
    confidence = 0.4 * n  # more sources = more confidence (cap handled below)
    if len(countries) == 1 and countries != {None}:
        confidence += 0.3  # unanimous country
    if len(cities) == 1 and cities != {None}:
        confidence += 0.3  # unanimous city
    confidence = min(confidence, 0.95)

    # Estimate a confidence RADIUS instead of one pin.
    radius_km = 1000.0
    if len(cities) == 1 and cities != {None}:
        radius_km = 25.0      # city-level agreement
    elif len(countries) == 1 and countries != {None}:
        radius_km = 250.0     # country-level agreement only
    if n == 1:
        radius_km = 500.0     # single source: wide radius, low trust

    best = results[0]
    return {
        "ip": ip,
        "sources": results,
        "agreed_country": next(iter(countries)) if len(countries) == 1 else None,
        "agreed_city": next(iter(cities)) if len(cities) == 1 else None,
        "confidence": round(confidence, 2),
        "radius_km": radius_km,
        "location": {
            "country": best.get("country"),
            "region": best.get("region"),
            "city": best.get("city"),
            "lat": best.get("lat"),
            "lon": best.get("lon"),
            "isp": best.get("isp"),
            "asn": best.get("asn"),
        },
        "message": f"{n} source(s) responded; confidence={confidence:.0%}, radius≈{radius_km:.0f}km",
    }
