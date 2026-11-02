"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../../runtime-resources/KAIZEN_EXTENSIONS/KAIZEN_EXTENSIONS");
for(const [dir,name,version] of [
["KAIZZEN_MAIN","KAIZZEN-MAIN","2.5.10"],
["KAIZZEN_GOOGLE","KAIZZEN-GOOGLE","1.0.7"],
["KAIZZEN_CUSTOM","KAIZZEN-CUSTOM","1.0.10"]
]){
  const base=path.join(root,dir);
  const manifest=JSON.parse(fs.readFileSync(path.join(base,"manifest.json"),"utf8"));
  assert.equal(manifest.name,name);
  assert.equal(manifest.version,version);
  assert.equal(manifest.options_page,"owner-guide.html");
  const html=fs.readFileSync(path.join(base,"index.html"),"utf8");
  const panel=fs.readFileSync(path.join(base,"owner-guide-panel.js"),"utf8");
  const guide=fs.readFileSync(path.join(base,"owner-guide.html"),"utf8");
  const script=fs.readFileSync(path.join(base,"owner-guide.js"),"utf8");
  new Function(panel);
  new Function(script);
  assert(html.includes("owner-guide-panel.js"),dir+" missing UI button script");
  assert(panel.includes("chrome.runtime.openOptionsPage()"));
  assert(guide.includes("chrome://password-manager/passwords"));
  assert(guide.includes("servidor KAIZZEN"));
  assert(script.includes("chrome.tabs.create"));
  assert(!/chrome[.]storage[.]local[.](get|set)|cookies[.]set|set_proxy/.test(panel+script));
  for(const filename of ["backgroundScript.js","contentScript.js","storageInjector.js","idbUtil.js"]){
    assert(fs.statSync(path.join(base,filename)).size>100);
  }
}
console.log("KAIZEN 1.5.27: tres perfiles, guía local y scripts de Chromium PASS");
