import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MeasurePanel from "../../components/setup/MeasurePanel";
import { useStepStore } from "../../store/stepStore";

beforeEach(() => {
  localStorage.clear();
  useStepStore.setState({
    faces: [], edges: [], measuring: false, measurement: null, workspaceOrigin: null,
  });
});

describe("MeasurePanel", () => {
  it("renders nothing without geometry", () => {
    const { container } = render(<MeasurePanel />);
    expect(container.firstChild).toBeNull();
  });

  it("toggles measuring on/off", () => {
    useStepStore.setState({ edges: [{ id: 0, type: "line", vertices: [] }] });
    render(<MeasurePanel />);
    fireEvent.click(screen.getByRole("button", { name: /Measure location/i }));
    expect(useStepStore.getState().measuring).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Measuring/i }));
    expect(useStepStore.getState().measuring).toBe(false);
  });

  it("shows the picked world coordinate and edge summary", () => {
    useStepStore.setState({
      edges: [{ id: 0, type: "line", vertices: [] }],
      measurement: {
        point: [10, 0, -2.5], kind: "edge", id: 0,
        summary: { type: "line", start: [0, 0, 0], end: [20, 0, 0], length: 20 },
      },
    });
    render(<MeasurePanel />);
    expect(screen.getByText("World")).toBeInTheDocument();
    expect(screen.getByText("10.00, 0.00, -2.50")).toBeInTheDocument();
    expect(screen.getByText("Length")).toBeInTheDocument();
    expect(screen.getByText("20.00")).toBeInTheDocument();
  });

  it("shows WCS-relative coordinates when an origin is set", () => {
    useStepStore.setState({
      edges: [{ id: 0, type: "line", vertices: [] }],
      workspaceOrigin: { x: 10, y: 0, z: 0 },
      measurement: { point: [12, 3, 0], kind: "edge", id: 0, summary: { type: "line" } },
    });
    render(<MeasurePanel />);
    expect(screen.getByText("WCS")).toBeInTheDocument();
    expect(screen.getByText("2.00, 3.00, 0.00")).toBeInTheDocument();
  });

  it("clears the measurement", () => {
    useStepStore.setState({
      edges: [{ id: 0, type: "line", vertices: [] }],
      measurement: { point: [1, 2, 3], kind: "edge", id: 0, summary: { type: "line" } },
    });
    render(<MeasurePanel />);
    fireEvent.click(screen.getByRole("button", { name: /Clear/i }));
    expect(useStepStore.getState().measurement).toBeNull();
  });

  it("collapses its section header to hide the controls", () => {
    useStepStore.setState({ edges: [{ id: 0, type: "line", vertices: [] }] });
    const { container } = render(<MeasurePanel />);
    expect(screen.getByRole("button", { name: /Measure location/i })).toBeInTheDocument();
    fireEvent.click(container.querySelector("[aria-expanded]")); // section header
    expect(screen.queryByRole("button", { name: /Measure location/i })).toBeNull();
  });
});
