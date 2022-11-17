const R = require('ramda');
const DockerBuilder = require('../../lib/docker');

describe('DockerBuilder', () => {
  const options = {
    srcPath: 'test/path',
    cargoLambdaOptions: ['opt0', 'opt1'],
    dockerImage: 'someImage:1.2.3',
    spawnOptions: { foo: 'bar' },
  };

  describe('build method', () => {
    let mockSpawn;
    let result;

    beforeEach(() => {
      const builder = new DockerBuilder(options);

      mockSpawn = jest.fn(() => 'mockSpawn return');
      result = builder.build(mockSpawn);
    });

    it('calls mockSpawn once', () => {
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('returns the value spawn returns', () => {
      expect(result).toEqual('mockSpawn return');
    });

    it('calls mockSpawn with correct arguments', () => {
      const args = mockSpawn.mock.lastCall;
      expect(args).toHaveLength(3);

      expect(args[0]).toEqual('docker');

      const expected2nd = [
        'run',
        '--rm',
        '-t',
        '-v',
        'test/path:/tmp',
        '-w',
        '/tmp',
        'someImage:1.2.3',
        'build',
        'opt0',
        'opt1',
      ];

      R.zip(args[1], expected2nd).forEach(([arg, expected]) => {
        expect(arg).toEqual(expected);
      });

      expect(args[2]).toEqual(expect.objectContaining({
        foo: 'bar',
      }));
    });
  });
});
