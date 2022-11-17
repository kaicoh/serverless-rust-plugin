const { spawnSync } = require('child_process');

class DockerBuilder {
  constructor(options) {
    this.srcPath = options.srcPath;
    this.cargoLambdaOptions = options.cargoLambdaOptions;
    this.dockerImage = options.dockerImage;
    this.spawnOptions = options.spawnOptions;
  }

  howToBuild() {
    return `Use docker image ${this.dockerImage}.`;
  }

  build(spawn = spawnSync) {
    const args = [
      'run',
      '--rm',
      '-t',
      '-v',
      `${this.srcPath}:/tmp`,
      '-w',
      '/tmp',
      this.dockerImage,
      'build',
      ...this.cargoLambdaOptions,
    ];

    return spawn('docker', args, this.spawnOptions);
  }
}

module.exports = DockerBuilder;
