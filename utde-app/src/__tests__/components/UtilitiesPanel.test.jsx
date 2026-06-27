import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import UtilitiesPanel from "../../components/setup/UtilitiesPanel";
import { useStepStore } from "../../store/stepStore";
import { IDENTITY_TRANSFORM } from "../../lib/geomTransform";

const planeFace = (id) => ({
  id, type: "plane",
  params: { normal: [0, 0, 1], origin: [0, 0, 5] },
  centroid: [0, 0, 5], vertices: [1, 0, 5, -1, 0, 5, 0, 1, 5], indices: [0, 1, 2],
});

beforeEach(() => {
  localStorage.clear();
  useStepStore.setState({
    faces: [], edges: [], selectedFaceIds: new Set(),
    transform: IDENTITY_TRANSFORM, gizmoMode: "off",
    measuring: false, measurement: null, workspaceOrigin: null,
  });
});

describe("UtilitiesPanel", () => {
  it("renders nothing without geometry", () => {
    const { container } = render(<UtilitiesPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("groups the Workpiece and Measure tools under one header", () => {
    useStepStore.setState({ faces: [planeFace(0)], edges: [{ id: 9, type: "line", vertices: [] }] });
    render(<UtilitiesPanel />);
    expect(screen.getByRole("button", { name: /Utilities/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Align face/i })).toBeInTheDocument();      // Workpiece
    expect(screen.getByRole("button", { name: /Measure location/i })).toBeInTheDocument(); // Measure
  });

  it("minimizes to hide both tools (and persists the choice)", () => {
    useStepStore.setState({ faces: [planeFace(0)] });
    const { unmount } = render(<UtilitiesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Utilities/i }));
    expect(screen.queryByRole("button", { name: /Align face/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Measure location/i })).toBeNull();
    expect(localStorage.getItem("utde-utilities-min")).toBe("1");

    // Re-mount: minimized preference is restored.
    unmount();
    render(<UtilitiesPanel />);
    expect(screen.queryByRole("button", { name: /Align face/i })).toBeNull();
  });
});
