/**
 * graphToScript — converts graphStore state to a Python script string.
 *
 * Thin wrapper around generatePythonCode that accepts graphStore state
 * and resolves the geometry needed to produce a complete script.
 */
import { generatePythonCode } from "../../utils/codeGen";
import { getStrategyParams, getOrientRules } from "../../store/graphStore";

/**
 * @param {object} graphState  - snapshot of graphStore state (nodes + edges)
 * @param {object[]} faces     - resolved face objects (from stepStore)
 * @param {object[]} edges     - resolved edge objects (from stepStore)
 * @param {string} machine     - machine preset name
 * @returns {string} Python script
 */
export function graphToScript(graphState, faces, edges, machine = "gantry_5axis_ac") {
  const strategy    = getStrategyParams(graphState);
  const orientRules = getOrientRules(graphState);
  return generatePythonCode(faces, edges, strategy, orientRules, machine);
}
