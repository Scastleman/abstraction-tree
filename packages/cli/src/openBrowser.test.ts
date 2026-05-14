import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { browserOpenCommand, openBrowser } from "./openBrowser.js";

test("browserOpenCommand chooses the platform browser command", () => {
  assert.deepEqual(browserOpenCommand("http://127.0.0.1:4317", "win32"), {
    command: "cmd",
    args: ["/c", "start", "", "http://127.0.0.1:4317"]
  });
  assert.deepEqual(browserOpenCommand("http://127.0.0.1:4317", "darwin"), {
    command: "open",
    args: ["http://127.0.0.1:4317"]
  });
  assert.deepEqual(browserOpenCommand("http://127.0.0.1:4317", "linux"), {
    command: "xdg-open",
    args: ["http://127.0.0.1:4317"]
  });
});

test("openBrowser resolves success without waiting for the browser process", async () => {
  const child = new MockChild();
  const resultPromise = openBrowser("http://127.0.0.1:4317", {
    platform: "linux",
    spawn: () => child
  });

  child.emit("spawn");

  assert.deepEqual(await resultPromise, {
    ok: true,
    command: { command: "xdg-open", args: ["http://127.0.0.1:4317"] }
  });
  assert.equal(child.unrefCalled, true);
});

test("openBrowser failure is reported as non-fatal result data", async () => {
  const child = new MockChild();
  const resultPromise = openBrowser("http://127.0.0.1:4317", {
    platform: "darwin",
    spawn: () => child
  });

  const error = new Error("no browser available");
  child.emit("error", error);
  const result = await resultPromise;

  assert.equal(result.ok, false);
  assert.equal(result.command.command, "open");
  assert.equal(result.error, error);
});

class MockChild extends EventEmitter {
  unrefCalled = false;

  unref() {
    this.unrefCalled = true;
  }
}
