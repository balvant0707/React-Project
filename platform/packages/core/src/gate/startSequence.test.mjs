// runStart: preparation first and never fatal, a failed load is reported, a loaded app is handed over once.
import assert from "node:assert/strict";
import { runStart } from "./startSequence.ts";

const run = async (options) => {
  const events = [];
  await runStart({
    prepare: options.prepare && (async () => { events.push("prepare"); await options.prepare(); }),
    loadApp: async () => { events.push("load"); return options.loadApp(); },
    onLoaded: (app) => events.push(`loaded:${app}`),
    onFailed: () => events.push("failed"),
    log: (message) => events.push(`log:${message.split(",")[0]}`),
  });
  return events;
};

assert.deepEqual(await run({ prepare: async () => {}, loadApp: () => "app" }), ["prepare", "load", "loaded:app"], "prepare, then load, then hand over");
assert.deepEqual(await run({ loadApp: () => "app" }), ["load", "loaded:app"], "no preparation: just load");
assert.deepEqual(await run({ prepare: async () => { throw new Error("cache"); }, loadApp: () => "app" }), ["prepare", "log:start-up preparation failed", "load", "loaded:app"], "a failing preparation does not stop the start");
assert.deepEqual(await run({ prepare: async () => {}, loadApp: () => { throw new Error("chunk"); } }), ["prepare", "load", "log:the app could not be loaded", "failed"], "a failing load is reported, nothing is handed over");
console.log("startSequence ok");
