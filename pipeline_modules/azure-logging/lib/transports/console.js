// Console log transport.
var format = require('./../format');
var colors = require('colors');
var verbosity = require('./constants').VERBOSITY;

colors.setTheme({
  silly  : 'rainbow',
  verbose: 'grey',
  debug  : 'grey',
  trace  : 'grey',
  log    : 'grey',
  info   : 'white',
  warn   : 'yellow',
  error  : 'red'
});

exports.create = function(options, callback) {

  var hiddenColumns = ['domain', 'instance', 'timestamp'];

  // Console transport supports only message logging.
  var transport = { name: 'console', log: log };

  return callback(null, transport);

  function log(level, msg, meta, callback) {
    callback = callback || function () {}
    // construct output line
    var item = { level: level, message: msg, meta: meta };
    var output = colors[level](format('text', item, hiddenColumns));

    // write to stdout/stderr
    if (level === 'error' || level === 'debug' || level === 'warn') {
      process.stderr.write(output);
    }
    else if (!options.level || verbosity[level] >= verbosity[options.level]) {
      process.stdout.write(output);
    }

    // continue
    return callback();
  }
}