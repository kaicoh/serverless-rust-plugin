'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawnSync } = require('child_process');
const Cargo = require('./lib/cargo');
const CargoLambda = require('./lib/cargolambda');
const Docker = require('./lib/docker');
const request = require('./lib/request');

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

function readFileSyncIfExist(filePath) {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }

  return undefined;
}

function copyFile(src, dist) {
  fs.createReadStream(src).pipe(fs.createWriteStream(dist));
}

function hasSpawnError({ status }) {
  return typeof status !== 'number' || status > 0;
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

    this.commands = {
      'rust:invoke:local': {
        usage: 'Invoke lambda function locally according to architecture defined in provider using docker container.',
        lifecycleEvents: ['invoke'],
        options: {
          function: {
            usage: 'The name of the function in your service that you want to invoke locally. Required.',
            shortcut: 'f',
            type: 'string',
            required: true,
          },
          path: {
            usage: 'The path to a JSON file holding input data to be passed to the invoked function as the event. This path is relative to the root directory of the service.',
            shortcut: 'p',
            type: 'string',
          },
          data: {
            usage: 'String containing data to be passed as an event to your function. Keep in mind that if you pass both --path and --data, the data included in the --path file will overwrite the data you passed with the --data flag.',
            shortcut: 'd',
            type: 'string',
          },
          env: {
            usage: 'String representing an environment variable to set when invoking your function, in the form <name>=<value>. Can be repeated for more than one environment variable.',
            shortcut: 'e',
            type: 'multiple',
          },
          'env-file': {
            usage: 'The path to a file of environment variables to pass to docker container. This path is relative to the root directory of the service.',
            type: 'string',
          },
          port: {
            usage: 'The port number docker container exposes to accept request.',
            type: 'string',
            default: '9000',
          },
          'docker-args': {
            usage: 'Additional arguments passed to `docker run` command for lambda function container.',
            type: 'string',
          },
          stdout: {
            usage: 'The lambda function outputs to stdout. default is stderr',
            type: 'boolean',
          },
        },
      },
    };

    this.hooks = {
      'before:package:createDeploymentArtifacts': this.buildZip.bind(this),
      'before:deploy:function:packageFunction': this.buildZip.bind(this),
      'before:rust:invoke:local:invoke': this.beforeInvokeLocal.bind(this),
      'rust:invoke:local:invoke': this.invokeLocal.bind(this),
      'after:rust:invoke:local:invoke': this.stopDocker.bind(this),
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
  //     handler: cargo-package-name.bin-name
  //
  //   nonRustFunc:
  //     handler: non-of-the-above
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

  cargoLambdaBuild(options) {
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

    return artifacts;
  }

  run(options) {
    const artifacts = this.cargoLambdaBuild(options);

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

  readJsonFile() {
    if (!this.options.path) {
      return {};
    }

    const filePath = path.resolve(this.srcPath, this.options.path);
    const fileStr = readFileSyncIfExist(filePath);

    if (!fileStr) {
      throw this.error(`File does not exist at ${filePath}`);
    }

    return this.strToJSON(fileStr);
  }

  strToJSON(str) {
    try {
      return JSON.parse(str);
    } catch (err) {
      throw this.error(`Cannot parse to JSON: ${str}`);
    }
  }

  dockerPort() {
    const port = parseInt(this.options.port, 10);

    if (Number.isNaN(port)) {
      throw this.error(`port must be an integer: ${this.options.port}`);
    }

    return port;
  }

  invokeOptions() {
    return {
      port: this.dockerPort(),
      retryCount: 3,
      retryInterval: 1000,
      stdout: this.options.stdout || false,
      env: this.options.env || [],
      data: {
        ...this.readJsonFile(),
        ...this.strToJSON(this.options.data || '{}'),
      },
    };
  }

  buildAndStartDocker() {
    // Exec binary build
    this.log.info('Execute binary build');
    const options = this.buildOptions({ format: CargoLambda.format.binary });
    const artifacts = this.cargoLambdaBuild(options);

    // Find artifact from function name
    const funcName = this.options.function;
    const artifact = artifacts.getAll().find(({ name }) => {
      const func = this.serverless.service.getFunction(funcName);

      if (!func || !func.handler) {
        throw this.error(`Not found function: ${funcName}`);
      }

      return func.handler === name;
    });

    if (!artifact) {
      throw this.error(`Not found rust function: ${funcName}`);
    }

    this.log.info('Use this artifact');
    this.log.info(`  bin: ${artifact.name}`);
    this.log.info(`  path: ${artifact.path}`);

    // docker run
    const containerName = 'sls-rust-plugin';
    this.docker = new Docker({
      name: containerName,
      arch: options.arch,
      bin: path.basename(artifact.path),
      env: this.options.env || [],
      envFile: this.options['env-file'],
      binDir: path.dirname(artifact.path),
      port: this.dockerPort(),
      addArgs: this.options['docker-args'],
    });

    this.log.info(`Docker run: ${this.docker.runCommand()}`);

    const result = this.docker.run(spawnSync);

    if (hasSpawnError(result)) {
      throw this.error(`docker run error: ${result.error} ${result.status}`);
    }

    this.log.info(`Docker container is running. Name: ${containerName}`);
  }

  async requestToDocker() {
    const options = this.invokeOptions();

    // For readable output, insert a new line to console.
    process.stderr.write('\n');

    try {
      const res = await request.invokeLambda(http.request, options);
      this.log.info(res);
    } catch (err) {
      throw this.error(err);
    }
  }

  stopDocker({ silent } = { silent: false }) {
    if (this.docker && this.docker.running(spawnSync)) {
      const result = this.docker.stop(spawnSync);

      if (hasSpawnError(result)) {
        throw this.error(`docker stop error: ${result.error} ${result.status}`);
      }

      if (!silent) {
        this.log.success('Now docker container has been stopped successfully.');
      }
    }
  }

  // just a wrapper function needs to stop docker container
  beforeInvokeLocal() {
    this.log.info(this.options);

    try {
      this.buildAndStartDocker();
    } catch (err) {
      this.stopDocker({ silent: true });
      throw err;
    }
  }

  // just a wrapper function needs to stop docker container
  async invokeLocal() {
    try {
      await this.requestToDocker();
    } catch (err) {
      this.stopDocker({ silent: true });
      throw err;
    }
  }
}

module.exports = ServerlessRustPlugin;
