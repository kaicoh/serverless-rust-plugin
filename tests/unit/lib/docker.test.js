const Docker = require('../../../lib/docker');
const CargoLambda = require('../../../lib/cargolambda');

describe('Docker', () => {
  let dockerArm;
  let dockerX86;

  beforeEach(() => {
    dockerArm = new Docker({
      name: 'Docker arm64',
      arch: CargoLambda.architecture.arm64,
      binDir: 'build/arm64',
      bin: 'binArm64',
      env: [],
      port: 9090,
    });

    dockerX86 = new Docker({
      name: 'Docker x86_64',
      arch: CargoLambda.architecture.x86_64,
      binDir: 'build/x86_64',
      bin: 'binX86_64',
      env: [],
      port: 9999,
    });
  });

  describe('method: _useArm64', () => {
    it('returns true when given arch is arm64', () => {
      expect(dockerArm._useArm64()).toBe(true);
    });

    it('returns false when given arch is x86_64', () => {
      expect(dockerX86._useArm64()).toBe(false);
    });
  });

  describe('method: _platform', () => {
    it('returns "linux/arm64/v8" when given arch is arm64', () => {
      expect(dockerArm._platform()).toBe('linux/arm64/v8');
    });

    it('returns "linux/amd64" when given arch is x86_64', () => {
      expect(dockerX86._platform()).toBe('linux/amd64');
    });
  });

  describe('method: _image', () => {
    it('returns "provided:al2-arm64" when given arch is arm64', () => {
      expect(dockerArm._image()).toBe('public.ecr.aws/lambda/provided:al2-arm64');
    });

    it('returns "provided:al2-x86_64" when given arch is x86_64', () => {
      expect(dockerX86._image()).toBe('public.ecr.aws/lambda/provided:al2-x86_64');
    });
  });

  describe('method: _args', () => {
    it('returns docker run args for arm64 image when given arch is arm64', () => {
      const expected = [
        'run',
        '-i',
        '-d',
        '--rm',
        '-v',
        'build/arm64:/var/runtime',
        '-p',
        '9090:8080',
        '--name',
        'Docker arm64',
        '--platform',
        'linux/arm64/v8',
        'public.ecr.aws/lambda/provided:al2-arm64',
        'binArm64',
      ];
      expect(dockerArm._args()).toEqual(expected);
    });

    it('returns docker run args for amd64 image when given arch is x86_64', () => {
      const expected = [
        'run',
        '-i',
        '-d',
        '--rm',
        '-v',
        'build/x86_64:/var/runtime',
        '-p',
        '9999:8080',
        '--name',
        'Docker x86_64',
        '--platform',
        'linux/amd64',
        'public.ecr.aws/lambda/provided:al2-x86_64',
        'binX86_64',
      ];
      expect(dockerX86._args()).toEqual(expected);
    });

    describe('when given env option', () => {
      const options = {
        name: 'Docker arm64',
        arch: CargoLambda.architecture.arm64,
        binDir: 'build/arm64',
        bin: 'binArm64',
        env: [],
        port: 9090,
      };

      it('sets env args', () => {
        const docker = new Docker({ ...options, env: ['foo=bar'] });
        expect(docker._args()).toEqual(expect.arrayContaining([
          '--env',
          'foo=bar',
        ]));
      });

      it('escapes space if the value includes any spaces', () => {
        const docker = new Docker({ ...options, env: ['foo=bar baz'] });
        expect(docker._args()).toEqual(expect.arrayContaining([
          '--env',
          'foo=bar\ baz', // eslint-disable-line no-useless-escape
        ]));
      });
    });

    describe('when given network option', () => {
      const options = {
        name: 'Docker arm64',
        arch: CargoLambda.architecture.arm64,
        binDir: 'build/arm64',
        bin: 'binArm64',
        env: [],
        network: 'serverless-rust-plugin',
        port: 9090,
      };

      it('sets network args', () => {
        const docker = new Docker(options);
        expect(docker._args()).toEqual(expect.arrayContaining([
          '--network',
          'serverless-rust-plugin',
        ]));
      });
    });
  });

  describe('method: run', () => {
    let spawn;
    let result;

    beforeEach(() => {
      dockerArm._args = jest.fn(() => ['foo', 'bar']);
      spawn = jest.fn(() => 'spawn return');

      result = dockerArm.run(spawn);
    });

    it('returns what spawn returns', () => {
      expect(result).toEqual('spawn return');
    });

    it('calls spawn function with correct arguments', () => {
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(spawn).toHaveBeenCalledWith('docker', ['foo', 'bar'], {
        stdio: [process.stdin, 'pipe', process.stderr],
        encoding: 'utf-8',
      });
    });
  });

  describe('method: runCommand', () => {
    it('shows a docker run command with given options', () => {
      dockerArm._args = jest.fn(() => ['foo', 'bar']);
      expect(dockerArm.runCommand()).toEqual('docker run foo bar');
    });
  });

  describe('method: running', () => {
    it('returns true when spawn function returns stdout "true"', () => {
      const spawn = jest.fn(() => ({ stdout: '"true"' }));
      expect(dockerArm.running(spawn)).toBe(true);
    });

    it('returns false when spawn function returns non-string stdout', () => {
      const spawn = jest.fn(() => ({ stdout: 0 }));
      expect(dockerArm.running(spawn)).toBe(false);
    });

    it('returns false when spawn function returns stdout not "true"', () => {
      const spawn = jest.fn(() => ({ stdout: '"false"' }));
      expect(dockerArm.running(spawn)).toBe(false);
    });

    it('calls spawn function with correct arguments', () => {
      const spawn = jest.fn(() => ({}));
      const expectedArgs = [
        'inspect',
        '--format',
        '"{{json .State.Running}}"',
        'Docker arm64',
      ];
      dockerArm.running(spawn);

      expect(spawn).toHaveBeenCalledTimes(1);
      expect(spawn).toHaveBeenCalledWith('docker', expectedArgs, {
        stdio: [process.stdin, 'pipe', process.stderr],
        encoding: 'utf-8',
      });
    });
  });

  describe('method: stop', () => {
    let spawn;
    let result;

    beforeEach(() => {
      dockerArm._args = jest.fn(() => ['foo', 'bar']);
      spawn = jest.fn(() => 'spawn return');

      result = dockerArm.stop(spawn);
    });

    it('returns what spawn returns', () => {
      expect(result).toEqual('spawn return');
    });

    it('calls spawn function with correct arguments', () => {
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(spawn).toHaveBeenCalledWith('docker', ['stop', 'Docker arm64'], {
        stdio: [process.stdin, 'pipe', process.stderr],
        encoding: 'utf-8',
      });
    });
  });
});
