const http = require('http');
const Router = require('./router');
const FormattedJson = require('./format');
const { addPrefixForEachLine, color } = require('../utils');

class ApiGatewayProxy {
  static create(utils) {
    const proxy = new ApiGatewayProxy(Router, utils);
    return proxy;
  }

  constructor(RouterConstructor, utils) {
    this.router = new RouterConstructor(utils);
    this.log = utils.log;

    const prefixRequest = 'ApiGatewayProxyRequest  | ';
    const prefixResponse = 'ApiGatewayProxyResponse | ';

    this.prefixForReqLog = utils.useColor
      ? color.fromIndex(0)(prefixRequest)
      : color.default(prefixRequest);

    this.prefixForResLog = utils.useColor
      ? color.fromIndex(1)(prefixResponse)
      : color.default(prefixResponse);
  }

  addRoute(routeConfig) {
    this.log.info('API Gateway route added');
    this.log.info(routeConfig);
    this.router.push(routeConfig);
  }

  hasRoutes() {
    return this.router.hasRoutes();
  }

  listen(port, callback) {
    http
      .createServer((reqFromLocal, resToLocal) => {
        const route = this.router.get(reqFromLocal);

        if (!route) {
          resToLocal.writeHead(404, { 'content-type': 'text/plan' });
          resToLocal.end(`Not Found route: ${reqFromLocal.url}`);
          return;
        }

        route.proxy(reqFromLocal, resToLocal, (reqToLambda, resFromLambda) => {
          // Logging request and response the lambda function actually handles.
          reqToLambda
            .pipe(new FormattedJson())
            .pipe(addPrefixForEachLine(this.prefixForReqLog))
            .pipe(process.stderr);

          resFromLambda
            .pipe(new FormattedJson())
            .pipe(addPrefixForEachLine(this.prefixForResLog))
            .pipe(process.stderr);
        });
      })
      .listen(port, callback);
  }
}

module.exports = ApiGatewayProxy;
