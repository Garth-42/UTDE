import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import RuntimeStatus from "../../components/RuntimeStatus";
import { useRuntimeStore } from "../../store/runtimeStore";

function setEngines(engines) {
  useRuntimeStore.setState({
    engines: {
      pyodide: { status: "idle", stage: null, error: null },
      occt: { status: "idle", stage: null, error: null },
      ...engines,
    },
  });
}

beforeEach(() => setEngines({}));

describe("RuntimeStatus", () => {
  it("renders nothing when all engines are idle/ready", () => {
    setEngines({ pyodide: { status: "ready", stage: null, error: null } });
    const { container } = render(<RuntimeStatus />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a loading row with a friendly stage label", () => {
    setEngines({ pyodide: { status: "loading", stage: "wheel", error: null } });
    render(<RuntimeStatus />);
    expect(screen.getByText("Toolpath engine")).toBeInTheDocument();
    expect(screen.getByText(/installing engine/i)).toBeInTheDocument();
  });

  it("maps the numpy/scipy stage", () => {
    setEngines({ pyodide: { status: "loading", stage: "packages", error: null } });
    render(<RuntimeStatus />);
    expect(screen.getByText(/numpy . scipy/i)).toBeInTheDocument();
  });

  it("shows an error row for a failed engine", () => {
    setEngines({ occt: { status: "error", stage: null, error: "wasm boom" } });
    render(<RuntimeStatus />);
    expect(screen.getByText("CAD kernel")).toBeInTheDocument();
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it("shows both engines when both are loading", () => {
    setEngines({
      pyodide: { status: "loading", stage: "starting", error: null },
      occt: { status: "loading", stage: "instantiating", error: null },
    });
    render(<RuntimeStatus />);
    expect(screen.getByText("Toolpath engine")).toBeInTheDocument();
    expect(screen.getByText("CAD kernel")).toBeInTheDocument();
  });
});
