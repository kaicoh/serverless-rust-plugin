'use strict';

const path = require('path');
const _get = require('lodash.get');
const {
  from,
  tap,
  map,
  combineLatest,
  filter,
  reduce,
  mergeMap,
} = require('rxjs');
const Table = require('table');
const Cargo = require('./lib/cargo');
const CargoLambda = require('./lib/cargolambda');
const Container = require('./lib/container');
const lambda = require('./lib/lambda');
const utils = require('./lib/utils');

// https://serverless.com/blog/writing-serverless-plugins/
// https://serverless.com/framework/docs/providers/aws/guide/plugins/

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
      'rust:logs': {
        usage: 'Outputs lambda function logs for docker containers.',
        lifecycleEvents: ['show'],
        options: {
          function: {
            usage: 'The name of the function to show logs.',
            shortcut: 'f',
            type: 'multiple',
          },
          color: {
            usage: 'Output logs with colored function name',
            type: 'boolean',
          },
          all: {
            usage: 'Output all logs from the container',
            type: 'boolean',
          },
          watch: {
            usage: 'Keep streaming logs until SIGINT',
            shortcut: 'w',
            type: 'boolean',
          },
        },
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

      'rust:logs:show': this.showLogs$.bind(this),

      'before:rust:invoke:execute': this.buildBinary.bind(this),
      'rust:invoke:execute': this.invokeFunction.bind(this),
      'after:rust:invoke:execute': this.stopContainers.bind(this),

      'rust:stop:stop': this.stopContainers.bind(this),
      'after:rust:stop:stop': this.showContainerStatus.bind(this),
    };
  }

  async initialize() {
    // escape original handlers before overwriting
    this.originalHandlers = new Map();

    return this.rustFunctions$.forEach(({ name }) => {
      const func = this.getFunction(name);
      this.originalHandlers.set(name, func.handler);
    });
  }

  // `Static` config from serverless.yml. This is distinguished from `Dynamic` options.
  get config() {
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
        envFile: _get(custom, ['local', 'envFile']),
        dockerArgs: _get(custom, ['local', 'dockerArgs']),
      },
    };
  }

  getFunction(funcName) {
    return this.serverless.service.getFunction(funcName);
  }

  buildArtifactPath(funcName) {
    const binName = this.originalHandlers.get(funcName);
    return this.artifacts.path(binName);
  }

  deployArtifactDir(profile) {
    return path.join(this.srcPath, 'target/lambda', profile);
  }

  buildOptions({ format }) {
    return {
      format,
      srcPath: this.config.srcPath,
      ...this.config.cargoLambda,
    };
  }

  // MEMO:
  // If multiple artifacts have same file name like bootstrap.zip,
  // the serverless framework fails to deploy each artifacts correctly.
  // But cargo lambda builds all artifacts into same name bootstrap(.zip),
  // so this plugin copies artifacts using each function name and deploys them.
  // See: https://github.com/serverless/serverless/issues/3696
  modifyFunctions$(options) {
    const targetDir = this.deployArtifactDir(options.profile);

    const useZip = options.format === CargoLambda.format.zip;
    const ext = useZip ? '.zip' : '';

    return this.rustFunctions$
      .pipe(
        map(({ name }) => {
          const buildPath = this.buildArtifactPath(name);
          const deployPath = path.join(targetDir, `${name}${ext}`);

          return {
            name,
            buildPath,
            deployPath,
          };
        }),

        tap(({ name, deployPath }) => {
          const func = this.getFunction(name);
          const handler = useZip ? 'bootstrap' : path.basename(deployPath);

          this.log.info(name);
          this.log.info(`  handler: ${handler}`);
          this.log.info('  package:');
          this.log.info(`    artifact: ${deployPath}`);
          this.log.info('    individually: true');

          func.handler = handler;
          func.package = {
            ...(func.package || {}),
            artifact: deployPath,
            individually: true,
          };
        }),

        mergeMap(({ buildPath, deployPath }) => utils.copyFile(buildPath, deployPath)),
      );
  }

  build$(options) {
    if (this.serverless.service.provider.name !== 'aws') {
      throw this.error('Provider must be "aws" to use this plugin');
    }

    return this.rustFunctionCount$
      .pipe(
        tap((total) => {
          if (total === 0) {
            throw this.error(
              'Error: no Rust functions found. '
              + 'Use "handler: {cargo-package-name}.{bin-name}" or "handler: {cargo-package-name}" '
              + 'in function configuration to use this plugin.',
            );
          }

          this.log.info('Start Cargo Lambda build');
        }),

        mergeMap(() => CargoLambda.build(this.cargo, options, { log: this.log })),

        tap(({ result, artifacts }) => {
          if (utils.hasSpawnError(result)) {
            const { error, code } = result;
            throw this.error(`Rust build encountered an error. Exit code: ${code}. ${error}`);
          }

          this.artifacts = artifacts;
          this.log.info('Complete Cargo Lambda build');

          artifacts.getAll().forEach(({ path: artifactPath }) => {
            this.log.info(`build artifact: ${artifactPath}`);
          });
        }),
      );
  }

  async package() {
    const options = this.buildOptions({ format: CargoLambda.format.zip });

    return this.build$(options)
      .pipe(
        tap(() => {
          const targetDir = this.deployArtifactDir(options.profile);
          utils.mkdirSyncIfNotExist(targetDir);
        }),

        mergeMap(() => this.modifyFunctions$(options)),
      )
      .forEach(() => {
        this.log.info('Complete building rust function');
      });
  }

  error(message) {
    return new this.serverless.classes.Error(message);
  }

  jsonFromPathOption() {
    if (!this.options.path) {
      return {};
    }

    const filePath = path.resolve(this.srcPath, this.options.path);
    const fileStr = utils.readFileSyncIfExist(filePath);

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

  rustFunction(funcName) {
    const func = this.getFunction(funcName);
    const port = parseInt(_get(func, ['rust', 'port'], '0'), 10);

    if (Number.isNaN(port)) {
      throw this.error('port number must be an integer');
    }

    return {
      name: funcName,
      config: {
        containerName: _get(func, ['rust', 'containerName']) || `${this.config.service}_${funcName}`,
        port,
        envFile: _get(func, ['rust', 'envFile']) || this.config.local.envFile,
        env: { ...this.config.environment, ...func.environment },
        dockerArgs: _get(func, ['rust', 'dockerArgs']) || this.config.local.dockerArgs,
      },
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
  get rustFunctions$() {
    const { service } = this.serverless;
    const bins = this.cargo.binaries();

    return from(service.getAllFunctions())
      .pipe(
        filter((funcName) => {
          const func = this.getFunction(funcName);
          return bins.some((bin) => bin === func.handler);
        }),

        map((funcName) => this.rustFunction(funcName)),
      );
  }

  get rustFunctionCount$() {
    return this.rustFunctions$.pipe(reduce((acc) => acc + 1, 0));
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
    const options = this.buildOptions({ format: CargoLambda.format.binary });
    return this.build$(options).forEach(() => {
      this.log.info('Binary build succeeded');
    });
  }

  async startContainer(container) {
    const options = {
      artifact: this.buildArtifactPath(container.funcName),
      arch: this.config.cargoLambda.arch,
    };

    return container.start(options);
  }

  async startContainers() {
    return this.rustContainers$(this.options.function)
      .pipe(
        // start the container process if it has not started yet.
        mergeMap(this.startContainer.bind(this)),
      )
      // Change observable to promise to let node.js know startContainers as an async function.
      // And wait starting next hook until this promise resolves.
      .forEach((container) => {
        this.log.info(`The container "${container.name}" has started`);
      });
  }

  showContainerStatus() {
    const headers = ['FUNCTION', 'CONTAINER NAME', 'STATUS', 'PORTS'];

    return this.rustContainers$()
      .pipe(
        map(Container.tableRow),
        reduce((rows, row) => [...rows, row], [headers]),
      )
      .subscribe((rows) => {
        process.stderr.write('\n');
        process.stderr.write(Table.table(rows));
        process.stderr.write('\n');
      });
  }

  showLogs$() {
    const runningContainers$ = this.rustContainers$(this.options.function)
      .pipe(filter((container) => container.isRunning));

    const prefixSize$ = runningContainers$
      .pipe(
        map((container) => container.funcName),

        reduce((names, name) => [...names, name], []),

        map((names) => {
          const [longestName] = names.sort((a, b) => b.length - a.length);
          return longestName ? longestName.length + 1 : 0;
        }),
      );

    return combineLatest([prefixSize$, runningContainers$])
      .pipe(
        map(([prefixSize, container], index) => {
          const color = this.options.color === false
            ? utils.color.default : utils.color.fromIndex(index);

          return container.logStreams({
            color,
            prefixSize,
            all: this.options.all === true,
            watch: this.options.watch === true,
          });
        }),
      )
      .subscribe((logStreams) => {
        logStreams.forEach((stream) => {
          stream.pipe(process.stderr);
        });
      });
  }

  async invokeFunction() {
    const options = {
      retryCount: 3,
      retryInterval: 1000,
      stdout: this.options.stdout || false,
      data: {
        ...this.jsonFromPathOption(),
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
            this.log.error(container.format());
            throw this.error('Cannot get host port binding to 8080/tcp');
          }

          return lambda.invoke({ ...options, port });
        }),
      )
      // Change to promise to wait starting next hook event.
      .forEach(() => {
        this.log.info('The invocation has been succeeded');
      });
  }

  async stopContainers() {
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
      .forEach((container) => {
        this.log.info(`The container ${container.name} has stopped`);
      });
  }
}

module.exports = ServerlessRustPlugin;
