const fs = require('fs');
const path = require('path');
const toml = require('toml');
const _get = require('lodash.get');

class Cargo {
  constructor(srcPath) {
    const cargoStr = fs.readFileSync(srcPath, 'utf8');
    this.srcDir = path.dirname(srcPath);
    this.contents = toml.parse(cargoStr);
  }

  binaries() {
    if (this.hasSingleBinary || this.hasMultiBinary) {
      return [...this.singleBinary(), ...this.multiBinary()];
    }

    if (this.isWorkspace) {
      return this.children.flatMap((child) => child.binaries());
    }

    // It is a libary crate.
    return [];
  }

  get packageName() {
    return _get(this.contents, ['package', 'name'], '');
  }

  get hasSingleBinary() {
    const main = path.join(this.srcDir, 'src', 'main.rs');
    return fs.existsSync(main);
  }

  get hasMultiBinary() {
    const bins = this.contents.bin;
    return Array.isArray(bins) && bins.length > 0;
  }

  get isWorkspace() {
    const { workspace } = this.contents;
    return workspace && Array.isArray(workspace.members);
  }

  get children() {
    if (!this.isWorkspace) {
      return [];
    }

    return this.contents.workspace.members.map((member) => {
      const childSrcPath = path.join(this.srcDir, member, 'Cargo.toml');
      return new Cargo(childSrcPath);
    });
  }

  singleBinary() {
    return this.hasSingleBinary ? [this.packageName] : [];
  }

  multiBinary() {
    return this.hasMultiBinary
      ? this.contents.bin.map(({ name }) => `${this.packageName}.${name}`)
      : [];
  }
}

module.exports = Cargo;
