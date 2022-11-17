const DockerBuilder = require('./docker');
const LocalBuilder = require('./local');

function builderFactory(options) {
  const { useDocker } = options;
  const builderOptions = {
    ...options,
    spawnOptions: { stdio: ['ignore', process.stdout, process.stderr] },
  };

  return useDocker
    ? new DockerBuilder(builderOptions)
    : new LocalBuilder(builderOptions);
}

module.exports = builderFactory;
