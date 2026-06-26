import { describe, it, expect, beforeEach } from "vitest";
import { useStepStore } from "../../store/stepStore";

beforeEach(() => {
  useStepStore.setState({ faces: [], edges: [], measuring: false, measurement: null });
});

describe("stepStore measure tool", () => {
  it("startMeasure / stopMeasure toggle the mode", () => {
    useStepStore.getState().startMeasure();
    expect(useStepStore.getState().measuring).toBe(true);
    useStepStore.getState().stopMeasure();
    expect(useStepStore.getState().measuring).toBe(false);
  });

  it("setMeasurement records the point + meta", () => {
    useStepStore.getState().setMeasurement([1, 2, 3], { kind: "edge", id: 7, summary: { type: "line" } });
    const m = useStepStore.getState().measurement;
    expect(m.point).toEqual([1, 2, 3]);
    expect(m.kind).toBe("edge");
    expect(m.id).toBe(7);
    expect(m.summary.type).toBe("line");
  });

  it("clearMeasurement removes the result", () => {
    useStepStore.getState().setMeasurement([1, 2, 3]);
    useStepStore.getState().clearMeasurement();
    expect(useStepStore.getState().measurement).toBeNull();
  });

  it("importing geometry resets measuring + measurement", () => {
    useStepStore.setState({ measuring: true, measurement: { point: [1, 2, 3] } });
    useStepStore.getState().setGeometry([], [], "p.step");
    expect(useStepStore.getState().measuring).toBe(false);
    expect(useStepStore.getState().measurement).toBeNull();
  });
});
