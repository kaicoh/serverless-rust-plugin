const Route = require('./route');

class Router {
  constructor({ log }) {
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
    return this.allRoutes().length > 0;
  }

  allRoutes() {
    return [
      this.optionsRoutes,
      this.headRoutes,
      this.getRoutes,
      this.postRoutes,
      this.putRoutes,
      this.patchRoutes,
      this.deleteRoutes,
    ].flat();
  }

  get(req) {
    return this.routes(req.method).find((r) => r.match(req));
  }
}

module.exports = Router;
