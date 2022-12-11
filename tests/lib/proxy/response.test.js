const { Readable, Writable } = require('stream');
const ApiGatewayProxyResponse = require('../../../lib/proxy/response');

describe('ApiGatewayProxyResponse', () => {
  let result;
  let res;

  beforeEach(() => {
    res = { writeHead: jest.fn() };
  });

  function subject(_res, _body) {
    let buffer = '';

    return new Promise((resolve) => {
      Readable.from(_body)
        .pipe(new ApiGatewayProxyResponse(_res))
        .pipe(new Writable({
          write(chunk, _, cb) {
            buffer += chunk.toString();
            cb();
          },
        }))
        .on('close', () => {
          resolve(buffer);
        });
    });
  }

  describe('when lambda returns response successfully', () => {
    beforeEach(async () => {
      const body = JSON.stringify({
        statusCode: 999,
        headers: { foo: 'bar' },
        body: '{"message":"This is a test"}',
      });

      result = await subject(res, body);
    });

    it('passes response body from lambda response', () => {
      expect(result).toEqual('{"message":"This is a test"}');
    });

    it('sets response status and headers', () => {
      expect(res.writeHead).toHaveBeenCalledWith(999, { foo: 'bar' });
    });
  });

  describe('when lambda returns error json objects', () => {
    beforeEach(async () => {
      const body = JSON.stringify({
        error: 'some error',
      });

      result = await subject(res, body);
    });

    it('passes response body from lambda response', () => {
      expect(result).toEqual('{"error":"some error"}');
    });

    it('sets response status and headers as internal server error', () => {
      expect(res.writeHead).toHaveBeenCalledWith(500, { 'content-type': 'application/json' });
    });
  });

  describe('when lambda returns a non json response', () => {
    beforeEach(async () => {
      const body = 'Unexpected error';
      result = await subject(res, body);
    });

    it('passes response body from lambda response', () => {
      expect(result).toEqual('Unexpected error');
    });

    it('sets response status and headers as internal server error', () => {
      expect(res.writeHead).toHaveBeenCalledWith(500, { 'content-type': 'text/plain' });
    });
  });
});
