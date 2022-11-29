const path = require('path');
const fs = require('fs');
const ServerlessRustPlugin = require('..');
const Cargo = require('../lib/cargo');
const CargoLambda = require('../lib/cargolambda');
// const request = require('../lib/request');

jest.mock('fs');
jest.mock('../lib/cargo');
jest.mock('../lib/cargolambda');
// jest.mock('../lib/request');

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
    ];

    it.each(events)('sets "%s" hook', (event) => {
      expect(plugin.hooks[event]).toBeDefined();
    });

    it('uses service name from serverless.service.service', () => {
      serverless.service.service = 'my-service';
      expect(plugin.settings.service).toEqual('my-service');
    });

    it('uses serviceObject name if serverless.service.service is undefined', () => {
      serverless.service.service = undefined;
      serverless.service.serviceObject = { name: 'service-object' };
      expect(plugin.settings.service).toEqual('service-object');
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

  describe('getter: rustFunctions', () => {
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
        .mockImplementationOnce(() => ({ handler: 'unit-test.bin0' }))
        .mockImplementationOnce(() => ({ handler: 'unit-test.bin1' }))
        .mockImplementation(() => ({ handler: 'non-of-the-above' }));

      plugin = new ServerlessRustPlugin(serverless, options, utils);
      result = plugin.rustFunctions;
    });

    it('returns a Map includes only rust functions', () => {
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toEqual(2);
    });

    it('returns a Map whose key is function name and value is function configuration', () => {
      expect(result.get('rustFunc0')).toEqual(expect.objectContaining({
        handler: 'unit-test.bin0',
      }));
      expect(result.get('rustFunc1')).toEqual(expect.objectContaining({
        handler: 'unit-test.bin1',
      }));
    });
  });

  describe('method: getRustFunctions', () => {
    beforeEach(() => {
      const map = new Map();
      map.set('func0', {});
      map.set('func1', {});

      jest.spyOn(plugin, 'rustFunctions', 'get').mockReturnValue(map);
    });

    it('returns an array from rust function names', () => {
      expect(plugin.getRustFunctions()).toEqual(expect.arrayContaining([
        'func0', 'func1',
      ]));
    });
  });

  describe('method: modifyFunctions', () => {
    // modifyFunctions arguments
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
      plugin.deployArtifactDir = jest.fn(() => 'deploy');

      CargoLambda.format = { zip: 'zip' };

      rustFunc0 = { handler: 'unit-test.bin0', package: { foo: 'bar' } };
      rustFunc1 = { handler: 'unit-test.bin1' };

      jest.spyOn(plugin, 'rustFunctions', 'get').mockReturnValue(
        new Map([['rustFunc0', rustFunc0], ['rustFunc1', rustFunc1]]),
      );

      serverless.service.getFunction
        .mockImplementationOnce(() => rustFunc0)
        .mockImplementationOnce(() => rustFunc1)
        .mockImplementation(() => {});
    });

    describe('with "zip" option', () => {
      beforeEach(() => {
        cargoLambdaOptions = { format: CargoLambda.format.zip };
        plugin.buildArtifactPath = jest.fn()
          .mockImplementationOnce(() => 'build/bin0.zip')
          .mockImplementationOnce(() => 'build/bin1.zip')
          .mockImplementation(() => 'build/others');

        plugin.modifyFunctions({ options: cargoLambdaOptions });
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
        plugin.buildArtifactPath = jest.fn()
          .mockImplementationOnce(() => 'build/bin0')
          .mockImplementationOnce(() => 'build/bin1')
          .mockImplementation(() => 'build/others');

        plugin.modifyFunctions({ options: cargoLambdaOptions });
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
    let cargoLambdaOptions;
    let buildOutput;

    beforeEach(() => {
      cargoLambdaOptions = {};
      buildOutput = {
        result: { status: 0 },
        artifacts: { getAll: jest.fn(() => [{ path: 'build/target/bin' }]) },
      };

      CargoLambda.build = jest.fn(() => Promise.resolve(buildOutput));

      plugin.getRustFunctions = jest.fn(() => ['func0', 'func1']);
    });

    it('throws an error if provider is not aws', async () => {
      serverless.service.provider.name = 'azuru';
      await expect(() => plugin.build(cargoLambdaOptions)).rejects.toThrow(/Provider must be "aws" to use this plugin/);
    });

    it('throws an error if there are no rust functions in serverless.yml', async () => {
      plugin.getRustFunctions = jest.fn(() => []);
      await expect(() => plugin.build(cargoLambdaOptions)).rejects.toThrow(/no Rust functions found/);
    });

    it('passes cargoLambdaOptions to CargoLambda.build function', async () => {
      await plugin.build(cargoLambdaOptions);
      expect(CargoLambda.build).toHaveBeenCalledTimes(1);
      expect(CargoLambda.build)
        .toHaveBeenCalledWith(plugin.cargo, cargoLambdaOptions, expect.anything());
    });

    it('throws an error if CargoLambda.build returns a failed result', async () => {
      buildOutput = {
        result: { status: 1, error: 'some error' },
        artifacts: { getAll: jest.fn(() => []) },
      };
      await expect(() => plugin.build(cargoLambdaOptions)).rejects.toThrow(/some error/);
    });

    it('sets buildOutput.artifacts to plugin.artifacts', async () => {
      await plugin.build(cargoLambdaOptions);
      expect(plugin.artifacts).toEqual(buildOutput.artifacts);
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

    it('calls plugin.modifyFunctions with cargoLambdaOptions', () => {
      const expected = expect.objectContaining({
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
});
