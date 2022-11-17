'use strict';

const path = require('path');
const fs = require('fs');
const Cargo = require('./lib/cargo');
const builderFactory = require('./lib/builder');

const PROFILE_RELEASE = 'release';
const ARCH_ARM64 = 'arm64';
const FORMAT_ZIP = 'zip';
const DEFAULT_DOCKER_TAG = 'latest';
const DEFAULT_DOCKER_IMAGE = 'calavera/cargo-lambda';
const DEFAULT_ARCHTECTURE = 'x86_64';

// https://serverless.com/blog/writing-serverless-plugins/
// https://serverless.com/framework/docs/providers/aws/guide/plugins/

function cargoLambdaOptions(profile, arch, format) {
  const outputFormat = format === FORMAT_ZIP ? ['--output-format', 'zip'] : [];
  return [
    profile === PROFILE_RELEASE ? '--release' : '',
    arch === ARCH_ARM64 ? '--arm64' : '',
    ...outputFormat,
  ].filter((i) => i);
}

function zipPath(srcPath, binaryName) {
  const binary = binaryName.split('.').reverse()[0];
  return path.join(srcPath, 'target/lambda', binary, 'bootstrap.zip');
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
    //
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

    const profile = this.custom.debug ? 'debug' : PROFILE_RELEASE;
    const arch = service.provider.architecture || DEFAULT_ARCHTECTURE;
    // MEMO: For 0.1.0 release, binary format is disabled.
    const format = FORMAT_ZIP;
    const options = {
      useDocker: this.custom.useDocker,
      srcPath: this.srcPath,
      cargoLambdaOptions: cargoLambdaOptions(profile, arch, format),
      dockerImage: `${DEFAULT_DOCKER_IMAGE}:${DEFAULT_DOCKER_TAG}`,
    };

    const builder = builderFactory(options);

    this.serverless.cli.log('Running cargo lambda build');
    const result = builder.build();

    if (result.error || result.status > 0) {
      this.serverless.cli.log(
        `Rust build encountered an error: ${result.error} ${result.status}.`,
      );
      throw new Error(result.error);
    }

    this.functions().forEach((funcName) => {
      const func = service.getFunction(funcName);
      const binaryName = binaryNames.find((bin) => bin === func.handler);

      if (binaryName === undefined) {
        return;
      }

      const zipArtifactPath = zipPath(this.srcPath, binaryName);
      const artifactPath = path.join(this.srcPath, 'target/lambda', `${funcName}.zip`);

      fs.createReadStream(zipArtifactPath).pipe(fs.createWriteStream(artifactPath));

      func.handler = 'bootstrap';
      func.package = {
        ...(func.package || {}),
        artifact: artifactPath,
        individually: true,
      };
    });
  }
}

module.exports = ServerlessRustPlugin;
