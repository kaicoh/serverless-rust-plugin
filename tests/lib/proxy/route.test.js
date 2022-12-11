const { Readable, Writable, Transform } = require('stream');
const http = require('http');
const Route = require('../../../lib/proxy/route');
const { pathRegexp } = require('../../../lib/proxy/route');
const ApiGatewayProxyRequest = require('../../../lib/proxy/request');
const ApiGatewayProxyResponse = require('../../../lib/proxy/response');

jest.mock('http');
jest.mock('../../../lib/proxy/request');
jest.mock('../../../lib/proxy/response');

describe('pathRegexp', () => {
  it('converts to path string to regexp', () => {
    expect(pathRegexp('hello')).toEqual(/^\/hello\/?$/);
  });

  it('removes heading "/" from path string', () => {
    expect(pathRegexp('/hello')).toEqual(/^\/hello\/?$/);
  });

  it('can convert nested route', () => {
    expect(pathRegexp('hello/world')).toEqual(/^\/hello\/world\/?$/);
  });

  it('converts path parameter to named capture group', () => {
    expect(pathRegexp('hello/{world}')).toEqual(/^\/hello\/(?<world>.+)\/?$/);
  });

  it('can converts multiple path parameters', () => {
    expect(pathRegexp('hello/{world}/{id}')).toEqual(/^\/hello\/(?<world>.+)\/(?<id>.+)\/?$/);
  });
});

describe('Route', () => {
  function configFromParams(parameters) {
    return {
      path: 'posts/create',
      method: 'post',
      request: { parameters },
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('method: match', () => {
    it('returns true if the given request matches the path', () => {
      const config = { path: 'hello' };
      const route = new Route(config);
      const req = {
        url: '/hello',
        headers: { host: 'localhost' },
      };
      expect(route.match(req)).toBe(true);
    });

    it('returns false if the given request doesn\'t match the path', () => {
      const config = { path: 'herro' };
      const route = new Route(config);
      const req = {
        url: '/hello',
        headers: { host: 'localhost' },
      };
      expect(route.match(req)).toBe(false);
    });

    it('returns true if the given request matches the path but has querystrings', () => {
      const config = { path: 'hello' };
      const route = new Route(config);
      const req = {
        url: '/hello?foo=bar',
        headers: { host: 'localhost' },
      };
      expect(route.match(req)).toBe(true);
    });

    it('returns true if the given request matches the path but has path parameters', () => {
      const config = { path: 'hello/{world}' };
      const route = new Route(config);
      const req = {
        url: '/hello/123',
        headers: { host: 'localhost' },
      };
      expect(route.match(req)).toBe(true);
    });

    it('returns false if the given request matches the path partially', () => {
      const config = { path: 'hello/{world}/{id}' };
      const route = new Route(config);
      const req = {
        url: '/hello/123',
        headers: { host: 'localhost' },
      };
      expect(route.match(req)).toBe(false);
    });
  });

  describe('validate', () => {
    it('returns an error message if some query parameters are missing', () => {
      const config = {
        path: 'hello',
        request: {
          parameters: {
            querystrings: {
              foo: true,
              bar: false,
            },
          },
        },
      };
      const route = new Route(config);
      const req = {
        url: '/hello?bar=baz',
        headers: { host: 'localhost' },
      };
      expect(route.validate(req)).toEqual(expect.arrayContaining([
        'query parameter "foo" is required',
      ]));
    });

    it('returns an error message if some header parameters are missing', () => {
      const config = {
        path: 'hello',
        request: {
          parameters: {
            headers: {
              foo: true,
              bar: false,
            },
          },
        },
      };
      const route = new Route(config);
      const req = {
        url: '/hello?bar=baz',
        headers: { host: 'localhost', bar: 'baz' },
      };
      expect(route.validate(req)).toEqual(expect.arrayContaining([
        'header parameter "foo" is required',
      ]));
    });

    it('returns an empty array if all parameters are valid', () => {
      const config = {
        path: 'hello',
        request: {
          parameters: {
            querystrings: {
              foo: true,
              bar: false,
            },
            headers: {
              foobar: true,
              baz: false,
            },
          },
        },
      };
      const route = new Route(config);
      const req = {
        url: '/hello?foo=bar',
        headers: { host: 'localhost', foobar: 'value' },
      };
      expect(route.validate(req)).toHaveLength(0);
    });
  });

  describe('property: pathParams', () => {
    it('returns an object from route configuration', () => {
      const config = configFromParams({
        paths: {
          foo: true,
          bar: false,
        },
      });
      const route = new Route(config);
      expect(route.pathParams).toEqual({ foo: true, bar: false });
    });

    it('returns an empty object if there is no config', () => {
      const config = configFromParams({});
      const route = new Route(config);
      expect(route.pathParams).toEqual({});
    });
  });

  describe('property: hasPathParams', () => {
    it('returns true when the path params exist in the configuration', () => {
      const config = configFromParams({
        paths: {
          foo: true,
          bar: false,
        },
      });
      const route = new Route(config);
      expect(route.hasPathParams).toBe(true);
    });

    it('returns false when the path params don\'t exist in the configuration', () => {
      const config = configFromParams({});
      const route = new Route(config);
      expect(route.hasPathParams).toBe(false);
    });
  });

  describe('property: queryParams', () => {
    it('returns an object from route configuration', () => {
      const config = configFromParams({
        querystrings: {
          foo: true,
          bar: false,
        },
      });
      const route = new Route(config);
      expect(route.queryParams).toEqual({ foo: true, bar: false });
    });

    it('returns an empty object if there is no config', () => {
      const config = configFromParams({});
      const route = new Route(config);
      expect(route.queryParams).toEqual({});
    });
  });

  describe('property: hasQueryParams', () => {
    it('returns true when the query params exist in the configuration', () => {
      const config = configFromParams({
        querystrings: {
          foo: true,
          bar: false,
        },
      });
      const route = new Route(config);
      expect(route.hasQueryParams).toBe(true);
    });

    it('returns false when the query params don\'t exist in the configuration', () => {
      const config = configFromParams({});
      const route = new Route(config);
      expect(route.hasQueryParams).toBe(false);
    });
  });

  describe('property: headerParams', () => {
    it('returns an object from route configuration', () => {
      const config = configFromParams({
        headers: {
          foo: true,
          bar: false,
        },
      });
      const route = new Route(config);
      expect(route.headerParams).toEqual({ foo: true, bar: false });
    });

    it('returns an empty object if there is no config', () => {
      const config = configFromParams({});
      const route = new Route(config);
      expect(route.headerParams).toEqual({});
    });
  });

  describe('property: hasHeaderParams', () => {
    it('returns true when the query params exist in the configuration', () => {
      const config = configFromParams({
        headers: {
          foo: true,
          bar: false,
        },
      });
      const route = new Route(config);
      expect(route.hasHeaderParams).toBe(true);
    });

    it('returns false when the query params don\'t exist in the configuration', () => {
      const config = configFromParams({});
      const route = new Route(config);
      expect(route.hasHeaderParams).toBe(false);
    });
  });

  describe('method: getPathParams', () => {
    it('returns path parameters from the given request', () => {
      const config = {
        path: 'hello/{world}/{id}',
        request: {
          parameters: {
            paths: {
              world: true,
              id: true,
            },
          },
        },
      };
      const route = new Route(config);
      const req = {
        url: '/hello/japan/123',
        headers: { host: 'localhost' },
      };
      expect(route.getPathParams(req)).toEqual({
        world: 'japan',
        id: '123',
      });
    });

    it('returns an empty object if there are no path parameters', () => {
      const config = {
        path: 'hello',
        request: {
          parameters: {},
        },
      };
      const route = new Route(config);
      const req = {
        url: '/hello',
        headers: { host: 'localhost' },
      };
      expect(route.getPathParams(req)).toEqual({});
    });

    it('returns an empty object if the path doesn\'t match', () => {
      const config = {
        path: 'herro',
        request: {
          parameters: {},
        },
      };
      const route = new Route(config);
      const req = {
        url: '/hello',
        headers: { host: 'localhost' },
      };
      expect(route.getPathParams(req)).toEqual({});
    });
  });

  describe('method: getQueryParams', () => {
    it('returns query parameters from the given request', () => {
      const config = {
        path: 'hello',
        request: {
          parameters: {
            querystrings: {
              world: true,
              id: true,
            },
          },
        },
      };
      const route = new Route(config);
      const req = {
        url: '/hello?world=japan&id=123',
        headers: { host: 'localhost' },
      };
      expect(route.getQueryParams(req)).toEqual({
        world: 'japan',
        id: '123',
      });
    });

    it('returns query parameters without not provided parameters', () => {
      const config = {
        path: 'hello',
        request: {
          parameters: {
            querystrings: {
              world: true,
              id: true,
              foo: false,
            },
          },
        },
      };
      const route = new Route(config);
      const req = {
        url: '/hello?world=japan&id=123',
        headers: { host: 'localhost' },
      };
      expect(route.getQueryParams(req)).toEqual({
        world: 'japan',
        id: '123',
      });
    });

    it('returns multi value query parameters from the given request', () => {
      const config = {
        path: 'hello',
        request: {
          parameters: {
            querystrings: {
              world: true,
              id: true,
            },
          },
        },
      };
      const route = new Route(config);
      const req = {
        url: '/hello?world=japan&world=korea',
        headers: { host: 'localhost' },
      };
      expect(route.getQueryParams(req, { multi: true })).toEqual({
        world: ['japan', 'korea'],
      });
    });

    it('returns an empty object if there are no path parameters', () => {
      const config = {
        path: 'hello',
        request: {
          parameters: {},
        },
      };
      const route = new Route(config);
      const req = {
        url: '/hello',
        headers: { host: 'localhost' },
      };
      expect(route.getQueryParams(req)).toEqual({});
    });
  });

  describe('displayLines', () => {
    const config = {
      funcName: 'test function',
      method: 'test method',
      path: 'hello',
    };

    it('returns an array from strings including function name', () => {
      const route = new Route(config);
      expect(route.displayLines()[0]).toEqual('func: test function');
    });

    it('returns an array from strings including method and path', () => {
      const route = new Route(config);
      expect(route.displayLines()[1]).toEqual('  TEST METHOD /hello');
    });

    describe('when header parameters exist', () => {
      let result;

      beforeEach(() => {
        const route = new Route({
          ...config,
          request: {
            parameters: {
              querystrings: {
                foo: true,
                bar: false,
              },
            },
          },
        });

        result = route.displayLines();
      });

      it('returns an array from strings including query parameters', () => {
        expect(result[2]).toEqual('    query parameters');
      });

      it('sets as required and optional from the configuration', () => {
        expect(result).toEqual(expect.arrayContaining([
          '      foo: required',
          '      bar: optional',
        ]));
      });
    });

    describe('when query parameters exist', () => {
      let result;

      beforeEach(() => {
        const route = new Route({
          ...config,
          request: {
            parameters: {
              headers: {
                foo: true,
                bar: false,
              },
            },
          },
        });

        result = route.displayLines();
      });

      it('returns an array from strings including query parameters', () => {
        expect(result[2]).toEqual('    header parameters');
      });

      it('sets as required and optional from the configuration', () => {
        expect(result).toEqual(expect.arrayContaining([
          '      foo: required',
          '      bar: optional',
        ]));
      });
    });
  });

  describe('proxy', () => {
    let req;
    let res;
    let body;

    beforeEach(() => {
      body = '';
      req = Readable.from('request from local');
      res = new Writable({
        write(chunk, _, cb) {
          body += chunk.toString();
          cb();
        },
      });
      res.writeHead = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    describe('if the request results in validation error', () => {
      let mock;

      beforeEach(() => {
        const route = new Route({ path: 'hello' });
        route.validate = jest.fn(() => ['some error']);

        mock = jest.spyOn(http, 'request');

        route.proxy(req, res, () => {});
      });

      afterEach(() => {
        mock.mockRestore();
      });

      it('returns validation error response', () => {
        expect(res.writeHead).toHaveBeenCalledWith(400, { 'content-type': 'application/json' });
        expect(body).toEqual('{"errors":["some error"]}');
      });

      it('doesn\'t call http.request', () => {
        expect(http.request).not.toHaveBeenCalled();
      });
    });

    describe('if the request doesn\'t have validation error', () => {
      let reqToLambda;
      let mock;
      let route;

      beforeEach(() => {
        reqToLambda = '';

        route = new Route({ path: 'hello', port: 8888 });
        route.validate = jest.fn(() => []);

        mock = jest.spyOn(http, 'request').mockImplementation((_, cb) => {
          const reqToLambdaStream = new Writable({
            write(chunk, __, done) {
              reqToLambda += chunk.toString();
              done();
            },
          });

          req.on('end', () => {
            cb(Readable.from('response from lambda'));
          });

          return reqToLambdaStream;
        });

        ApiGatewayProxyRequest.mockClear();
        ApiGatewayProxyRequest.mockImplementation(() => new Transform({
          transform(chunk, _, done) {
            this.push(chunk);
            done();
          },
          flush(done) {
            this.push(' transformed from api gateway proxy request stream');
            done();
          },
        }));

        ApiGatewayProxyResponse.mockClear();
        ApiGatewayProxyResponse.mockImplementation(() => new Transform({
          transform(chunk, _, done) {
            this.push(chunk);
            done();
          },
          flush(done) {
            this.push(' transformed from api gateway proxy response stream');
            done();
          },
        }));
      });

      afterEach(() => {
        mock.mockRestore();
      });

      it('calls http.request with options from the route port', (done) => {
        route.proxy(req, res, () => {});
        res.on('close', () => {
          expect(http.request).toHaveBeenCalledWith(
            {
              hostname: 'localhost',
              port: 8888,
              path: '/2015-03-31/functions/function/invocations',
              method: 'POST',
            },
            expect.anything(),
          );

          done();
        });
      });

      it('passes a transformed request to lambda', (done) => {
        route.proxy(req, res, () => {});
        res.on('close', () => {
          expect(reqToLambda).toEqual('request from local transformed from api gateway proxy request stream');
          done();
        });
      });

      it('passed a transformed response to local', (done) => {
        route.proxy(req, res, () => {});
        res.on('close', () => {
          expect(body).toEqual('response from lambda transformed from api gateway proxy response stream');
          done();
        });
      });

      it('can obsereve transformed request to lambda using subscription callback', (done) => {
        let forkedRequest = '';
        const observer = new Writable({
          write(chunk, _, cb) {
            forkedRequest += chunk.toString();
            cb();
          },
        });

        route.proxy(req, res, (_req) => {
          _req.pipe(observer);
        });

        res.on('close', () => {
          expect(forkedRequest).toEqual('request from local transformed from api gateway proxy request stream');
          done();
        });
      });

      it('can obsereve raw response from lambda using subscription callback', (done) => {
        let forkedResponse = '';
        const observer = new Writable({
          write(chunk, _, cb) {
            forkedResponse += chunk.toString();
            cb();
          },
        });

        route.proxy(req, res, (_, _res) => {
          _res.pipe(observer);
        });

        res.on('close', () => {
          expect(forkedResponse).toEqual('response from lambda');
          done();
        });
      });
    });
  });
});
