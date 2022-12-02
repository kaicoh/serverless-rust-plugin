const http = require('http');

async function invoke(invokeOptions) {
  const {
    port,
    data,
    retryCount,
    retryInterval,
    stdout,
  } = invokeOptions;

  const body = JSON.stringify(data);

  const options = {
    hostname: 'localhost',
    port,
    path: '/2015-03-31/functions/function/invocations',
    method: 'POST',
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const response = {
        status: res.statusCode,
        headers: res.headers,
      };

      res.pipe(stdout ? process.stdout : process.stderr);

      res.on('error', reject);

      res.on('end', () => {
        if (!stdout) {
          // For readable output, insert some new lines to console.
          // If stdout is requested, we keep outputs untouched as much as possible.
          process.stderr.write('\n\n');
        }
        resolve(response);
      });
    });

    // NOTE:
    // If the request starts immediately after the docker container starts,
    // it will fail because the container is not ready to accept requests.
    // We have to retry in case of that.
    req.on('error', (err) => {
      if (retryCount === 0) {
        reject(err);
      }

      const retryOptions = {
        ...invokeOptions,
        retryCount: retryCount - 1,
      };

      setTimeout(() => {
        resolve(invoke(retryOptions));
      }, retryInterval);
    });

    req.write(body);
    req.end();
  });
}

module.exports = { invoke };
