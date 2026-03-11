const Sentry = require("@sentry/node");
const console = require('./Console.js');
Sentry.init({
  dsn: "https://9a431a7b0594d5745a7148c4bba1216a@o4511026290098176.ingest.de.sentry.io/4511026291736656",
  sendDefaultPii: true,
});

console.log('Sentry initialized');

function error(error) {
  console.log('Sending exception to Sentry:', error);
  Sentry.captureException(error);
}

module.exports = { error };