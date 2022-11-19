const path = require('path');
const fs = require('fs');
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

    CargoLambda.mockClear();
    CargoLambda.mockImplementation(() => ({
      buildCommand: jest.fn(() => ['buildCommand', 'output']),
      howToBuild: jest.fn(() => 'somehow'),
      build: jest.fn(() => ({ status: 0 })),
      useZip: jest.fn(() => true),
      artifactExt: jest.fn(() => '.js'),
      artifactPath: jest.fn(() => 'test/path'),
      profile: 'release',
    }));

    serverless = createMockServerless();
    options = {};

    plugin = new ServerlessRustPlugin(serverless, options);
  });

  describe('constructor', () => {
    // the path index.js is in.
    const indexPath = path.join(__dirname, '../..');

    it('sets "before:package:createDeploymentArtifacts" hook', () => {
      expect(plugin.hooks['before:package:createDeploymentArtifacts']).toBeDefined();
    });

    it('sets "before:deploy:function:packageFunction" hook', () => {
      expect(plugin.hooks['before:deploy:function:packageFunction']).toBeDefined();
    });

    it.each([
      // major, minor
      [1, 36],
      [1, 40],
      [2, 0],
    ])('doesn\'t set "before:invoke:local:invoke" hook when serverless version is %d.%d.x', (major, minor) => {
      serverless.version = `${major}.${minor}.x`;
      plugin = new ServerlessRustPlugin(serverless, options);
      expect(plugin.hooks['before:invoke:local:invoke']).toBeUndefined();
    });

    it.each([
      // major, minor
      [1, 38],
      [1, 39],
    ])('sets "before:invoke:local:invoke" hook when serverless version is %d.%d.x', (major, minor) => {
      serverless.version = `${major}.${minor}.x`;
      plugin = new ServerlessRustPlugin(serverless, options);
      expect(plugin.hooks['before:invoke:local:invoke']).toBeDefined();
    });

    it('sets "srcPath" from serverless.config.servicePath', () => {
      const expected = path.join(indexPath, serverless.config.servicePath);
      expect(plugin.srcPath).toEqual(expected);
    });

    it('sets project root directory to "srcPath" if serverless.config.servicePath is undefined', () => {
      serverless.config.servicePath = undefined;
      plugin = new ServerlessRustPlugin(serverless, options);
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
  });

  describe('method: log', () => {
    beforeEach(() => {
      plugin.log('this is a log');
    });

    it('calls serverless.cli.log once', () => {
      expect(serverless.cli.log).toHaveBeenCalledTimes(1);
    });

    it('calls serverless.cli.log with prefixed message', () => {
      expect(serverless.cli.log).toHaveBeenCalledWith('[ServerlessRustPlugin]: this is a log');
    });
  });

  describe('method: deployArtifactDir', () => {
    it('returns a string concantenating srcPath, target, lambda and given arg', () => {
      const expected = path.join(plugin.srcPath, 'target', 'lambda', 'arg');
      expect(plugin.deployArtifactDir('arg')).toEqual(expected);
    });
  });

  describe('method: functions', () => {
    it('returns what serverless.service.getAllFunctions returns', () => {
      const expected = expect.arrayContaining(serverless.service.getAllFunctions());
      expect(plugin.functions()).toEqual(expected);
    });
  });

  describe('method: providerIsAws', () => {
    it('returns true if serverless.service.provider.name is "aws"', () => {
      serverless.service.provider.name = 'aws';
      expect(plugin.providerIsAws()).toBe(true);
    });

    it('returns false if serverless.service.provider.name is not "aws"', () => {
      serverless.service.provider.name = 'azure';
      expect(plugin.providerIsAws()).toBe(false);
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
        plugin = new ServerlessRustPlugin(serverless, options);
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
        plugin = new ServerlessRustPlugin(serverless, options);
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
        plugin = new ServerlessRustPlugin(serverless, options);
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

      plugin = new ServerlessRustPlugin(serverless, options);

      const result = plugin.getRustFunctions();
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining(['func0', 'func1']));
    });

    it('returns function names if some handlers are equal to one of the binary names', () => {
      // function handler is not equal to one of the binary names.
      serverless.service.getFunction.mockImplementation(() => ({ handler: 'non rust func' }));
      // Only one function handler is equal to one of the binary names.
      serverless.service.getFunction.mockImplementationOnce(() => ({ handler: 'bin0' }));

      plugin = new ServerlessRustPlugin(serverless, options);

      const result = plugin.getRustFunctions();
      expect(result).toHaveLength(1);
      expect(result).toEqual(expect.arrayContaining(['func0']));
    });

    it('returns an empty array if no handlers are equal to one of the binary names', () => {
      // function handler is not equal to one of the binary names.
      serverless.service.getFunction.mockImplementation(() => ({ handler: 'non rust func' }));

      plugin = new ServerlessRustPlugin(serverless, options);

      const result = plugin.getRustFunctions();
      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('method: resetEachPackage', () => {
    let functions;
    let builder;

    const targetDir = 'target';
    const rustFunctions = ['func0', 'func1'];

    beforeEach(() => {
      builder = {
        artifactPath: jest.fn((bin) => `build/artifact/${bin}.zip`),
        artifactExt: jest.fn(() => '.zip'),
        useZip: jest.fn(() => true),
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
      plugin.resetEachPackage({ rustFunctions, builder, targetDir });

      expect(fs.createReadStream).toHaveBeenCalledTimes(2);
      expect(fs.createReadStream).toHaveBeenNthCalledWith(1, 'build/artifact/bin0.zip');
      expect(fs.createReadStream).toHaveBeenNthCalledWith(2, 'build/artifact/bin1.zip');
    });

    it('calls "fs.createWriteStream" for each rust function', () => {
      plugin.resetEachPackage({ rustFunctions, builder, targetDir });

      expect(fs.createWriteStream).toHaveBeenCalledTimes(2);
      expect(fs.createWriteStream).toHaveBeenNthCalledWith(1, 'target/func0.zip');
      expect(fs.createWriteStream).toHaveBeenNthCalledWith(2, 'target/func1.zip');
    });

    it('chages "handler" property to "bootstrap" for each rust function if builder.useZip returns true', () => {
      plugin.resetEachPackage({ rustFunctions, builder, targetDir });

      const func0 = functions.get('func0');
      expect(func0.handler).toEqual('bootstrap');

      const func1 = functions.get('func1');
      expect(func1.handler).toEqual('bootstrap');
    });

    it('chages "handler" property to binary name for each rust function if builder.useZip returns false', () => {
      builder = {
        artifactPath: jest.fn((bin) => `build/artifact/${bin}`),
        artifactExt: jest.fn(() => ''),
        useZip: jest.fn(() => false),
      };

      plugin.resetEachPackage({ rustFunctions, builder, targetDir });

      const func0 = functions.get('func0');
      expect(func0.handler).toEqual('func0');

      const func1 = functions.get('func1');
      expect(func1.handler).toEqual('func1');
    });

    it('overwrites "package" definition for each rust function', () => {
      plugin.resetEachPackage({ rustFunctions, builder, targetDir });

      const func0 = functions.get('func0');
      expect(func0.package).toEqual(expect.objectContaining({
        foo: 'bar',
        individually: true,
        artifact: 'target/func0.zip',
      }));

      const func1 = functions.get('func1');
      expect(func1.package).toEqual(expect.objectContaining({
        individually: true,
        artifact: 'target/func1.zip',
      }));
    });
  });

  describe('method: buildZip', () => {
    beforeEach(() => {
      plugin.build = jest.fn();
      plugin.buildOptions = jest.fn(() => ({ foo: 'bar' }));
    });

    describe('when plugin.providerIsAws returns true', () => {
      beforeEach(() => {
        plugin.providerIsAws = jest.fn(() => true);
      });

      it('calls plugin.buildOptions with format zip option', () => {
        plugin.buildZip();

        const expected = expect.objectContaining({
          format: 'zip',
        });
        expect(plugin.buildOptions).toHaveBeenCalledWith(expected);
      });

      it('calls CargoLambda constructor with what plugin.buildOptions returns', () => {
        plugin.buildZip();

        expect(CargoLambda).toHaveBeenCalledWith({
          foo: 'bar',
        });
      });

      it('calls plugin.build with what CargoLambda constructor returns', () => {
        CargoLambda.mockImplementationOnce(() => ({
          foo: 'barbaz',
        }));

        plugin.buildZip();

        expect(plugin.build).toHaveBeenCalledWith({
          foo: 'barbaz',
        });
      });
    });

    describe('when plugin.providerIsAws returns false', () => {
      beforeEach(() => {
        plugin.providerIsAws = jest.fn(() => false);
        plugin.buildZip();
      });

      it('does not call plugin.buildOptions', () => {
        expect(plugin.buildOptions).not.toHaveBeenCalled();
      });

      it('does not call CargoLambda constructor', () => {
        expect(CargoLambda).not.toHaveBeenCalled();
      });

      it('does not call plugin.build', () => {
        expect(plugin.build).not.toHaveBeenCalled();
      });
    });
  });

  describe('method: buildBinary', () => {
    beforeEach(() => {
      plugin.build = jest.fn();
      plugin.buildOptions = jest.fn(() => ({ foo: 'bar' }));
    });

    describe('when plugin.providerIsAws returns true', () => {
      beforeEach(() => {
        plugin.providerIsAws = jest.fn(() => true);
      });

      it('calls plugin.buildOptions with format binary option', () => {
        plugin.buildBinary();

        const expected = expect.objectContaining({
          format: 'binary',
        });
        expect(plugin.buildOptions).toHaveBeenCalledWith(expected);
      });

      it('calls CargoLambda constructor with what plugin.buildOptions returns', () => {
        plugin.buildBinary();

        expect(CargoLambda).toHaveBeenCalledWith({
          foo: 'bar',
        });
      });

      it('calls plugin.build with what CargoLambda constructor returns', () => {
        CargoLambda.mockImplementationOnce(() => ({
          foo: 'barbaz',
        }));

        plugin.buildBinary();

        expect(plugin.build).toHaveBeenCalledWith({
          foo: 'barbaz',
        });
      });
    });

    describe('when plugin.providerIsAws returns false', () => {
      beforeEach(() => {
        plugin.providerIsAws = jest.fn(() => false);
        plugin.buildBinary();
      });

      it('does not call plugin.buildOptions', () => {
        expect(plugin.buildOptions).not.toHaveBeenCalled();
      });

      it('does not call CargoLambda constructor', () => {
        expect(CargoLambda).not.toHaveBeenCalled();
      });

      it('does not call plugin.build', () => {
        expect(plugin.build).not.toHaveBeenCalled();
      });
    });
  });

  describe('method: build', () => {
    let builder;

    beforeEach(() => {
      // To confirm mock implementation, see above.
      builder = new CargoLambda();

      plugin.getRustFunctions = jest.fn(() => ['func0', 'func1']);
      plugin.log = jest.fn();
      plugin.deployArtifactDir = jest.fn(() => 'artifact/target');
      plugin.resetEachPackage = jest.fn();
    });

    it('throws an error if there are no rust functions in serverless.yml', () => {
      plugin.getRustFunctions = jest.fn(() => []);
      expect(() => plugin.build(builder)).toThrow(/no Rust functions found/);
    });

    it('calls build method of given builder', () => {
      plugin.build(builder);
      expect(builder.build).toHaveBeenCalledTimes(1);
      expect(builder.build).toHaveBeenCalledWith(expect.objectContaining({
        stdio: ['ignore', process.stdout, process.stderr],
      }));
    });

    it('throws an error if builder.build method returns a failed result', () => {
      builder.build = jest.fn(() => ({ status: 1, error: 'some error' }));
      expect(() => plugin.build(builder)).toThrow(/some error/);
    });

    it('creates target directory if it doesn\'t exist', () => {
      fs.existsSync = jest.fn(() => false);
      plugin.build(builder);

      expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
      expect(fs.mkdirSync).toHaveBeenCalledWith('artifact/target', { recursive: true });
    });

    it('does not create target directory if it exists', () => {
      fs.existsSync = jest.fn(() => true);
      plugin.build(builder);

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('calls plugin resetEachPackage method', () => {
      plugin.build(builder);
      expect(plugin.resetEachPackage).toHaveBeenCalledWith({
        rustFunctions: ['func0', 'func1'],
        targetDir: 'artifact/target',
        builder,
      });
    });
  });
});
