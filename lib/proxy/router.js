const http = require('http');
const { PassThrough } = require('stream');
const Route = require('./route');
const FormattedJson = require('./format');
const ApiGatewayProxyResponse = require('./response');
const { addPrefixForEachLine, color } = require('../utils');

class Router {
  constructor({ log, useColor }) {
    this.log = log;
    const prefixRequest = 'ApiGatewayProxyRequest  | ';
    const prefixResponse = 'ApiGatewayProxyResponse | ';

    this.prefixForRequestLog = useColor
      ? color.fromIndex(0)(prefixRequest)
      : color.default(prefixRequest);

    this.prefixForResponseLog = useColor
      ? color.fromIndex(1)(prefixResponse)
      : color.default(prefixResponse);

    this.optionsRoutes = [];
    this.headRoutes = [];
    this.getRoutes = [];
    this.postRoutes = [];
    this.putRoutes = [];
    this.patchRoutes = [];
    this.deleteRoutes = [];
  }

  routes(method) {
    switch (method.toUpperCase()) {
      case 'OPTIONS':
        return this.optionsRoutes;
      case 'HEAD':
        return this.headRoutes;
      case 'GET':
        return this.getRoutes;
      case 'POST':
        return this.postRoutes;
      case 'PUT':
        return this.putRoutes;
      case 'PATCH':
        return this.patchRoutes;
      case 'DELETE':
        return this.deleteRoutes;
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  push(routeConfig) {
    const { method } = routeConfig;
    const route = new Route(routeConfig, this.log);
    this.routes(method).push(route);
  }

  hasRoutes() {
    return [
      this.optionsRoutes,
      this.headRoutes,
      this.getRoutes,
      this.postRoutes,
      this.putRoutes,
      this.patchRoutes,
      this.deleteRoutes,
    ].flat().length > 0;
  }

  handler() {
    return (reqFromLocal, resToLocal) => {
      const route = this.routes(reqFromLocal.method)
        .find((r) => r.match(reqFromLocal));

      if (!route) {
        resToLocal.writeHead(404, { 'content-type': 'applicaton/json' });
        resToLocal.end(JSON.stringify({ errors: ['Not Found route'] }));
        return;
      }

      const errors = route.validate(reqFromLocal);

      if (errors.length > 0) {
        resToLocal.writeHead(400, { 'content-type': 'application/json' });
        resToLocal.end(JSON.stringify({ errors }));
        return;
      }

      const { options, proxyStream } = route.proxy(reqFromLocal);

      const reqToLambda = http.request(options, (resFromLambda) => {
        let output = '';

        // logging
        resFromLambda
          .pipe(new FormattedJson())
          .pipe(addPrefixForEachLine(this.prefixForResponseLog))
          .pipe(process.stderr);

        resFromLambda.on('error', (err) => {
          this.log.error(`Error occurred in proxy response: ${err.message}`);
          throw err;
        });

        resFromLambda.on('data', (chunk) => {
          output += chunk.toString();
        });

        resFromLambda.on('end', () => {
          const {
            statusCode,
            headers,
            body,
          } = ApiGatewayProxyResponse.parse(output);

          resToLocal.writeHead(statusCode, headers);
          resToLocal.end(body);
        });
      });

      reqFromLocal.on('error', (err) => {
        this.log.error(`Error occurred in proxy request: ${err.message}`);
        throw err;
      });

      const pass = new PassThrough();

      reqFromLocal
        .pipe(proxyStream)
        .pipe(pass);

      // Forward to Lambda function
      pass
        .pipe(reqToLambda);

      // logging
      pass
        .pipe(new FormattedJson())
        .pipe(addPrefixForEachLine(this.prefixForRequestLog))
        .pipe(process.stderr);
    };
  }
}

module.exports = Router;
