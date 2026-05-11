import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LibraryPanel from "../../components/setup/LibraryPanel";
import { useOpsStore } from "../../store/opsStore";
import { useUiStore } from "../../store/uiStore";

vi.mock("../../lib/templateLoader", () => {
  return {
    useTemplates: () => ({
      templates: [
        {
          id: "pocket", label: "Pocket", kind: "sub", icon: "pocket",
          requires: [{ type: "face", label: "Pocket floor" }],
          params: [], est_time: 4.6, est_volume: 2.2,
        },
        {
          id: "face-mill", label: "Face Mill", kind: "sub", icon: "face-mill",
          requires: [{ type: "face", label: "Top face" }],
          params: [], est_time: 2.4,
        },
        {
          id: "deposit-layer", label: "Deposit Layer", kind: "add", icon: "add-layer",
          requires: [{ type: "face", label: "Build surface" }],
          params: [], est_time: 14.2,
        },
        {
          id: "print-finish", label: "Print + Finish", kind: "hyb", icon: "print-finish",
          requires: [{ type: "face", label: "Surface" }],
          params: [], est_time: 9.6,
        },
        {
          id: "weird-thing", label: "Weird Thing", kind: "coat", icon: "coat",
          requires: [{ type: "face", label: "Surface" }],
          params: [],
        },
      ],
      loading: false,
      error: null,
    }),
    getTemplate: () => null,
  };
});

beforeEach(() => {
  useOpsStore.getState().reset();
  useOpsStore.setState({ entries: [] });
  useUiStore.setState({ tab: "setup", filter: "face", scriptOverlayOpen: false });
  // Suppress kindMeta accent test pop-up — defaults to Other label for free kinds.
});

describe("LibraryPanel", () => {
  it("renders the panel header", () => {
    render(<LibraryPanel />);
    expect(screen.getByText(/Operation Library/i)).toBeInTheDocument();
  });

  it("renders the Scene section with Import CAD and Clear part cards", () => {
    render(<LibraryPanel />);
    expect(screen.getByText("Scene")).toBeInTheDocument();
    expect(screen.getByText("Import CAD")).toBeInTheDocument();
    expect(screen.getByText("Clear part")).toBeInTheDocument();
  });

  it("clicking Import CAD appends a scene row via applyScene", () => {
    render(<LibraryPanel />);
    fireEvent.click(screen.getByText("Import CAD"));
    const entry = useOpsStore.getState().entries.at(-1);
    expect(entry.kind).toBe("scene");
    expect(entry.action).toBe("import");
  });

  it("clicking Clear part appends a clear scene row", () => {
    render(<LibraryPanel />);
    fireEvent.click(screen.getByText("Clear part"));
    const entry = useOpsStore.getState().entries.at(-1);
    expect(entry.action).toBe("clear");
  });

  it("renders cards for each template", () => {
    render(<LibraryPanel />);
    expect(screen.getByText("Pocket")).toBeInTheDocument();
    expect(screen.getByText("Face Mill")).toBeInTheDocument();
    expect(screen.getByText("Deposit Layer")).toBeInTheDocument();
    expect(screen.getByText("Print + Finish")).toBeInTheDocument();
  });

  it("groups templates into sections by kind", () => {
    render(<LibraryPanel />);
    expect(screen.getByText("Additive")).toBeInTheDocument();
    expect(screen.getByText("Subtractive")).toBeInTheDocument();
    expect(screen.getByText("Hybrid")).toBeInTheDocument();
  });

  it("shows a fallback section for unknown kind tags", () => {
    render(<LibraryPanel />);
    // "coat" is a free-form tag → shell capitalises it and uses neutral colours
    expect(screen.getByText("Coat")).toBeInTheDocument();
  });

  it("filters via the search input", () => {
    render(<LibraryPanel />);
    const input = screen.getByPlaceholderText(/Search operations/i);
    fireEvent.change(input, { target: { value: "pocket" } });
    expect(screen.getByText("Pocket")).toBeInTheDocument();
    expect(screen.queryByText("Face Mill")).not.toBeInTheDocument();
    expect(screen.queryByText("Deposit Layer")).not.toBeInTheDocument();
  });

  it("clicking a card calls applyTemplate and adds an op entry", () => {
    render(<LibraryPanel />);
    fireEvent.click(screen.getByText("Pocket"));
    const { entries, activeIdx, rpMode, promptSlot } = useOpsStore.getState();
    expect(entries).toHaveLength(1);
    expect(entries[0].templateId).toBe("pocket");
    expect(activeIdx).toBe(0);
    expect(rpMode).toBe("params");
    expect(promptSlot).toEqual({ entryIdx: 0, slotIdx: 0 });
  });

  it("clicking a card sets the selection filter to the first required type", () => {
    useUiStore.setState({ filter: "edge" });
    render(<LibraryPanel />);
    fireEvent.click(screen.getByText("Pocket"));
    expect(useUiStore.getState().filter).toBe("face");
  });

  it("shows the requires/time meta on cards", () => {
    render(<LibraryPanel />);
    expect(screen.getByText(/requires face · ~4\.6 min/i)).toBeInTheDocument();
    expect(screen.getByText(/requires face · ~14\.2 min/i)).toBeInTheDocument();
  });
});
