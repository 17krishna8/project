"""Tool package: whitelisted analysis functions.

Each tool is a plain, pure-Python function. The agent can call ONLY these
(see registry.py). Importing this package makes the submodules available.
"""
from . import registry  # noqa: F401
