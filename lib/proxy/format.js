const { Transform } = require('stream');

function format(str) {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch (err) {
    return str;
  }
}

class FormatJson extends Transform {
  constructor() {
    super();
    this.body = '';
  }

  _transform(chunk, _, callback) {
    this.body += chunk.toString();
    callback();
  }

  _flush(done) {
    this.push(format(this.body), 'utf8');
    done();
  }
}

module.exports = FormatJson;
