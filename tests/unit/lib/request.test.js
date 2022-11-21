const { PassThrough } = require('stream');
const { invokeLambda } = require('../../../lib/request');

describe('invokeLambda', () => {
  let request;
  let options;
  let reqStream;
  let resStream;
  let promise;

  beforeEach(() => {
    options = {
      port: 1234,
      data: { foo: 'bar' },
      retryCount: 0,
      retryInterval: 1000,
      stdout: false,
    };

    reqStream = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };

    resStream = new PassThrough();
    resStream.statusCode = 200;
    resStream.headers = { 'content-type': 'application/json' };
    resStream.pipe = jest.fn();

    request = jest.fn((_, callback) => {
      callback(resStream);
      return reqStream;
    });
  });

  afterEach(() => {
    if (!resStream.closed) {
      resStream.emit('close');
    }
  });

  it('rejects when response stream emits an error', async () => {
    promise = invokeLambda(request, options);
    resStream.emit('error', new Error('some error'));
    await expect(() => promise).rejects.toThrow(/some error/);
  });

  it('outputs to stderr if option.stdout is false', async () => {
    promise = invokeLambda(request, options);
    resStream.emit('end');
    await promise;

    expect(resStream.pipe).toHaveBeenCalledWith(process.stderr);
  });

  it('outputs to stdout when option.stdout is true', async () => {
    options.stdout = true;
    promise = invokeLambda(request, options);
    resStream.emit('end');
    await promise;

    expect(resStream.pipe).toHaveBeenCalledWith(process.stdout);
  });

  describe('when http request seccesses', () => {
    beforeEach(() => {
      promise = invokeLambda(request, options);
      resStream.emit('end');
    });

    it('calls http.request with correct options', () => {
      const arg = request.mock.lastCall[0];
      const expected = expect.objectContaining({
        hostname: 'localhost',
        port: options.port,
        path: '/2015-03-31/functions/function/invocations',
        method: 'POST',
      });
      expect(arg).toEqual(expected);
    });

    it('resolves with http status and headers', async () => {
      const result = await promise;
      expect(result.status).toEqual(200);
      expect(result.headers).toEqual(expect.objectContaining({
        'content-type': 'application/json',
      }));
    });

    it('writes JSON.stringified data to request stream', () => {
      expect(reqStream.write).toHaveBeenCalledTimes(1);
      expect(reqStream.write).toHaveBeenCalledWith('{"foo":"bar"}');
    });

    it('calls end function of request stream', () => {
      expect(reqStream.end).toHaveBeenCalledTimes(1);
    });
  });

  describe('when http request fails', () => {
    beforeEach(() => {
      options = {
        port: 1234,
        data: '{"foo":"bar"}',
        retryCount: 3,
        retryInterval: 1,
      };
    });

    it('retries function call until retry is 0', async () => {
      const errRequest = {
        on: jest.fn((_, callback) => {
          callback(new Error('broken request'));
        }),
        write: jest.fn(),
        end: jest.fn(),
      };

      request = () => errRequest;
      await expect(() => invokeLambda(request, options)).rejects.toThrow(/broken request/);

      expect(errRequest.on).toHaveBeenCalledTimes(4);
    });
  });
});
