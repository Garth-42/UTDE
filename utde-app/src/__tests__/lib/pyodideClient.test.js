import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPyodideClient } from "../../lib/pyodide/client";

const tick = () => new Promise((r) => setTimeout(r, 0));

function makeFakeWorker() {
  return {
    posted: [],
    onmessage: null,
    onerror: null,
    terminated: false,
    postMessage(msg) {
      this.posted.push(msg);
    },
    terminate() {
      this.terminated = true;
    },
    reply(msg) {
      this.onmessage({ data: msg });
    },
  };
}

function newClient() {
  const worker = makeFakeWorker();
  const client = createPyodideClient({ createWorker: () => worker });
  return { worker, client };
}

async function initClient(worker, client) {
  const p = client.initPyodide();
  await tick();
  const initMsg = worker.posted.find((m) => m.op === "__init__");
  worker.reply({ id: initMsg.id, ok: true, result: { ready: true } });
  await p;
}

describe("createPyodideClient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends __init__ and resolves when the worker reports ready", async () => {
    const { worker, client } = newClient();
    const p = client.initPyodide({ wheelUrl: "w.whl" });
    await tick();
    const initMsg = worker.posted[0];
    expect(initMsg.op).toBe("__init__");
    expect(initMsg.args.wheelUrl).toBe("w.whl");
    worker.reply({ id: initMsg.id, ok: true, result: { ready: true } });
    await expect(p).resolves.toBeDefined();
    expect(client.isReady()).toBe(true);
  });

  it("callPython resolves with the op result", async () => {
    const { worker, client } = newClient();
    await initClient(worker, client);
    const call = client.callPython("lint_script", { code: "x=1" });
    await tick();
    const msg = worker.posted.find((m) => m.op === "lint_script");
    expect(msg.args).toEqual({ code: "x=1" });
    worker.reply({ id: msg.id, ok: true, result: { errors: [] } });
    await expect(call).resolves.toEqual({ errors: [] });
  });

  it("callPython rejects with the Python error message", async () => {
    const { worker, client } = newClient();
    await initClient(worker, client);
    const call = client.callPython("generate_toolpath", { payload: {} });
    await tick();
    const msg = worker.posted.find((m) => m.op === "generate_toolpath");
    worker.reply({ id: msg.id, ok: false, error: "Could not generate toolpath — boom" });
    await expect(call).rejects.toThrow(/Could not generate toolpath/);
  });

  it("correlates concurrent calls by id (out-of-order replies)", async () => {
    const { worker, client } = newClient();
    await initClient(worker, client);
    const a = client.callPython("lint_script", { code: "a" });
    const b = client.callPython("lint_script", { code: "b" });
    await tick();
    const msgs = worker.posted.filter((m) => m.op === "lint_script");
    expect(msgs).toHaveLength(2);
    // reply to the second first
    worker.reply({ id: msgs[1].id, ok: true, result: { which: "b" } });
    worker.reply({ id: msgs[0].id, ok: true, result: { which: "a" } });
    expect(await a).toEqual({ which: "a" });
    expect(await b).toEqual({ which: "b" });
  });

  it("auto-initializes on first callPython", async () => {
    const { worker, client } = newClient();
    const call = client.callPython("list_templates", {});
    await tick();
    // First message is the auto __init__
    expect(worker.posted[0].op).toBe("__init__");
    worker.reply({ id: worker.posted[0].id, ok: true, result: { ready: true } });
    await tick();
    const opMsg = worker.posted.find((m) => m.op === "list_templates");
    worker.reply({ id: opMsg.id, ok: true, result: { templates: [] } });
    await expect(call).resolves.toEqual({ templates: [] });
  });

  it("worker error rejects in-flight calls", async () => {
    const { worker, client } = newClient();
    await initClient(worker, client);
    const call = client.callPython("lint_script", { code: "x" });
    await tick();
    worker.onerror({ message: "worker exploded" });
    await expect(call).rejects.toThrow(/worker exploded/);
  });
});
