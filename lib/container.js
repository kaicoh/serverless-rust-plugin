const _get = require('lodash.get');
const utils = require('./utils');

class Container {
  static async get(containerName) {
    const { stdout } = await utils.spawn('docker', ['inspect', containerName]);
    const [state] = JSON.parse(stdout === '' ? '[{}]' : stdout);
    return new Container(state);
  }

  constructor(state) {
    this._state = state || {};
  }

  get name() {
    return _get(this._state, ['Name']);
  }

  get exists() {
    return Object.keys(this._state).length > 0;
  }

  get status() {
    return _get(this._state, ['State', 'Status']);
  }

  get isRunning() {
    return _get(this._state, ['State', 'Running'], false);
  }

  get ports() {
    return Object.entries(_get(this._state, ['NetworkSettings', 'Ports']));
  }

  format(functionName) {
    if (!this.exists) {
      return [functionName, '', 'not exist', ''];
    }
    const ports = Array.from(this.ports)
      .reduce((acc, [containerPort, hostBindings]) => {
        const bindings = hostBindings.map(({ HostIp, HostPort }) => `${HostIp}:${HostPort} -> ${containerPort}`);
        return [...acc, ...bindings];
      }, []);

    return [functionName, this.name, this.status, ports.join(', ')];
  }
}

module.exports = Container;
