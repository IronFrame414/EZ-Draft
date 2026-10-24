// EZD-029 parser (vault/plans/EZD-029.md Step 3a): dxf-parser with the spike's own HATCH handler.
// Tests obtain the parser only through createParser().
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// dxf-parser 1.1.2's Node entry is a UMD bundle (`module.exports = DxfParser`): the named export
// `DxfParser` that Node's CommonJS detection lists is undefined at run time, so the class is the
// default import.
import DxfParser from 'dxf-parser';
import { HatchHandler } from './hatch-handler.mjs';

const spikeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {DxfParser} dxf-parser with the HATCH handler registered */
export function createParser() {
  const parser = new DxfParser();
  parser.registerEntityHandler(HatchHandler);
  return parser;
}

/**
 * The installed version, read from `<spike dir>/node_modules/<pkgName>/package.json`.
 * @param {string} pkgName
 * @returns {string}
 */
export function installedVersion(pkgName) {
  const file = path.join(spikeDir, 'node_modules', ...pkgName.split('/'), 'package.json');
  return JSON.parse(readFileSync(file, 'utf8')).version;
}

/** @returns {{ name: string, version: string, parse: (text: string) => any }} */
export function defaultParser() {
  return {
    name: 'dxf-parser',
    version: installedVersion('dxf-parser'),
    parse: (text) => createParser().parseSync(text),
  };
}
