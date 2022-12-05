const http = require('http');
const { PassThrough } = require('stream');
const _get = require('lodash.get');
const ApiGatewayProxyRequest = require('./request');
const ApiGatewayProxyResponse = require('./response');

function pathRegexp(path) {
  const regStr = path.split('/')
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

  displayLines() {
    const lines = [];
    const indent = (count) => '  '.repeat(count);

    const { funcName, method, path } = this.config;

    lines.push(`func: ${funcName}`);
    lines.push(`${indent(1)}${method.toUpperCase()} /${path.replace(/^\//, '')}`);

    if (this.hasHeaderParams) {
      lines.push(`${indent(2)}header parameters`);

      Object.entries(this.headerParams).forEach(([key, required]) => {
        lines.push(`${indent(3)}${key}: ${required ? 'required' : 'optional'}`);
      });
    }

    if (this.hasQueryParams) {
      lines.push(`${indent(2)}query parameters`);

      Object.entries(this.queryParams).forEach(([key, required]) => {
        lines.push(`${indent(3)}${key}: ${required ? 'required' : 'optional'}`);
      });
    }

    return lines;
  }

  proxy(req, res, subscribe) {
    const errors = this.validate(req);

    if (errors.length > 0) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ errors }));
      return;
    }

    const options = {
      hostname: 'localhost',
      port: this.config.port,
      path: '/2015-03-31/functions/function/invocations',
      method: 'POST',
    };

    const passReqStream = new PassThrough();
    const passResStream = new PassThrough();

    const reqToLambda = http.request(options, (resFromLambda) => {
      resFromLambda
        .pipe(passResStream)
        .pipe(new ApiGatewayProxyResponse(res))
        .pipe(res);
    });

    subscribe(passReqStream, passResStream);

    req.pipe(new ApiGatewayProxyRequest(this, req))
      .pipe(passReqStream)
      .pipe(reqToLambda);
  }
}

module.exports = Route;
module.exports.pathRegexp = pathRegexp;
