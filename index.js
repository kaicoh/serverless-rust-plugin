'use strict';

const path = require('path');
const fs = require('fs');
const _get = require('lodash.get');
const {
  from,
  tap,
  map,
  filter,
  reduce,
  mergeMap,
} = require('rxjs');
const { table } = require('table');
const Cargo = require('./lib/cargo');
const CargoLambda = require('./lib/cargolambda');
const Container = require('./lib/container');
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

      'before:rust:invoke:execute': this.buildBinary.bind(this),
      'rust:invoke:execute': this.invokeFunction.bind(this),
      'after:rust:invoke:execute': this.stopContainers.bind(this),

      'rust:stop:stop': this.stopContainers.bind(this),
      'after:rust:stop:stop': this.showContainerStatus.bind(this),
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

  rustFunction(funcName) {
    const { service } = this.serverless;
    const func = service.getFunction(funcName);

    return {
      name: funcName,
      config: {
        containerName: _get(func, ['rust', 'containerName']) || `${this.settings.service}_${funcName}`,
        port: _get(func, ['rust', 'port'], 0),
        envFile: _get(func, ['rust', 'envFile']) || this.settings.local.envFile,
        env: { ...this.settings.environment, ...func.environment },
        dockerArgs: _get(func, ['rust', 'dockerArgs']) || this.settings.local.dockerArgs,
      },
    };
  }

  get rustFunctions$() {
    const { service } = this.serverless;
    const bins = this.cargo.binaries();

    return from(service.getAllFunctions())
      .pipe(
        filter((funcName) => {
          const func = service.getFunction(funcName);
          return bins.some((bin) => bin === func.handler);
        }),
        map((funcName) => this.rustFunction(funcName)),
      );
  }

  // Assume funcNames is undefined | string | string[].
  rustContainers$(funcNames) {
    return this.rustFunctions$
      .pipe(
        // Use filtering if the argument is provided.
        filter(({ name }) => {
          if (Array.isArray(funcNames)) {
            return funcNames.some((funcName) => name === funcName);
          }

          if (typeof funcNames === 'string') {
            return name === funcNames;
          }

          return true;
        }),

        mergeMap(({ name, config }) => Container.get({ name, config })),
      );
  }

  async buildBinary() {
    // before:rust:start:start event
    const options = this.cargoLambdaOptions({ format: CargoLambda.format.binary });
    return this.build(options);
  }

  async startContainer(container) {
    const options = {
      artifact: this.buildArtifactPath(container.funcName),
      arch: this.settings.cargoLambda.arch,
    };

    return container.start(options);
  }

  async startContainers() {
    // rust:start:start event
    // 1. collect settings
    // 2. get current docker container status
    return this.rustContainers$(this.options.function)
      .pipe(
        // 3. start the container process if it has not started yet.
        mergeMap(this.startContainer.bind(this)),
      )
      // Change observable to promise to let node.js know startCommand as an async function.
      // And wait starting next after:rust:start:start hook until this promise resolves.
      .forEach(() => {
        this.log.info('The all containers have started');
      });
  }

  showContainerStatus() {
    const headers = ['FUNCTION', 'CONTAINER NAME', 'STATUS', 'PORTS'];

    return this.rustContainers$()
      .pipe(
        map((container) => container.format()),
        reduce((rows, row) => [...rows, row], [headers]),
      )
      .subscribe((rows) => {
        process.stderr.write('\n');
        process.stderr.write(table(rows));
        process.stderr.write('\n');
      });
  }

  invokeFunction() {
    const options = {
      retryCount: 3,
      retryInterval: 1000,
      stdout: this.options.stdout || false,
      data: {
        ...this.readJsonFile(),
        ...this.strToJSON(this.options.data || '{}'),
      },
    };

    this.containersToStop = [];

    return this.rustContainers$(this.options.function)
      .pipe(
        // If the container is not running, we stop it after the invocation.
        tap((container) => {
          if (!container.isRunning) {
            this.containersToStop.push(container.name);
          }
        }),

        mergeMap(this.startContainer.bind(this)),

        mergeMap((container) => {
          // For readable output, insert a new line to console.
          process.stderr.write('\n');

          const [port] = container.hostPortsTo(8080);

          if (!port) {
            this.log.error(container.show());
            throw this.error('Cannot get host port binding to 8080/tcp');
          }

          return request.invokeLambda({ ...options, port });
        }),
      )
      // Change to promise to wait starting next hook event.
      .forEach(() => {
        this.log.info('The invocation has been succeeded');
      });
  }

  stopContainers() {
    return this.rustContainers$(this.options.function)
      .pipe(
        // Use filtering if this.containersToStop property exists.
        filter((container) => {
          if (Array.isArray(this.containersToStop)) {
            return this.containersToStop
              .some((containerName) => containerName === container.name);
          }

          return true;
        }),

        mergeMap((container) => container.stop()),
      )
      .forEach(() => {
        this.log.info('The all containers have stopped');
      });
  }
}

module.exports = ServerlessRustPlugin;
