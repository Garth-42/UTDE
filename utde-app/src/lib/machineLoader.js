/**
 * machineLoader — fetch + import calls for the machine picker.
 *
 * The picker UI subscribes to machineStore; this module owns the network
 * round-trips and keeps the store in sync. Loaded eagerly once on mount
 * via useMachines(); the picker's "Import" button calls importMachine().
 */

import { useEffect } from "react";
import runtime from "./runtime";
import { useMachineStore } from "../store/machineStore";

export async function fetchMachines() {
  const store = useMachineStore.getState();
  store.setLoading(true);
  try {
    const machines = await runtime.listMachines();
    store.setAvailable(machines || []);
    return machines || [];
  } catch (err) {
    store.setError(err.message || String(err));
    throw err;
  } finally {
    store.setLoading(false);
  }
}

export async function importMachine(file) {
  const store = useMachineStore.getState();
  store.setLoading(true);
  try {
    const text = typeof file === "string" ? file : await file.text();
    const filename = (file && file.name) || "machine.yaml";
    const machine = await runtime.importMachine(text, filename);
    if (machine) store.appendMachine(machine);
    return machine;
  } catch (err) {
    store.setError(err.message || String(err));
    throw err;
  } finally {
    store.setLoading(false);
  }
}

/** React hook — kicks off a fetch on mount, returns the current store slice. */
export function useMachines() {
  const available = useMachineStore((s) => s.available);
  const currentId = useMachineStore((s) => s.currentId);
  const loading   = useMachineStore((s) => s.loading);
  const error     = useMachineStore((s) => s.error);

  useEffect(() => {
    if (available.length === 0 && !loading) {
      fetchMachines().catch(() => { /* surfaced via store.error */ });
    }
    // run-once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { available, currentId, loading, error };
}
