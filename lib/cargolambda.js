const { spawnSync } = require('child_process');
const path = require('path');

class CargoLambda {
  static profile = {
    debug: 'debug',
    release: 'release',
  };

  static architecture = {
    arm64: 'arm64',
    x86_64: 'x86_64',
  };

  static format = {
    zip: 'zip',
    binary: 'binary',
  };

  constructor(options) {
    // src
    this.srcPath = options.srcPath;

    // docker
    this.useDocker = options.useDocker;
    this.dockerImage = options.dockerImage;

    // build settings
    this.profile = options.profile || CargoLambda.profile.debug;
    this.arch = options.arch || CargoLambda.architecture.x86_64;
    this.format = options.format || CargoLambda.format.binary;
  }

  // ***********************************************************
  // public methods
  // ***********************************************************
  buildCommand() {
    return [
      'cargo',
      'lambda',
      'build',
      ...this._buildOptions(),
    ].join(' ');
  }

  howToBuild() {
    if (this.useDocker) {
      return `Use docker image ${this.dockerImage}.`;
    }
    return 'Use local cargo-lambda.';
  }

  build(spawnOptions, spawn = spawnSync) {
    const cmd = this._buildCmd();
    const args = this._buildArgs();
    return spawn(cmd, args, spawnOptions);
  }

  useZip() {
    return this.format === CargoLambda.format.zip;
  }

  artifactExt() {
    return this.useZip() ? '.zip' : '';
  }

  // Assume binaryName is like "cargo-package-name.bin-name" or "cargo-package-name".
  artifactPath(binaryName) {
    const [binary] = binaryName.split('.').reverse();
    const ext = this.artifactExt();
    return path.join(this.srcPath, 'target/lambda', binary, `bootstrap${ext}`);
  }

  // ***********************************************************
  // private methods
  // ***********************************************************
  _buildOptions() {
    const outputFormat = this.useZip() ? ['--output-format', 'zip'] : [];
    return [
      this.profile === CargoLambda.profile.release ? '--release' : '',
      this.arch === CargoLambda.architecture.arm64 ? '--arm64' : '',
      ...outputFormat,
    ].filter((i) => i);
  }

  _buildCmd() {
    return this.useDocker ? 'docker' : 'cargo';
  }

  _buildArgs() {
    if (this.useDocker) {
      return [
        'run',
        '--rm',
        '-t',
        '-v',
        `${this.srcPath}:/tmp`,
        '-w',
        '/tmp',
        this.dockerImage,
        'build',
        ...this._buildOptions(),
      ];
    }

    return [
      'lambda',
      'build',
      ...this._buildOptions(),
    ];
  }
}

module.exports = CargoLambda;
