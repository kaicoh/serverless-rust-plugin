'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawnSync } = require('child_process');
const _get = require('lodash.get');
const {
  from,
  zip,
  map,
  filter,
  reduce,
  mergeMap,
} = require('rxjs');
const { table } = require('table');
const Cargo = require('./lib/cargo');
const CargoLambda = require('./lib/cargolambda');
const Container = require('./lib/container');
const Docker = require('./lib/docker');
const request = require('./lib/request');

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

    this.serverless.configSchemaHandler.defineFunctionProperties('aws', {
      properties: {
        rust: {
          type: 'object',
          properties: {
            containerName: { type: 'string' },
            port: { type: 'number' },
            envFile: { type: 'string' },
            dockerArgs: { type: 'string' },
          },
          required: [],
          additionalProperties: false,
        },
        required: false,
        additionalProperties: false,
      },
    });

    this.options = options;
    this.log = log;
    this.srcPath = path.resolve(this.serverless.config.servicePath || '');
    this.cargo = new Cargo(path.join(this.srcPath, 'Cargo.toml'));

    this.commands = {
      'rust:start': {
        usage: 'Start the docker container processes according to configurations and options at once',
        lifecycleEvents: ['start'],
        options: {
          function: {
            usage: 'The name of the function to start the docker container. If not given, all the rust function starts',
            shortcut: 'f',
            type: 'multiple',
          },
        },
      },
      'rust:ps': {
        usage: 'Outputs current status for docker containers',
        lifecycleEvents: ['show'],
      },
      'rust:invoke': {
        usage: 'Invoke lambda function locally according to configurations and options',
        lifecycleEvents: ['execute'],
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
          stdout: {
            usage: 'The lambda function outputs to stdout. default is stderr',
            type: 'boolean',
          },
        },
      },
      'rust:stop': {
        usage: 'Stop all docker container process according to configurations and options',
        lifecycleEvents: ['stop'],
        options: {
          function: {
            usage: 'The name of the function to stop the docker container. If not given, all the rust function stops',
            shortcut: 'f',
            type: 'multiple',
          },
        },
      },
    };

    this.hooks = {
      initialize: this.initialize.bind(this),

      'before:package:createDeploymentArtifacts': this.package.bind(this),
      'before:deploy:function:packageFunction': this.package.bind(this),

      'before:rust:start:start': this.buildBinary.bind(this),
      'rust:start:start': this.startContainers.bind(this),
      'after:rust:start:start': this.showContainerStatus.bind(this),

      'rust:ps:show': this.showContainerStatus.bind(this),

      'before:rust:invoke:execute': this.beforeInvokeCommand.bind(this),
      'rust:invoke:execute': this.invokeCommand.bind(this),
      'after:rust:invoke:execute': this.afterInvokeCommand.bind(this),

      'rust:stop:stop': this.stopCommand.bind(this),
    };
  }

  initialize() {
    // escape original handlers before overwriting
    this.originalHandlers = new Map();
    this.rustFunctions.forEach((func, funcName) => {
      this.originalHandlers.set(funcName, func.handler);
    });
  }

  // `Static` settings from serverless.yml. This is distinguished from `Dynamic` options.
  get settings() {
    const { service } = this.serverless;
    const custom = _get(service, ['custom', 'rust'], {});

    return {
      service: service.service || _get(service, ['serviceObject', 'name'], ''),

      srcPath: this.srcPath,

      environment: this.serverless.service.provider.environment || {},

      cargoLambda: {
        docker: _get(custom, ['cargoLambda', 'docker'], true),
        profile: _get(custom, ['cargoLambda', 'profile'], CargoLambda.profile.release),
        arch: this.serverless.service.provider.architecture || CargoLambda.architecture.x86_64,
      },

      local: {
        port: _get(custom, ['local', 'port']),
        envFile: _get(custom, ['local', 'envFile']),
        dockerArgs: _get(custom, ['local', 'dockerArgs']),
      },
    };
  }

  buildArtifactPath(funcName) {
    const binName = this.originalHandlers.get(funcName);
    return this.artifacts.path(binName);
  }

  deployArtifactDir(profile) {
    return path.join(this.srcPath, 'target/lambda', profile);
  }

  cargoLambdaOptions({ format }) {
    return {
      format,
      srcPath: this.settings.srcPath,
      ...this.settings.cargoLambda,
    };
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

  dockerOptions({ artifactPath }) {
    return {
      name: 'sls-rust-plugin',
      port: this.dockerPort(),
      arch: this.settings.cargoLambda.arch,
      bin: path.basename(artifactPath),
      binDir: path.dirname(artifactPath),
      env: this.options.env,
      envFile: this.options['env-file'] || this.settings.local.envFile,
      addArgs: this.options['docker-args'] || this.settings.local.dockerArgs,
    };
  }

  getRustFunctions() {
    return Array.from(this.rustFunctions.keys());
  }

  // MEMO:
  // If multiple artifacts have same file name like bootstrap.zip,
  // the serverless framework fails to deploy each artifacts correctly.
  // But cargo lambda builds all artifacts into same name bootstrap(.zip),
  // so this plugin copies artifacts using each function name and deploys them.
  // See: https://github.com/serverless/serverless/issues/3696
  modifyFunctions({ options }) {
    const targetDir = this.deployArtifactDir(options.profile);

    const useZip = options.format === CargoLambda.format.zip;
    const ext = useZip ? '.zip' : '';

    this.log.info('Modify rust function definitions');

    this.rustFunctions.forEach((func, funcName) => {
      const buildArtifactPath = this.buildArtifactPath(funcName);
      const deployArtifactPath = path.join(targetDir, `${funcName}${ext}`);

      copyFile(buildArtifactPath, deployArtifactPath);

      const handler = useZip ? 'bootstrap' : path.basename(deployArtifactPath);

      this.log.info(funcName);
      this.log.info(`  handler: ${handler}`);
      this.log.info('  package:');
      this.log.info(`    artifact: ${deployArtifactPath}`);
      this.log.info('    individually: true');

      /* eslint-disable no-param-reassign */
      func.handler = handler;
      func.package = {
        ...(func.package || {}),
        artifact: deployArtifactPath,
        individually: true,
      };
      /* eslint-enable no-param-reassign */
    });
  }

  async build(options) {
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

    const { result, artifacts } = await CargoLambda.build(this.cargo, options, { log: this.log });

    if (result.error || result.status > 0) {
      throw this.error(`Rust build encountered an error: ${result.error} ${result.status}.`);
    }

    this.artifacts = artifacts;
    this.log.info('Complete Cargo Lambda build');

    artifacts.getAll().forEach(({ path: artifactPath }) => {
      this.log.info(`build artifact: ${artifactPath}`);
    });
  }

  package() {
    const options = this.cargoLambdaOptions({ format: CargoLambda.format.zip });
    this.build(options);

    const targetDir = this.deployArtifactDir(options.profile);
    mkdirSyncIfNotExist(targetDir);

    this.modifyFunctions({ options });

    this.log.success('Complete building rust functions');
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
    // options.port is used when both custom.local.port and options.port are set.
    const strPort = this.options.port || this.settings.local.port || '9000';
    const port = parseInt(strPort, 10);

    if (Number.isNaN(port)) {
      throw this.error(`port must be an integer: ${strPort}`);
    }

    return port;
  }

  buildAndStartDocker() {
    // Exec binary build
    this.log.info('Execute binary build');
    const options = this.cargoLambdaOptions({ format: CargoLambda.format.binary });
    const artifacts = this.build(options);

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
    this.startDocker({ artifactPath: artifact.path });
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

  startDocker({ artifactPath }) {
    const options = this.dockerOptions({ artifactPath });
    this.docker = new Docker(options);

    this.log.info(`Docker run: ${this.docker.runCommand()}`);
    const result = this.docker.run(spawnSync);

    if (hasSpawnError(result)) {
      throw this.error(`docker run error: ${result.status}`);
    }
    this.log.info(`Docker container is running. Name: ${options.name}`);
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
  // Return Map<string, object>
  //   key: function name
  //   value: function configuration object
  get rustFunctions() {
    const { service } = this.serverless;
    const binaryNames = this.cargo.binaries();

    const functions = new Map();

    service.getAllFunctions().forEach((funcName) => {
      const func = service.getFunction(funcName);

      if (binaryNames.some((bin) => bin === func.handler)) {
        functions.set(funcName, func);
      }
    });

    return functions;
  }

  get funcSettings() {
    const settings = new Map();

    this.rustFunctions.forEach((func, funcName) => {
      settings.set(funcName, {
        containerName: _get(func, ['rust', 'containerName']) || `${this.settings.service}_${funcName}`,
        port: _get(func, ['rust', 'port'], 0),
        envFile: _get(func, ['rust', 'envFile']) || this.settings.local.envFile,
        env: { ...this.settings.environment, ...func.environment },
        dockerArgs: _get(func, ['rust', 'dockerArgs']) || this.settings.local.dockerArgs,
      });
    });

    return settings;
  }

  get funcSettings$() {
    return from(this.funcSettings);
  }

  get currentContainers$() {
    return this.funcSettings$.pipe(
      mergeMap(([, { containerName }]) => Container.get(containerName)),
    );
  }

  functionAndContainers$(funcNames) {
    return zip(this.funcSettings$, this.currentContainers$)
      .pipe(
        // MEMO:
        // if funcNames is provided, filter functions. if not, all functions pass.
        filter(([[funcName]]) => {
          if (Array.isArray(funcNames)) {
            return funcNames.some((name) => name === funcName);
          }

          return true;
        }),
        map(([[funcName, funcSetting], container]) => ({
          funcName,
          funcSetting,
          container,
        })),
      );
  }

  async buildBinary() {
    // before:rust:start:start event
    const options = this.cargoLambdaOptions({ format: CargoLambda.format.binary });
    await this.build(options);
  }

  async startContainers() {
    // rust:start:start event
    // 1. collect settings
    // 2. get current docker container status
    return this.functionAndContainers$(this.options.function)
      .pipe(
        // 3. start the container process if it has not started yet.
        mergeMap(({ funcName, funcSetting, container }) => {
          const options = {
            artifact: this.buildArtifactPath(funcName),
            arch: this.settings.cargoLambda.arch,
            ...funcSetting,
          };

          return container.start(options);
        }),
      )
      // Change observable to promise to let node.js know startCommand as an async function.
      // And wait starting next after:rust:start:start hook until this promise resolves.
      .forEach(({ message }) => {
        this.log.info(message);
      });
  }

  showContainerStatus() {
    const headers = ['FUNCTION', 'CONTAINER NAME', 'STATUS', 'PORTS'];

    return this.functionAndContainers$()
      .pipe(
        map(({ funcName, container }) => container.format(funcName)),
        reduce((rows, row) => [...rows, row], [headers]),
      )
      .subscribe((rows) => {
        process.stderr.write('\n');
        process.stderr.write(table(rows));
        process.stderr.write('\n');
      });
  }

  beforeInvokeCommand() {
    // before:rust:invoke:execute event
    // 1. collect settings
    // 2. get current docker container status
    // 3. determine which container to start or not to start(already running)
    // 4. start the container
    this.log.info('before invoke command called');
  }

  invokeCommand() {
    // rust:invoke:execute event
    // 1. collect settings
    // 2. execute http request to invoke
    // 3. show output
    this.log.info('invoke command called');
  }

  afterInvokeCommand() {
    // after:rust:invoke:execute event
    // 1. collect settings
    // 2. get current docker container status
    // 3. determine which container to stop or not to stop(already running)
    // 4. stop the container
    this.log.info('after invoke command called');
  }

  stopCommand() {
    // rust:stop:stop event
    // 1. collect settings
    // 2. get current docker container status
    // 3. determine which containers to stop
    // 4. stop the containers
    this.log.info('stop command called');
  }
}

module.exports = ServerlessRustPlugin;
