const { spawnSync } = require('child_process');

class LocalBuilder {
  constructor(options) {
    this.cargoLambdaOptions = options.cargoLambdaOptions;
    this.spawnOptions = options.spawnOptions;
  }

  // eslint-disable-next-line class-methods-use-this
  howToBuild() {
    return 'Use local cargo-lambda.';
  }

  build(spawn = spawnSync) {
    const args = [
      'lambda',
      'build',
      ...this.cargoLambdaOptions,
    ];

    return spawn('cargo', args, this.spawnOptions);
  }
}

module.exports = LocalBuilder;
