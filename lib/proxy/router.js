const http = require('http');
const Route = require('./route');
const ApiGatewayProxyResponse = require('./response');

class Router {
  constructor(log) {
    this.log = log;

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
      this.log.info('### IncommingMessage ###');
      this.log.info(reqFromLocal);

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
        this.log.info('### Response from Container ###');
        this.log.info(resFromLambda);

        let output = '';

        resFromLambda.on('error', (err) => {
          this.log.error(`Error occurred in proxy response: ${err.message}`);
          throw err;
        });

        resFromLambda.on('data', (chunk) => {
          output += chunk.toString();
        });

        resFromLambda.on('end', () => {
          this.log.info('### Response from Lambda ###');
          this.log.info(output);

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

      reqFromLocal
        .pipe(proxyStream)
        .pipe(reqToLambda);
    };
  }
}

module.exports = Router;
