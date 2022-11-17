const path = require('path');
const Cargo = require('../../lib/cargo');

describe('Cargo instance', () => {
  let cargo;

  describe('single binary', () => {
    beforeEach(() => {
      const tomlPath = path.join(__dirname, 'Simple.toml');
      cargo = new Cargo(tomlPath);
    });

    it('instantiates', () => {
      expect(cargo).not.toBeUndefined();
    });

    it('returns single binary name when binaries method is called', () => {
      const binaries = cargo.binaries();
      expect(binaries).toHaveLength(1);
      expect(binaries).toEqual(expect.arrayContaining(['simple-package']));
    });
  });

  describe('multiple binaries', () => {
    beforeEach(() => {
      const tomlPath = path.join(__dirname, 'MultiBinaries.toml');
      cargo = new Cargo(tomlPath);
    });

    it('instantiates', () => {
      expect(cargo).not.toBeUndefined();
    });

    it('returns binary names with package name when binaries method is called without options', () => {
      const binaries = cargo.binaries();
      expect(binaries).toHaveLength(2);
      expect(binaries).toEqual(expect.arrayContaining([
        'multiple-binaries.binary1',
        'multiple-binaries.binary2',
      ]));
    });

    it('returns binary names without package name when binary method is called with option', () => {
      const binaries = cargo.binaries({ withoutPackage: true });
      expect(binaries).toHaveLength(2);
      expect(binaries).toEqual(expect.arrayContaining([
        'binary1',
        'binary2',
      ]));
    });
  });
});
