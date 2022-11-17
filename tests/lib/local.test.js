const R = require('ramda');
const LocalBuilder = require('../../lib/local');

describe('LocalBuilder', () => {
  const options = {
    cargoLambdaOptions: ['opt0', 'opt1'],
    spawnOptions: { foo: 'bar' },
  };

  describe('build method', () => {
    let mockSpawn;
    let result;

    beforeEach(() => {
      const builder = new LocalBuilder(options);

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

      expect(args[0]).toEqual('cargo');

      const expected2nd = [
        'lambda',
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
