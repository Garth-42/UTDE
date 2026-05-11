"""
Process registry and @process decorator.

Provides a lightweight mechanism to register named process templates.
Every process is a plain Python function decorated with @process("name", ...).
The function takes a GeometryModel, picked geometry, and a params dict and
returns a ToolpathCollection.

Usage:
    from toolpath_engine import process, get_process, list_processes

    @process(
        "pocket",
        kind="sub",
        label="Pocket",
        icon="pocket",
        requires=[{"type": "face", "label": "Pocket floor"}],
        params=[
            {"id": "depth", "type": "number", "default": 8.0, "unit": "mm",
             "label": "Total depth"},
        ],
        est_time=4.6,
        est_volume=2.2,
    )
    def pocket(model, geometry, params):
        ...

    fn = get_process("pocket")
    result = fn(my_model, picked_geometry, {"depth": 5.0})

Design notes:
- The registry is module-level; templates auto-register on import.
- Process names are lowercase-with-hyphens by convention.
- Templates ship with the library at toolpath_engine/templates/.
- A process function must return a ToolpathCollection.
- All UI-metadata fields (kind, icon, requires, params, est_*) are OPTIONAL.
  Templates without them still register; they just expose minimal metadata.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

_REGISTRY: Dict[str, Callable] = {}


def process(
    name: str,
    description: str = "",
    tags: Optional[List[str]] = None,
    *,
    kind: Optional[str] = None,
    label: Optional[str] = None,
    icon: Optional[str] = None,
    requires: Optional[List[Dict[str, Any]]] = None,
    params: Optional[List[Dict[str, Any]]] = None,
    est_time: Optional[float] = None,
    est_volume: Optional[float] = None,
):
    """
    Decorator that registers a function as a named process template.

    Args:
        name:        Unique process identifier, e.g. "pocket".
        description: Human-readable description shown in template browser.
        tags:        Optional list of tags for filtering, e.g. ["additive", "5-axis"].

    UI metadata (all optional — used by the front-end Operation Library):
        kind:       Free-form classification tag, e.g. "add", "sub", "hyb",
                    "coat", "inspect". The shell colours add/sub/hyb specially
                    and falls back to a neutral colour for everything else.
        label:      Display name shown in the library/timeline. Defaults to `name`.
        icon:       Icon key the front end resolves into a glyph.
        requires:   List of geometry-slot specs the user must pick before the op
                    can run. Each entry: {"type": "face"|"edge"|"vertex",
                    "label": str, "count": int (1 or 0; 0 means multi)}.
                    Empty list means the template needs no geometry selection.
        params:     Parameter schema rendered in the parameter editor. Each entry:
                    {"id": str, "type": "number"|"select"|"segment", "default": Any,
                     "label": str, "unit"?: str, "options"?: [str], "hint"?: str}.
        est_time:   Estimated cycle time in minutes (mock value for the timeline).
        est_volume: Estimated volume removed/deposited in cm³.

    Example:
        @process(
            "pocket",
            kind="sub",
            label="Pocket",
            icon="pocket",
            requires=[{"type": "face", "label": "Pocket floor"}],
            params=[
                {"id": "depth", "type": "number", "default": 8.0,
                 "unit": "mm", "label": "Total depth"},
            ],
            est_time=4.6, est_volume=2.2,
            tags=["subtractive", "milling"],
        )
        def pocket(model, geometry, params): ...
    """
    def decorator(fn: Callable) -> Callable:
        fn.__process_name__        = name
        fn.__process_description__ = description
        fn.__process_tags__        = tags or []
        fn.__process_kind__        = kind
        fn.__process_label__       = label or name
        fn.__process_icon__        = icon
        fn.__process_requires__    = requires or []
        fn.__process_params__      = params or []
        fn.__process_est_time__    = est_time
        fn.__process_est_volume__  = est_volume
        _REGISTRY[name] = fn
        return fn
    return decorator


def get_process(name: str) -> Callable:
    """Return the registered process function by name."""
    if name not in _REGISTRY:
        available = ", ".join(sorted(_REGISTRY.keys())) or "(none registered)"
        raise KeyError(f"No process named '{name}'. Available: {available}")
    return _REGISTRY[name]


def list_processes() -> List[Dict[str, Any]]:
    """
    Return UI-shaped metadata for every registered process.

    The shape matches what the front-end Operation Library consumes:
        { id, name, label, kind, icon, description, tags,
          requires, params, est_time, est_volume }
    """
    return [
        {
            "id":          fn.__process_name__,
            "name":        fn.__process_name__,
            "label":       fn.__process_label__,
            "kind":        fn.__process_kind__,
            "icon":        fn.__process_icon__,
            "description": fn.__process_description__,
            "tags":        fn.__process_tags__,
            "requires":    fn.__process_requires__,
            "params":      fn.__process_params__,
            "est_time":    fn.__process_est_time__,
            "est_volume":  fn.__process_est_volume__,
        }
        for fn in _REGISTRY.values()
    ]


def clear_registry():
    """Clear all registered processes. Primarily for testing."""
    _REGISTRY.clear()
