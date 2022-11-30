const path = require('path');
const fs = require('fs');
const { reduce, of } = require('rxjs');
const ServerlessRustPlugin = require('..');
const Cargo = require('../lib/cargo');
const CargoLambda = require('../lib/cargolambda');
const lambda = require('../lib/lambda');
const mockUtils = require('../lib/utils');

jest.mock('../lib/cargo');
jest.mock('../lib/cargolambda');
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

      jest.spyOn(plugin, 'rustFunctions$', 'get')
        .mockReturnValue({
          forEach: jest.fn((callback) => {
            rustFunctions.forEach((f) => callback(f));
            return Promise.resolve({});
          }),
        });
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
      jest.spyOn(plugin, 'rustFunction');

      result = plugin.rustFunctions$;
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

      jest.spyOn(plugin, 'rustFunctions$', 'get').mockReturnValue(
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

      jest.spyOn(plugin, 'rustFunctions$', 'get').mockReturnValue(
        of({ name: 'rustFunc0' }, { name: 'rustFunc1' }),
      );

      plugin.getRustFunctions = jest.fn(() => ['func0', 'func1']);
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
});
