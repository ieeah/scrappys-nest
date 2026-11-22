#!/usr/bin/env node
/**
 * CLI di validazione integrità referenziale del dataset Scrappy's Nest.
 * Uso: node scripts/validate-dataset.mjs [--strict] [--json] [--data-dir <path>]
 */

import path from 'node:path';
import {
  formatValidationReport,
  loadDatasetFromDir,
  validateDataset,
} from './lib/dataset-validator.mjs';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const jsonMode = args.includes('--json');

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

const dataset = loadDatasetFromDir(dataDir, customItemsPath);
const result = validateDataset(dataset);

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(formatValidationReport(result));
}

const hasErrors = result.summary.errorCount > 0;
const hasStrictFailure = strict && result.summary.warningCount > 0;
process.exit(hasErrors || hasStrictFailure ? 1 : 0);
