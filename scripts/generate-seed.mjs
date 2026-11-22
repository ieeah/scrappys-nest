#!/usr/bin/env node
/**
 * CLI per la generazione dello script SQL Postgres idempotente (`seed.sql`).
 * Uso: node scripts/generate-seed.mjs [--out <path>] [--no-pois] [--data-dir <path>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadDatasetFromDir } from './lib/dataset-validator.mjs';
import { generateSeedSql } from './lib/seed-generator.mjs';

const args = process.argv.slice(2);
const includePois = !args.includes('--no-pois');

const getArgValue = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

const rootDir = path.resolve(import.meta.dirname, '..');
const dataDir = path.resolve(rootDir, getArgValue('--data-dir') ?? 'src/data');
const customItemsPath = path.resolve(
  rootDir,
  getArgValue('--custom-items') ?? 'scripts/data/custom-items/items.json'
);
const aliasesPath = path.resolve(
  rootDir,
  getArgValue('--aliases') ?? 'scripts/data/upstream-aliases.json'
);
const outPath = path.resolve(
  rootDir,
  getArgValue('--out') ?? 'scripts/db/seed.sql'
);

const dataset = loadDatasetFromDir(dataDir, customItemsPath);
const aliases = fs.existsSync(aliasesPath)
  ? JSON.parse(fs.readFileSync(aliasesPath, 'utf-8'))
  : {};

try {
  const { sql, stats } = generateSeedSql(dataset, { aliases, includePois });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, sql, 'utf-8');

  const sizeMb = (Buffer.byteLength(sql, 'utf-8') / (1024 * 1024)).toFixed(2);
  console.log(`Generated ${path.relative(rootDir, outPath)} (${sizeMb} MB)`);
  console.log('Stats:', JSON.stringify(stats));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
