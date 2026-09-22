const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const { EventEmitter } = require("events");

const preloadPath = path.join(__dirname, "..", "preload.min.js");
const source = fs.readFileSync(preloadPath, "utf8");

const ipcRenderer = new EventEmitter();
const invokeCalls = [];
ipcRenderer.invoke = (channel, payload) => {
  invokeCalls.push({ channel, payload });
  return Promise.resolve(undefined);
};

let exposed;
const contextBridge = {
  exposeInMainWorld(name, api) {
    if (name === "electron") exposed = api;
  },
};

const document = {
  readyState: "loading",
  getElementById: () => null,
  body: { appendChild() {} },
};
const window = {
  addEventListener() {},
};
const sandbox = {
  require(id) {
    if (id === "electron/main") return { contextBridge, ipcRenderer };
    throw new Error("Unexpected require: " + id);
  },
  console,
  document,
  window,
  setTimeout,
  clearTimeout,
  Promise,
  String,
  Map,
  RegExp,
};
vm.runInNewContext(source, sandbox, { filename: "preload.min.js" });

assert(exposed && typeof exposed.syncProfile === "function", "syncProfile bridge missing");
assert.strictEqual(ipcRenderer.listenerCount("sync-profile-done"), 1, "sync-profile-done must use exactly one shared listener");

const seenA = [];
const seenB = [];
exposed.syncProfile({ profileUniqueName: "alpha.zip" }, (result) => seenA.push(result.profileUniqueName));
exposed.syncProfile({ profileUniqueName: "beta.zip" }, (result) => seenB.push(result.profileUniqueName));

ipcRenderer.emit("sync-profile-done", {}, { error: false, profileUniqueName: "beta.zip" });
assert.deepStrictEqual(seenA, [], "alpha callback fired for beta result");
assert.deepStrictEqual(seenB, ["beta.zip"], "beta callback did not receive beta result");

ipcRenderer.emit("sync-profile-done", {}, { error: false, profileUniqueName: "alpha.zip" });
assert.deepStrictEqual(seenA, ["alpha.zip"], "alpha callback did not receive alpha result");
assert.strictEqual(ipcRenderer.listenerCount("sync-profile-done"), 1, "shared listener count changed after completion");

const beforeDuplicate = invokeCalls.filter((call) => call.channel === "sync-profile").length;
const duplicateA = [];
const duplicateB = [];
exposed.syncProfile({ profileUniqueName: "same-profile.zip" }, (result) => duplicateA.push(result.profileUniqueName));
exposed.syncProfile({ profileUniqueName: "same-profile.zip" }, (result) => duplicateB.push(result.profileUniqueName));
const afterDuplicate = invokeCalls.filter((call) => call.channel === "sync-profile").length;
assert.strictEqual(afterDuplicate - beforeDuplicate, 1, "duplicate in-flight sync started more than one IPC request");

ipcRenderer.emit("sync-profile-done", {}, { error: false, profileUniqueName: "same-profile.zip" });
assert.deepStrictEqual(duplicateA, ["same-profile.zip"], "first duplicate callback missing");
assert.deepStrictEqual(duplicateB, ["same-profile.zip"], "second duplicate callback missing");

for (let i = 0; i < 100; i += 1) {
  let calls = 0;
  const name = `repeat-${i}.zip`;
  exposed.syncProfile({ profileUniqueName: name }, (result) => {
    assert.strictEqual(result.profileUniqueName, name, "repeated sync received wrong profile result");
    calls += 1;
  });
  ipcRenderer.emit("sync-profile-done", {}, { error: false, profileUniqueName: name });
  assert.strictEqual(calls, 1, `repeated sync callback count mismatch at iteration ${i}`);
  assert.strictEqual(ipcRenderer.listenerCount("sync-profile-done"), 1, `listener leaked at iteration ${i}`);
}

console.log("KAIZEN sync profile preload scenarios: PASS");
console.log(" - one shared sync-profile-done listener: PASS");
console.log(" - out-of-order profile responses isolated: PASS");
console.log(" - duplicate in-flight profile requests coalesced: PASS");
console.log(" - 100 repeated sync operations without listener growth: PASS");
