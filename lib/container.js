const path = require('path');
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

async function startContainer(options) {
  const args = startArgs(options);

  return utils.spawn('docker', args, {
    stdio: ['pipe', 'pipe', process.stderr],
    encoding: 'utf-8',
  });
}

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

  async start(options) {
    const { containerName } = options;

    if (this.isRunning) {
      return Promise.resolve({ message: `${containerName} is running` });
    }

    return assignPort(options)
      .then(startContainer)
      .then(() => ({ message: `${containerName} is started` }));
  }
}

module.exports = Container;
