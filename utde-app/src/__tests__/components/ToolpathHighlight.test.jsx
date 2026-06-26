import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import ToolpathHighlight from "../../components/viewport/ToolpathHighlight";
import { useToolpathStore } from "../../store/toolpathStore";
import { useUiStore } from "../../store/uiStore";

// Only the "renders nothing" paths are exercised here — the actual marker is an
// R3F element that needs a <Canvas>, but the gating logic (return null) runs
// before any R3F and is what we care about.

beforeEach(() => {
  useToolpathStore.setState({
    toolpaths: [{ id: 1, points: [{ x: 0, y: 0, z: 0 }] }],
    gcode: "G1 X0 Y0 Z0",
    opRanges: [{ gcode_start_line: 0, gcode_end_line: 1, point_start: 0, point_end: 1 }],
    selectedLine: 0,
  });
  useUiStore.setState({ tab: "post" });
});

describe("ToolpathHighlight gating", () => {
  it("renders nothing when not on the Post tab (marker is Post-only)", () => {
    useUiStore.setState({ tab: "simulate" });
    const { container } = render(<ToolpathHighlight />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing on the Setup tab", () => {
    useUiStore.setState({ tab: "setup" });
    const { container } = render(<ToolpathHighlight />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when no line is selected", () => {
    useToolpathStore.setState({ selectedLine: null });
    const { container } = render(<ToolpathHighlight />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the selected line maps to no point", () => {
    // No op_ranges → buildLineToPointMap yields -1 for every line.
    useToolpathStore.setState({ opRanges: [], selectedLine: 0 });
    const { container } = render(<ToolpathHighlight />);
    expect(container.firstChild).toBeNull();
  });
});
