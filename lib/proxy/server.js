const http = require('http');
const Router = require('./router');

class ApiGatewayProxy {
  static create(utils) {
    const proxy = new ApiGatewayProxy(Router, utils);
    return proxy;
  }

  constructor(RouterConstructor, utils) {
    this.router = new RouterConstructor(utils);
    this.log = utils.log;
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
      .createServer(this.router.handler())
      .listen(port, callback);
  }
}

module.exports = ApiGatewayProxy;
