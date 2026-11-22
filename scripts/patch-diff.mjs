#!/usr/bin/env node
/**
 * CLI per il confronto tra due snapshot del dataset Scrappy's Nest (ADR 010 — flusso `patch-diff`).
 *
 * Uso:
 *   node scripts/patch-diff.mjs                         # confronta HEAD:src/data vs working tree src/data
 *   node scripts/patch-diff.mjs --from-dir <d1> --to-dir <d2>
 *   node scripts/patch-diff.mjs --json                  # output JSON su stdout
 *   node scripts/patch-diff.mjs --out <path>            # scrive il report su file
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadDatasetFromDir } from './lib/dataset-validator.mjs';
import { computeDatasetDiff, formatPatchDiffReport } from './lib/patch-diff.mjs';

const DATASET_FILES = [
  ['items', 'items.json'],
  ['itemVariants', 'item-variants.json'],
  ['workbenches', 'workbenches.json'],
  ['projects', 'projects.json'],
  ['expeditions', 'expeditions.json'],
  ['passes', 'passes.json'],
  ['quests', 'quests.json'],
  ['recipes', 'recipes.json'],
  ['traders', 'traders.json'],
  ['skills', 'skills.json'],
  ['maps', 'maps.json'],
  ['mapPois', 'map-pois.json'],
  ['overridesConflicts', 'overrides-conflicts.json'],
];

function readGitHeadJson(rootDir, relPath) {
  try {
    const raw = execFileSync('git', ['show', `HEAD:${relPath}`], {
      cwd: rootDir,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function loadDatasetFromGitHead(rootDir) {
  const dataset = {};
  for (const [key, filename] of DATASET_FILES) {
    dataset[key] = readGitHeadJson(rootDir, `src/data/${filename}`);
  }
  return dataset;
}

function getArgValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const fromDirArg = getArgValue(args, '--from-dir');
  const toDirArg = getArgValue(args, '--to-dir');
  const outArg = getArgValue(args, '--out');

  const rootDir = path.resolve(import.meta.dirname, '..');
  const beforeDataset = fromDirArg
    ? loadDatasetFromDir(path.resolve(rootDir, fromDirArg))
    : loadDatasetFromGitHead(rootDir);
  const afterDataset = loadDatasetFromDir(
    path.resolve(rootDir, toDirArg ?? 'src/data')
  );

  const diff = computeDatasetDiff(beforeDataset, afterDataset);
  const output = jsonMode ? JSON.stringify(diff, null, 2) : formatPatchDiffReport(diff);

  if (outArg) {
    const outPath = path.resolve(rootDir, outArg);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output + '\n', 'utf-8');
    console.log(`Report salvato in ${outPath}`);
  } else {
    console.log(output);
  }
}

main();
