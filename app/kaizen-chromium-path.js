"use strict";
// Single source of truth for the official, unbranded Chromium bundled with
// KAIZEN. The executable lives beside the installed KAIZEN.exe, not under
// Electron's resources/ directory and never inside an old Chrome for Testing
// directory. Keep the three profile data roots separate from this binary.
const path=require("node:path");

function bundledChromiumExecutable(isPackaged, executablePath=process.execPath, sourceDir=__dirname){
  const installRoot=isPackaged?path.dirname(executablePath):path.resolve(sourceDir,"..");
  return path.join(installRoot,"KAIZEN_CHROMIUM","chrome-win","chrome.exe");
}

module.exports={bundledChromiumExecutable};
