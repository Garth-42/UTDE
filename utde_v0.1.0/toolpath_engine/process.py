"""
Process registry and @process decorator.

Provides a lightweight mechanism to register named process templates.
Every process is a plain Python function decorated with @process("name").
The function takes a GeometryModel (or nothing) and returns a ToolpathCollection.

Usage:
    from toolpath_engine import process, get_process, list_processes

    @process("conformal-spray-coat")
    def spray_coat(model, params=None):
        surfaces = model.select(tag="coat_target")
        paths = RasterFillStrategy().generate(surfaces, spacing=3)
        paths.orient(to_normal(surfaces))
        paths.orient(lead(10))
        return paths

    # Later:
    fn = get_process("conformal-spray-coat")
    result = fn(my_model)

Design notes:
- The registry is module-level; templates auto-register on import.
- Process names are lowercase-with-hyphens by convention.
- Templates live in the templates/ directory at the repo root.
- A process function must return a ToolpathCollection.
"""

from __future__ import annotations

from typing import Callable, Dict, Optional, List

_REGISTRY: Dict[str, Callable] = {}


def process(name: str, description: str = "", tags: Optional[List[str]] = None):
    """
    Decorator that registers a function as a named process template.

    Args:
        name:        Unique process identifier, e.g. "ded-5axis-helical".
        description: Human-readable description shown in template browser.
        tags:        Optional list of tags for filtering, e.g. ["additive", "5-axis"].

    Example:
        @process("ded-5axis-helical", description="DED weld on cylindrical surface",
                 tags=["additive", "5-axis", "ded"])
        def ded_helical(model, params=None):
            ...
            return collection
    """
    def decorator(fn: Callable) -> Callable:
        fn.__process_name__ = name
        fn.__process_description__ = description
        fn.__process_tags__ = tags or []
        _REGISTRY[name] = fn
        return fn
    return decorator


def get_process(name: str) -> Callable:
    """Return the registered process function by name."""
    if name not in _REGISTRY:
        available = ", ".join(sorted(_REGISTRY.keys())) or "(none registered)"
        raise KeyError(f"No process named '{name}'. Available: {available}")
    return _REGISTRY[name]


def list_processes() -> List[Dict]:
    """Return metadata for all registered processes."""
    return [
        {
            "name": fn.__process_name__,
            "description": fn.__process_description__,
            "tags": fn.__process_tags__,
        }
        for fn in _REGISTRY.values()
    ]


def clear_registry():
    """Clear all registered processes. Primarily for testing."""
    _REGISTRY.clear()
