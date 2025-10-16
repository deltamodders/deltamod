// collecton of utility functions

const crypto = require('crypto');
const fs = require('fs');

var win = null;

function timeoutPromise(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getFileVersion(filePath) {
  var basecmd = `powershell -command "(Get-Item '${filePath}').VersionInfo.FileVersion"`;
  var execSync = require('child_process').execSync;
  var c = execSync(basecmd).toString().trim();
  console.log(`File version of ${filePath} is ${c}`);
  return c;
}

function randomString(length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function lastOfArray(arr) {
  return arr.length > 0 ? arr[arr.length - 1] : null;
}

function hashFile(filePath) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

function getWindow() {
  return win;
}

function validateVersioning(version) {
  return version;
}

function setWindow(newwin) {
  win = newwin;
}

function page(newPage) {
  win.webContents.send("page", [newPage]);
}

let sharedVariables = {}; // shared vars with renderer
function setSharedVar(name, value) {
    sharedVariables[name] = value;
    return true;
}

function getSharedVar(name) {
    return sharedVariables[name];
}

function properRelaunch() {
  const a = process.argv.slice(1);
  return { args: a.filter(x => !x.toLowerCase().startsWith("deltamod://")) }
}

function logOnAccess(obj, logMsg) {
  console.log(logMsg);
  return obj;
}

function between(string, start, end) {
  return string.split(start)[1].split(end)[0];
}

module.exports = {timeoutPromise, between, logOnAccess, getFileVersion, randomString, hashFile, lastOfArray, getWindow, setWindow, page, validateVersioning, setSharedVar, getSharedVar, properRelaunch};