const cp = require('child_process');
const net = require('net');
const { PassThrough } = require('stream');
const utils = require('../../lib/utils');

jest.mock('child_process');
jest.mock('net');

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

describe('getFreePort', () => {
  let server;

  beforeEach(() => {
    net.createServer = jest.fn(() => server);
  });

  describe('when success', () => {
    beforeEach(() => {
      server = {
        on: jest.fn(),
        listen: jest.fn((_, callback) => {
          callback();
        }),
        address: jest.fn(() => ({ port: 9999 })),
        close: jest.fn(),
      };
    });

    it('resolves with a port number which is from server.address function', async () => {
      const result = await utils.getFreePort();
      expect(result).toEqual(9999);
    });

    it('closes the server', async () => {
      await utils.getFreePort();
      expect(server.close).toHaveBeenCalled();
    });
  });

  describe('when server.address doesn\'t return port', () => {
    beforeEach(() => {
      server = {
        on: jest.fn(),
        listen: jest.fn((_, callback) => {
          callback();
        }),
        address: jest.fn(() => ({})),
        close: jest.fn(),
      };
    });

    it('rejects with an error', async () => {
      await expect(() => utils.getFreePort()).rejects.toThrow(/Unable to get the server's given port/);
    });

    it('closes the server', async () => {
      await expect(() => utils.getFreePort()).rejects.toThrow();
      expect(server.close).toHaveBeenCalled();
    });
  });

  describe('when server gets an error', () => {
    beforeEach(() => {
      server = {
        on: jest.fn((_, callback) => {
          callback(new Error('an error'));
        }),
        listen: jest.fn(),
        address: jest.fn(() => ({ port: 9999 })),
        close: jest.fn(),
      };
    });

    it('rejects with an error', async () => {
      await expect(() => utils.getFreePort()).rejects.toThrow(/an error/);
    });

    it('closes the server', async () => {
      await expect(() => utils.getFreePort()).rejects.toThrow();
      expect(server.close).toHaveBeenCalled();
    });
  });
});
