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

function executable(binaryName, useZip) {
  return useZip ? 'bootstrap' : binaryName;
}

// assumes docker is on the host's execution path for build
class ServerlessRustPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.servicePath = this.serverless.config.servicePath || '';
    // MEMO: For 0.1.0 release, I focus on "package" and "deploy" event.
    this.hooks = {
      'before:package:createDeploymentArtifacts': this.build.bind(this),
      'before:deploy:function:packageFunction': this.build.bind(this),
      // 'before:offline:start': this.build.bind(this),
      // 'before:offline:start:init': this.build.bind(this),
    };

    // if (includeInvokeHook(serverless.version)) {
    //   this.hooks['before:invoke:local:invoke'] = this.build.bind(this);
    // }
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

  build() {
    const { service } = this.serverless;
    if (service.provider.name !== 'aws') {
      return;
    }

    const binaryNames = this.cargo.binaries();
    const rustFunctionsFound = this.functions().some((funcName) => {
      const func = service.getFunction(funcName);
      return binaryNames.some((bin) => bin === func.handler);
    });

    if (!rustFunctionsFound) {
      throw new Error(
        'Error: no Rust functions found. '
        + 'Use "handler: {cargo-package-name}.{bin-name}" or "handler: {cargo-package-name}" '
        + 'in function configuration to use this plugin.',
      );
    }

    const options = {
      useDocker: this.custom.useDocker,
      srcPath: this.srcPath,
      dockerImage: `${DEFAULT_DOCKER_IMAGE}:${DEFAULT_DOCKER_TAG}`,
      profile: this.custom.cargoProfile || CargoLambda.profile.release,
      arch: service.provider.architecture || CargoLambda.architecture.x86_64,
      // MEMO: For 0.1.0 release, binary format is disabled.
      format: CargoLambda.format.zip,
    };

    const builder = new CargoLambda(options);

    this.log(builder.howToBuild());
    this.log(`Running "${builder.buildCommand()}"`);
    const result = builder.build(NO_OUTPUT_CAPTURE);

    if (result.error || result.status > 0) {
      this.log(`Rust build encountered an error: ${result.error} ${result.status}.`);
      throw new Error(result.error);
    }

    this.functions().forEach((funcName) => {
      const func = service.getFunction(funcName);
      const binaryName = binaryNames.find((bin) => bin === func.handler);

      if (binaryName === undefined) {
        return;
      }

      // MEMO:
      // If multiple artifacts have same file name like bootstrap.zip,
      // the serverless framework fails to deploy each artifacts correctly.
      // But cargo lambda builds all artifacts to bootstrap(.zip).
      // So, this plugins renames artifacts using each function name.
      // See: https://github.com/serverless/serverless/issues/3696
      const buildArtifactPath = builder.artifactPath(binaryName);
      const targetDir = this.deployArtifactDir(builder.profile);
      mkdirSyncIfNotExist(targetDir);
      const deployArtifactPath = path.join(targetDir, `${funcName}${builder.artifactExt()}`);

      fs.createReadStream(buildArtifactPath)
        .pipe(fs.createWriteStream(deployArtifactPath));

      func.handler = executable(binaryName, builder.useZip());
      func.package = {
        ...(func.package || {}),
        artifact: deployArtifactPath,
        individually: true,
      };
    });
  }
}

module.exports = ServerlessRustPlugin;
