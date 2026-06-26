/**
 * Wire the opencascade.js STEP parser into the runtime's parser registry.
 *
 * Call `registerOcctParser()` once at app startup. The actual WASM kernel only
 * loads on the first STEP import (initOcct is lazy), so this is cheap to call.
 */

import { setStepParser } from "../runtime/stepParser";
import { initOcct } from "./loadOcct";
import { parseStepWithOc } from "./parseStep";
import { useRuntimeStore } from "../../store/runtimeStore";

export function registerOcctParser(opts = {}) {
  setStepParser(async (bytes, deflection) => {
    const store = useRuntimeStore.getState();
    store.setEngine("occt", "loading", "starting");
    try {
      const oc = await initOcct({
        ...opts,
        onProgress: (stage) => store.setEngine("occt", "loading", stage),
      });
      store.setEngine("occt", "ready");
      return parseStepWithOc(oc, bytes, deflection);
    } catch (err) {
      store.setError("occt", err.message || String(err));
      throw err;
    }
  });
}

export { parseStepWithOc } from "./parseStep";
export { initOcct, isOcctLoaded } from "./loadOcct";
