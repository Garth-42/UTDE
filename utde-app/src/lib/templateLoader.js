/**
 * Template loader — fetches the Operation Library from the Python backend.
 *
 * The backend's GET /templates endpoint returns metadata produced by the
 * @process decorator: { id, label, kind, icon, requires, params,
 * est_time, est_volume, ... }. The Setup tab's library panel and parameter
 * editor consume that data directly.
 *
 * Loaded once per session and cached. Call invalidateTemplates() if the
 * server reloads templates at runtime.
 */

import { useCallback, useEffect, useState } from "react";
import { getBaseUrl } from "./backend";

let _cache = null;
let _inflight = null;

export async function fetchTemplates() {
  if (_cache) return _cache;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    const base = await getBaseUrl();
    const res = await fetch(`${base}/templates`);
    if (!res.ok) {
      _inflight = null;
      throw new Error(`/templates returned ${res.status}`);
    }
    const body = await res.json();
    _cache = body.templates || [];
    _inflight = null;
    return _cache;
  })();

  return _inflight;
}

export function invalidateTemplates() {
  _cache = null;
  _inflight = null;
}

/** Look up a single template record by id from the cached list. */
export function getTemplate(id) {
  if (!_cache) return null;
  return _cache.find((t) => t.id === id) || null;
}

/** React hook — fetches once on mount; exposes refresh() that invalidates
 *  the module cache and refetches (lets the LibraryPanel recover from a
 *  failed initial load without remounting). */
export function useTemplates() {
  const [state, setState] = useState({
    templates: _cache || [],
    loading:   _cache == null,
    error:     null,
  });

  const refresh = useCallback(() => {
    invalidateTemplates();
    setState({ templates: [], loading: true, error: null });
    fetchTemplates()
      .then((templates) => setState({ templates, loading: false, error: null }))
      .catch((error)    => setState({ templates: [], loading: false, error }));
  }, []);

  useEffect(() => {
    if (_cache) return;
    let cancelled = false;
    fetchTemplates()
      .then((templates) => {
        if (!cancelled) setState({ templates, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ templates: [], loading: false, error });
      });
    return () => { cancelled = true; };
  }, []);

  return { ...state, refresh };
}
