const http = require('http');
const Router = require('./router');

class ApiGatewayProxy {
  static create({ log }) {
    const proxy = new ApiGatewayProxy(Router, log);
    return proxy;
  }

  constructor(RouterConstructor, log) {
    this.router = new RouterConstructor(log);
    this.log = log;
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
