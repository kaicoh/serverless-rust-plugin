const cp = require('child_process');

function spawn(cmd, args, options) {
  const stdout = [];
  const stderr = [];

  return new Promise((resolve, reject) => {
    const child = cp.spawn(cmd, args, options);

    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('err', reject);
    // Node.js doc says
    // " The 'close' event will always emit after 'exit' was already emitted,
    // or 'error' if the child failed to spawn."
    child.on('close', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}

module.exports = {
  spawn,
};
