'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
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

function copyFile(src, dist) {
  fs.createReadStream(src).pipe(fs.createWriteStream(dist));
}

class ServerlessRustPlugin {
  constructor(serverless, options, { log }) {
    this.serverless = serverless;
    this.options = options;
    this.log = log;
    this.servicePath = this.serverless.config.servicePath || '';
    this.srcPath = path.resolve(this.servicePath);
    this.custom = {
      cargoPath: path.join(this.srcPath, 'Cargo.toml'),
      useDocker: true,
      ...((this.serverless.service.custom && this.serverless.service.custom.rust) || {}),
    };
    this.cargo = new Cargo(this.custom.cargoPath);

    this.hooks = {
      'before:package:createDeploymentArtifacts': this.buildZip.bind(this),
      'before:deploy:function:packageFunction': this.buildZip.bind(this),
    };
  }

  deployArtifactDir(profile) {
    return path.join(this.srcPath, 'target/lambda', profile);
  }

  buildOptions(options = {}) {
    return {
      useDocker: this.custom.useDocker,
      srcPath: this.srcPath,
      dockerImage: `${DEFAULT_DOCKER_IMAGE}:${DEFAULT_DOCKER_TAG}`,
      profile: this.custom.cargoProfile || CargoLambda.profile.release,
      arch: this.serverless.service.provider.architecture || CargoLambda.architecture.x86_64,
      format: CargoLambda.format.zip,
      ...options,
    };
  }

  // MEMO:
  // This plugin recognize rust function whether its handler value satisfies the syntax or not.
  // [[syntax]]
  // functions:
  //   rustFuncOne:
  //     handler: cargo-package-name
  //
  //   rustFuncTwo:
  //     handler: cargo-cackage-name.bin-name
  //
  //   nonRustFunc:
  //     handler: non-of-the-abave
  getRustFunctions() {
    const { service } = this.serverless;
    const binaryNames = this.cargo.binaries();

    return service.getAllFunctions().flatMap((funcName) => {
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
  modifyFunctions({ artifacts, options }) {
    const { service } = this.serverless;
    const rustFunctions = this.getRustFunctions();
    const targetDir = this.deployArtifactDir(options.profile);

    const useZip = options.format === CargoLambda.format.zip;
    const ext = useZip ? '.zip' : '';

    this.log.info('Modify rust function definitions');

    rustFunctions.forEach((funcName) => {
      const func = service.getFunction(funcName);
      const binaryName = func.handler;

      const buildArtifactPath = artifacts.path(binaryName);
      const deployArtifactPath = path.join(targetDir, `${funcName}${ext}`);

      copyFile(buildArtifactPath, deployArtifactPath);

      const handler = useZip ? 'bootstrap' : path.basename(deployArtifactPath);

      this.log.info(funcName);
      this.log.info(`  handler: ${handler}`);
      this.log.info('  package:');
      this.log.info(`    artifact: ${deployArtifactPath}`);
      this.log.info('    individually: true');

      func.handler = handler;
      func.package = {
        ...(func.package || {}),
        artifact: deployArtifactPath,
        individually: true,
      };
    });
  }

  run(options) {
    if (this.serverless.service.provider.name !== 'aws') {
      throw this.error('Provider must be "aws" to use this plugin');
    }

    const rustFunctions = this.getRustFunctions();

    if (rustFunctions.length === 0) {
      throw this.error(
        'Error: no Rust functions found. '
        + 'Use "handler: {cargo-package-name}.{bin-name}" or "handler: {cargo-package-name}" '
        + 'in function configuration to use this plugin.',
      );
    }

    const builder = new CargoLambda(this.cargo, options);

    this.log.info('Start Cargo Lambda build');
    this.log.info(builder.howToBuild());
    this.log.info(`Running "${builder.buildCommand()}"`);

    const { result, artifacts } = builder.build(spawnSync, NO_OUTPUT_CAPTURE);

    if (result.error || result.status > 0) {
      throw this.error(`Rust build encountered an error: ${result.error} ${result.status}.`);
    }

    this.log.info('Complete Cargo Lambda build');

    artifacts.getAll().forEach(({ path: artifactPath }) => {
      this.log.info(`build artifact: ${artifactPath}`);
    });

    const targetDir = this.deployArtifactDir(options.profile);
    mkdirSyncIfNotExist(targetDir);

    this.modifyFunctions({ artifacts, options });

    this.log.success('Complete building rust functions');
  }

  buildZip() {
    const options = this.buildOptions({ format: CargoLambda.format.zip });
    this.run(options);
  }

  buildBinary() {
    const options = this.buildOptions({ format: CargoLambda.format.binary });
    this.run(options);
  }

  error(message) {
    return new this.serverless.classes.Error(message);
  }
}

module.exports = ServerlessRustPlugin;
