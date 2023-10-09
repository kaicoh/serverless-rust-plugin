const CargoLambda = require('../../lib/cargolambda');
const utils = require('../../lib/utils');

jest.mock('../../lib/utils');

describe('CargoLambda', () => {
  describe('function: build', () => {
    const cargo = { binaries: () => ['bin0', 'bin1'] };
    const srcPath = 'test/path';
    const log = { info: jest.fn() };

    const subject = (options) => CargoLambda.build(cargo, options, { log });

    beforeEach(() => {
      utils.spawn = jest.fn(() => Promise.resolve({ status: 999 }));
    });

    describe('calls "utils.spawn"', () => {
      it('with command "docker" if option docker is true', async () => {
        await subject({ docker: true, srcPath });
        expect(utils.spawn.mock.lastCall[0]).toEqual('docker');
      });

      it('with command "cargo" if option docker is false', async () => {
        await subject({ docker: false, srcPath });
        expect(utils.spawn.mock.lastCall[0]).toEqual('cargo');
      });

      it('with arguments for docker run if option docker is true', async () => {
        await subject({ docker: true, srcPath });
        expect(utils.spawn.mock.lastCall[1]).toEqual([
          'run',
          '--rm',
          '-t',
          '-v',
          'test/path:/tmp',
          '-w',
          '/tmp',
          'ghcr.io/cargo-lambda/cargo-lambda',
          'cargo',
          'lambda',
          'build',
        ]);
      });

      it('with arguments for cargo lambda if option docker is false', async () => {
        await subject({ docker: false, srcPath });
        expect(utils.spawn.mock.lastCall[1]).toEqual(expect.arrayContaining([
          'lambda',
          'build',
        ]));
      });

      it('with release flag when profile options is release', async () => {
        await subject({ profile: 'release', srcPath });
        expect(utils.spawn.mock.lastCall[1]).toEqual(expect.arrayContaining([
          '--release',
        ]));
      });

      it('without release flag when profile options isn\'t release', async () => {
        await subject({ profile: 'debug', srcPath });
        expect(utils.spawn.mock.lastCall[1]).toEqual(expect.not.arrayContaining([
          '--release',
        ]));
      });

      it('with arm64 flag when arch options is arm64', async () => {
        await subject({ arch: 'arm64', srcPath });
        expect(utils.spawn.mock.lastCall[1]).toEqual(expect.arrayContaining([
          '--arm64',
        ]));
      });

      it('without arm64 flag when arch options isn\'t arm64', async () => {
        await subject({ arch: 'x86_64', srcPath });
        expect(utils.spawn.mock.lastCall[1]).toEqual(expect.not.arrayContaining([
          '--arm64',
        ]));
      });

      it('with format zip flag when format options is zip', async () => {
        await subject({ format: 'zip', srcPath });
        expect(utils.spawn.mock.lastCall[1]).toEqual(expect.arrayContaining([
          '--output-format',
          'zip',
        ]));
      });

      it('without format zip flag when format options isn\'t zip', async () => {
        await subject({ format: 'binary', srcPath });
        expect(utils.spawn.mock.lastCall[1]).toEqual(expect.not.arrayContaining([
          '--output-format',
          'zip',
        ]));
      });
    });
  });

  describe('Artifacts class', () => {
    let artifacts;
    let instance;

    beforeEach(() => {
      artifacts = [{ name: 'foo', path: 'test/foo' }, { name: 'bar', path: 'test/bar' }];
      instance = new CargoLambda.Artifacts(artifacts);
    });

    describe('property isEmpty', () => {
      it('returns false when there are some artifacts', () => {
        expect(instance.isEmpty).toBe(false);
      });

      it('returns true when there are no artifacts', () => {
        instance = new CargoLambda.Artifacts([]);
        expect(instance.isEmpty).toBe(true);
      });
    });

    describe('method getAll', () => {
      it('returns inner artifacts', () => {
        expect(instance.getAll()).toEqual(expect.arrayContaining(artifacts));
      });
    });

    describe('method path', () => {
      it('returns the path of the artifact which matches the given name', () => {
        expect(instance.path('bar')).toEqual('test/bar');
      });

      it('returns undefined when there are no matched artifact from given name', () => {
        expect(instance.path('barbaz')).toBeUndefined();
      });
    });
  });
});
