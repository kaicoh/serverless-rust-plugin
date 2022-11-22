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

  constructor(cargo, options) {
    this.cargo = cargo;

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

  build(spawn, options) {
    const cmd = this._buildCmd();
    const args = this._buildArgs();
    const result = spawn(cmd, args, options);

    const artifacts = this._artifacts();

    return {
      result,
      artifacts: {
        getAll: () => artifacts,
        path: (bin) => {
          const artifact = artifacts.find(({ name }) => name === bin);
          if (artifact) return artifact.path;
          return undefined;
        },
      },
    };
  }

  // ***********************************************************
  // private methods
  // ***********************************************************
  _useZip() {
    return this.format === CargoLambda.format.zip;
  }

  _artifactExt() {
    return this._useZip() ? '.zip' : '';
  }

  // Assume binaryName is like "cargo-package-name.bin-name" or "cargo-package-name".
  _artifactPath(binaryName) {
    const [binary] = binaryName.split('.').reverse();
    const ext = this._artifactExt();
    return path.join(this.srcPath, 'target/lambda', binary, `bootstrap${ext}`);
  }

  _artifacts() {
    return this.cargo.binaries().map((binaryName) => ({
      name: binaryName,
      path: this._artifactPath(binaryName),
    }));
  }

  _buildOptions() {
    const outputFormat = this._useZip() ? ['--output-format', 'zip'] : [];
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
