const pino = require('pino');
const logger = pino({
  level: 'silent' // atau 'info', 'debug'
});
module.exports = logger;