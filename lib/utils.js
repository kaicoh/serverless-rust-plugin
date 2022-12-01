const cp = require('child_process');
const fs = require('fs');
const net = require('net');
const { Transform } = require('stream');

function spawn(cmd, args, options) {
  const stdout = [];
  const stderr = [];
  let error;

  return new Promise((resolve) => {
    const child = cp.spawn(cmd, args, options);

    if (child.stdout) {
      child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    }

    child.on('err', (err) => {
      error = err;
    });
    // Node.js doc says
    // " The 'close' event will always emit after 'exit' was already emitted,
    // or 'error' if the child failed to spawn."
    child.on('close', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        error,
      });
    });
  });
}

function hasSpawnError({ error, code }) {
  return error !== undefined || code > 0;
}

function mkdirSyncIfNotExist(dirname) {
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

function readFileSyncIfExist(filePath) {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }

  return undefined;
}

function copyFile(src, dist) {
  const stream = fs.createReadStream(src).pipe(fs.createWriteStream(dist));

  return new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('close', resolve);
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on('error', (err) => {
      server.close();
      reject(err);
    });

    server.listen(0, () => {
      const { port } = server.address();
      server.close();

      if (!port) {
        reject(new Error('Unable to get the server\'s given port'));
      } else {
        resolve(port);
      }
    });
  });
}

const color = {
  byNum: (msg, fgNum) => (msg ? `\u001b[${fgNum}m${msg}\u001b[39m` : ''),
  black: (msg) => color.byNum(msg, 30),
  red: (msg) => color.byNum(msg, 31),
  green: (msg) => color.byNum(msg, 32),
  yellow: (msg) => color.byNum(msg, 33),
  blue: (msg) => color.byNum(msg, 34),
  magenta: (msg) => color.byNum(msg, 35),
  cyan: (msg) => color.byNum(msg, 36),
  white: (msg) => color.byNum(msg, 37),
  default: (msg) => msg,
  fromIndex: (index) => {
    switch (index % 6) {
      case 0:
        return color.cyan;
      case 1:
        return color.yellow;
      case 2:
        return color.green;
      case 3:
        return color.magenta;
      case 4:
        return color.blue;
      default:
        return color.red;
    }
  },
};

// Ref: https://gist.github.com/NotWoods/39e1f7d29a56be0d012461cde409e285
function addPrefixForEachLine(prefix) {
  return new Transform({
    transform(chunk, _, next) {
      const lines = `${this.soFar || ''}${chunk.toString()}`.split(/\r?\n/);
      this.soFar = lines.pop();

      lines.forEach((line) => {
        this.push(`${prefix}${line}\n`);
      });

      next();
    },

    flush(done) {
      if (this.soFar) {
        this.push(`${prefix}${this.soFar}\n`);
      }
      done();
    },
  });
}

module.exports = {
  spawn,
  getFreePort,
  color,
  hasSpawnError,
  mkdirSyncIfNotExist,
  readFileSyncIfExist,
  copyFile,
  addPrefixForEachLine,
};
