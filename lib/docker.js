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
    return [
      'run',
      '-i',
      '-d',
      '--rm',
      '-v',
      `${this.options.binDir}:/var/runtime`,
      '-p',
      `${this.options.port}:8080`,
      '--name',
      this.options.name,
      '--platform',
      this._platform(),
      this._image(),
      this.options.bin,
    ];
  }
}

module.exports = Docker;
