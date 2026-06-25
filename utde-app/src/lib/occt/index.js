/**
 * Wire the opencascade.js STEP parser into the runtime's parser registry.
 *
 * Call `registerOcctParser()` once at app startup. The actual WASM kernel only
 * loads on the first STEP import (initOcct is lazy), so this is cheap to call.
 */

import { setStepParser } from "../runtime/stepParser";
import { initOcct } from "./loadOcct";
import { parseStepWithOc } from "./parseStep";

export function registerOcctParser(opts = {}) {
  setStepParser(async (bytes, deflection) => {
    const oc = await initOcct(opts);
    return parseStepWithOc(oc, bytes, deflection);
  });
}

export { parseStepWithOc } from "./parseStep";
export { initOcct, isOcctLoaded } from "./loadOcct";
