const cp = require('child_process');
const net = require('net');
const fs = require('fs');
const { PassThrough, Readable, Writable } = require('stream');
const utils = require('../../lib/utils');

jest.mock('child_process');
jest.mock('net');
jest.mock('fs');

describe('spawn', () => {
  let promise;
  let child;

  beforeEach(() => {
    child = new PassThrough();

    cp.spawn = jest.fn().mockImplementation(() => child);
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

  it('resolves with error if child process invokes error callback', async () => {
    const error = { foo: 'bar' };

    child.on = jest.fn()
      .mockImplementationOnce((_, callback) => { callback(error); })
      .mockImplementation((_, callback) => { callback(1); });

    const subject = () => utils.spawn('cmd', ['arg0', 'arg1'], { foo: 'bar' });

    expect(await subject()).toEqual(expect.objectContaining({
      code: 1,
      error,
    }));
  });

  it('collects data emitted to stdout and returns it', async () => {
    child.stdout = new PassThrough();

    promise = utils.spawn('cmd', ['arg0', 'arg1'], { foo: 'bar' });

    child.stdout.emit('data', 'This i');
    child.stdout.emit('data', 's a');
    child.stdout.emit('data', ' test.');

    child.emit('close', 0);
    expect(await promise).toEqual(expect.objectContaining({
      stdout: 'This is a test.',
    }));
  });

  it('collects data emitted to stderr and returns it', async () => {
    child.stderr = new PassThrough();

    promise = utils.spawn('cmd', ['arg0', 'arg1'], { foo: 'bar' });

    child.stderr.emit('data', 'This i');
    child.stderr.emit('data', 's a');
    child.stderr.emit('data', ' test.');

    child.emit('close', 0);
    expect(await promise).toEqual(expect.objectContaining({
      stderr: 'This is a test.',
    }));
  });
});

describe('hasSpawnError', () => {
  it('returns true if the argument\'s error property exists', () => {
    expect(utils.hasSpawnError({ error: {} })).toBe(true);
  });

  it('returns true if the argument\'s code property is larger than 0', () => {
    expect(utils.hasSpawnError({ code: 1 })).toBe(true);
  });

  it('returns false if the argument is neither of the above 2', () => {
    expect(utils.hasSpawnError({ code: 0 })).toBe(false);
  });
});

describe('mkdirSyncIfNotExist', () => {
  beforeEach(() => {
    fs.mkdirSync = jest.fn();
  });

  describe('if the given directory doesn\'t exist', () => {
    beforeEach(() => {
      fs.existsSync = jest.fn(() => false);
      utils.mkdirSyncIfNotExist('some dir');
    });

    it('calls fs.mkdirSync', () => {
      expect(fs.mkdirSync).toHaveBeenCalledWith('some dir', { recursive: true });
    });
  });

  describe('if the given directory exists', () => {
    beforeEach(() => {
      fs.existsSync = jest.fn(() => true);
      utils.mkdirSyncIfNotExist('some dir');
    });

    it('doesn\'t call fs.mkdirSync', () => {
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });
});

describe('readFileSyncIfExist', () => {
  let result;

  beforeEach(() => {
    fs.readFileSync = jest.fn(() => 'contents in a file');
  });

  describe('if the given file doesn\'t exist', () => {
    beforeEach(() => {
      fs.existsSync = jest.fn(() => false);
      result = utils.readFileSyncIfExist('a file');
    });

    it('returns undefined', () => {
      expect(result).toBeUndefined();
    });

    it('doesn\'t call fs.readFileSync', () => {
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });

  describe('if the given file exists', () => {
    beforeEach(() => {
      fs.existsSync = jest.fn(() => true);
      result = utils.readFileSyncIfExist('a file');
    });

    it('returns what fs.readFileSync returns', () => {
      expect(result).toEqual('contents in a file');
    });

    it('calls fs.readFileSync', () => {
      expect(fs.readFileSync).toHaveBeenCalledWith('a file', 'utf8');
    });
  });
});

describe('copyFile', () => {
  let stream;

  beforeEach(() => {
    stream = {
      on: jest.fn()
        .mockImplementationOnce(() => {})
        .mockImplementation((_, callback) => { callback(); }),
    };

    fs.createReadStream = jest.fn(() => ({
      pipe: jest.fn(() => stream),
    }));
    fs.createwriteStream = jest.fn(() => 'writable stream');
  });

  it('copys from src to dist', async () => {
    await utils.copyFile('src file', 'dist file');
    expect(fs.createReadStream).toHaveBeenCalledWith('src file');
    expect(fs.createWriteStream).toHaveBeenCalledWith('dist file');
  });

  it('returns a promise resolves when copying succeeds', async () => {
    await expect(utils.copyFile('src', 'dist')).resolves.toBeUndefined();
  });

  it('returns a promise rejects when copying fails', async () => {
    const error = { foo: 'bar' };
    stream = {
      on: jest.fn()
        .mockImplementation((_, callback) => { callback(error); }),
    };
    await expect(utils.copyFile('src', 'dist')).rejects.toEqual(error);
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

describe('color', () => {
  const table = [
    ['black', 30],
    ['red', 31],
    ['green', 32],
    ['yellow', 33],
    ['blue', 34],
    ['magenta', 35],
    ['cyan', 36],
    ['white', 37],
  ];

  const expected = (num) => `\u001b[${num}mMessage\u001b[39m`;

  it.each(table)('returns the decorated message when color.%s is called', (color, num) => {
    expect(utils.color[color]('Message')).toEqual(expected(num));
  });

  it.each(table)('returns an empty message when when color.%s is called with an falsy object', (color) => {
    expect(utils.color[color]()).toEqual('');
  });

  it('doesn\'t decorate message when color.default is called', () => {
    expect(utils.color.default('Message')).toEqual('Message');
  });

  describe('fromIndex', () => {
    const message = 'message';
    const indexTable = [
      ['cyan', 0],
      ['yellow', 1],
      ['green', 2],
      ['magenta', 3],
      ['blue', 4],
      ['red', 5],
    ];

    it.each(indexTable)('docorates with "%s" if index is %d(mod 6)', (color, index) => {
      expect(utils.color.fromIndex(index)(message)).toEqual(utils.color[color](message));
    });
  });
});

describe('addPrefixForEachLine', () => {
  /*
   * Assume following
   *
   * [Input Stream]
   * Lorem ipsum dolor si
   * t amet, consectetur
   * adipiscing elit. Pha
   * sellus pulvinar nibh
   * sed mauris convall
   *
   * [Output Stream]
   * [prefix] Lorem ipsum dolor si
   * [prefix] t amet, consectetur
   * [prefix] adipiscing elit. Pha
   * [prefix] sellus pulvinar nibh
   * [prefix] sed mauris convall
   */

  it('inserts prefix for each line', (done) => {
    const outputs = [];
    const expected = [
      '[prefix] Lorem ipsum dolor si',
      '[prefix] t amet, consectetur ',
      '[prefix] adipiscing elit. Pha',
      '[prefix] sellus pulvinar nibh',
      '[prefix] sed mauris convall\n',
    ].join('\n');

    async function* inputs() {
      yield 'Lorem ipsum do';
      yield 'lor si\nt ame';
      yield 't, consectetur \nadipiscing elit. Pha\nsell';
      yield 'us pulvinar ';
      yield 'nibh\nsed mauris convall';
    }

    const stream = Readable.from(inputs())
      .pipe(utils.addPrefixForEachLine('[prefix] '));

    stream.on('data', (chunk) => {
      outputs.push(chunk.toString());
    });

    stream.on('end', () => {
      const output = outputs.join('');
      expect(output).toEqual(expected);

      done();
    });
  });

  it('doesn\'t emit data if there are no rest data in flushing', (done) => {
    const outputs = [];
    const expected = '[prefix] Lorem ipsum dolor si\n';

    async function* inputs() {
      yield 'Lorem ipsum dolor si\n';
    }

    const stream = Readable.from(inputs())
      .pipe(utils.addPrefixForEachLine('[prefix] '));

    stream.on('data', (chunk) => {
      outputs.push(chunk.toString());
    });

    stream.on('end', () => {
      const output = outputs.join('');
      expect(output).toEqual(expected);

      done();
    });
  });
});

describe('concat', () => {
  it('concats given streams sequentially', (done) => {
    const outputs = [];

    const streamA = Readable.from(['0', '1', '2']);
    const streamB = Readable.from(['a', 'b', 'c']);
    const streamC = Readable.from(['A', 'B', 'C']);

    const dest = new Writable({
      objectMode: true,
      write(chunk, _, callback) {
        outputs.push(chunk);
        callback();
      },
    });

    dest.on('finish', () => {
      expect(outputs).toEqual(['0', '1', '2', 'a', 'b', 'c', 'A', 'B', 'C']);
      done();
    });

    utils.concat(streamA, streamB, streamC).pipe(dest);
  });
});
