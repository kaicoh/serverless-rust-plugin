const R = require('ramda');
const CargoLambda = require('../../../lib/cargolambda');

describe('CargoLambda', () => {
  let cargo;

  beforeEach(() => {
    cargo = {};
  });

  describe('method: _buildOptions', () => {
    it('includes --release option when profile is release', () => {
      const options = {
        profile: CargoLambda.profile.release,
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._buildOptions()).toEqual(expect.arrayContaining(['--release']));
    });

    it('does not include --release option when profile is not release', () => {
      const options = {
        profile: CargoLambda.profile.debug,
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._buildOptions()).toEqual(expect.not.arrayContaining(['--release']));
    });

    it('includes --output-format option when format is zip', () => {
      const options = {
        format: CargoLambda.format.zip,
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._buildOptions()).toEqual(expect.arrayContaining(['--output-format', 'zip']));
    });

    it('does not include --output-format option when format is not zip', () => {
      const options = {
        format: CargoLambda.format.binary,
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._buildOptions()).toEqual(expect.not.arrayContaining(['--output-format', 'zip']));
    });

    it('includes --arm64 option when architecture is arm64', () => {
      const options = {
        arch: CargoLambda.architecture.arm64,
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._buildOptions()).toEqual(expect.arrayContaining(['--arm64']));
    });

    it('does not include --arm64 option when architecture is not arm64', () => {
      const options = {
        arch: CargoLambda.architecture.x86_64,
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._buildOptions()).toEqual(expect.not.arrayContaining(['--arm64']));
    });
  });

  describe('method: _buildCmd', () => {
    it('returns "docker" when useDocker is true', () => {
      const options = {
        useDocker: true,
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._buildCmd()).toEqual('docker');
    });

    it('returns "cargo" when useDocker is false', () => {
      const options = {
        useDocker: false,
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._buildCmd()).toEqual('cargo');
    });
  });

  describe('method: _buildArgs', () => {
    it('returns docker run command options when useDocker is true', () => {
      const options = {
        useDocker: true,
        srcPath: 'test/path',
        dockerImage: 'sample:1.2.3',
        profile: 'release',
        arch: 'x86_64',
        format: 'binary',
      };
      const builder = new CargoLambda(cargo, options);
      const expecteds = [
        'run',
        '--rm',
        '-t',
        '-v',
        'test/path:/tmp',
        '-w',
        '/tmp',
        'sample:1.2.3',
        'build',
        '--release',
      ];
      R.zip(builder._buildArgs(), expecteds).forEach(([arg, expected]) => {
        expect(arg).toEqual(expected);
      });
    });

    it('returns cargo command options when useDocker is false', () => {
      const options = {
        useDocker: false,
        profile: 'debug',
        arch: 'arm64',
        format: 'zip',
      };
      const builder = new CargoLambda(cargo, options);
      const expecteds = [
        'lambda',
        'build',
        '--arm64',
        '--output-format',
        'zip',
      ];
      R.zip(builder._buildArgs(), expecteds).forEach(([arg, expected]) => {
        expect(arg).toEqual(expected);
      });
    });
  });

  describe('method: _artifacts', () => {
    let builder;

    describe('given format is zip', () => {
      beforeEach(() => {
        const options = { format: 'zip' };
        builder = new CargoLambda(cargo, options);

        builder.cargo = { binaries: jest.fn(() => ['bin0', 'bin1']) };
        builder.artifactPath = jest.fn((bin) => `build/${bin}/bootstrap.zip`);
      });

      it('returns an array containing artifact name and path for zip format', () => {
        const expected = expect.arrayContaining([{
          name: 'bin0',
          path: 'build/bin0/bootstrap.zip',
        }, {
          name: 'bin1',
          path: 'build/bin1/bootstrap.zip',
        }]);

        expect(builder._artifacts()).toEqual(expected);
      });
    });
  });

  describe('method _useZip', () => {
    it('returns true when format is zip', () => {
      const options = {
        format: CargoLambda.format.zip,
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._useZip()).toBe(true);
    });

    it('returns false when format is not zip', () => {
      const options = {
        format: CargoLambda.format.binary,
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._useZip()).toBe(false);
    });
  });

  describe('method: _artifactExt', () => {
    it('returns ".zip" when format is zip', () => {
      const options = {
        format: CargoLambda.format.zip,
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._artifactExt()).toEqual('.zip');
    });

    it('returns empty string when format is not zip', () => {
      const options = {
        format: CargoLambda.format.binary,
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._artifactExt()).toEqual('');
    });
  });

  describe('method: _artifactPath', () => {
    it('takes away package name if given binary name has', () => {
      const options = {
        format: CargoLambda.format.zip,
        srcPath: 'test/path',
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._artifactPath('package.binName')).toEqual('test/path/target/lambda/binName/bootstrap.zip');
    });

    it('uses argument if it does not have package name', () => {
      const options = {
        format: CargoLambda.format.zip,
        srcPath: 'test/path',
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder._artifactPath('binName')).toEqual('test/path/target/lambda/binName/bootstrap.zip');
    });
  });

  describe('method: buildCommand', () => {
    it('returns cargo lambda build command', () => {
      const options = {
        useDocker: false,
        profile: 'release',
        arch: 'arm64',
        format: 'zip',
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder.buildCommand()).toEqual('cargo lambda build --release --arm64 --output-format zip');
    });
  });

  describe('method: howToBuild', () => {
    it('says using docker when useDocker is true', () => {
      const options = {
        useDocker: true,
        dockerImage: 'sample:1.2.3',
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder.howToBuild()).toEqual('Use docker image sample:1.2.3.');
    });

    it('says using local cargo lambda when useDocker is false', () => {
      const options = {
        useDocker: false,
      };
      const builder = new CargoLambda(cargo, options);
      expect(builder.howToBuild()).toEqual('Use local cargo-lambda.');
    });
  });

  describe('method: build', () => {
    let builder;
    let mockSpawn;
    let output;
    let args;

    beforeEach(() => {
      builder = new CargoLambda(cargo, {});
      builder._buildCmd = jest.fn(() => 'buildCmd');
      builder._buildArgs = jest.fn(() => ['arg0', 'arg1', 'arg2']);
      builder._artifacts = jest.fn(() => []);

      mockSpawn = jest.fn(() => 'mock return');
    });

    it('passes _buildCmd output to spawn function as 1st argument', () => {
      output = builder.build(mockSpawn, { foo: 'bar' });
      args = mockSpawn.mock.lastCall;

      expect(args[0]).toEqual('buildCmd');
    });

    it('passes _buildArgs output to spawn function as 2nd argument', () => {
      output = builder.build(mockSpawn, { foo: 'bar' });
      args = mockSpawn.mock.lastCall;

      R.zip(args[1], ['arg0', 'arg1', 'arg2']).forEach(([arg, expected]) => {
        expect(arg).toEqual(expected);
      });
    });

    it('passes 1st argument of itself to spawn function as 3rd argument', () => {
      output = builder.build(mockSpawn, { foo: 'bar' });
      args = mockSpawn.mock.lastCall;

      expect(args[2]).toEqual(expect.objectContaining({ foo: 'bar' }));
    });

    describe('returns an object', () => {
      it('contains "result" property is equal to what spawn function returns', () => {
        output = builder.build(mockSpawn, { foo: 'bar' });
        expect(output.result).toEqual('mock return');
      });

      describe('contains "artifacts" property', () => {
        beforeEach(() => {
          builder._artifacts = jest.fn(() => [{
            name: 'bin0',
            path: 'build/bin0/bootstrap.zip',
          }, {
            name: 'bin1',
            path: 'build/bin1/bootstrap.zip',
          }]);

          output = builder.build(mockSpawn, { foo: 'bar' });
        });

        it('has getAll method to return all artifacts object', () => {
          const expected = expect.arrayContaining([{
            name: 'bin0',
            path: 'build/bin0/bootstrap.zip',
          }, {
            name: 'bin1',
            path: 'build/bin1/bootstrap.zip',
          }]);
          expect(output.artifacts.getAll()).toEqual(expected);
        });

        it('has path method to return one artifact path', () => {
          expect(output.artifacts.path('bin0')).toEqual('build/bin0/bootstrap.zip');
          expect(output.artifacts.path('bin1')).toEqual('build/bin1/bootstrap.zip');
          expect(output.artifacts.path('bin2')).toBeUndefined();
        });
      });
    });
  });
});
