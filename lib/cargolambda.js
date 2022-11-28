const path = require('path');
const utils = require('./utils');

const DOCKER_IMAGE = 'calavera/cargo-lambda:latest';

class Artifacts {
  constructor(artifacts) {
    this._artifacts = artifacts;
  }

  get isEmpty() {
    return this._artifacts.length === 0;
  }

  getAll() {
    return this._artifacts;
  }

  path(bin) {
    const artifact = this._artifacts.find(({ name }) => name === bin);
    if (artifact) return artifact.path;
    return undefined;
  }
}

const CargoLambda = {
  profile: {
    debug: 'debug',
    release: 'release',
  },

  architecture: {
    arm64: 'arm64',
    x86_64: 'x86_64',
  },

  format: {
    zip: 'zip',
    binary: 'binary',
  },
};

function useZip({ format }) {
  return format === CargoLambda.format.zip;
}

function ext({ format }) {
  return useZip({ format }) ? '.zip' : '';
}

// Assume binName is like "cargo-package-name.bin-name" or "cargo-package-name".
function artifactPath(binName, { srcPath, format }) {
  const [bin] = binName.split('.').reverse();
  return path.join(srcPath, 'target/lambda', bin, `bootstrap${ext({ format })}`);
}

function buildArgs(options) {
  const {
    docker,
    srcPath,
    format,
    profile,
    arch,
  } = options;

  const buildOptions = [
    profile === CargoLambda.profile.release ? ['--release'] : [],
    arch === CargoLambda.architecture.arm64 ? ['--arm64'] : [],
    useZip({ format }) ? ['--output-format', 'zip'] : [],
  ].flat();

  if (docker) {
    return [
      'run',
      '--rm',
      '-t',
      '-v',
      `${srcPath}:/tmp`,
      '-w',
      '/tmp',
      DOCKER_IMAGE,
      'build',
      ...buildOptions,
    ];
  }

  return [
    'lambda',
    'build',
    ...buildOptions,
  ];
}

function buildCommand({ docker }) {
  return docker ? 'docker' : 'cargo';
}

async function build(cargo, options, { log }) {
  const artifacts = cargo.binaries().map((binName) => ({
    name: binName,
    path: artifactPath(binName, options),
  }));

  const cmd = buildCommand(options);
  const args = buildArgs(options);

  log.info(`Running: ${cmd} ${args.join(' ')}`);

  const result = await utils.spawn(cmd, args, {
    stdio: ['ignore', 'pipe', process.stderr],
  });

  return {
    result,
    artifacts: new Artifacts(artifacts),
  };
}

module.exports = CargoLambda;
module.exports.Artifacts = Artifacts;
module.exports.build = build;
