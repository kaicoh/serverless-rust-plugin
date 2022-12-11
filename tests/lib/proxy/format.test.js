const { Readable, Writable } = require('stream');
const FormatJson = require('../../../lib/proxy/format');

describe('FormatJson', () => {
  it('transforms json string to being formatted', (done) => {
    let result = '';

    Readable.from('{"foo":{"bar":"baz"}}')
      .pipe(new FormatJson())
      .pipe(new Writable({
        write(chunk, _, callback) {
          result += chunk.toString();
          callback();
        },
      }))
      .on('close', () => {
        expect(result).toEqual('{\n  "foo": {\n    "bar": "baz"\n  }\n}');
        done();
      });
  });

  it('passes through if the streaming data isn\'t a json', (done) => {
    let result = '';

    Readable.from('Hello World')
      .pipe(new FormatJson())
      .pipe(new Writable({
        write(chunk, _, callback) {
          result += chunk.toString();
          callback();
        },
      }))
      .on('close', () => {
        expect(result).toEqual('Hello World');
        done();
      });
  });
});
