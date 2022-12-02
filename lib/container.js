const path = require('path');
const cp = require('child_process');
const _get = require('lodash.get');
const utils = require('./utils');
const CargoLambda = require('./cargolambda');

const IMAGE_X86_64 = 'public.ecr.aws/lambda/provided:al2-x86_64';
const IMAGE_ARM64 = 'public.ecr.aws/lambda/provided:al2-arm64';
const PLATFORM_X86_64 = 'linux/amd64';
const PLATFORM_ARM64 = 'linux/arm64/v8';

async function assignPort(options) {
  if (options.port === 0) {
    const port = await utils.getFreePort();
    return { ...options, port };
  }
  return Promise.resolve(options);
}

function startArgs(options) {
  const {
    artifact,
    arch,
    containerName,
    port,
    envFile,
    env,
    dockerArgs,
  } = options;

  const binDir = path.dirname(artifact);
  const bin = path.basename(artifact);
  const useArm64 = arch === CargoLambda.architecture.arm64;

  const envs = Object.entries(env).flatMap(([key, val]) => [
    '--env',
    `${key}=${val.replace(/\s/g, '\ ')}`, // eslint-disable-line no-useless-escape
  ]);

  return [
    'run',
    '-i',
    '-d',
    '--rm',
    '-v',
    `${binDir}:/var/runtime`,
    '-p',
    `${port}:8080`,
    ...envs,
    ...(envFile ? ['--env-file', envFile] : []),
    '--name',
    containerName,
    '--platform',
    useArm64 ? PLATFORM_ARM64 : PLATFORM_X86_64,
    ...(dockerArgs ? dockerArgs.split(' ') : []),
    useArm64 ? IMAGE_ARM64 : IMAGE_X86_64,
    bin,
  ];
}

async function executeDockerCommand(args) {
  return utils.spawn('docker', args, {
    stdio: ['pipe', 'pipe', process.stderr],
    encoding: 'utf-8',
  });
}

async function startContainer(options) {
  const args = startArgs(options);
  return executeDockerCommand(args);
}

async function stopContainer(options) {
  const args = ['stop', options.containerName];
  return executeDockerCommand(args);
}

class Container {
  static async get({ name, config }) {
    const { containerName } = config;
    const { stdout } = await utils.spawn('docker', ['inspect', containerName]);
    const [state] = JSON.parse(stdout === '' ? '[{}]' : stdout);
    return new Container({ name, state, config });
  }

  static tableRow(container) {
    if (!container.exists) {
      return [container._funcName, '', 'not exist', ''];
    }
    const ports = container.ports
      .reduce((acc, [containerPort, hostBindings]) => {
        const bindings = hostBindings.map(({ HostIp, HostPort }) => `${HostIp}:${HostPort} -> ${containerPort}`);
        return [...acc, ...bindings];
      }, []);

    return [container._funcName, container.name, container.displayStatus(), ports.join(', ')];
  }

  constructor({ name, state, config }) {
    this._funcName = name;
    this._state = state || {};
    this._config = config;
  }

  format() {
    return JSON.stringify(this._state, null, '\t');
  }

  get id() {
    return _get(this._state, ['Id']);
  }

  get funcName() {
    return this._funcName;
  }

  get name() {
    return _get(this._state, ['Name'], '').replace(/^\//, '')
      || this._config.containerName;
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

  hostPortsTo(bindingTo) {
    return this.ports
      .filter(([containerPort]) => containerPort === `${bindingTo}/tcp`)
      .flatMap(([, hostBindings]) => (
        hostBindings.flatMap(({ HostPort }) => {
          const port = parseInt(HostPort, 10);
          return Number.isNaN(port) ? [] : [port];
        })
      ));
  }

  get ports() {
    return Array.from(
      Object.entries(_get(this._state, ['NetworkSettings', 'Ports'])),
    );
  }

  displayStatus() {
    const { status } = this;

    const color = (() => {
      switch (status) {
        case 'created':
        case 'restarting':
          return utils.color.blue;
        case 'running':
          return utils.color.green;
        case 'paused':
          return utils.color.yellow;
        case 'removing':
        case 'exit':
        case 'dead':
          return utils.color.red;
        default:
          return utils.color.default;
      }
    })();

    return color(status);
  }

  async start(options) {
    if (this.isRunning) {
      return Promise.resolve(this);
    }

    return assignPort({ ...this._config, ...options })
      .then(startContainer)
      .then(this.refresh.bind(this));
  }

  async stop() {
    if (!this.isRunning) {
      return Promise.resolve(this);
    }

    return stopContainer(this._config)
      .then(this.refresh.bind(this));
  }

  async refresh() {
    const name = this._funcName;
    const config = this._config;
    return Container.get({ name, config });
  }

  logStreams(options) {
    const {
      color,
      prefixSize,
      all,
      watch,
    } = options;

    const paddingSize = this.funcName.length > prefixSize ? this.funcName.length : prefixSize;
    const prefix = color(`${this.funcName.padEnd(paddingSize)} | `);
    const addPrefix = () => utils.addPrefixForEachLine(prefix);

    const { stdout, stderr } = cp.spawn(
      'docker',
      ['logs', this.name, ...(watch ? ['-f'] : [])],
      { stdio: 'pipe' },
    );

    return [
      stdout.pipe(addPrefix()),
      ...(all ? [stderr.pipe(addPrefix())] : []),
    ];
  }
}

module.exports = Container;
