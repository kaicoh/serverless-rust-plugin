const fs = require('fs');
const toml = require('toml');

class Cargo {
  constructor(path) {
    const cargoStr = fs.readFileSync(path, 'utf8');
    this.contents = toml.parse(cargoStr);
  }

  binaries(options) {
    const { withoutPackage } = {
      withoutPackage: false,
      ...options,
    };
    const packageName = this.contents.package.name;
    const binaries = this.contents.bin;

    if (Array.isArray(binaries) && binaries.length > 0) {
      return binaries.map((bin) => `${withoutPackage ? '' : `${packageName}.`}${bin.name}`);
    }

    return [packageName];
  }
}

module.exports = Cargo;
