import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import GcodeView from "../../components/post/GcodeView";

const GCODE = "G1 X0 Y0 Z0\nG1 X10 Y0 Z0\nM30"; // 3 lines (0,1,2)

describe("GcodeView line selection", () => {
  it("renders one selectable row per line", () => {
    const { container } = render(<GcodeView gcode={GCODE} />);
    expect(container.querySelectorAll("[aria-selected]")).toHaveLength(3);
  });

  it("calls onSelectLine with the clicked line index", () => {
    const onSelectLine = vi.fn();
    const { container } = render(
      <GcodeView gcode={GCODE} onSelectLine={onSelectLine} />
    );
    const rows = container.querySelectorAll("[aria-selected]");
    fireEvent.click(rows[1]);
    expect(onSelectLine).toHaveBeenCalledWith(1);
  });

  it("marks the selected row", () => {
    const { container } = render(<GcodeView gcode={GCODE} selectedLine={2} />);
    const selected = container.querySelectorAll('[aria-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(container.querySelectorAll('[aria-selected="false"]')).toHaveLength(2);
  });

  it("does not throw when onSelectLine is omitted", () => {
    const { container } = render(<GcodeView gcode={GCODE} />);
    const rows = container.querySelectorAll("[aria-selected]");
    expect(() => fireEvent.click(rows[0])).not.toThrow();
  });

  it("ArrowDown selects the next line", () => {
    const onSelectLine = vi.fn();
    render(<GcodeView gcode={GCODE} selectedLine={0} onSelectLine={onSelectLine} />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(onSelectLine).toHaveBeenCalledWith(1);
  });

  it("ArrowUp selects the previous line", () => {
    const onSelectLine = vi.fn();
    render(<GcodeView gcode={GCODE} selectedLine={2} onSelectLine={onSelectLine} />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowUp" });
    expect(onSelectLine).toHaveBeenCalledWith(1);
  });

  it("ArrowDown from no selection starts at the first line", () => {
    const onSelectLine = vi.fn();
    render(<GcodeView gcode={GCODE} selectedLine={null} onSelectLine={onSelectLine} />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(onSelectLine).toHaveBeenCalledWith(0);
  });

  it("does not move past the last line (no accidental toggle-off)", () => {
    const onSelectLine = vi.fn();
    render(<GcodeView gcode={GCODE} selectedLine={2} onSelectLine={onSelectLine} />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(onSelectLine).not.toHaveBeenCalled();
  });

  it("Home/End jump to the first/last line", () => {
    const onSelectLine = vi.fn();
    render(<GcodeView gcode={GCODE} selectedLine={1} onSelectLine={onSelectLine} />);
    const pane = screen.getByRole("listbox");
    fireEvent.keyDown(pane, { key: "Home" });
    expect(onSelectLine).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(pane, { key: "End" });
    expect(onSelectLine).toHaveBeenLastCalledWith(2);
  });

  it("scrolls the selected line into view (reverse sync)", () => {
    const spy = vi.fn();
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy;
    try {
      render(<GcodeView gcode={GCODE} selectedLine={1} />);
      expect(spy).toHaveBeenCalledWith({ block: "nearest" });
    } finally {
      Element.prototype.scrollIntoView = orig;
    }
  });
});
