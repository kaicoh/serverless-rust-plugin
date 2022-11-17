const builderFactory = require('../../lib/builder');
const DockerBuilder = require('../../lib/docker');
const LocalBuilder = require('../../lib/local');

describe('builderFactory', () => {
  it('returns DockerBuilder instance when called with useDocker option', () => {
    const builder = builderFactory({ useDocker: true });
    expect(builder).toBeInstanceOf(DockerBuilder);
  });

  it('returns LocalBuilder instance when called without useDocker option', () => {
    const builder = builderFactory({ useDocker: false });
    expect(builder).toBeInstanceOf(LocalBuilder);
  });
});
