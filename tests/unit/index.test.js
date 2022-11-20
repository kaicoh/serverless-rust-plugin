const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ServerlessRustPlugin = require('../..');
const Cargo = require('../../lib/cargo');
const CargoLambda = require('../../lib/cargolambda');

jest.mock('fs');
jest.mock('../../lib/cargo');
jest.mock('../../lib/cargolambda');

describe('ServerlessRustPlugin', () => {
  // An instance of ServerlessRustPlugin
  let plugin;

  // Arguments to instantiate ServerlessRustPlugin
  let serverless;
  let options;
  let utils;

  function createMockServerless(custom = {}) {
    return {
      version: '3.24.1',
      cli: { log: jest.fn() },
      service: {
        provider: {
          name: 'aws',
        },
        getAllFunctions: jest.fn(() => ['func0', 'func1']),
        getFunction: jest.fn(() => ({ handler: 'bin0' })),
        custom,
      },
      config: { servicePath: 'sls-service' },
      classes: { Error },
    };
  }

  beforeEach(() => {
    fs.existsSync = jest.fn(() => true);
    fs.mkdirSync = jest.fn();
    fs.createReadStream = jest.fn(() => ({ pipe: jest.fn() }));
    fs.createWriteStream = jest.fn();

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
    // the path index.js is in.
    const indexPath = path.join(__dirname, '../..');
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

    it('sets "srcPath" from serverless.config.servicePath', () => {
      const expected = path.join(indexPath, serverless.config.servicePath);
      expect(plugin.srcPath).toEqual(expected);
    });

    it('sets project root directory to "srcPath" if serverless.config.servicePath is undefined', () => {
      serverless.config.servicePath = undefined;
      plugin = new ServerlessRustPlugin(serverless, options, utils);
      const expected = path.join(__dirname, '../..');
      expect(plugin.srcPath).toEqual(expected);
    });

    it('sets "custom" with "cargoPath" and "useDocker" properties', () => {
      const cargoPath = path.join(plugin.srcPath, 'Cargo.toml');
      expect(plugin.custom).toEqual(expect.objectContaining({
        cargoPath,
        useDocker: true,
      }));
    });

    it('calls "Cargo" constructor to set "cargo" property', () => {
      const cargoPath = path.join(plugin.srcPath, 'Cargo.toml');
      expect(Cargo).toHaveBeenCalledTimes(1);
      expect(Cargo).toHaveBeenCalledWith(cargoPath);
    });

    describe('sets commands', () => {
      describe('rust:invoke:local', () => {
        let command;

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

  describe('method: buildOptions', () => {
    describe('returns an object with property "useDocker"', () => {
      it('is true by default', () => {
        expect(plugin.buildOptions()).toEqual(expect.objectContaining({
          useDocker: true,
        }));
      });

      it('is overwritten by custom property in serverless.yml', () => {
        serverless.service.custom.rust = { useDocker: false };
        plugin = new ServerlessRustPlugin(serverless, options, utils);
        expect(plugin.buildOptions()).toEqual(expect.objectContaining({
          useDocker: false,
        }));
      });
    });

    describe('returns an object with property "srcPath"', () => {
      it('is equal to the project service path', () => {
        expect(plugin.buildOptions()).toEqual(expect.objectContaining({
          srcPath: plugin.srcPath,
        }));
      });
    });

    describe('returns an object with property "dockerImage"', () => {
      it('is equal to "calavera/cargo-lambda:latest"', () => {
        expect(plugin.buildOptions()).toEqual(expect.objectContaining({
          dockerImage: 'calavera/cargo-lambda:latest',
        }));
      });
    });

    describe('returns an object with property "profile"', () => {
      it('is equal to "release" by default', () => {
        expect(plugin.buildOptions()).toEqual(expect.objectContaining({
          profile: 'release',
        }));
      });

      it('is overwritten by custom property in serverless.yml', () => {
        serverless.service.custom.rust = { cargoProfile: 'debug' };
        plugin = new ServerlessRustPlugin(serverless, options, utils);
        expect(plugin.buildOptions()).toEqual(expect.objectContaining({
          profile: 'debug',
        }));
      });
    });

    describe('returns an object with property "arch"', () => {
      it('is equal to "x86_64" by default', () => {
        expect(plugin.buildOptions()).toEqual(expect.objectContaining({
          arch: 'x86_64',
        }));
      });

      it('is overwritten by provider property in serverless.yml', () => {
        serverless.service.provider.architecture = 'arm64';
        plugin = new ServerlessRustPlugin(serverless, options, utils);
        expect(plugin.buildOptions()).toEqual(expect.objectContaining({
          arch: 'arm64',
        }));
      });
    });

    describe('returns an object with property "format"', () => {
      it('is equal to "zip"', () => {
        expect(plugin.buildOptions()).toEqual(expect.objectContaining({
          format: 'zip',
        }));
      });
    });

    describe('returns an object with any property', () => {
      it('is overwritten by given arguments', () => {
        const arg = {
          useDocker: false,
          srcPath: 'srcPath',
          dockerImage: 'sample:1.2.3',
          profile: 'dev',
          arch: 'amd64',
          format: 'binary',
          foo: 'bar',
        };
        expect(plugin.buildOptions(arg)).toEqual(expect.objectContaining({
          useDocker: false,
          srcPath: 'srcPath',
          dockerImage: 'sample:1.2.3',
          profile: 'dev',
          arch: 'amd64',
          format: 'binary',
          foo: 'bar',
        }));
      });
    });
  });

  describe('method: getRustFunctions', () => {
    beforeEach(() => {
      // Suppose there are 2 binary definitions in Cargo.toml
      Cargo.mockImplementationOnce(() => ({
        binaries: jest.fn(() => ['bin0', 'bin1']),
      }));

      // Suppose there are 2 function definitions in serverless.yml
      serverless.service.getAllFunctions.mockImplementation(() => ['func0', 'func1']);
    });

    it('returns all function names if all handlers are equal to one of the binary names', () => {
      // function handler is always equal to one of the binary names.
      serverless.service.getFunction.mockImplementation(() => ({ handler: 'bin1' }));

      plugin = new ServerlessRustPlugin(serverless, options, utils);

      const result = plugin.getRustFunctions();
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining(['func0', 'func1']));
    });

    it('returns function names if some handlers are equal to one of the binary names', () => {
      // function handler is not equal to one of the binary names.
      serverless.service.getFunction.mockImplementation(() => ({ handler: 'non rust func' }));
      // Only one function handler is equal to one of the binary names.
      serverless.service.getFunction.mockImplementationOnce(() => ({ handler: 'bin0' }));

      plugin = new ServerlessRustPlugin(serverless, options, utils);

      const result = plugin.getRustFunctions();
      expect(result).toHaveLength(1);
      expect(result).toEqual(expect.arrayContaining(['func0']));
    });

    it('returns an empty array if no handlers are equal to one of the binary names', () => {
      // function handler is not equal to one of the binary names.
      serverless.service.getFunction.mockImplementation(() => ({ handler: 'non rust func' }));

      plugin = new ServerlessRustPlugin(serverless, options, utils);

      const result = plugin.getRustFunctions();
      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('method: modifyFunctions', () => {
    let functions;
    let artifacts;
    let buildOptions;

    beforeEach(() => {
      plugin.getRustFunctions = jest.fn(() => ['func0', 'func1']);
      plugin.deployArtifactDir = jest.fn(() => 'deploy/artifact');

      CargoLambda.format = { zip: 'zip' };

      artifacts = {
        path: jest.fn((bin) => `build/artifact/${bin}.zip`),
      };
      buildOptions = {
        profile: 'release',
        format: CargoLambda.format.zip,
      };

      // Suppose there are 2 rust functions in serverless.yml
      functions = new Map();

      functions.set('func0', {
        handler: 'bin0',
        package: {
          foo: 'bar',
          individually: false,
          artifact: 'this is invalid path',
        },
      });

      functions.set('func1', {
        handler: 'bin1',
      });

      serverless.service.getFunction = jest.fn((key) => functions.get(key));
    });

    it('calls "fs.createReadStream" for each rust function', () => {
      plugin.modifyFunctions({ artifacts, options: buildOptions });

      expect(fs.createReadStream).toHaveBeenCalledTimes(2);
      expect(fs.createReadStream).toHaveBeenNthCalledWith(1, 'build/artifact/bin0.zip');
      expect(fs.createReadStream).toHaveBeenNthCalledWith(2, 'build/artifact/bin1.zip');
    });

    it('calls "fs.createWriteStream" for each rust function', () => {
      plugin.modifyFunctions({ artifacts, options: buildOptions });

      expect(fs.createWriteStream).toHaveBeenCalledTimes(2);
      expect(fs.createWriteStream).toHaveBeenNthCalledWith(1, 'deploy/artifact/func0.zip');
      expect(fs.createWriteStream).toHaveBeenNthCalledWith(2, 'deploy/artifact/func1.zip');
    });

    it('chages "handler" property to "bootstrap" for each rust function if builder.useZip returns true', () => {
      plugin.modifyFunctions({ artifacts, options: buildOptions });

      const func0 = functions.get('func0');
      expect(func0.handler).toEqual('bootstrap');

      const func1 = functions.get('func1');
      expect(func1.handler).toEqual('bootstrap');
    });

    it('chages "handler" property to binary name for each rust function if format isn\'t zip', () => {
      artifacts = {
        path: jest.fn((bin) => `build/artifact/${bin}`),
      };
      buildOptions = {
        profile: 'release',
        format: 'nonzip',
      };

      plugin.modifyFunctions({ artifacts, options: buildOptions });

      const func0 = functions.get('func0');
      expect(func0.handler).toEqual('func0');

      const func1 = functions.get('func1');
      expect(func1.handler).toEqual('func1');
    });

    it('overwrites "package" definition for each rust function', () => {
      plugin.modifyFunctions({ artifacts, options: buildOptions });

      const func0 = functions.get('func0');
      expect(func0.package).toEqual(expect.objectContaining({
        foo: 'bar',
        individually: true,
        artifact: 'deploy/artifact/func0.zip',
      }));

      const func1 = functions.get('func1');
      expect(func1.package).toEqual(expect.objectContaining({
        individually: true,
        artifact: 'deploy/artifact/func1.zip',
      }));
    });
  });

  describe('method: buildZip', () => {
    beforeEach(() => {
      CargoLambda.format = { zip: 'zip' };

      plugin.buildOptions = jest.fn(() => ({ foo: 'bar' }));
      plugin.run = jest.fn();

      plugin.buildZip();
    });

    it('calls plugin.buildOptions with format zip option', () => {
      const expected = expect.objectContaining({
        format: 'zip',
      });
      expect(plugin.buildOptions).toHaveBeenCalledWith(expected);
    });

    it('calls plugin.run with what plugin.buildOptions returns', () => {
      expect(plugin.run).toHaveBeenCalledWith({
        foo: 'bar',
      });
    });
  });

  describe('method: buildBinary', () => {
    beforeEach(() => {
      CargoLambda.format = { binary: 'binary' };

      plugin.buildOptions = jest.fn(() => ({ foo: 'bar' }));
      plugin.run = jest.fn();

      plugin.buildBinary();
    });

    it('calls plugin.buildOptions with format binary option', () => {
      const expected = expect.objectContaining({
        format: 'binary',
      });
      expect(plugin.buildOptions).toHaveBeenCalledWith(expected);
    });

    it('calls plugin.run with what plugin.buildOptions returns', () => {
      expect(plugin.run).toHaveBeenCalledWith({
        foo: 'bar',
      });
    });
  });

  describe('method: run', () => {
    // An instance of mocked CargoLambda class
    let builder;
    let buildOptions;
    let buildOutput;

    beforeEach(() => {
      buildOptions = {};
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
      plugin.deployArtifactDir = jest.fn(() => 'artifact/target');
      plugin.modifyFunctions = jest.fn();
    });

    it('throws an error if provider is not aws', () => {
      serverless.service.provider.name = 'azuru';
      expect(() => plugin.run(buildOptions)).toThrow(/Provider must be "aws" to use this plugin/);
    });

    it('throws an error if there are no rust functions in serverless.yml', () => {
      plugin.getRustFunctions = jest.fn(() => []);
      expect(() => plugin.run(buildOptions)).toThrow(/no Rust functions found/);
    });

    it('passes buildOptions to CargoLambda constructor', () => {
      plugin.run(buildOptions);
      expect(CargoLambda).toHaveBeenCalledTimes(1);
      expect(CargoLambda).toHaveBeenCalledWith(plugin.cargo, buildOptions);
    });

    it('calls build method of builder', () => {
      plugin.run(buildOptions);
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
      expect(() => plugin.run(buildOptions)).toThrow(/some error/);
    });

    it('calls plugin.deployArtifactDir with buildOptions.profile', () => {
      buildOptions = { profile: 'dev' };
      plugin.run(buildOptions);
      expect(plugin.deployArtifactDir).toHaveBeenCalledTimes(1);
      expect(plugin.deployArtifactDir).toHaveBeenCalledWith('dev');
    });

    it('creates target directory if it doesn\'t exist', () => {
      fs.existsSync = jest.fn(() => false);
      plugin.run(buildOptions);

      expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
      expect(fs.mkdirSync).toHaveBeenCalledWith('artifact/target', { recursive: true });
    });

    it('does not create target directory if it exists', () => {
      fs.existsSync = jest.fn(() => true);
      plugin.run(buildOptions);

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('calls plugin.modifyFunctions with build artifacts and buildOptions', () => {
      plugin.run(buildOptions);

      const expected = expect.objectContaining({
        artifacts: buildOutput.artifacts,
        options: buildOptions,
      });

      expect(plugin.modifyFunctions).toHaveBeenCalledTimes(1);
      expect(plugin.modifyFunctions).toHaveBeenCalledWith(expected);
    });
  });

  describe('method: beforeInvokeLocal', () => {
    it('returns undefined', () => {
      expect(plugin.beforeInvokeLocal()).toBeUndefined();
    });
  });

  describe('method: invokeLocal', () => {
    it('returns undefined', () => {
      expect(plugin.invokeLocal()).toBeUndefined();
    });
  });

  describe('method: afterInvokeLocal', () => {
    it('returns undefined', () => {
      expect(plugin.afterInvokeLocal()).toBeUndefined();
    });
  });
});
