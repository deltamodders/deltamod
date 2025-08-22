const crypto = require('crypto');
const fs = require('fs');

var win = null;

function timeoutPromise(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function setWindow(newwin) {
  win = newwin;
}

function page(newPage) {
  win.webContents.send("page", [newPage]);
}

module.exports = {timeoutPromise, randomString, hashFile, lastOfArray, getWindow, setWindow, page};