const crypto = require('crypto');

function timeoutPromise(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function randomString(length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

module.exports = {timeoutPromise, randomString};