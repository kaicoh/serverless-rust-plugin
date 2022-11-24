const CargoLambda = require('./cargolambda');

const DEFAULT_IMAGE_X86_64 = 'public.ecr.aws/lambda/provided:al2-x86_64';
const DEFAULT_IMAGE_ARM64 = 'public.ecr.aws/lambda/provided:al2-arm64';
const SPAWN_OPTIONS = {
  stdio: [process.stdin, 'pipe', process.stderr],
  encoding: 'utf-8',
};

class Docker {
  static platform = {
    x86_64: 'linux/amd64',
    arm64: 'linux/arm64/v8',
  };

  constructor(options) {
    this.options = options;
  }

  run(spawn) {
    return spawn('docker', this._args(), SPAWN_OPTIONS);
  }

  running(spawn) {
    const options = [
      'inspect',
      '--format',
      '"{{json .State.Running}}"',
      this.options.name,
    ];
    const { stdout } = spawn('docker', options, SPAWN_OPTIONS);
    return typeof stdout === 'string' && stdout.trim() === '"true"';
  }

  runCommand() {
    return `docker run ${this._args().join(' ')}`;
  }

  stop(spawn) {
    return spawn('docker', ['stop', this.options.name], SPAWN_OPTIONS);
  }

  _useArm64() {
    return this.options.arch === CargoLambda.architecture.arm64;
  }

  _platform() {
    return this._useArm64() ? Docker.platform.arm64 : Docker.platform.x86_64;
  }

  _image() {
    return this._useArm64() ? DEFAULT_IMAGE_ARM64 : DEFAULT_IMAGE_X86_64;
  }

  _args() {
    const environments = this.options.env.flatMap((env) => {
      const [key, val] = env.split('=');
      return [
        '--env',
        `${key}=${val.replace(/\s/g, '\ ')}`, // eslint-disable-line no-useless-escape
      ];
    });

    const additionals = this.options['additional-args']
      ? this.options['additional-args'].split(' ') : [];

    return [
      'run',
      '-i',
      '-d',
      '--rm',
      '-v',
      `${this.options.binDir}:/var/runtime`,
      '-p',
      `${this.options.port}:8080`,
      ...environments,
      '--name',
      this.options.name,
      '--platform',
      this._platform(),
      ...additionals,
      this._image(),
      this.options.bin,
    ];
  }
}

module.exports = Docker;
