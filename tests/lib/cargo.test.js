const path = require('path');
const Cargo = require('../../lib/cargo');

describe('Cargo instance', () => {
  let cargo;

  describe('method: binaries', () => {
    describe('when single binary', () => {
      beforeEach(() => {
        const tomlPath = path.join(__dirname, 'single', 'Cargo.toml');
        cargo = new Cargo(tomlPath);
      });

      it('returns single binary name', () => {
        const binaries = cargo.binaries();
        expect(binaries).toHaveLength(1);
        expect(binaries).toEqual(expect.arrayContaining(['simple-package']));
      });
    });

    describe('when multi binary', () => {
      beforeEach(() => {
        const tomlPath = path.join(__dirname, 'multi', 'Cargo.toml');
        cargo = new Cargo(tomlPath);
      });

      it('returns binary names with package name', () => {
        const binaries = cargo.binaries();
        expect(binaries).toHaveLength(2);
        expect(binaries).toEqual(expect.arrayContaining([
          'multiple-binaries.binary1',
          'multiple-binaries.binary2',
        ]));
      });
    });

    describe('when workspace', () => {
      beforeEach(() => {
        const tomlPath = path.join(__dirname, 'workspace', 'Cargo.toml');
        cargo = new Cargo(tomlPath);
      });

      it('returns binary names with each package without library crate', () => {
        const binaries = cargo.binaries();
        expect(binaries).toEqual(expect.arrayContaining([
          'bin0',
          'bin1',
        ]));
        expect(binaries).toEqual(expect.not.arrayContaining([
          'lib0',
        ]));
      });
    });
  });

  describe('property: children', () => {
    it.each([
      ['single binary', 'single'],
      ['multi binary', 'multi'],
      ['library', 'workspace/lib0'],
    ])('returns an empty array if it is a %s', (_, dir) => {
      const srcPath = path.join(__dirname, dir, 'Cargo.toml');
      cargo = new Cargo(srcPath);

      expect(Array.isArray(cargo.children)).toBe(true);
      expect(cargo.children).toHaveLength(0);
    });
  });
});
