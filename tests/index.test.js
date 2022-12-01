const path = require('path');
const { reduce, of } = require('rxjs');
const Table = require('table');
const ServerlessRustPlugin = require('..');
const Cargo = require('../lib/cargo');
const CargoLambda = require('../lib/cargolambda');
const Container = require('../lib/container');
const lambda = require('../lib/lambda');
const mockUtils = require('../lib/utils');

jest.mock('table');
jest.mock('../lib/cargo');
jest.mock('../lib/cargolambda');
jest.mock('../lib/container');
jest.mock('../lib/lambda');
jest.mock('../lib/utils');

describe('ServerlessRustPlugin', () => {
  // An instance of ServerlessRustPlugin
  let plugin;

  // Arguments to instantiate ServerlessRustPlugin
  let serverless;
  let options;
  let utils;

  // project root directory
  const rootDir = path.join(__dirname, '..');

  function createMockServerless(custom = {}) {
    return {
      version: '3.24.1',
      service: {
        provider: {
          name: 'aws',
        },
        getAllFunctions: jest.fn(() => ['func0', 'func1']),
        getFunction: jest.fn(() => ({ handler: 'bin0' })),
        custom,
      },
      config: {},
      classes: { Error },
      configSchemaHandler: {
        defineFunctionProperties: jest.fn(),
      },
    };
  }

  beforeEach(() => {
    Cargo.mockClear();
    Cargo.mockImplementation(() => ({
      binaries: jest.fn(() => ['bin0', 'bin1']),
    }));

    serverless = createMockServerless();
    options = {};
    utils = {
      log: {
        info: jest.fn(),
        success: jest.fn(),
        notice: jest.fn(),
        error: jest.fn(),
      },
    };

    plugin = new ServerlessRustPlugin(serverless, options, utils);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    describe('envet hook', () => {
      const events = [
        'before:package:createDeploymentArtifacts',
        'before:deploy:function:packageFunction',
        'before:rust:start:start',
        'rust:start:start',
        'after:rust:start:start',
        'rust:ps:show',
        'rust:logs:show',
        'before:rust:invoke:execute',
        'rust:invoke:execute',
        'after:rust:invoke:execute',
        'rust:stop:stop',
        'after:rust:stop:stop',
      ];

      it.each(events)('"%s" defines', (event) => {
        expect(plugin.hooks[event]).toBeDefined();
      });
    });

    describe('when "serverless.config.servicePath" is undefined', () => {
      const expectedSrcPath = rootDir;

      beforeEach(() => {
        serverless.config = {};
        plugin = new ServerlessRustPlugin(serverless, options, utils);
      });

      it('sets "srcPath" property as expected', () => {
        expect(plugin.srcPath).toEqual(expectedSrcPath);
      });

      it('instantiates cargo object from "srcPath"', () => {
        const expected = path.join(expectedSrcPath, 'Cargo.toml');
        expect(Cargo).toHaveBeenCalledWith(expected);
      });
    });

    describe('when "serverless.config.servicePath" is defined', () => {
      const servicePath = 'some/path';
      const expectedSrcPath = path.join(rootDir, servicePath);

      beforeEach(() => {
        serverless.config = { servicePath };
        plugin = new ServerlessRustPlugin(serverless, options, utils);
      });

      it('sets "srcPath" property as expected', () => {
        expect(plugin.srcPath).toEqual(expectedSrcPath);
      });

      it('instantiates cargo object from "srcPath"', () => {
        const expected = path.join(expectedSrcPath, 'Cargo.toml');
        expect(Cargo).toHaveBeenCalledWith(expected);
      });
    });

    describe('commands', () => {
      const table = [
        /*
         * each item is following.
         * [command, lifecycleEvents, options]
         */
        [
          'rust:start',
          ['start'],
          [{
            name: 'function',
            def: { shortcut: 'f', type: 'multiple' },
          }],
        ],
        [
          'rust:ps',
          ['show'],
          [],
        ],
        [
          'rust:logs',
          ['show'],
          [{
            name: 'function',
            def: { shortcut: 'f', type: 'multiple' },
          }, {
            name: 'color',
            def: { type: 'boolean' },
          }, {
            name: 'all',
            def: { type: 'boolean' },
          }, {
            name: 'watch',
            def: { shortcut: 'w', type: 'boolean' },
          }],
        ],
        [
          'rust:invoke',
          ['execute'],
          [{
            name: 'function',
            def: { shortcut: 'f', type: 'string', required: true },
          }, {
            name: 'path',
            def: { shortcut: 'p', type: 'string' },
          }, {
            name: 'data',
            def: { shortcut: 'd', type: 'string' },
          }, {
            name: 'stdout',
            def: { type: 'boolean' },
          }],
        ],
        [
          'rust:stop',
          ['stop'],
          [{
            name: 'function',
            def: { shortcut: 'f', type: 'multiple' },
          }],
        ],
      ];

      describe.each(table)('%s command', (cmd, lifecycleEvents, opts) => {
        let command;

        beforeEach(() => {
          command = plugin.commands[cmd];
        });

        it('defines', () => {
          expect(command).toBeDefined();
        });

        it.each(lifecycleEvents)('has lifecycle event "%s"', (event) => {
          expect(command.lifecycleEvents).toEqual(expect.arrayContaining([event]));
        });

        // it.each doesn't accept an empty array.
        if (opts.length > 0) {
          it.each(opts)('has option "$name"', ({ name, def }) => {
            expect(command.options[name]).toEqual(expect.objectContaining(def));
          });
        }
      });
    });
  });

  describe('method: initialize', () => {
    let mock;
    /*
     * Suppose there are 2 rust functions in serverless.yml
     *
     * ```
     * functions
     *   rustFunc0:
     *     handler: unit-test.bin0
     *     ...
     *
     *   rustFunc1:
     *     handler: unit-test.bin1
     *     ...
     *  ```
     */
    beforeEach(() => {
      const rustFunctions = [{ name: 'rustFunc0' }, { name: 'rustFunc1' }];

      plugin.getFunction = jest.fn()
        .mockImplementationOnce(() => ({ handler: 'unit-test.bin0' }))
        .mockImplementationOnce(() => ({ handler: 'unit-test.bin1' }))
        .mockImplementation(() => ({ handler: 'non-rust-func' }));

      mock = jest.spyOn(plugin, 'rustFunctions$', 'get')
        .mockReturnValue({
          forEach: jest.fn((callback) => {
            rustFunctions.forEach((f) => callback(f));
            return Promise.resolve({});
          }),
        });
    });

    afterEach(() => {
      mock.mockRestore();
    });

    it('resolves with what plugin.rustFunctions$.forEach returns', async () => {
      await expect(plugin.initialize()).resolves.toEqual({});
    });

    it('defines plugin.originalHandlers as a Map instance', async () => {
      await plugin.initialize();
      expect(plugin.originalHandlers).toBeInstanceOf(Map);
    });

    it('escapes handler name for each functions', async () => {
      await plugin.initialize();
      expect(plugin.originalHandlers.get('rustFunc0')).toEqual('unit-test.bin0');
      expect(plugin.originalHandlers.get('rustFunc1')).toEqual('unit-test.bin1');
    });
  });

  describe('property: config', () => {
    describe('has "service" property', () => {
      it('is from serverless.service.service', () => {
        serverless.service.service = 'my-service';
        expect(plugin.config.service).toEqual('my-service');
      });

      it('is from serviceObject name if serverless.service.service is undefined', () => {
        serverless.service.service = undefined;
        serverless.service.serviceObject = { name: 'service-object' };
        expect(plugin.config.service).toEqual('service-object');
      });
    });

    describe('has "srcPath" property', () => {
      it('is equal to the directory serverless.yml is on', () => {
        expect(plugin.config.srcPath).toEqual(plugin.srcPath);
      });
    });

    describe('has "environment" property', () => {
      it('is from provider.environment settings', () => {
        serverless.service.provider.environment = { var: 'var' };
        expect(plugin.config.environment).toEqual({ var: 'var' });
      });

      it('is an empty object if provider.environment is undefined', () => {
        serverless.service.provider.environment = undefined;
        expect(plugin.config.environment).toEqual({});
      });
    });

    describe('has "cargoLambda.docker" property', () => {
      it('is from custom settings', () => {
        serverless.service.custom.rust = {
          cargoLambda: {
            docker: false,
          },
        };
        expect(plugin.config.cargoLambda.docker).toBe(false);
      });

      it('is true if custom.rust.cargoLambda.docker is undefined', () => {
        expect(plugin.config.cargoLambda.docker).toEqual(true);
      });
    });

    describe('has "cargoLambda.profile" property', () => {
      it('is from custom settings', () => {
        serverless.service.custom.rust = {
          cargoLambda: {
            profile: 'debug',
          },
        };
        expect(plugin.config.cargoLambda.profile).toEqual('debug');
      });

      it('is "release" if custom.rust.cargoLambda.profile is undefined', () => {
        expect(plugin.config.cargoLambda.profile).toEqual('release');
      });
    });

    describe('has "cargoLambda.arch" property', () => {
      it('is from provider.architecture settings', () => {
        serverless.service.provider.architecture = 'arm64';
        expect(plugin.config.cargoLambda.arch).toEqual('arm64');
      });

      it('is "x86_64" if provider.architecture is undefined', () => {
        expect(plugin.config.cargoLambda.arch).toEqual('x86_64');
      });
    });

    describe('has "local.envFile" property', () => {
      it('is from custom settings', () => {
        serverless.service.custom.rust = {
          local: {
            envFile: '.env',
          },
        };
        expect(plugin.config.local.envFile).toEqual('.env');
      });
    });

    describe('has "local.dockerArgs" property', () => {
      it('is from custom settings', () => {
        serverless.service.custom.rust = {
          local: {
            dockerArgs: '--some args',
          },
        };
        expect(plugin.config.local.dockerArgs).toEqual('--some args');
      });
    });
  });

  describe('method: getFunction', () => {
    let result;

    beforeEach(() => {
      serverless.service.getFunction = jest.fn(() => 'foobar');
      result = plugin.getFunction('some args');
    });

    it('passes the argument to serverless.service.getFunction', () => {
      expect(serverless.service.getFunction).toHaveBeenCalledWith('some args');
    });
    it('returns what serverless.service.getFunction returns', () => {
      expect(result).toEqual('foobar');
    });
  });

  describe('method: buildArtifactPath', () => {
    it('returns what plugin.artifacts.path returns', () => {
      plugin.originalHandlers = {
        get: jest.fn(() => 'bin'),
      };
      plugin.artifacts = {
        path: jest.fn(() => 'something'),
      };
      expect(plugin.buildArtifactPath('foo')).toEqual('something');
      expect(plugin.artifacts.path).toHaveBeenCalledWith('bin');
    });
  });

  describe('method: deployArtifactDir', () => {
    it('returns a string concantenating srcPath, target, lambda and given arg', () => {
      const expected = path.join(plugin.srcPath, 'target', 'lambda', 'arg');
      expect(plugin.deployArtifactDir('arg')).toEqual(expected);
    });
  });

  describe('method: buildOptions', () => {
    const args = { format: 'format' };

    describe('returns an object with property "docker"', () => {
      it('is true by default', () => {
        expect(plugin.buildOptions(args)).toEqual(expect.objectContaining({
          docker: true,
        }));
      });

      it('is overwritten by custom property in serverless.yml', () => {
        // serverless.yml
        //
        // custom
        //   rust:
        //     cargoLambda:
        //       docker: false
        serverless.service.custom.rust = { cargoLambda: { docker: false } };
        plugin = new ServerlessRustPlugin(serverless, options, utils);
        expect(plugin.buildOptions(args)).toEqual(expect.objectContaining({
          docker: false,
        }));
      });
    });

    describe('returns an object with property "srcPath"', () => {
      it('is equal to the project service path', () => {
        expect(plugin.buildOptions(args)).toEqual(expect.objectContaining({
          srcPath: plugin.srcPath,
        }));
      });
    });

    describe('returns an object with property "profile"', () => {
      it('is equal to "release" by default', () => {
        expect(plugin.buildOptions(args)).toEqual(expect.objectContaining({
          profile: 'release',
        }));
      });

      it('is overwritten by custom property in serverless.yml', () => {
        // serverless.yml
        //
        // custom
        //   rust:
        //     cargoLambda:
        //       profile: debug
        serverless.service.custom.rust = { cargoLambda: { profile: 'debug' } };
        plugin = new ServerlessRustPlugin(serverless, options, utils);
        expect(plugin.buildOptions(args)).toEqual(expect.objectContaining({
          profile: 'debug',
        }));
      });
    });

    describe('returns an object with property "arch"', () => {
      it('is equal to "x86_64" by default', () => {
        expect(plugin.buildOptions(args)).toEqual(expect.objectContaining({
          arch: 'x86_64',
        }));
      });

      it('is overwritten by provider property in serverless.yml', () => {
        serverless.service.provider.architecture = 'arm64';
        expect(plugin.buildOptions(args)).toEqual(expect.objectContaining({
          arch: 'arm64',
        }));
      });
    });

    describe('returns an object with property "format"', () => {
      it('is from given argument', () => {
        expect(plugin.buildOptions({ format: 'foo' })).toEqual(expect.objectContaining({
          format: 'foo',
        }));
      });
    });
  });

  describe('getter: rustFunctions$', () => {
    let result;
    let mock;

    beforeEach(() => {
      // Suppose there are 2 binary definitions in Cargo.toml
      // Cargo.toml
      //
      // [package]
      // name = unit-test
      // ...
      //
      // [[bin]]
      // name = "bin0"
      // ...
      //
      // [[bin]]
      // name = "bin1"
      // ...
      Cargo.mockImplementationOnce(() => ({
        binaries: jest.fn(() => ['unit-test.bin0', 'unit-test.bin1']),
      }));

      // And suppose there are 3 function definitions in serverless.yml
      //
      // serverless.yml
      //
      // functions
      //   rustFunc0:
      //     handler: unit-test.bin0
      //     ...
      //
      //   rustFunc1:
      //     handler: unit-test.bin1
      //     ...
      //
      //   nonRustFunc:
      //     handler: non-of-the-above
      serverless.service.getAllFunctions
        .mockImplementation(() => ['rustFunc0', 'rustFunc1', 'nonRustFunc']);

      serverless.service.getFunction
        .mockImplementation((func) => {
          switch (func) {
            case 'rustFunc0':
              return { handler: 'unit-test.bin0' };
            case 'rustFunc1':
              return { handler: 'unit-test.bin1' };
            default:
              return { handler: 'non-of-the-above' };
          }
        });

      plugin = new ServerlessRustPlugin(serverless, options, utils);
      mock = jest.spyOn(plugin, 'rustFunction');

      result = plugin.rustFunctions$;
    });

    afterEach(() => {
      mock.mockRestore();
    });

    it('returns an Observable includes only rust functions', (done) => {
      result
        .pipe(reduce((funcs, func) => [...funcs, func], []))
        .subscribe((funcs) => {
          expect(funcs).toHaveLength(2);

          expect(funcs.sort()).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'rustFunc0' }),
            expect.objectContaining({ name: 'rustFunc1' }),
          ]));

          done();
        });
    });

    it('calls plugin.rustFunction with rust function name', (done) => {
      result
        .pipe(reduce((funcs, func) => [...funcs, func], []))
        .subscribe(() => {
          expect(plugin.rustFunction).toHaveBeenCalledWith('rustFunc0');
          expect(plugin.rustFunction).toHaveBeenCalledWith('rustFunc1');

          done();
        });
    });
  });

  describe('method: modifyFunctions$', () => {
    // modifyFunctions arguments
    let buildOptions;

    // function definitions in serverless.yml
    let rustFunc0;
    let rustFunc1;

    let mock;

    beforeEach(() => {
      // Suppose following
      // serverless.yml
      //
      // functions
      //   rustFunc0:
      //     handler: unit-test.bin0
      //     ...
      //
      //   rustFunc1:
      //     handler: unit-test.bin1
      //     ...
      plugin.deployArtifactDir = jest.fn(() => 'deploy');

      CargoLambda.format = { zip: 'zip' };

      rustFunc0 = { handler: 'unit-test.bin0', package: { foo: 'bar' } };
      rustFunc1 = { handler: 'unit-test.bin1' };

      mock = jest.spyOn(plugin, 'rustFunctions$', 'get').mockReturnValue(
        of({ name: 'rustFunc0' }, { name: 'rustFunc1' }),
      );

      mockUtils.copyFile = jest.fn(() => Promise.resolve());

      serverless.service.getFunction
        .mockImplementation((func) => {
          switch (func) {
            case 'rustFunc0':
              return rustFunc0;
            case 'rustFunc1':
              return rustFunc1;
            default:
              return {};
          }
        });
    });

    afterEach(() => {
      mock.mockRestore();
    });

    describe('with "zip" option', () => {
      let subject;

      beforeEach(() => {
        buildOptions = { format: CargoLambda.format.zip };
        plugin.buildArtifactPath = jest.fn()
          .mockImplementation((func) => {
            switch (func) {
              case 'rustFunc0':
                return 'build/bin0.zip';
              case 'rustFunc1':
                return 'build/bin1.zip';
              default:
                return 'build/others';
            }
          });

        subject = plugin.modifyFunctions$(buildOptions)
          .pipe(reduce((acc) => acc + 1, 0));
      });

      it('copies artifacts to deploy path for each function', (done) => {
        subject.subscribe((acc) => {
          expect(acc).toEqual(2);

          expect(mockUtils.copyFile).toHaveBeenCalledWith(
            'build/bin0.zip',
            'deploy/rustFunc0.zip',
          );

          expect(mockUtils.copyFile).toHaveBeenCalledWith(
            'build/bin1.zip',
            'deploy/rustFunc1.zip',
          );

          done();
        });
      });

      it('sets "bootstrap" to "handler" property for each function', (done) => {
        subject.subscribe(() => {
          expect(rustFunc0).toEqual(expect.objectContaining({
            handler: 'bootstrap',
          }));

          expect(rustFunc1).toEqual(expect.objectContaining({
            handler: 'bootstrap',
          }));

          done();
        });
      });

      it('overwrites "package" property for each function', (done) => {
        subject.subscribe(() => {
          expect(rustFunc0).toEqual(expect.objectContaining({
            package: {
              foo: 'bar',
              individually: true,
              artifact: 'deploy/rustFunc0.zip',
            },
          }));

          expect(rustFunc1).toEqual(expect.objectContaining({
            package: {
              individually: true,
              artifact: 'deploy/rustFunc1.zip',
            },
          }));

          done();
        });
      });
    });

    describe('without "zip" option', () => {
      let subject;

      beforeEach(() => {
        buildOptions = { format: 'nonzip' };
        plugin.buildArtifactPath = jest.fn()
          .mockImplementation((func) => {
            switch (func) {
              case 'rustFunc0':
                return 'build/bin0';
              case 'rustFunc1':
                return 'build/bin1';
              default:
                return 'build/others';
            }
          });

        subject = plugin.modifyFunctions$({ options: buildOptions })
          .pipe(reduce((acc) => acc + 1, 0));
      });

      it('copys artifacts to deploy path for each function', (done) => {
        subject.subscribe((acc) => {
          expect(acc).toEqual(2);

          expect(mockUtils.copyFile).toHaveBeenCalledWith(
            'build/bin0',
            'deploy/rustFunc0',
          );

          expect(mockUtils.copyFile).toHaveBeenCalledWith(
            'build/bin1',
            'deploy/rustFunc1',
          );

          done();
        });
      });

      it('sets each function name to "handler" property for each function', (done) => {
        subject.subscribe(() => {
          expect(rustFunc0).toEqual(expect.objectContaining({
            handler: 'rustFunc0',
          }));

          expect(rustFunc1).toEqual(expect.objectContaining({
            handler: 'rustFunc1',
          }));

          done();
        });
      });

      it('overwrites "package" property for each function', (done) => {
        subject.subscribe(() => {
          expect(rustFunc0).toEqual(expect.objectContaining({
            package: {
              foo: 'bar',
              individually: true,
              artifact: 'deploy/rustFunc0',
            },
          }));

          expect(rustFunc1).toEqual(expect.objectContaining({
            package: {
              individually: true,
              artifact: 'deploy/rustFunc1',
            },
          }));

          done();
        });
      });
    });
  });

  describe('method: build$', () => {
    // An instance of mocked CargoLambda class
    let buildOptions;
    let buildOutput;
    let artifacts;
    let mock;

    beforeEach(() => {
      buildOptions = {};
      artifacts = {
        getAll: jest.fn(() => [{ path: 'build/target/bin' }]),
      };

      buildOutput = {
        result: { status: 0 },
        artifacts,
      };

      CargoLambda.build = jest.fn(() => Promise.resolve(buildOutput));
      mockUtils.hasSpawnError = jest.fn(() => false);

      mock = jest.spyOn(plugin, 'rustFunctions$', 'get').mockReturnValue(
        of({ name: 'rustFunc0' }, { name: 'rustFunc1' }),
      );

      plugin.getRustFunctions = jest.fn(() => ['func0', 'func1']);
    });

    afterEach(() => {
      mock.mockRestore();
    });

    it('throws an error if provider is not aws', () => {
      serverless.service.provider.name = 'azuru';
      expect(() => plugin.build$(buildOptions)).toThrow(/Provider must be "aws" to use this plugin/);
    });

    it('throws an error if there are no rust functions in serverless.yml', (done) => {
      jest.spyOn(plugin, 'rustFunctions$', 'get').mockReturnValue(of());
      plugin.build$(buildOptions).subscribe(() => {}, (err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toMatch(/no Rust functions found/);
        done();
      });
    });

    it('passes buildOptions to CargoLambda.build function', (done) => {
      plugin.build$(buildOptions).subscribe(() => {
        expect(CargoLambda.build).toHaveBeenCalledTimes(1);
        expect(CargoLambda.build)
          .toHaveBeenCalledWith(plugin.cargo, buildOptions, expect.anything());
        done();
      });
    });

    it('throws an error if CargoLambda.build returns a failed result', (done) => {
      mockUtils.hasSpawnError = jest.fn(() => true);
      plugin.build$(buildOptions).subscribe(() => {}, (err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toMatch(/Rust build encountered an error/);
        done();
      });
    });

    it('sets build artifacts to plugin.artifacts', (done) => {
      plugin.build$(buildOptions).subscribe(() => {
        expect(plugin.artifacts).toEqual(artifacts);
        done();
      });
    });
  });

  describe('method: package', () => {
    let buildOptions;

    beforeEach(async () => {
      CargoLambda.format = { zip: 'zip' };
      buildOptions = {
        foo: 'bar',
        profile: 'dev',
      };

      mockUtils.mkdirSyncIfNotExist = jest.fn();

      plugin.buildOptions = jest.fn(() => buildOptions);
      plugin.build$ = jest.fn(() => of({}));
      plugin.deployArtifactDir = jest.fn(() => 'artifact/target');
      plugin.modifyFunctions$ = jest.fn(() => of({}));

      await plugin.package();
    });

    it('calls plugin.buildOptions with format zip option', () => {
      expect(plugin.buildOptions).toHaveBeenCalledWith(expect.objectContaining({
        format: CargoLambda.format.zip,
      }));
    });

    it('calls plugin.build$ with buildOptions', () => {
      expect(plugin.build$).toHaveBeenCalledTimes(1);
      expect(plugin.build$).toHaveBeenCalledWith(buildOptions);
    });

    it('calls plugin.deployArtifactDir with buildOptions.profile', () => {
      expect(plugin.deployArtifactDir).toHaveBeenCalledTimes(1);
      expect(plugin.deployArtifactDir).toHaveBeenCalledWith('dev');
    });

    it('calls utils.mkdirSyncIfNotExist with deployArtifactDir', () => {
      expect(mockUtils.mkdirSyncIfNotExist).toHaveBeenCalledTimes(1);
      expect(mockUtils.mkdirSyncIfNotExist).toHaveBeenCalledWith('artifact/target');
    });

    it('calls plugin.modifyFunctions with buildOptions', () => {
      expect(plugin.modifyFunctions$).toHaveBeenCalledTimes(1);
      expect(plugin.modifyFunctions$).toHaveBeenCalledWith(
        expect.objectContaining(buildOptions),
      );
    });
  });

  describe('method: jsonFromPathOption', () => {
    beforeEach(() => {
      options.path = 'some/path';
      mockUtils.readFileSyncIfExist = jest.fn(() => '{"foo":"bar"}');
    });

    it('returns an empty object if the options.path is undefined', () => {
      options.path = undefined;
      expect(plugin.jsonFromPathOption()).toEqual({});
    });

    it('throws an error if file doesn\'t exist', () => {
      mockUtils.readFileSyncIfExist = jest.fn();
      expect(() => plugin.jsonFromPathOption()).toThrow(/File does not exist/);
    });

    it('reads file using options.path', () => {
      plugin.jsonFromPathOption();

      const expectedPath = path.resolve(plugin.srcPath, options.path);
      expect(mockUtils.readFileSyncIfExist).toHaveBeenCalledWith(expectedPath);
    });

    it('returns an object parse from the file', () => {
      expect(plugin.jsonFromPathOption()).toEqual({ foo: 'bar' });
    });

    it('throws an error if the file content is not a valid json', () => {
      mockUtils.readFileSyncIfExist = jest.fn(() => '{foo:"bar"}');
      expect(() => plugin.jsonFromPathOption()).toThrow(/Cannot parse to JSON/);
    });
  });

  describe('method: rustFunction', () => {
    let rustFunc;
    let mock;

    beforeEach(() => {
      rustFunc = {
        rust: {},
      };

      mock = jest.spyOn(plugin, 'config', 'get').mockReturnValue({
        service: 'unit-test',
        environment: { var1: 'VAL1', var2: 'VAL2' },
        local: {
          envFile: 'localenv',
          dockerArgs: '--some args',
        },
      });

      plugin.getFunction = jest.fn(() => rustFunc);
    });

    afterEach(() => {
      mock.mockRestore();
    });

    describe('returns an object with "name" property', () => {
      it('is from given function name', () => {
        expect(plugin.rustFunction('func0')).toEqual(expect.objectContaining({
          name: 'func0',
        }));
      });
    });

    describe('returns an object with "config.containerName" property', () => {
      it('is from each function configuration', () => {
        rustFunc.rust.containerName = 'func0Container';
        expect(plugin.rustFunction('func0').config).toEqual(expect.objectContaining({
          containerName: 'func0Container',
        }));
      });

      it('is from service name if function configuration is undefined', () => {
        expect(plugin.rustFunction('func0').config).toEqual(expect.objectContaining({
          containerName: 'unit-test_func0',
        }));
      });
    });

    describe('returns an object with "config.port" property', () => {
      it('is from each function configuration', () => {
        rustFunc.rust.port = '8000';
        expect(plugin.rustFunction('func0').config).toEqual(expect.objectContaining({
          port: 8000,
        }));
      });

      it('throws an error if it is not a number in configuration', () => {
        rustFunc.rust.port = 'foobar';
        expect(() => plugin.rustFunction('func0')).toThrow(/port number must be an integer/);
      });

      it('is 0 if function configuration is undefined', () => {
        expect(plugin.rustFunction('func0').config).toEqual(expect.objectContaining({
          port: 0,
        }));
      });
    });

    describe('returns an object with "config.envFile" property', () => {
      it('is from each function configuration', () => {
        rustFunc.rust.envFile = 'funcEnv';
        expect(plugin.rustFunction('func0').config).toEqual(expect.objectContaining({
          envFile: 'funcEnv',
        }));
      });

      it('is from global configuration if function configuration is undefined', () => {
        expect(plugin.rustFunction('func0').config).toEqual(expect.objectContaining({
          envFile: 'localenv',
        }));
      });
    });

    describe('returns an object with "config.env" property', () => {
      it('is what is merged from each function and glocal configuration', () => {
        rustFunc.environment = { var1: 'FOO' };
        expect(plugin.rustFunction('func0').config).toEqual(expect.objectContaining({
          env: {
            var1: 'FOO',
            var2: 'VAL2',
          },
        }));
      });
    });

    describe('returns an object with "config.dockerArgs" property', () => {
      it('is from each function configuration', () => {
        rustFunc.rust.dockerArgs = '--local config';
        expect(plugin.rustFunction('func0').config).toEqual(expect.objectContaining({
          dockerArgs: '--local config',
        }));
      });

      it('is from global configuration if function configuration is undefined', () => {
        expect(plugin.rustFunction('func0').config).toEqual(expect.objectContaining({
          dockerArgs: '--some args',
        }));
      });
    });
  });

  describe('method: rustContainers$', () => {
    let observable;
    let mock;

    beforeEach(() => {
      mock = jest.spyOn(plugin, 'rustFunctions$', 'get').mockReturnValue(
        of({
          name: 'rustFunc0',
          config: { foo: 'bar0' },
        }, {
          name: 'rustFunc1',
          config: { foo: 'bar1' },
        }, {
          name: 'rustFunc2',
          config: { foo: 'bar2' },
        }),
      );
    });

    afterEach(() => {
      mock.mockRestore();
    });

    describe('when given an array of string', () => {
      let container0;
      let container1;

      beforeEach(() => {
        container0 = {};
        container1 = {};

        Container.get = jest.fn()
          .mockImplementationOnce(() => Promise.resolve(container0))
          .mockImplementationOnce(() => Promise.resolve(container1))
          .mockImplementation(() => Promise.resolve('nothing'));

        observable = plugin
          .rustContainers$(['rustFunc0', 'rustFunc2'])
          .pipe(reduce((acc, con) => [...acc, con], []));
      });

      it('streams the containers from given function names', (done) => {
        observable.subscribe((containers) => {
          expect(containers).toHaveLength(2);

          expect(containers.sort()).toEqual(expect.arrayContaining([
            container0,
            container1,
          ]));

          expect(Container.get).toHaveBeenCalledWith({
            name: 'rustFunc0',
            config: { foo: 'bar0' },
          });

          expect(Container.get).toHaveBeenCalledWith({
            name: 'rustFunc2',
            config: { foo: 'bar2' },
          });

          expect(Container.get).not.toHaveBeenCalledWith({
            name: 'rustFunc1',
            config: { foo: 'bar1' },
          });

          done();
        });
      });
    });

    describe('when given a string', () => {
      let container0;

      beforeEach(() => {
        container0 = {};

        Container.get = jest.fn()
          .mockImplementationOnce(() => Promise.resolve(container0))
          .mockImplementation(() => Promise.resolve('nothing'));

        observable = plugin
          .rustContainers$('rustFunc1')
          .pipe(reduce((acc, con) => [...acc, con], []));
      });

      it('streams the container from given function name', (done) => {
        observable.subscribe((containers) => {
          expect(containers).toHaveLength(1);

          expect(containers).toEqual(expect.arrayContaining([
            container0,
          ]));

          expect(Container.get).toHaveBeenCalledWith({
            name: 'rustFunc1',
            config: { foo: 'bar1' },
          });

          expect(Container.get).not.toHaveBeenCalledWith({
            name: 'rustFunc0',
            config: { foo: 'bar0' },
          });

          expect(Container.get).not.toHaveBeenCalledWith({
            name: 'rustFunc2',
            config: { foo: 'bar2' },
          });

          done();
        });
      });
    });

    describe('when given nothing', () => {
      let container0;
      let container1;
      let container2;

      beforeEach(() => {
        container0 = {};
        container1 = {};
        container2 = {};

        Container.get = jest.fn()
          .mockImplementationOnce(() => Promise.resolve(container0))
          .mockImplementationOnce(() => Promise.resolve(container1))
          .mockImplementationOnce(() => Promise.resolve(container2))
          .mockImplementation(() => Promise.resolve('nothing'));

        observable = plugin
          .rustContainers$()
          .pipe(reduce((acc, con) => [...acc, con], []));
      });

      it('streams the containers from all functions', (done) => {
        observable.subscribe((containers) => {
          expect(containers).toHaveLength(3);

          expect(containers.sort()).toEqual(expect.arrayContaining([
            container0,
            container1,
            container2,
          ]));

          expect(Container.get).toHaveBeenCalledWith({
            name: 'rustFunc0',
            config: { foo: 'bar0' },
          });

          expect(Container.get).toHaveBeenCalledWith({
            name: 'rustFunc1',
            config: { foo: 'bar1' },
          });

          expect(Container.get).toHaveBeenCalledWith({
            name: 'rustFunc2',
            config: { foo: 'bar2' },
          });

          done();
        });
      });
    });
  });

  describe('method: buildBinary', () => {
    // An instance of mocked CargoLambda class
    let buildOptions;

    beforeEach(async () => {
      buildOptions = {};

      CargoLambda.format.binary = 'binary';

      plugin.buildOptions = jest.fn(() => buildOptions);
      plugin.build$ = jest.fn(() => of({}));

      await plugin.buildBinary();
    });

    it('calls build$ with binary format option', async () => {
      expect(plugin.buildOptions).toHaveBeenCalledWith({ format: 'binary' });
      expect(plugin.build$).toHaveBeenCalledWith(buildOptions);
    });
  });

  describe('method: startContainer', () => {
    let container;
    let output;
    let mock;

    beforeEach(() => {
      output = {};

      container = {
        funcName: 'rustFunc',
        start: jest.fn(() => Promise.resolve(output)),
      };

      mock = jest.spyOn(plugin, 'config', 'get').mockReturnValue({
        cargoLambda: { arch: 'architecture' },
      });
      plugin.buildArtifactPath = jest.fn(() => 'artifact/path');
    });

    afterEach(() => {
      mock.mockRestore();
    });

    it('returns a promise resolves with what container.start returns', async () => {
      const result = await plugin.startContainer(container);
      expect(result).toEqual(output);
    });

    it('passes artifact path and architecture to container.start', async () => {
      await plugin.startContainer(container);
      expect(container.start).toHaveBeenCalledWith({
        artifact: 'artifact/path',
        arch: 'architecture',
      });
    });
  });

  describe('method: startContainers', () => {
    let container0;
    let container1;

    beforeEach(async () => {
      options = { function: 'rustFunc' };

      container0 = { name: 'container0' };
      container1 = { name: 'container1' };

      plugin = new ServerlessRustPlugin(serverless, options, utils);

      plugin.rustContainers$ = jest.fn(() => of(container0, container1));
      plugin.startContainer = jest.fn((val) => Promise.resolve(val));

      await plugin.startContainers();
    });

    it('calls plugin.rustContainers$ with options.function', () => {
      expect(plugin.rustContainers$).toHaveBeenCalledWith('rustFunc');
    });

    it('passes rust function container to plugin.startContainer', () => {
      expect(plugin.startContainer).toHaveBeenCalledTimes(2);
      expect(plugin.startContainer.mock.calls[0][0]).toEqual(container0);
      expect(plugin.startContainer.mock.calls[1][0]).toEqual(container1);
    });
  });

  describe('method: showContainerStatus', () => {
    let container0;
    let container1;
    let mock;

    beforeEach(() => {
      container0 = { name: 'container0' };
      container1 = { name: 'container1' };

      plugin.rustContainers$ = jest.fn(() => of(container0, container1));

      Container.tableRow = jest.fn()
        .mockImplementationOnce(() => ['rustFunc0', 'container0', 'running', 'port8000'])
        .mockImplementationOnce(() => ['rustFunc1', 'container1', 'stopped', 'port0'])
        .mockImplementation(() => {});

      Table.table = jest.fn(() => 'table');

      mock = jest.spyOn(process.stderr, 'write');
    });

    afterEach(() => {
      mock.mockRestore();
    });

    it('calls Table.table from container status', (done) => {
      plugin.showContainerStatus().add(() => {
        expect(Table.table).toHaveBeenCalledWith([
          ['FUNCTION', 'CONTAINER NAME', 'STATUS', 'PORTS'],
          ['rustFunc0', 'container0', 'running', 'port8000'],
          ['rustFunc1', 'container1', 'stopped', 'port0'],
        ]);

        done();
      });
    });
  });

  describe('method: showLogs', () => {
    let subject;

    let container0;
    let container1;
    let stream0;
    let stream1;

    beforeEach(() => {
      options = {
        function: 'rustFunc0',
        color: true,
        all: true,
        watch: true,
      };

      stream0 = { pipe: jest.fn() };
      stream1 = { pipe: jest.fn() };

      container0 = {
        name: 'container0',
        funcName: 'loooooongNameFunction',
        isRunning: true,
        logStreams: jest.fn(() => [stream0]),
      };
      container1 = {
        name: 'container1',
        funcName: 'rustFunc1',
        isRunning: true,
        logStreams: jest.fn(() => [stream1]),
      };

      plugin = new ServerlessRustPlugin(serverless, options, utils);
      plugin.rustContainers$ = jest.fn(() => of(container0, container1));

      mockUtils.color = {
        default: 'default',
        fromIndex: jest.fn(() => 'fromIndex'),
      };

      subject = () => plugin.showLogs();
    });

    it('passes all log streams to stderr', async () => {
      await subject();

      expect(stream0.pipe).toHaveBeenCalledWith(process.stderr);
      expect(stream1.pipe).toHaveBeenCalledWith(process.stderr);
    });

    it('passes log streams from running container only', async () => {
      container0.isRunning = false;
      container1.isRunning = true;

      await subject();

      expect(stream0.pipe).not.toHaveBeenCalledWith();
      expect(stream1.pipe).toHaveBeenCalledWith(process.stderr);
    });

    it('doesn\'t pass any log streams to stderr if there are no running containers', async () => {
      container0.isRunning = false;
      container1.isRunning = false;

      await subject();

      expect(stream0.pipe).not.toHaveBeenCalledWith();
      expect(stream1.pipe).not.toHaveBeenCalledWith();
    });

    it('gets rust containers from options.function', async () => {
      await subject();
      expect(plugin.rustContainers$).toHaveBeenCalledWith('rustFunc0');
    });

    it('gets container log streams with color option if options.color is true', async () => {
      await subject();
      expect(container0.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        color: 'fromIndex',
      }));
    });

    it('gets container log streams with color option if options.color is undefined', async () => {
      options.color = undefined;
      await subject();
      expect(container0.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        color: 'fromIndex',
      }));
      expect(container1.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        color: 'fromIndex',
      }));
    });

    it('gets container log streams without color option if options.color is false', async () => {
      options.color = false;
      await subject();
      expect(container0.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        color: 'default',
      }));
      expect(container1.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        color: 'default',
      }));
    });

    it('gets container log streams with all option if options.all is true', async () => {
      await subject();
      expect(container0.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        all: true,
      }));
      expect(container1.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        all: true,
      }));
    });

    it('gets container log streams without all option if options.all is undefined', async () => {
      options.all = undefined;
      await subject();
      expect(container0.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        all: false,
      }));
      expect(container1.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        all: false,
      }));
    });

    it('gets container log streams without all option if options.all is false', async () => {
      options.all = false;
      await subject();
      expect(container0.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        all: false,
      }));
      expect(container1.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        all: false,
      }));
    });

    it('gets container log streams with watch option if options.watch is true', async () => {
      await subject();
      expect(container0.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        watch: true,
      }));
      expect(container1.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        watch: true,
      }));
    });

    it('gets container log streams without watch option if options.watch is undefined', async () => {
      options.watch = undefined;
      await subject();
      expect(container0.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        watch: false,
      }));
      expect(container1.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        watch: false,
      }));
    });

    it('gets container log streams without watch option if options.watch is false', async () => {
      options.watch = false;
      await subject();
      expect(container0.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        watch: false,
      }));
      expect(container1.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        watch: false,
      }));
    });

    it('gets container log stream with prefixSize option as longest function name + 1', async () => {
      // expected = 'loooooongNameFunction'.length + 1
      await subject();
      expect(container0.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        prefixSize: 22,
      }));
      expect(container1.logStreams).toHaveBeenCalledWith(expect.objectContaining({
        prefixSize: 22,
      }));
    });

    it('throws an error if something wrong', async () => {
      plugin.rustContainers$ = jest.fn(() => of(undefined));
      await expect(() => subject()).rejects.toThrow();
    });
  });

  describe('method: invokeFunction', () => {
    let container;
    let mock;

    beforeEach(() => {
      options = { function: 'rustFunc' };
      container = {
        name: 'rust container',
        isRunning: true,
        hostPortsTo: jest.fn(() => [1234]),
        format: jest.fn(),
      };

      mock = jest.spyOn(process.stderr, 'write');

      plugin = new ServerlessRustPlugin(serverless, options, utils);

      plugin.rustContainers$ = jest.fn(() => of(container));
      plugin.startContainer = jest.fn((val) => Promise.resolve(val));

      lambda.invoke = jest.fn(() => Promise.resolve());
    });

    afterEach(() => {
      mock.mockRestore();
    });

    it('calls lambda.invoke with host port binding to container\'s 8080 port', async () => {
      await plugin.invokeFunction();
      expect(lambda.invoke).toHaveBeenCalledWith(expect.objectContaining({
        port: 1234,
      }));
    });

    it('gets host port from container.hostPortsTo', async () => {
      await plugin.invokeFunction();
      expect(container.hostPortsTo).toHaveBeenCalledWith(8080);
    });

    it('throws an error when  container.hostPortsTo doesn\'t return port number', async () => {
      container.hostPortsTo = jest.fn(() => []);
      await expect(() => plugin.invokeFunction()).rejects.toThrow(/Cannot get host port binding to 8080\/tcp/);
    });

    it('calls lambda.invoke with stdout option if it is given', async () => {
      options.stdout = true;

      await plugin.invokeFunction();
      expect(lambda.invoke).toHaveBeenCalledWith(expect.objectContaining({
        stdout: true,
      }));
    });

    it('calls lambda.invoke with data from path and data options', async () => {
      options.data = '{"foo":"bar"}';
      plugin.jsonFromPathOption = jest.fn(() => ({ foo: 'baz', foobar: 'baz' }));

      await plugin.invokeFunction();
      expect(lambda.invoke).toHaveBeenCalledWith(expect.objectContaining({
        data: {
          foo: 'bar',
          foobar: 'baz',
        },
      }));
    });

    it('doesn\'t push container name to containersToStop if the container is running', async () => {
      await plugin.invokeFunction();
      expect(plugin.containersToStop).toHaveLength(0);
    });

    it('pushes container name to containersToStop if the container is not running', async () => {
      container.isRunning = false;
      await plugin.invokeFunction();
      expect(plugin.containersToStop).toEqual(['rust container']);
    });

    it('calls plugin.rustContainers$ with options.function', async () => {
      await plugin.invokeFunction();
      expect(plugin.rustContainers$).toHaveBeenCalledWith('rustFunc');
    });
  });

  describe('method: stopContainers', () => {
    let container0;
    let container1;

    beforeEach(() => {
      options = { function: 'rustFunc' };

      container0 = {
        name: 'container0',
        stop: jest.fn(() => Promise.resolve(container0)),
      };
      container1 = {
        name: 'container1',
        stop: jest.fn(() => Promise.resolve(container1)),
      };

      plugin = new ServerlessRustPlugin(serverless, options, utils);

      plugin.rustContainers$ = jest.fn(() => of(container0, container1));
    });

    it('stops all containers when plugin.containersToStop is undefined', async () => {
      await plugin.stopContainers();
      expect(container0.stop).toHaveBeenCalled();
      expect(container1.stop).toHaveBeenCalled();
    });

    it('stops container includes plugin.containersToStop when it exists', async () => {
      plugin.containersToStop = ['container1'];
      await plugin.stopContainers();
      expect(container0.stop).not.toHaveBeenCalled();
      expect(container1.stop).toHaveBeenCalled();
    });

    it('passes options.function to plugin.rustContainers$', async () => {
      await plugin.stopContainers();
      expect(plugin.rustContainers$).toHaveBeenCalledWith('rustFunc');
    });
  });
});
