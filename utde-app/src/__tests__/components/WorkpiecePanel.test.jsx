import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WorkpiecePanel from "../../components/setup/WorkpiecePanel";
import { useStepStore } from "../../store/stepStore";
import { IDENTITY_TRANSFORM, isIdentity } from "../../lib/geomTransform";

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
  });
});

describe("WorkpiecePanel", () => {
  it("renders nothing without geometry", () => {
    const { container } = render(<WorkpiecePanel />);
    expect(container.firstChild).toBeNull();
  });

  it("disables Align until exactly one planar face is selected", () => {
    useStepStore.setState({ faces: [planeFace(0)], selectedFaceIds: new Set() });
    render(<WorkpiecePanel />);
    expect(screen.getByRole("button", { name: /Align face/i })).toBeDisabled();
    expect(screen.getByText(/Select one planar face/i)).toBeInTheDocument();
  });

  it("aligns the selected planar face to the bed", () => {
    useStepStore.setState({ faces: [planeFace(0)], selectedFaceIds: new Set([0]) });
    render(<WorkpiecePanel />);
    const btn = screen.getByRole("button", { name: /Align face/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(isIdentity(useStepStore.getState().transform)).toBe(false);
  });

  it("numeric Move X updates the translation", () => {
    useStepStore.setState({ faces: [planeFace(0)] });
    render(<WorkpiecePanel />);
    fireEvent.change(screen.getByLabelText("Move X"), { target: { value: "12" } });
    expect(useStepStore.getState().transform.translation[0]).toBe(12);
  });

  it("Move/Rotate toggle drives the gizmo mode", () => {
    useStepStore.setState({ faces: [planeFace(0)] });
    render(<WorkpiecePanel />);
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(useStepStore.getState().gizmoMode).toBe("translate");
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    expect(useStepStore.getState().gizmoMode).toBe("rotate");
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    expect(useStepStore.getState().gizmoMode).toBe("off");
  });

  it("Reset restores identity", () => {
    useStepStore.setState({
      faces: [planeFace(0)],
      transform: { translation: [5, 5, 5], quaternion: [0, 0, 0, 1] },
    });
    render(<WorkpiecePanel />);
    fireEvent.click(screen.getByRole("button", { name: /Reset/i }));
    expect(isIdentity(useStepStore.getState().transform)).toBe(true);
  });

  it("collapses its section header to hide the controls", () => {
    useStepStore.setState({ faces: [planeFace(0)], selectedFaceIds: new Set([0]) });
    const { container } = render(<WorkpiecePanel />);
    expect(screen.getByRole("button", { name: /Align face/i })).toBeInTheDocument();
    fireEvent.click(container.querySelector("[aria-expanded]")); // section header
    expect(screen.queryByRole("button", { name: /Align face/i })).toBeNull();
  });

  it("remembers its collapsed state across remounts", () => {
    useStepStore.setState({ faces: [planeFace(0)], selectedFaceIds: new Set([0]) });
    const first = render(<WorkpiecePanel />);
    fireEvent.click(first.container.querySelector("[aria-expanded]"));
    expect(localStorage.getItem("utde-section-workpiece")).toBe("1");
    first.unmount();
    render(<WorkpiecePanel />);
    expect(screen.queryByRole("button", { name: /Align face/i })).toBeNull(); // still collapsed
  });
});
