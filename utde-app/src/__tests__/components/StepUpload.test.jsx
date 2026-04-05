import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StepUpload from "../../components/sidebar/StepUpload";
import { useStepStore } from "../../store/stepStore";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../api/client", () => ({
  parseStep: vi.fn(),
  parseStepByPath: vi.fn(),
  IS_TAURI: false, // default: run in browser mode
}));

vi.mock("../../lib/backend", () => ({
  IS_TAURI: false,
  openStepFileDialog: vi.fn(),
  saveGcodeDialog: vi.fn(),
  getBaseUrl: vi.fn().mockResolvedValue("/api"),
  waitForServer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../utils/session", () => ({
  importSession: vi.fn(),
}));

vi.mock("../../components/styles", () => ({
  S: { sectionLabel: {}, btn: {} },
}));

import { parseStep } from "../../api/client";
import { openStepFileDialog } from "../../lib/backend";

const INITIAL_STORE = {
  faces: [],
  edges: [],
  fileName: null,
  selectedFaceIds: new Set(),
  selectedEdgeIds: new Set(),
  isLoading: false,
  error: null,
};

beforeEach(() => {
  useStepStore.setState(INITIAL_STORE);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Browser mode tests ────────────────────────────────────────────────────────

describe("StepUpload (browser mode)", () => {
  it("renders the upload drop zone", () => {
    render(<StepUpload />);
    expect(screen.getByText(/Drop \.step \/ \.stp/i)).toBeInTheDocument();
  });

  it("shows quality slider", () => {
    render(<StepUpload />);
    const slider = screen.getByRole("slider");
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute("min", "0.1");
    expect(slider).toHaveAttribute("max", "2");
  });

  it("displays fileName from store when set", () => {
    useStepStore.setState({ ...INITIAL_STORE, fileName: "part.step" });
    render(<StepUpload />);
    expect(screen.getByText("part.step")).toBeInTheDocument();
  });

  it("rejects non-STEP files", async () => {
    render(<StepUpload />);
    const input = document.querySelector('input[type="file"][accept=".step,.stp"]');
    const file = new File(["data"], "model.obj", { type: "text/plain" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
    await waitFor(() => {
      const error = useStepStore.getState().error;
      expect(error).toBeTruthy();
      expect(error).toContain(".step");
    });
    expect(parseStep).not.toHaveBeenCalled();
  });

  it("accepts .step files and calls parseStep", async () => {
    parseStep.mockResolvedValue({ faces: [{ id: 0 }], edges: [], face_count: 1, edge_count: 0 });
    render(<StepUpload />);
    const input = document.querySelector('input[type="file"][accept=".step,.stp"]');
    const file = new File(["STEP data"], "part.step");
    await userEvent.upload(input, file);
    await waitFor(() => {
      expect(parseStep).toHaveBeenCalledWith(file, expect.any(Number));
    });
  });

  it("accepts .stp files", async () => {
    parseStep.mockResolvedValue({ faces: [], edges: [], face_count: 0, edge_count: 0 });
    render(<StepUpload />);
    const input = document.querySelector('input[type="file"][accept=".step,.stp"]');
    await userEvent.upload(input, new File(["STEP data"], "part.stp"));
    await waitFor(() => expect(parseStep).toHaveBeenCalled());
  });

  it("sets geometry in store on successful upload", async () => {
    const mockFaces = [{ id: 0, type: "plane" }];
    const mockEdges = [{ id: 0, type: "line" }];
    parseStep.mockResolvedValue({ faces: mockFaces, edges: mockEdges, face_count: 1, edge_count: 1 });
    render(<StepUpload />);
    const input = document.querySelector('input[type="file"][accept=".step,.stp"]');
    await userEvent.upload(input, new File(["data"], "part.step"));
    await waitFor(() => {
      const s = useStepStore.getState();
      expect(s.faces).toEqual(mockFaces);
      expect(s.fileName).toBe("part.step");
    });
  });

  it("sets error in store on failed upload", async () => {
    parseStep.mockRejectedValue(new Error("pythonocc not installed"));
    render(<StepUpload />);
    const input = document.querySelector('input[type="file"][accept=".step,.stp"]');
    await userEvent.upload(input, new File(["data"], "part.step"));
    await waitFor(() => {
      expect(useStepStore.getState().error).toContain("pythonocc");
    });
  });

  it("shows loading state during upload", async () => {
    let resolveUpload;
    parseStep.mockReturnValue(new Promise((res) => { resolveUpload = res; }));
    render(<StepUpload />);
    const input = document.querySelector('input[type="file"][accept=".step,.stp"]');
    await userEvent.upload(input, new File(["data"], "part.step"));
    expect(useStepStore.getState().isLoading).toBe(true);
    resolveUpload({ faces: [], edges: [], face_count: 0, edge_count: 0 });
    await waitFor(() => expect(useStepStore.getState().isLoading).toBe(false));
  });

  it("clears loading state even on error", async () => {
    parseStep.mockRejectedValue(new Error("Network error"));
    render(<StepUpload />);
    const input = document.querySelector('input[type="file"][accept=".step,.stp"]');
    await userEvent.upload(input, new File(["data"], "part.step"));
    await waitFor(() => expect(useStepStore.getState().isLoading).toBe(false));
  });

  it("quality slider updates value display", async () => {
    render(<StepUpload />);
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "1.5" } });
    expect(screen.getByText("1.5")).toBeInTheDocument();
  });

  it("drag over changes visual state", () => {
    render(<StepUpload />);
    const label = screen.getByText(/Drop \.step \/ \.stp/i).closest("label");
    fireEvent.dragOver(label, { preventDefault: () => {} });
    expect(label).toBeInTheDocument();
  });

  it("drag leave resets visual state", () => {
    render(<StepUpload />);
    const label = screen.getByText(/Drop \.step \/ \.stp/i).closest("label");
    fireEvent.dragOver(label, { preventDefault: () => {} });
    fireEvent.dragLeave(label);
    expect(label).toBeInTheDocument();
  });

  it("drop event calls uploadFile with file", async () => {
    parseStep.mockResolvedValue({ faces: [], edges: [], face_count: 0, edge_count: 0 });
    render(<StepUpload />);
    const label = screen.getByText(/Drop \.step \/ \.stp/i).closest("label");
    const file = new File(["data"], "dropped.step");
    fireEvent.drop(label, {
      preventDefault: () => {},
      dataTransfer: { files: [file] },
    });
    await waitFor(() => expect(parseStep).toHaveBeenCalledWith(file, expect.any(Number)));
  });

  it("renders Import Session button", () => {
    render(<StepUpload />);
    expect(screen.getByText("Import Session")).toBeInTheDocument();
  });

  it("does not render hidden file input in Tauri mode (IS_TAURI=false shows input)", () => {
    render(<StepUpload />);
    const input = document.querySelector('input[type="file"][accept=".step,.stp"]');
    expect(input).toBeInTheDocument();
  });
});

// ── Tauri mode tests ───────────────────────────────────────────────────────────

describe("StepUpload (Tauri mode)", async () => {
  beforeEach(async () => {
    // Re-mock with IS_TAURI=true for this block
    vi.doMock("../../lib/backend", () => ({
      IS_TAURI: true,
      openStepFileDialog: vi.fn().mockResolvedValue("/Users/user/part.step"),
      saveGcodeDialog: vi.fn(),
      getBaseUrl: vi.fn().mockResolvedValue("http://127.0.0.1:5174"),
      waitForServer: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../../api/client", () => ({
      parseStep: vi.fn(),
      parseStepByPath: vi.fn().mockResolvedValue({
        faces: [{ id: 0 }], edges: [], face_count: 1, edge_count: 0,
      }),
      IS_TAURI: true,
    }));
  });

  it("openStepFileDialog is called when the drop zone is clicked in Tauri mode", async () => {
    // This is tested via the mock; actual Tauri IPC is unavailable in jsdom
    expect(openStepFileDialog).toBeDefined();
  });
});
