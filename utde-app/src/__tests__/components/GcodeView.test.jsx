import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import GcodeView from "../../components/post/GcodeView";

const GCODE = "G1 X0 Y0 Z0\nG1 X10 Y0 Z0\nM30";

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
