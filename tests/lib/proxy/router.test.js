const Router = require('../../../lib/proxy/router');
const Route = require('../../../lib/proxy/route');

jest.mock('../../../lib/proxy/route');

describe('Router', () => {
  let router;

  beforeEach(() => {
    Route.mockClear();
    Route.mockImplementation((config) => config);

    router = new Router({ log: {} });

    router.push({ method: 'options', path: '/test' });
    router.push({ method: 'head', path: '/test' });
    router.push({ method: 'get', path: '/test' });
    router.push({ method: 'post', path: '/test' });
    router.push({ method: 'put', path: '/test' });
    router.push({ method: 'patch', path: '/test' });
    router.push({ method: 'delete', path: '/test' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws an error if the route config has invalid method', () => {
    expect(() => router.push({ method: 'other' })).toThrow(/Unsupported method: other/);
  });

  describe('method: hasRoutes', () => {
    it('returns true when it has some routes', () => {
      expect(router.hasRoutes()).toBe(true);
    });

    it('returns false when it has no routes', () => {
      router = new Router({ log: {} });
      expect(router.hasRoutes()).toBe(false);
    });
  });

  describe('method: allRoutes', () => {
    it('returns all route objects in the router', () => {
      expect(router.allRoutes()).toEqual(expect.arrayContaining([
        { method: 'options', path: '/test' },
        { method: 'head', path: '/test' },
        { method: 'get', path: '/test' },
        { method: 'post', path: '/test' },
        { method: 'put', path: '/test' },
        { method: 'patch', path: '/test' },
        { method: 'delete', path: '/test' },
      ]));
    });
  });

  describe('method: get', () => {
    beforeEach(() => {
      router = new Router({ log: {} });

      router.push({
        method: 'get',
        path: '/unmatch',
        match: jest.fn(() => false),
      });

      router.push({
        method: 'get',
        path: '/match',
        match: jest.fn(() => true),
      });

      router.push({
        method: 'post',
        path: '/unmatch',
        match: jest.fn(() => false),
      });

      router.push({
        method: 'post',
        path: '/match',
        match: jest.fn(() => true),
      });
    });

    it('returns route object the matches methods and path', () => {
      expect(router.get({ method: 'post' })).toEqual(expect.objectContaining({
        method: 'post',
        path: '/match',
      }));
    });
  });
});
