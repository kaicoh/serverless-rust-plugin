const { Readable, Writable } = require('stream');
const ApiGatewayProxyRequest = require('../../../lib/proxy/request');

describe('ApiGatewayProxyRequest', () => {
  const req = {
    url: '/test?foo=bar',
    method: 'some method',
    headers: {
      host: 'example.com',
      foo: 'bar',
    },
    headersDistinct: {
      host: 'localhost',
      foobar: 'baz',
    },
  };

  const route = {
    getQueryParams: jest.fn()
      .mockImplementation((_, opt) => {
        if (opt && opt.multi) return { query: 'multi values' };
        return { query: 'value' };
      }),
    getPathParams: jest.fn()
      .mockImplementation(() => ({ path: ['path value'] })),
  };

  it('transforms to ApiGatewayProxy Event without "body" if the readable emits nothing', (done) => {
    let buffer = '';

    Readable.from([])
      .pipe(new ApiGatewayProxyRequest(route, req))
      .pipe(new Writable({
        write(chunk, _, callback) {
          buffer += chunk.toString();
          callback();
        },
      }))
      .on('close', () => {
        const result = JSON.parse(buffer);
        expect(result.body).toBeUndefined();
        done();
      });
  });

  describe('transforms to ApiGatewayProxy Event', () => {
    let result;

    beforeEach(() => {
      let buffer = '';

      return new Promise((resolve) => {
        Readable.from('{"message":"This is a test"}')
          .pipe(new ApiGatewayProxyRequest(route, req))
          .pipe(new Writable({
            write(chunk, _, done) {
              buffer += chunk.toString();
              done();
            },
          }))
          .on('close', () => {
            result = JSON.parse(buffer);
            resolve();
          });
      });
    });

    it('has property "resource"', () => {
      expect(result.resource).toBeDefined();
    });

    it('has property "path" from given req object', () => {
      expect(result.path).toEqual('/test');
    });

    it('has property "httpMethod" from given req object', () => {
      expect(result.httpMethod).toEqual('some method');
    });

    it('has property "headers" from given req object', () => {
      expect(result.headers).toEqual({
        host: 'example.com',
        foo: 'bar',
      });
    });

    it('has property "multiValueHeaders" from given req object', () => {
      expect(result.multiValueHeaders).toEqual({
        host: 'localhost',
        foobar: 'baz',
      });
    });

    it('has property "queryStringParameters" from given route and req object', () => {
      expect(result.queryStringParameters).toEqual({
        query: 'value',
      });
    });

    it('has property "multiValueQueryStringParameters" from given route and req object', () => {
      expect(result.multiValueQueryStringParameters).toEqual({
        query: 'multi values',
      });
    });

    it('has property "pathParameters" from given route and req object', () => {
      expect(result.pathParameters).toEqual({
        path: ['path value'],
      });
    });

    it('has property "stageVariables" as empty object', () => {
      expect(result.stageVariables).toEqual({});
    });

    it('has property "requestContext" as an object', () => {
      expect(result.requestContext).toEqual(expect.objectContaining({
        identity: {},
        authorizer: {},
        httpMethod: 'some method',
        requestTimeEpoch: expect.anything(),
      }));
    });

    it('has property "isBase64Encoded"', () => {
      expect(result.isBase64Encoded).toBe(false);
    });

    it('has property "body" as JSON stringified string', () => {
      expect(result.body).toEqual('{"message":"This is a test"}');
    });
  });
});
