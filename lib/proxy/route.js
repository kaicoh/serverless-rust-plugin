const _get = require('lodash.get');
const ApiGatewayProxyRequest = require('./request');

function pathRegexp(path) {
  const fragments = path.split('/');
  const regStr = fragments
    .filter((val) => val !== undefined && val.length > 0)
    .map((val) => {
      const match = val.match(/^{(?<name>.+)}$/);
      if (match && match.groups && match.groups.name) {
        return `(?<${match.groups.name}>.+)`;
      }
      return val;
    })
    .join('/');

  return new RegExp(`^/${regStr}/?$`);
}

class Route {
  static Url(req) {
    return new URL(req.url, `http://${req.headers.host}`);
  }

  constructor(config, log) {
    this.pathRegexp = pathRegexp(config.path);
    this.config = config;
    this.log = log;
  }

  match(req) {
    const url = Route.Url(req);
    return this.pathRegexp.test(url.pathname);
  }

  validate(req) {
    const errors = [];
    const url = Route.Url(req);

    Object.entries(this.queryParams).forEach(([key, required]) => {
      const value = url.searchParams.get(key);

      if (required && value === null) {
        errors.push(`query parameter "${key}" is required`);
      }
    });

    Object.entries(this.headerParams).forEach(([key, required]) => {
      // request header's names are all lowercased.
      // See: https://nodejs.org/api/http.html#messageheaders
      const value = req.headers[key.toLowerCase()];

      if (required && !value) {
        errors.push(`header parameter "${key}" is required`);
      }
    });

    return errors;
  }

  get parameters() {
    return _get(this.config, ['request', 'parameters'], {});
  }

  get pathParams() {
    const { paths } = this.parameters;
    if (paths === undefined || typeof paths !== 'object') {
      return {};
    }
    return paths;
  }

  get hasPathParams() {
    return Object.keys(this.pathParams).length > 0;
  }

  get queryParams() {
    const { querystrings } = this.parameters;
    if (querystrings === undefined || typeof querystrings !== 'object') {
      return {};
    }
    return querystrings;
  }

  get hasQueryParams() {
    return Object.keys(this.queryParams).length > 0;
  }

  get headerParams() {
    const { headers } = this.parameters;
    if (headers === undefined || typeof headers !== 'object') {
      return {};
    }
    return headers;
  }

  get hasHeaderParams() {
    return Object.keys(this.headerParams).length > 0;
  }

  getPathParams(req) {
    const paths = {};
    const url = Route.Url(req);
    const match = url.pathname.match(this.pathRegexp);

    if (match) {
      Object.keys(this.pathParams).forEach((key) => {
        paths[key] = _get(match, ['groups', key]);
      });
    }

    return paths;
  }

  getQueryParams(req, { multi } = { multi: false }) {
    const queries = {};
    const url = Route.Url(req);

    Object.keys(this.queryParams).forEach((key) => {
      if (multi) {
        const values = url.searchParams.getAll(key);
        if (values.length > 0) {
          queries[key] = values;
        }
      } else {
        const value = url.searchParams.get(key);
        if (value) {
          queries[key] = value;
        }
      }
    });

    return queries;
  }

  proxy(req) {
    const options = {
      hostname: 'localhost',
      port: this.config.port,
      path: '/2015-03-31/functions/function/invocations',
      method: 'POST',
    };

    const proxyStream = new ApiGatewayProxyRequest(this, req, this.log);

    return { options, proxyStream };
  }
}

module.exports = Route;
module.exports.pathRegexp = pathRegexp;