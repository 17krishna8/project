#!/usr/bin/env python3
"""Top-level entry point.

Usage:
    python run.py samples/phishing.eml
    python run.py samples/bec_gmail.eml --mode agent
    python run.py samples/clean.eml --no-sandbox

This tiny shim exists so the project can be launched without pip-installing
the `sentinel` package. It just hands off to sentinel.main:main().
"""
import sys
from sentinel.main import main

if __name__ == "__main__":
    sys.exit(main())
