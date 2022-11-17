const R = require('ramda');
const CargoLambda = require('../../lib/cargolambda');

describe('CargoLambda', () => {
  describe('_buildOptions method', () => {
    it('includes --release option when profile is release', () => {
      const options = {
        profile: CargoLambda.profile.release,
      };
      const builder = new CargoLambda(options);
      expect(builder._buildOptions()).toEqual(expect.arrayContaining(['--release']));
    });

    it('does not include --release option when profile is not release', () => {
      const options = {
        profile: CargoLambda.profile.debug,
      };
      const builder = new CargoLambda(options);
      expect(builder._buildOptions()).toEqual(expect.not.arrayContaining(['--release']));
    });

    it('includes --output-format option when format is zip', () => {
      const options = {
        format: CargoLambda.format.zip,
      };
      const builder = new CargoLambda(options);
      expect(builder._buildOptions()).toEqual(expect.arrayContaining(['--output-format', 'zip']));
    });

    it('does not include --output-format option when format is not zip', () => {
      const options = {
        format: CargoLambda.format.binary,
      };
      const builder = new CargoLambda(options);
      expect(builder._buildOptions()).toEqual(expect.not.arrayContaining(['--output-format', 'zip']));
    });

    it('includes --arm64 option when architecture is arm64', () => {
      const options = {
        arch: CargoLambda.architecture.arm64,
      };
      const builder = new CargoLambda(options);
      expect(builder._buildOptions()).toEqual(expect.arrayContaining(['--arm64']));
    });

    it('does not include --arm64 option when architecture is not arm64', () => {
      const options = {
        arch: CargoLambda.architecture.x86_64,
      };
      const builder = new CargoLambda(options);
      expect(builder._buildOptions()).toEqual(expect.not.arrayContaining(['--arm64']));
    });
  });

  describe('_buildCmd method', () => {
    it('returns "docker" when useDocker is true', () => {
      const options = {
        useDocker: true,
      };
      const builder = new CargoLambda(options);
      expect(builder._buildCmd()).toEqual('docker');
    });

    it('returns "cargo" when useDocker is false', () => {
      const options = {
        useDocker: false,
      };
      const builder = new CargoLambda(options);
      expect(builder._buildCmd()).toEqual('cargo');
    });
  });

  describe('_buildArgs method', () => {
    it('returns docker run command options when useDocker is true', () => {
      const options = {
        useDocker: true,
        srcPath: 'test/path',
        dockerImage: 'sample:1.2.3',
        profile: 'release',
        arch: 'x86_64',
        format: 'binary',
      };
      const builder = new CargoLambda(options);
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
      const builder = new CargoLambda(options);
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

  describe('buildCommand method', () => {
    it('returns cargo lambda build command', () => {
      const options = {
        useDocker: false,
        profile: 'release',
        arch: 'arm64',
        format: 'zip',
      };
      const builder = new CargoLambda(options);
      expect(builder.buildCommand()).toEqual('cargo lambda build --release --arm64 --output-format zip');
    });
  });

  describe('howToBuild method', () => {
    it('says using docker when useDocker is true', () => {
      const options = {
        useDocker: true,
        dockerImage: 'sample:1.2.3',
      };
      const builder = new CargoLambda(options);
      expect(builder.howToBuild()).toEqual('Use docker image sample:1.2.3.');
    });

    it('says using local cargo lambda when useDocker is false', () => {
      const options = {
        useDocker: false,
      };
      const builder = new CargoLambda(options);
      expect(builder.howToBuild()).toEqual('Use local cargo-lambda.');
    });
  });

  describe('build method', () => {
    let mockSpawn;
    let result;
    let args;

    beforeEach(() => {
      const options = {
        useDocker: true,
        srcPath: 'test/path',
        dockerImage: 'sample:1.2.3',
        profile: 'release',
        arch: 'x86_64',
        format: 'binary',
      };
      const builder = new CargoLambda(options);

      mockSpawn = jest.fn(() => 'mock return');
      result = builder.build({ foo: 'bar' }, mockSpawn);
      args = mockSpawn.mock.lastCall;
    });

    it('returns what spawn function returns', () => {
      expect(result).toEqual('mock return');
    });

    it('passes _buildCmd output to spawn function as 1st argument', () => {
      expect(args[0]).toEqual('docker');
    });

    it('passes _buildArgs output to spawn function as 2nd argument', () => {
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
      R.zip(args[1], expecteds).forEach(([arg, expected]) => {
        expect(arg).toEqual(expected);
      });
    });

    it('passes 1st argument of itself to spawn function as 3rd argument', () => {
      expect(args[2]).toEqual(expect.objectContaining({ foo: 'bar' }));
    });
  });

  describe('useZip method', () => {
    it('returns true when format is zip', () => {
      const options = {
        format: CargoLambda.format.zip,
      };
      const builder = new CargoLambda(options);
      expect(builder.useZip()).toBe(true);
    });

    it('returns false when format is not zip', () => {
      const options = {
        format: CargoLambda.format.binary,
      };
      const builder = new CargoLambda(options);
      expect(builder.useZip()).toBe(false);
    });
  });

  describe('artifactExt method', () => {
    it('returns ".zip" when format is zip', () => {
      const options = {
        format: CargoLambda.format.zip,
      };
      const builder = new CargoLambda(options);
      expect(builder.artifactExt()).toEqual('.zip');
    });

    it('returns empty string when format is not zip', () => {
      const options = {
        format: CargoLambda.format.binary,
      };
      const builder = new CargoLambda(options);
      expect(builder.artifactExt()).toEqual('');
    });
  });

  describe('artifactPath method', () => {
    it('takes away package name if given binary name has', () => {
      const options = {
        format: CargoLambda.format.zip,
        srcPath: 'test/path',
      };
      const builder = new CargoLambda(options);
      expect(builder.artifactPath('package.binName')).toEqual('test/path/target/lambda/binName/bootstrap.zip');
    });

    it('uses argument if it does not have package name', () => {
      const options = {
        format: CargoLambda.format.zip,
        srcPath: 'test/path',
      };
      const builder = new CargoLambda(options);
      expect(builder.artifactPath('binName')).toEqual('test/path/target/lambda/binName/bootstrap.zip');
    });
  });
});
