'use strict';

const path = require('path');
const fs = require('fs');
const Cargo = require('./lib/cargo');
const CargoLambda = require('./lib/cargolambda');

const DEFAULT_DOCKER_TAG = 'latest';
const DEFAULT_DOCKER_IMAGE = 'calavera/cargo-lambda';
const NO_OUTPUT_CAPTURE = { stdio: ['ignore', process.stdout, process.stderr] };

// https://serverless.com/blog/writing-serverless-plugins/
// https://serverless.com/framework/docs/providers/aws/guide/plugins/

function mkdirSyncIfNotExist(dirname) {
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

function includeInvokeHook(serverlessVersion) {
  const [major, minor] = serverlessVersion.split('.');
  const majorVersion = parseInt(major, 10);
  const minorVersion = parseInt(minor, 10);
  return majorVersion === 1 && minorVersion >= 38 && minorVersion < 40;
}

class ServerlessRustPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.servicePath = this.serverless.config.servicePath || '';
    // MEMO: In 0.1.0 release, I focus on "package" and "deploy" event.
    this.hooks = {
      'before:package:createDeploymentArtifacts': this.build.bind(this),
      'before:deploy:function:packageFunction': this.build.bind(this),
      // 'before:offline:start': this.build.bind(this),
      // 'before:offline:start:init': this.build.bind(this),
    };

    if (includeInvokeHook(serverless.version)) {
      this.hooks['before:invoke:local:invoke'] = this.build.bind(this);
    }

    this.srcPath = path.resolve(this.servicePath);

    // MEMO: Customization for docker is disabled in 0.1.0 release.
    this.custom = {
      // dockerTag: DEFAULT_DOCKER_TAG,
      // dockerImage: DEFAULT_DOCKER_IMAGE,
      cargoPath: path.join(this.srcPath, 'Cargo.toml'),
      useDocker: true,
      ...((this.serverless.service.custom && this.serverless.service.custom.rust) || {}),
    };

    this.cargo = new Cargo(this.custom.cargoPath);

    const buildOptions = {
      useDocker: this.custom.useDocker,
      srcPath: this.srcPath,
      dockerImage: `${DEFAULT_DOCKER_IMAGE}:${DEFAULT_DOCKER_TAG}`,
      profile: this.custom.cargoProfile || CargoLambda.profile.release,
      arch: serverless.service.provider.architecture || CargoLambda.architecture.x86_64,
      // MEMO: In 0.1.0 release, binary format is disabled.
      format: CargoLambda.format.zip,
    };

    this.builder = new CargoLambda(buildOptions);
  }

  log(message) {
    this.serverless.cli.log(`[ServerlessRustPlugin]: ${message}`);
  }

  deployArtifactDir(profile) {
    return path.join(this.srcPath, 'target/lambda', profile);
  }

  functions() {
    return this.serverless.service.getAllFunctions();
  }

  getRustFunctions() {
    const { service } = this.serverless;
    const binaryNames = this.cargo.binaries();

    return this.functions().flatMap((funcName) => {
      const func = service.getFunction(funcName);
      return binaryNames.some((bin) => bin === func.handler) ? funcName : [];
    });
  }

  // MEMO:
  // If multiple artifacts have same file name like bootstrap.zip,
  // the serverless framework fails to deploy each artifacts correctly.
  // But cargo lambda builds all artifacts into same name bootstrap(.zip),
  // so this plugin copies artifacts using each function name and deploys them.
  // See: https://github.com/serverless/serverless/issues/3696
  resetEachPackage({ rustFunctions, builder, targetDir }) { // builder is an instance of CargoLambda
    const { service } = this.serverless;

    rustFunctions.forEach((funcName) => {
      const func = service.getFunction(funcName);
      const binaryName = func.handler;

      const buildArtifactPath = builder.artifactPath(binaryName);
      const deployArtifactPath = path.join(targetDir, `${funcName}${builder.artifactExt()}`);

      fs.createReadStream(buildArtifactPath)
        .pipe(fs.createWriteStream(deployArtifactPath));

      func.handler = builder.useZip() ? 'bootstrap' : path.basename(deployArtifactPath);
      func.package = {
        ...(func.package || {}),
        artifact: deployArtifactPath,
        individually: true,
      };
    });
  }

  build() {
    const { service } = this.serverless;
    if (service.provider.name !== 'aws') {
      return;
    }

    const rustFunctions = this.getRustFunctions();

    if (rustFunctions.length === 0) {
      throw new Error(
        'Error: no Rust functions found. '
        + 'Use "handler: {cargo-package-name}.{bin-name}" or "handler: {cargo-package-name}" '
        + 'in function configuration to use this plugin.',
      );
    }

    this.log(this.builder.howToBuild());
    this.log(`Running "${this.builder.buildCommand()}"`);

    const result = this.builder.build(NO_OUTPUT_CAPTURE);

    if (result.error || result.status > 0) {
      this.log(`Rust build encountered an error: ${result.error} ${result.status}.`);
      throw new Error(result.error);
    }

    const targetDir = this.deployArtifactDir(this.builder.profile);
    mkdirSyncIfNotExist(targetDir);

    this.resetEachPackage({
      rustFunctions,
      targetDir,
      builder: this.builder,
    });
  }
}

module.exports = ServerlessRustPlugin;
