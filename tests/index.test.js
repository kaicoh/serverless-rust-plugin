const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawnSync } = require('child_process');
const ServerlessRustPlugin = require('..');
const Cargo = require('../lib/cargo');
const CargoLambda = require('../lib/cargolambda');
const Docker = require('../lib/docker');
const request = require('../lib/request');

jest.mock('fs');
jest.mock('../lib/cargo');
jest.mock('../lib/cargolambda');
jest.mock('../lib/docker');
jest.mock('../lib/request');

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
    fs.existsSync = jest.fn(() => true);
    fs.mkdirSync = jest.fn();
    fs.createReadStream = jest.fn(() => ({ pipe: jest.fn() }));
    fs.createWriteStream = jest.fn();
    fs.readFileSync = jest.fn();

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

  describe('constructor', () => {
    const events = [
      'before:package:createDeploymentArtifacts',
      'before:deploy:function:packageFunction',
      'before:rust:invoke:local:invoke',
      'rust:invoke:local:invoke',
      'after:rust:invoke:local:invoke',
    ];

    it.each(events)('sets "%s" hook', (event) => {
      expect(plugin.hooks[event]).toBeDefined();
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

    describe('sets commands', () => {
      let command;

      describe('rust:start', () => {
        beforeEach(() => {
          command = plugin.commands['rust:start'];
        });

        it('defines', () => {
          expect(command).toBeDefined();
        });

        const lifecycleEvents = ['start'];

        it.each(lifecycleEvents)('has lifecycle event "%s"', (event) => {
          expect(command.lifecycleEvents).toEqual(expect.arrayContaining([event]));
        });
      });

      describe('rust:ps', () => {
        beforeEach(() => {
          command = plugin.commands['rust:ps'];
        });

        it('defines', () => {
          expect(command).toBeDefined();
        });

        const lifecycleEvents = ['show'];

        it.each(lifecycleEvents)('has lifecycle event "%s"', (event) => {
          expect(command.lifecycleEvents).toEqual(expect.arrayContaining([event]));
        });
      });

      describe('rust:invoke', () => {
        beforeEach(() => {
          command = plugin.commands['rust:invoke'];
        });

        it('defines', () => {
          expect(command).toBeDefined();
        });

        const lifecycleEvents = ['execute'];

        it.each(lifecycleEvents)('has lifecycle event "%s"', (event) => {
          expect(command.lifecycleEvents).toEqual(expect.arrayContaining([event]));
        });
      });

      describe('rust:stop', () => {
        beforeEach(() => {
          command = plugin.commands['rust:stop'];
        });

        it('defines', () => {
          expect(command).toBeDefined();
        });

        const lifecycleEvents = ['stop'];

        it.each(lifecycleEvents)('has lifecycle event "%s"', (event) => {
          expect(command.lifecycleEvents).toEqual(expect.arrayContaining([event]));
        });
      });

      describe('rust:invoke:local', () => {
        beforeEach(() => {
          command = plugin.commands['rust:invoke:local'];
        });

        it('defines', () => {
          expect(command).toBeDefined();
        });

        const lifecycleEvents = ['invoke'];

        it.each(lifecycleEvents)('has lifecycle event "%s"', (event) => {
          expect(command.lifecycleEvents).toEqual(expect.arrayContaining([event]));
        });

        const cmdOptions = [
          ['function', { shortcut: 'f', type: 'string', required: true }],
          ['path', { shortcut: 'p', type: 'string' }],
          ['data', { shortcut: 'd', type: 'string' }],
          ['env', { shortcut: 'e', type: 'multiple' }],
          ['env-file', { type: 'string' }],
          ['port', { type: 'string' }],
          ['docker-args', { type: 'string' }],
          ['stdout', { type: 'boolean' }],
        ];

        it.each(cmdOptions)('has option "%s"', (name, definition) => {
          const option = command.options[name];
          expect(option).toEqual(expect.objectContaining(definition));
        });
      });
    });
  });

  describe('method: deployArtifactDir', () => {
    it('returns a string concantenating srcPath, target, lambda and given arg', () => {
      const expected = path.join(plugin.srcPath, 'target', 'lambda', 'arg');
      expect(plugin.deployArtifactDir('arg')).toEqual(expected);
    });
  });

  describe('method: cargoLambdaOptions', () => {
    const args = { format: 'format' };

    describe('returns an object with property "docker"', () => {
      it('is true by default', () => {
        expect(plugin.cargoLambdaOptions(args)).toEqual(expect.objectContaining({
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
        expect(plugin.cargoLambdaOptions(args)).toEqual(expect.objectContaining({
          docker: false,
        }));
      });
    });

    describe('returns an object with property "srcPath"', () => {
      it('is equal to the project service path', () => {
        expect(plugin.cargoLambdaOptions(args)).toEqual(expect.objectContaining({
          srcPath: plugin.srcPath,
        }));
      });
    });

    describe('returns an object with property "dockerImage"', () => {
      it('is equal to "calavera/cargo-lambda:latest"', () => {
        expect(plugin.cargoLambdaOptions(args)).toEqual(expect.objectContaining({
          dockerImage: 'calavera/cargo-lambda:latest',
        }));
      });
    });

    describe('returns an object with property "profile"', () => {
      it('is equal to "release" by default', () => {
        expect(plugin.cargoLambdaOptions(args)).toEqual(expect.objectContaining({
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
        expect(plugin.cargoLambdaOptions(args)).toEqual(expect.objectContaining({
          profile: 'debug',
        }));
      });
    });

    describe('returns an object with property "arch"', () => {
      it('is equal to "x86_64" by default', () => {
        expect(plugin.cargoLambdaOptions(args)).toEqual(expect.objectContaining({
          arch: 'x86_64',
        }));
      });

      it('is overwritten by provider property in serverless.yml', () => {
        serverless.service.provider.architecture = 'arm64';
        expect(plugin.cargoLambdaOptions(args)).toEqual(expect.objectContaining({
          arch: 'arm64',
        }));
      });
    });

    describe('returns an object with property "format"', () => {
      it('is from given argument', () => {
        expect(plugin.cargoLambdaOptions({ format: 'foo' })).toEqual(expect.objectContaining({
          format: 'foo',
        }));
      });
    });
  });

  describe('method: getRustFunctions', () => {
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
    });

    it('returns function names whose handler is equal to one of the binary names', () => {
      // Suppose there are 3 function definitions in serverless.yml
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
        .mockImplementationOnce(() => ({ handler: 'unit-test.bin0' }))
        .mockImplementationOnce(() => ({ handler: 'unit-test.bin1' }))
        .mockImplementation(() => ({ handler: 'non-of-the-above' }));

      plugin = new ServerlessRustPlugin(serverless, options, utils);

      const result = plugin.getRustFunctions();
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining(['rustFunc0', 'rustFunc1']));
    });
  });

  describe('method: modifyFunctions', () => {
    // modifyFunctions arguments
    let artifacts;
    let cargoLambdaOptions;

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
      plugin.getRustFunctions = jest.fn(() => ['rustFunc0', 'rustFunc1']);
      plugin.deployArtifactDir = jest.fn(() => 'deploy');

      CargoLambda.format = { zip: 'zip' };

      rustFunc0 = { handler: 'unit-test.bin0', package: { foo: 'bar' } };
      rustFunc1 = { handler: 'unit-test.bin1' };

      serverless.service.getFunction
        .mockImplementationOnce(() => rustFunc0)
        .mockImplementationOnce(() => rustFunc1)
        .mockImplementation(() => {});
    });

    describe('with "zip" option', () => {
      beforeEach(() => {
        cargoLambdaOptions = { format: CargoLambda.format.zip };
        artifacts = {
          path: jest.fn()
            .mockImplementationOnce(() => 'build/bin0.zip')
            .mockImplementationOnce(() => 'build/bin1.zip')
            .mockImplementation(() => 'build/others'),
        };

        plugin.modifyFunctions({ artifacts, options: cargoLambdaOptions });
      });

      it('copys artifacts to deploy path for each function', () => {
        expect(fs.createReadStream).toHaveBeenCalledTimes(2);
        expect(fs.createWriteStream).toHaveBeenCalledTimes(2);

        expect(fs.createReadStream).toHaveBeenNthCalledWith(1, 'build/bin0.zip');
        expect(fs.createWriteStream).toHaveBeenNthCalledWith(1, 'deploy/rustFunc0.zip');

        expect(fs.createReadStream).toHaveBeenNthCalledWith(2, 'build/bin1.zip');
        expect(fs.createWriteStream).toHaveBeenNthCalledWith(2, 'deploy/rustFunc1.zip');
      });

      it('sets "bootstrap" to "handler" property for each function', () => {
        expect(rustFunc0).toEqual(expect.objectContaining({
          handler: 'bootstrap',
        }));

        expect(rustFunc1).toEqual(expect.objectContaining({
          handler: 'bootstrap',
        }));
      });

      it('overwrites "package" property for each function', () => {
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
      });
    });

    describe('without "zip" option', () => {
      beforeEach(() => {
        cargoLambdaOptions = { format: 'nonzip' };
        artifacts = {
          path: jest.fn()
            .mockImplementationOnce(() => 'build/bin0')
            .mockImplementationOnce(() => 'build/bin1')
            .mockImplementation(() => 'build/others'),
        };

        plugin.modifyFunctions({ artifacts, options: cargoLambdaOptions });
      });

      it('copys artifacts to deploy path for each function', () => {
        expect(fs.createReadStream).toHaveBeenCalledTimes(2);
        expect(fs.createWriteStream).toHaveBeenCalledTimes(2);

        expect(fs.createReadStream).toHaveBeenNthCalledWith(1, 'build/bin0');
        expect(fs.createWriteStream).toHaveBeenNthCalledWith(1, 'deploy/rustFunc0');

        expect(fs.createReadStream).toHaveBeenNthCalledWith(2, 'build/bin1');
        expect(fs.createWriteStream).toHaveBeenNthCalledWith(2, 'deploy/rustFunc1');
      });

      it('sets each function name to "handler" property for each function', () => {
        expect(rustFunc0).toEqual(expect.objectContaining({
          handler: 'rustFunc0',
        }));

        expect(rustFunc1).toEqual(expect.objectContaining({
          handler: 'rustFunc1',
        }));
      });

      it('overwrites "package" property for each function', () => {
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
      });
    });
  });

  describe('method: build', () => {
    // An instance of mocked CargoLambda class
    let builder;
    let cargoLambdaOptions;
    let buildOutput;

    beforeEach(() => {
      cargoLambdaOptions = {};
      buildOutput = {
        result: { status: 0 },
        artifacts: { getAll: jest.fn(() => [{ path: 'build/target/bin' }]) },
      };

      CargoLambda.mockClear();
      CargoLambda.mockImplementation(() => {
        builder = {
          buildCommand: jest.fn(() => ['buildCommand', 'output']),
          howToBuild: jest.fn(() => 'somehow'),
          build: jest.fn(() => buildOutput),
        };
        return builder;
      });

      plugin.getRustFunctions = jest.fn(() => ['func0', 'func1']);
    });

    it('throws an error if provider is not aws', () => {
      serverless.service.provider.name = 'azuru';
      expect(() => plugin.build(cargoLambdaOptions)).toThrow(/Provider must be "aws" to use this plugin/);
    });

    it('throws an error if there are no rust functions in serverless.yml', () => {
      plugin.getRustFunctions = jest.fn(() => []);
      expect(() => plugin.build(cargoLambdaOptions)).toThrow(/no Rust functions found/);
    });

    it('passes cargoLambdaOptions to CargoLambda constructor', () => {
      plugin.build(cargoLambdaOptions);
      expect(CargoLambda).toHaveBeenCalledTimes(1);
      expect(CargoLambda).toHaveBeenCalledWith(plugin.cargo, cargoLambdaOptions);
    });

    it('calls build method of builder', () => {
      plugin.build(cargoLambdaOptions);
      expect(builder.build).toHaveBeenCalledTimes(1);
      expect(builder.build).toHaveBeenCalledWith(spawnSync, expect.objectContaining({
        stdio: ['ignore', process.stdout, process.stderr],
      }));
    });

    it('throws an error if builder.build method returns a failed result', () => {
      buildOutput = {
        result: { status: 1, error: 'some error' },
        artifacts: { getAll: jest.fn(() => []) },
      };
      expect(() => plugin.build(cargoLambdaOptions)).toThrow(/some error/);
    });

    it('returns buildOutput.artifacts', () => {
      expect(plugin.build(cargoLambdaOptions)).toEqual(buildOutput.artifacts);
    });
  });

  describe('method: package', () => {
    let artifacts;
    let cargoLambdaOptions;

    beforeEach(() => {
      CargoLambda.format = { zip: 'zip' };

      artifacts = { bar: 'baz' };
      cargoLambdaOptions = {
        foo: 'bar',
        profile: 'dev',
      };

      fs.existsSync = jest.fn(() => true);

      plugin.cargoLambdaOptions = jest.fn(() => cargoLambdaOptions);
      plugin.build = jest.fn(() => artifacts);
      plugin.deployArtifactDir = jest.fn(() => 'artifact/target');
      plugin.modifyFunctions = jest.fn();

      plugin.package();
    });

    it('calls plugin.cargoLambdaOptions with format zip option', () => {
      const expected = expect.objectContaining({
        format: CargoLambda.format.zip,
      });
      expect(plugin.cargoLambdaOptions).toHaveBeenCalledWith(expected);
    });

    it('calls plugin.build with cargoLambdaOptions', () => {
      expect(plugin.build).toHaveBeenCalledTimes(1);
      expect(plugin.build).toHaveBeenCalledWith(cargoLambdaOptions);
    });

    it('calls plugin.deployArtifactDir with cargoLambdaOptions.profile', () => {
      expect(plugin.deployArtifactDir).toHaveBeenCalledTimes(1);
      expect(plugin.deployArtifactDir).toHaveBeenCalledWith('dev');
    });

    it('calls plugin.modifyFunctions with build artifacts and cargoLambdaOptions', () => {
      const expected = expect.objectContaining({
        artifacts,
        options: cargoLambdaOptions,
      });

      expect(plugin.modifyFunctions).toHaveBeenCalledTimes(1);
      expect(plugin.modifyFunctions).toHaveBeenCalledWith(expected);
    });

    it('checks if target directory exists', () => {
      expect(fs.existsSync).toHaveBeenCalledTimes(1);
      expect(fs.existsSync).toHaveBeenCalledWith('artifact/target');
    });

    describe('when target directory exists', () => {
      beforeEach(() => {
        fs.existsSync = jest.fn(() => true);
        fs.mkdirSync = jest.fn();

        plugin.package();
      });

      it('does not create target directory', () => {
        expect(fs.mkdirSync).not.toHaveBeenCalled();
      });
    });

    describe('when target directory doesn\'t exist', () => {
      beforeEach(() => {
        fs.existsSync = jest.fn(() => false);
        fs.mkdirSync = jest.fn();

        plugin.package();
      });

      it('creates target directory', () => {
        expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
        expect(fs.mkdirSync).toHaveBeenCalledWith('artifact/target', { recursive: true });
      });
    });
  });

  describe('method: buildAndStartDocker', () => {
    let cargoLambdaOptions;
    let artifacts;
    let docker;

    beforeEach(() => {
      const bin = 'hello';

      options = {
        function: 'hello',
        port: '9000',
        'env-file': 'some/path',
        'docker-args': 'foo bar baz',
      };

      serverless.service.getFunction = jest.fn(() => ({ handler: bin }));
      CargoLambda.format.binary = 'binary format';

      cargoLambdaOptions = { foo: 'bar' };
      artifacts = [{ name: bin, path: 'build/artifacts/bin' }];

      Docker.mockClear();
      Docker.mockImplementation(() => {
        docker = {
          run: jest.fn(() => ({ status: 0 })),
          runCommand: jest.fn(),
        };

        return docker;
      });

      plugin = new ServerlessRustPlugin(serverless, options, utils);

      plugin.cargoLambdaOptions = jest.fn(() => cargoLambdaOptions);
      plugin.build = jest.fn(() => ({
        getAll: () => artifacts,
      }));
      plugin.startDocker = jest.fn();
    });

    it('calls plugin.cargoLambdaOptions with binary format option', () => {
      plugin.buildAndStartDocker();
      expect(plugin.cargoLambdaOptions).toHaveBeenCalledTimes(1);
      expect(plugin.cargoLambdaOptions).toHaveBeenCalledWith({ format: 'binary format' });
    });

    it('calls plugin.build with what plugin.cargoLambdaOptions returns', () => {
      plugin.buildAndStartDocker();
      expect(plugin.build).toHaveBeenCalledTimes(1);
      expect(plugin.build).toHaveBeenCalledWith(cargoLambdaOptions);
    });

    it('throws an error when no function found from option.function', () => {
      serverless.service.getFunction = jest.fn(() => undefined);
      expect(() => plugin.buildAndStartDocker()).toThrow(/Not found function: hello/);
    });

    it('throws an error when found function doesn\'t have handler property', () => {
      serverless.service.getFunction = jest.fn(() => {});
      expect(() => plugin.buildAndStartDocker()).toThrow(/Not found function: hello/);
    });

    it('throws an error when no rust function found from option.function', () => {
      serverless.service.getFunction = jest.fn(() => ({ handler: 'non rust func' }));
      expect(() => plugin.buildAndStartDocker()).toThrow(/Not found rust function: hello/);
    });

    it('calls plugin.startDocker with artifact.path', () => {
      plugin.buildAndStartDocker();
      expect(plugin.startDocker).toHaveBeenCalledWith(expect.objectContaining({
        artifactPath: 'build/artifacts/bin',
      }));
    });
  });

  describe('method: dockerPort', () => {
    it('returns a number from options.port', () => {
      options = { port: '1111' };
      plugin = new ServerlessRustPlugin(serverless, options, utils);
      expect(plugin.dockerPort()).toEqual(1111);
    });

    it('returns a number from serverless settings if options.port is undefined', () => {
      // serverless.yml
      //
      // custom:
      //   rust:
      //     local:
      //       port: 2222
      options = { port: undefined };
      serverless.service.custom.rust = { local: { port: '2222' } };
      plugin = new ServerlessRustPlugin(serverless, options, utils);
      expect(plugin.dockerPort()).toEqual(2222);
    });

    it('returns 9000 if both options.port and serverless settings are undefined', () => {
      plugin = new ServerlessRustPlugin(serverless, options, utils);
      expect(plugin.dockerPort()).toEqual(9000);
    });

    it('throws an error if given port is NaN', () => {
      options = { port: 'invalid' };
      plugin = new ServerlessRustPlugin(serverless, options, utils);
      expect(() => plugin.dockerPort()).toThrow(/port must be an integer/);
    });
  });

  describe('method: dockerOptions', () => {
    let result;

    const artifactPath = 'build/artifact/func.zip';

    beforeEach(() => {
      serverless.service.provider.architecture = 'some arch';
      options = {
        env: ['foo=bar'],
        'env-file': '.env',
        'docker-args': 'foo bar baz',
      };

      plugin = new ServerlessRustPlugin(serverless, options, utils);
      plugin.dockerPort = jest.fn(() => 9999);

      result = plugin.dockerOptions({ artifactPath });
    });

    it('returns an object having "name" property', () => {
      expect(result).toEqual(expect.objectContaining({
        name: 'sls-rust-plugin',
      }));
    });

    it('returns an object having "port" property from dockerPort method', () => {
      expect(result).toEqual(expect.objectContaining({
        port: 9999,
      }));
    });

    it('returns an object having "arch" property from serverless.yml settings', () => {
      expect(result).toEqual(expect.objectContaining({
        arch: 'some arch',
      }));
    });

    it('returns an object having "bin" and "binDir" properties from given artifact', () => {
      expect(result).toEqual(expect.objectContaining({
        bin: 'func.zip',
        binDir: 'build/artifact',
      }));
    });

    it('returns an "env" property from options.env', () => {
      expect(result).toEqual(expect.objectContaining({
        env: ['foo=bar'],
      }));
    });

    describe('returns an object hqving "envFile" property', () => {
      it('is from options env-file property', () => {
        expect(result).toEqual(expect.objectContaining({
          envFile: '.env',
        }));
      });

      it('is from serverless settings if options env-file is undefined', () => {
        // serverless.yml
        // custom:
        //   rust:
        //     local:
        //       envFile: dotenv
        options['env-file'] = undefined;
        serverless.service.custom.rust = { local: { envFile: 'dotenv' } };

        plugin = new ServerlessRustPlugin(serverless, options, utils);
        plugin.dockerPort = jest.fn(() => 9999);

        expect(plugin.dockerOptions({ artifactPath })).toEqual(expect.objectContaining({
          envFile: 'dotenv',
        }));
      });
    });

    describe('returns an object hqving "addArgs" property', () => {
      it('is from options docker-args property', () => {
        expect(result).toEqual(expect.objectContaining({
          addArgs: 'foo bar baz',
        }));
      });

      it('is from serverless settings if options docker-args is undefined', () => {
        // serverless.yml
        // custom:
        //   rust:
        //     local:
        //       dockerArgs: foobar baz foo
        options['docker-args'] = undefined;
        serverless.service.custom.rust = { local: { dockerArgs: 'foobar baz foo' } };

        plugin = new ServerlessRustPlugin(serverless, options, utils);
        plugin.dockerPort = jest.fn(() => 9999);

        expect(plugin.dockerOptions({ artifactPath })).toEqual(expect.objectContaining({
          addArgs: 'foobar baz foo',
        }));
      });
    });
  });

  describe('method: startDocker', () => {
    let docker;
    let dockerOptions;

    const artifactPath = 'some/path';

    beforeEach(() => {
      dockerOptions = {};

      Docker.mockClear();
      Docker.mockImplementation(() => {
        docker = {
          run: jest.fn(() => ({ status: 0 })),
          runCommand: jest.fn(),
        };

        return docker;
      });

      plugin.dockerOptions = jest.fn(() => dockerOptions);
    });

    it('calls dockerOptions method with given artifactPath', () => {
      plugin.startDocker({ artifactPath });
      expect(plugin.dockerOptions).toHaveBeenCalledWith({ artifactPath });
    });

    it('passes options from dockerOptions method to Docker constructor', () => {
      plugin.startDocker({ artifactPath });
      expect(Docker).toHaveBeenCalledWith(dockerOptions);
    });

    it('calls docker.run with spawnSync', () => {
      plugin.startDocker({ artifactPath });
      expect(docker.run).toHaveBeenCalledTimes(1);
      expect(docker.run).toHaveBeenCalledWith(spawnSync);
    });

    it('throws an error when docker run returns NaN status', () => {
      Docker.mockImplementationOnce(() => ({
        run: jest.fn(() => ({})),
        runCommand: jest.fn(),
      }));
      expect(() => plugin.startDocker({ artifactPath })).toThrow(/docker run error/);
    });

    it('throws an error when docker run returns error status', () => {
      Docker.mockImplementationOnce(() => ({
        run: jest.fn(() => ({ status: 1 })),
        runCommand: jest.fn(),
      }));
      expect(() => plugin.startDocker({ artifactPath })).toThrow(/docker run error/);
    });
  });

  describe('method: requestToDocker', () => {
    beforeEach(async () => {
      plugin = new ServerlessRustPlugin(serverless, options, utils);

      plugin.invokeOptions = jest.fn(() => ({ foo: 'bar' }));
      request.invokeLambda = jest.fn(() => Promise.resolve({ foo: 'bar' }));
    });

    it('calls request.invokeLambda function', async () => {
      await plugin.requestToDocker();
      expect(request.invokeLambda).toHaveBeenCalledTimes(1);
      expect(request.invokeLambda).toHaveBeenCalledWith(http.request, {
        foo: 'bar',
      });
    });

    it('resolves with undefined', async () => {
      const result = await plugin.requestToDocker();
      expect(result).toBeUndefined();
    });

    it('throws an error when request.invokeLambda rejects', async () => {
      request.invokeLambda = jest.fn(() => Promise.reject(new Error('foo')));
      await expect(plugin.requestToDocker()).rejects.toThrow(/foo/);
    });
  });

  describe('method: stopDocker', () => {
    beforeEach(() => {
      plugin.docker = {
        stop: jest.fn(() => ({ status: 0 })),
        running: jest.fn(() => true),
      };
    });

    it('calls plugin.docker.running', () => {
      plugin.stopDocker();
      expect(plugin.docker.running).toHaveBeenCalledTimes(1);
      expect(plugin.docker.running).toHaveBeenCalledWith(spawnSync);
    });

    it('calls plugin.docker.stop', () => {
      plugin.stopDocker();
      expect(plugin.docker.stop).toHaveBeenCalledTimes(1);
      expect(plugin.docker.stop).toHaveBeenCalledWith(spawnSync);
    });

    it('calls utils.log.success', () => {
      plugin.stopDocker();
      expect(utils.log.success).toHaveBeenCalledTimes(1);
    });

    it('throws an error when docker stop returns NaN status', () => {
      plugin.docker.stop = jest.fn(() => ({}));
      expect(() => plugin.stopDocker()).toThrow(/docker stop error/);
    });

    it('throws an error when docker stop returns error status', () => {
      plugin.docker.stop = jest.fn(() => ({ status: 1 }));
      expect(() => plugin.stopDocker()).toThrow(/docker stop error/);
    });

    it('doesn\'t call docker.stop if docker is not running', () => {
      plugin.docker.running = jest.fn(() => false);
      plugin.stopDocker();
      expect(plugin.docker.stop).not.toHaveBeenCalled();
    });

    it('doesn\'t call utils.log.success if silent option is true', () => {
      plugin.stopDocker({ silent: true });
      expect(utils.log.success).not.toHaveBeenCalled();
    });
  });

  describe('method: invokeOptions', () => {
    beforeEach(() => {
      plugin.options.port = '9000';
    });

    describe('has "stdout" property', () => {
      it('is set from options.stdout', () => {
        plugin.options.stdout = true;
        expect(plugin.invokeOptions()).toEqual(expect.objectContaining({
          stdout: true,
        }));
      });

      it('is false by default', () => {
        expect(plugin.invokeOptions()).toEqual(expect.objectContaining({
          stdout: false,
        }));
      });
    });

    describe('has "data" property', () => {
      beforeEach(() => {
        plugin.options.path = 'some/path';
        plugin.options.data = '{"firstName":"Mary"}';

        fs.existsSync = jest.fn(() => true);
        fs.readFileSync = jest.fn(() => '{"lastName":"Sue"}');
      });

      it('reads file at the path option', () => {
        const expectedPath = path.resolve(plugin.srcPath, 'some/path');
        plugin.invokeOptions();

        expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');
      });

      it('throws an error if file doesn\'t exists at given path', () => {
        fs.existsSync = jest.fn(() => false);
        expect(() => plugin.readJsonFile()).toThrow(/File does not exist at/);
      });

      it('throws an error if file contents from the path option is not a valid json', () => {
        fs.readFileSync = jest.fn(() => 'simple text');
        expect(() => plugin.readJsonFile()).toThrow(/Cannot parse to JSON/);
      });

      it('throws an error if the data option is invalid json', () => {
        plugin.options.data = 'simple text';
        expect(() => plugin.invokeOptions()).toThrow(/Cannot parse to JSON/);
      });

      describe('is an object', () => {
        it('is from a file from the path option and an object from the data option', () => {
          expect(plugin.invokeOptions()).toEqual(expect.objectContaining({
            data: {
              firstName: 'Mary',
              lastName: 'Sue',
            },
          }));
        });

        it('is from a file from the path option if the data option is undefined', () => {
          plugin.options.data = undefined;
          expect(plugin.invokeOptions()).toEqual(expect.objectContaining({
            data: {
              lastName: 'Sue',
            },
          }));
        });

        it('is from the data option if the path option is undefined', () => {
          plugin.options.path = undefined;
          expect(plugin.invokeOptions()).toEqual(expect.objectContaining({
            data: {
              firstName: 'Mary',
            },
          }));
        });

        it('overwrites data when path file and data has same key', () => {
          plugin.options.data = '{"firstName":"Mary","zipcode":"0000000"}';
          fs.readFileSync = jest.fn(() => '{"lastName":"Sue","zipcode":"1111111"}');

          expect(plugin.invokeOptions()).toEqual(expect.objectContaining({
            data: {
              firstName: 'Mary',
              lastName: 'Sue',
              zipcode: '0000000',
            },
          }));
        });
      });
    });

    describe('has "port" property', () => {
      beforeEach(() => {
        plugin.options.port = '8080';
      });

      it('is from options.port', () => {
        expect(plugin.invokeOptions()).toEqual(expect.objectContaining({
          port: 8080,
        }));
      });

      it('throws an error if port options is not a number', () => {
        plugin.options.port = 'not a number';
        expect(() => plugin.invokeOptions()).toThrow(/port must be an integer/);
      });
    });
  });

  describe('method: beforeInvokeLocal', () => {
    describe('when buildAndStartDocker successes', () => {
      beforeEach(() => {
        plugin.buildAndStartDocker = jest.fn();
        plugin.stopDocker = jest.fn();
      });

      it('calls plugin.buildAndStartDocker', () => {
        plugin.beforeInvokeLocal();
        expect(plugin.buildAndStartDocker).toHaveBeenCalled();
      });

      it('doesn\'t call plugin.stopDocker', () => {
        plugin.beforeInvokeLocal();
        expect(plugin.stopDocker).not.toHaveBeenCalled();
      });
    });

    describe('when buildAndStartDocker fails', () => {
      beforeEach(() => {
        plugin.buildAndStartDocker = jest.fn(() => { throw new Error('some error'); });
        plugin.stopDocker = jest.fn();
      });

      it('throws an error thrown by buildAndStartDocker', () => {
        expect(() => plugin.beforeInvokeLocal()).toThrow(/some error/);
      });

      it('calls plugin.stopDocker with silent option', () => {
        expect(() => plugin.beforeInvokeLocal()).toThrow(/some error/);
        expect(plugin.stopDocker).toHaveBeenCalledWith({ silent: true });
      });
    });
  });

  describe('method: invokeLocal', () => {
    describe('when requestToDocker resolves', () => {
      beforeEach(() => {
        plugin.requestToDocker = jest.fn(() => Promise.resolve());
        plugin.stopDocker = jest.fn();
      });

      it('calls plugin.requestToDocker', async () => {
        await plugin.invokeLocal();
        expect(plugin.requestToDocker).toHaveBeenCalled();
      });

      it('doesn\'t call plugin.stopDocker', async () => {
        await plugin.invokeLocal();
        expect(plugin.stopDocker).not.toHaveBeenCalled();
      });
    });

    describe('when requestToDocker rejects', () => {
      beforeEach(() => {
        plugin.requestToDocker = jest.fn(() => Promise.reject(new Error('some error')));
        plugin.stopDocker = jest.fn();
      });

      it('throws an error thrown by requestToDocker', async () => {
        await expect(() => plugin.invokeLocal()).rejects.toThrow(/some error/);
      });

      it('calls plugin.stopDocker with silent option', async () => {
        await expect(() => plugin.invokeLocal()).rejects.toThrow(/some error/);
        expect(plugin.stopDocker).toHaveBeenCalledWith({ silent: true });
      });
    });
  });
});
