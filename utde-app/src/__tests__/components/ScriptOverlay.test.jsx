import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ScriptOverlay from "../../components/ScriptOverlay";
import { useOpsStore } from "../../store/opsStore";
import { useUiStore } from "../../store/uiStore";

beforeEach(() => {
  useOpsStore.getState().reset();
  useOpsStore.setState({ entries: [] });
  useUiStore.setState({
    tab: "setup", filter: "face",
    scriptOverlayOpen: false,
  });
});

describe("ScriptOverlay", () => {
  it("renders nothing when scriptOverlayOpen is false", () => {
    const { container } = render(<ScriptOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the drawer when open", () => {
    useUiStore.setState({ scriptOverlayOpen: true });
    render(<ScriptOverlay />);
    expect(screen.getByRole("dialog", { name: /Generated Python/i })).toBeInTheDocument();
    expect(screen.getByText(/Read-only · derived from the timeline/i)).toBeInTheDocument();
  });

  it("renders the generated Python for the current timeline", () => {
    useOpsStore.getState().applyTemplate({
      id: "pocket", label: "Pocket", kind: "sub",
      requires: [{ type: "face", label: "Pocket floor" }],
      params: [{ id: "depth", type: "number", default: 8.0 }],
    });
    useUiStore.setState({ scriptOverlayOpen: true });
    render(<ScriptOverlay />);
    const script = screen.getByRole("dialog").textContent;
    expect(script).toContain("from toolpath_engine import");
    expect(script).toContain('get_process("pocket")');
    expect(script).toContain('# --- Op 01: Pocket ---');
  });

  it("Close button toggles the drawer off", () => {
    useUiStore.setState({ scriptOverlayOpen: true });
    render(<ScriptOverlay />);
    fireEvent.click(screen.getByTitle("Close"));
    expect(useUiStore.getState().scriptOverlayOpen).toBe(false);
  });

  it("clicking the backdrop closes the drawer", () => {
    useUiStore.setState({ scriptOverlayOpen: true });
    const { container } = render(<ScriptOverlay />);
    fireEvent.click(container.firstChild);
    expect(useUiStore.getState().scriptOverlayOpen).toBe(false);
  });

  it("Copy button writes the script to the clipboard", async () => {
    useUiStore.setState({ scriptOverlayOpen: true });
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ScriptOverlay />);
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/i }));
    expect(writeText).toHaveBeenCalled();
  });
});
