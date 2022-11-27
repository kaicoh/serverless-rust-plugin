const cp = require('child_process');
const { PassThrough } = require('stream');
const utils = require('../../lib/utils');

jest.mock('child_process');

describe('spawn', () => {
  let promise;
  let child;

  beforeEach(() => {
    child = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();

    cp.spawn = jest.fn(() => child);

    promise = utils.spawn('cmd', ['arg0', 'arg1'], { foo: 'bar' });
  });

  it('calls "child_process.spawn" with given arguments', async () => {
    child.emit('close', 0);
    await promise;
    expect(cp.spawn).toHaveBeenCalledWith('cmd', ['arg0', 'arg1'], { foo: 'bar' });
  });

  it('resolves with child process exit code', async () => {
    child.emit('close', 999);
    expect(await promise).toEqual(expect.objectContaining({
      code: 999,
    }));
  });

  it('rejects when child process emits an error', () => {
    const subject = () => { child.emit('error', new Error('some error')); };
    expect(subject).toThrow(/some error/);
  });

  it('collects data emitted to stdout and returns it', async () => {
    child.stdout.emit('data', 'This i');
    child.stdout.emit('data', 's a');
    child.stdout.emit('data', ' test.');

    child.emit('close', 0);
    expect(await promise).toEqual(expect.objectContaining({
      stdout: 'This is a test.',
    }));
  });

  it('collects data emitted to stderr and returns it', async () => {
    child.stderr.emit('data', 'This i');
    child.stderr.emit('data', 's a');
    child.stderr.emit('data', ' test.');

    child.emit('close', 0);
    expect(await promise).toEqual(expect.objectContaining({
      stderr: 'This is a test.',
    }));
  });
});
