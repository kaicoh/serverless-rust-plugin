// Assume request is node.js's http.request.
function invokeLambda(request, invokeOptions) {
  const {
    port,
    data,
    retryCount,
    retryInterval,
  } = invokeOptions;

  const body = data || '{}';

  try {
    JSON.parse(body);
  } catch (err) {
    return Promise.reject(new Error(`Cannot parse to JSON: ${body}`));
  }

  const options = {
    hostname: 'localhost',
    port,
    path: '/2015-03-31/functions/function/invocations',
    method: 'POST',
  };

  return new Promise((resolve, reject) => {
    const req = request(options, (res) => {
      const response = {
        status: res.statusCode,
        headers: res.headers,
      };

      res.pipe(process.stderr);

      res.on('error', reject);

      res.on('end', () => {
        process.stderr.write('\n\n');
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
        port,
        data,
        retryCount: retryCount - 1,
        retryInterval,
      };

      setTimeout(() => {
        resolve(invokeLambda(request, retryOptions));
      }, retryInterval);
    });

    req.write(body);
    req.end();
  });
}

module.exports = { invokeLambda };
