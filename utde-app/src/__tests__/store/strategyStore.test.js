import { describe, it, expect, beforeEach } from "vitest";
import { useStrategyStore } from "../../store/strategyStore";

beforeEach(() => {
  useStrategyStore.getState().reset();
});

describe("strategy", () => {
  it("has follow_curve as default type", () => {
    expect(useStrategyStore.getState().strategy.type).toBe("follow_curve");
  });

  it("setStrategy patches individual fields", () => {
    useStrategyStore.getState().setStrategy({ feed_rate: 1200 });
    expect(useStrategyStore.getState().strategy.feed_rate).toBe(1200);
    // Other fields unchanged
    expect(useStrategyStore.getState().strategy.type).toBe("follow_curve");
  });

  it("setStrategy switches type", () => {
    useStrategyStore.getState().setStrategy({ type: "raster_fill" });
    expect(useStrategyStore.getState().strategy.type).toBe("raster_fill");
  });

  it("setStrategy merges with existing state", () => {
    useStrategyStore.getState().setStrategy({ spacing: 5.0 });
    useStrategyStore.getState().setStrategy({ feed_rate: 900 });
    const s = useStrategyStore.getState().strategy;
    expect(s.spacing).toBe(5.0);
    expect(s.feed_rate).toBe(900);
  });
});

describe("orientationRules", () => {
  it("starts empty", () => {
    expect(useStrategyStore.getState().orientationRules).toHaveLength(0);
  });

  it("addOrientationRule appends", () => {
    useStrategyStore.getState().addOrientationRule({ rule: "fixed", k: -1 });
    expect(useStrategyStore.getState().orientationRules).toHaveLength(1);
    expect(useStrategyStore.getState().orientationRules[0].rule).toBe("fixed");
  });

  it("removeOrientationRule removes by index", () => {
    useStrategyStore.getState().addOrientationRule({ rule: "fixed" });
    useStrategyStore.getState().addOrientationRule({ rule: "lead", angle_deg: 10 });
    useStrategyStore.getState().removeOrientationRule(0);
    const rules = useStrategyStore.getState().orientationRules;
    expect(rules).toHaveLength(1);
    expect(rules[0].rule).toBe("lead");
  });

  it("moveOrientationRule reorders", () => {
    useStrategyStore.getState().addOrientationRule({ rule: "fixed" });
    useStrategyStore.getState().addOrientationRule({ rule: "lead" });
    useStrategyStore.getState().addOrientationRule({ rule: "avoid_collision" });
    useStrategyStore.getState().moveOrientationRule(0, 2);
    const rules = useStrategyStore.getState().orientationRules;
    expect(rules[0].rule).toBe("lead");
    expect(rules[2].rule).toBe("fixed");
  });

  it("updateOrientationRule patches a rule", () => {
    useStrategyStore.getState().addOrientationRule({ rule: "lead", angle_deg: 5 });
    useStrategyStore.getState().updateOrientationRule(0, { angle_deg: 20 });
    const rules = useStrategyStore.getState().orientationRules;
    expect(rules[0].angle_deg).toBe(20);
    expect(rules[0].rule).toBe("lead");
  });
});

describe("code output state", () => {
  it("setGeneratedCode stores code", () => {
    useStrategyStore.getState().setGeneratedCode("from toolpath_engine import *");
    expect(useStrategyStore.getState().generatedCode).toBe("from toolpath_engine import *");
  });

  it("setGcodeOutput stores gcode", () => {
    useStrategyStore.getState().setGcodeOutput("G0 Z50\nM30");
    expect(useStrategyStore.getState().gcodeOutput).toBe("G0 Z50\nM30");
  });

  it("setGenerating toggles flag", () => {
    useStrategyStore.getState().setGenerating(true);
    expect(useStrategyStore.getState().isGenerating).toBe(true);
    useStrategyStore.getState().setGenerating(false);
    expect(useStrategyStore.getState().isGenerating).toBe(false);
  });
});

describe("reset", () => {
  it("restores all defaults", () => {
    useStrategyStore.getState().setStrategy({ feed_rate: 9999, type: "raster_fill" });
    useStrategyStore.getState().addOrientationRule({ rule: "fixed" });
    useStrategyStore.getState().setGeneratedCode("some code");
    useStrategyStore.getState().reset();

    const s = useStrategyStore.getState();
    expect(s.strategy.feed_rate).toBe(600);
    expect(s.strategy.type).toBe("follow_curve");
    expect(s.orientationRules).toHaveLength(0);
    expect(s.generatedCode).toBe("");
    expect(s.gcodeOutput).toBe("");
  });
});
