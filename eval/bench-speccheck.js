#!/usr/bin/env node
/**
 * SpecCheck benchmark runner.
 *
 * Runs the SpecCheck pipeline (ambiguity elicitation + round-robin cross-validation)
 * on Domain 2 (Python Hypothesis) from mappings/hypothesis.json.
 *
 * Usage:
 *   node eval/bench-speccheck.js --domain hypothesis --runs 1 --label speccheck-test
 *   node eval/bench-speccheck.js --domain hypothesis --runs 3 --label speccheck-full
 *   node eval/bench-speccheck.js --domain hypothesis --runs 1 --limit 5 --verbose --label speccheck-debug
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { speccheck } from '../src/speccheck.js';
import { configureOpenRouter } from '../src/api.js';

const ROOT = resolve(import.meta.dirname, '..');
const RESULTS_DIR = resolve(ROOT, 'eval/results');
const PAPER_RESULTS_DIR = resolve(ROOT, 'new_version/results');
const MAPPINGS_DIR = resolve(ROOT, 'test/integration/speccheck/mappings');

// --- Parse args ---

const args = process.argv.slice(2);

function getArg(name, defaultVal) {
  const i = args.indexOf(name);
  if (i === -1) return defaultVal;
  return args[i + 1];
}

const domain = getArg('--domain', 'hypothesis');
const runs = parseInt(getArg('--runs', '1'));
const label = getArg('--label', `speccheck-${domain}-${Date.now()}`);
const limit = parseInt(getArg('--limit', '0')) || 0;
const offset = parseInt(getArg('--offset', '0')) || 0;
const verbose = args.includes('--verbose');
const modelA = getArg('--model-a', null);
const modelB = getArg('--model-b', null);
const judgeModel = getArg('--judge-model', null);
const noAmbiguity = args.includes('--no-ambiguity');   // B2: round-robin only
const noRoundRobin = args.includes('--no-roundrobin'); // B3: ambiguity only
const singleModel = args.includes('--single-model');   // B1: single-model baseline
const drifted = args.includes('--drifted');            // Sensitivity: pre-written drifted specs
const useOpenRouter = args.includes('--openrouter');   // Use OpenRouter API instead of Anthropic

const DOMAIN_CONFIG = {
  hypothesis: { formalism: 'hypothesis', mappingFile: 'hypothesis.json', displayName: 'Python Hypothesis (Domain 2)' },
  lean:       { formalism: 'lean',       mappingFile: 'lean.json',        displayName: 'VERINA Lean 4 (Domain 1)'    },
};

// Configure OpenRouter if requested
if (useOpenRouter) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENROUTER_API_KEY environment variable not set');
    process.exit(1);
  }
  configureOpenRouter({ apiKey });
}

// --- Main ---

async function main() {
  const config = DOMAIN_CONFIG[domain];
  if (!config) {
    console.error(`Unknown domain: ${domain}. Available: ${Object.keys(DOMAIN_CONFIG).join(', ')}`);
    process.exit(1);
  }

  // In --drifted mode, use the drifted mappings file (Hypothesis only)
  const mappingFile = drifted ? 'hypothesis_drifted.json' : config.mappingFile;
  const mappingPath = join(MAPPINGS_DIR, mappingFile);
  let mapping = JSON.parse(await readFile(mappingPath, 'utf-8'));
  if (offset > 0 || limit > 0) mapping = mapping.slice(offset, limit > 0 ? offset + limit : undefined);

  const requirements = mapping.map(e => e.requirement);
  // In drifted mode, each entry has a pre-written specCode to inject
  const prewrittenSpecs = drifted
    ? mapping.map((e, i) => ({ index: i, specCode: e.specCode }))
    : null;

  // OpenRouter model name defaults (if not overridden via --model-a etc.)
  const resolvedModelA = modelA ?? (useOpenRouter ? 'anthropic/claude-haiku-4-5' : null);
  const resolvedModelB = modelB ?? (useOpenRouter ? 'anthropic/claude-sonnet-4-5' : null);
  const resolvedJudge  = judgeModel ?? (useOpenRouter ? 'anthropic/claude-sonnet-4-5' : null);

  console.error(`SpecCheck Benchmark: ${label}`);
  console.error(`  domain:    ${domain}${drifted ? ' (DRIFTED/sensitivity mode)' : ''}`);
  console.error(`  formalism: ${config.formalism}`);
  console.error(`  runs:      ${runs}`);
  console.error(`  examples:  ${mapping.length}${offset > 0 ? ` (offset ${offset})` : ''}`);
  console.error(`  api:       ${useOpenRouter ? 'OpenRouter' : 'Anthropic'}`);
  console.error(`  model-a:   ${resolvedModelA ?? '(default haiku)'}`);
  console.error(`  model-b:   ${resolvedModelB ?? '(default sonnet)'}`);
  console.error(`  judge:     ${resolvedJudge ?? '(default sonnet)'}`);
  const condition = drifted ? 'sensitivity: pre-written drifted specs'
    : singleModel ? 'B1: single-model baseline'
    : noRoundRobin ? 'B3: ambiguity only'
    : noAmbiguity  ? 'B2: round-robin only'
    : 'B4: full SpecCheck';
  console.error(`  condition: ${condition}`);
  console.error('');

  const allRuns = [];
  const totalStart = Date.now();

  for (let run = 1; run <= runs; run++) {
    console.error(`── Run ${run}/${runs} ──`);
    const runStart = Date.now();

    const opts = {
      verbose,
      log: console.error.bind(console),
      ...(resolvedModelA ? { modelA: resolvedModelA } : {}),
      ...(resolvedModelB ? { modelB: resolvedModelB } : {}),
      ...(resolvedJudge  ? { judgeModel: resolvedJudge } : {}),
      noAmbiguity,
      noRoundRobin,
      singleModel,
      ...(prewrittenSpecs ? { prewrittenSpecs } : {}),
    };

    try {
      const { results, tokenUsage } = await speccheck({
        requirements,
        domain,
        formalism: config.formalism,
        options: opts,
      });

      const confirmed = results.filter(r => r.status === 'confirmed').length;
      const disputed = results.filter(r => r.status === 'disputed').length;
      const errors = results.filter(r => r.status === 'error').length;
      const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);

      // Per-signal breakdown
      const bySignal = {};
      for (const r of results) {
        if (r.status === 'disputed') {
          bySignal[r.driftSignal] = (bySignal[r.driftSignal] ?? 0) + 1;
        }
      }

      // Per-drift-type breakdown
      const byDriftType = {};
      for (const r of results) {
        if (r.status === 'disputed' && r.driftType && r.driftType !== 'none') {
          byDriftType[r.driftType] = (byDriftType[r.driftType] ?? 0) + 1;
        }
      }

      // Accuracy vs expected — in drifted mode, all specs are known-bad so expected = 'disputed'
      let correct = 0;
      let total = 0;
      for (const r of results) {
        const expectedStatus = drifted ? 'disputed' : mapping.find(e => e.requirement === r.requirement)?.expected;
        if (expectedStatus) {
          total++;
          if (r.status === expectedStatus) correct++;
        }
      }

      console.error(`  Confirmed: ${confirmed}/${results.length}`);
      console.error(`  Disputed:  ${disputed}/${results.length}`);
      if (errors) console.error(`  Errors:    ${errors}`);
      if (total > 0) console.error(`  Accuracy:  ${correct}/${total} (${(100 * correct / total).toFixed(1)}%)`);
      console.error(`  By signal: ${JSON.stringify(bySignal)}`);
      console.error(`  By type:   ${JSON.stringify(byDriftType)}`);
      console.error(`  Tokens:    input=${tokenUsage.input} output=${tokenUsage.output}`);
      console.error(`  Elapsed:   ${elapsed}s`);
      console.error('');

      // Print per-result summary
      for (const r of results) {
        const expected = mapping.find(e => e.requirement === r.requirement)?.expected;
        const marker = expected ? (r.status === expected ? '✓' : '✗') : ' ';
        const drift = r.driftType && r.driftType !== 'none' ? ` [${r.driftType}]` : '';
        const signal = r.driftSignal && r.driftSignal !== 'none' ? ` via ${r.driftSignal}` : '';
        console.error(`  ${marker} [${r.requirementIndex}] ${r.status}${drift}${signal}`);
        if (r.status === 'disputed') {
          if (r.specA?.judgment?.explanation) {
            console.error(`      A: ${r.specA.judgment.explanation.slice(0, 100)}`);
          }
          if (r.specB?.judgment?.explanation) {
            console.error(`      B: ${r.specB.judgment.explanation.slice(0, 100)}`);
          }
        }
      }
      console.error('');

      allRuns.push({
        run,
        confirmed,
        disputed,
        errors,
        correct,
        total,
        elapsedMs: Date.now() - runStart,
        tokenUsage,
        bySignal,
        byDriftType,
        results,
      });

    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      console.error(err.stack);
      allRuns.push({ run, error: err.message });
    }
  }

  const totalElapsedMs = Date.now() - totalStart;

  // --- Aggregate across runs ---

  const completedRuns = allRuns.filter(r => !r.error);
  if (completedRuns.length > 0) {
    const avgConfirmed = completedRuns.reduce((s, r) => s + r.confirmed, 0) / completedRuns.length;
    const avgDisputed = completedRuns.reduce((s, r) => s + r.disputed, 0) / completedRuns.length;
    const totalExamples = mapping.length;

    console.error(`── Summary (${completedRuns.length} run(s)) ──`);
    console.error(`  Avg confirmed: ${avgConfirmed.toFixed(1)}/${totalExamples}`);
    console.error(`  Avg disputed:  ${avgDisputed.toFixed(1)}/${totalExamples}`);
    console.error(`  Total elapsed: ${(totalElapsedMs / 1000).toFixed(1)}s`);
  }

  // --- Save results ---

  await mkdir(RESULTS_DIR, { recursive: true });
  await mkdir(PAPER_RESULTS_DIR, { recursive: true });

  const output = {
    label,
    timestamp: new Date().toISOString(),
    config: {
      domain,
      formalism: config.formalism,
      condition,
      runs,
      examples: mapping.length,
      modelA: modelA ?? 'default-haiku',
      modelB: modelB ?? 'default-sonnet',
      judgeModel: judgeModel ?? 'default-sonnet',
    },
    totalElapsedMs,
    runs: allRuns,
  };

  // Raw full results
  const outPath = join(RESULTS_DIR, `${label}.json`);
  await writeFile(outPath, JSON.stringify(output, null, 2));
  console.error(`\nSaved (raw): ${outPath}`);

  // Paper-ready summary — aggregated across runs, no spec code
  const paperSummary = {
    label,
    timestamp: new Date().toISOString(),
    config: output.config,
    totalElapsedMs,
    // Per-run numbers for stability analysis
    perRun: completedRuns.map(r => ({
      run: r.run,
      confirmed: r.confirmed,
      disputed: r.disputed,
      errors: r.errors,
      accuracy: r.total > 0 ? `${r.correct}/${r.total}` : 'n/a',
      bySignal: r.bySignal,
      byDriftType: r.byDriftType,
      elapsedMs: r.elapsedMs,
      tokenUsage: r.tokenUsage,
    })),
    // Averaged across runs
    aggregate: completedRuns.length > 0 ? {
      avgConfirmed: (completedRuns.reduce((s, r) => s + r.confirmed, 0) / completedRuns.length).toFixed(1),
      avgDisputed: (completedRuns.reduce((s, r) => s + r.disputed, 0) / completedRuns.length).toFixed(1),
      totalExamples: mapping.length,
      confirmationRate: (completedRuns.reduce((s, r) => s + r.confirmed, 0) / (completedRuns.length * mapping.length) * 100).toFixed(1) + '%',
      // Signal breakdown (averaged)
      bySignal: (() => {
        const signals = {};
        for (const r of completedRuns) {
          for (const [k, v] of Object.entries(r.bySignal ?? {})) {
            signals[k] = (signals[k] ?? 0) + v;
          }
        }
        for (const k of Object.keys(signals)) signals[k] = (signals[k] / completedRuns.length).toFixed(1);
        return signals;
      })(),
      // Drift type breakdown (averaged)
      byDriftType: (() => {
        const types = {};
        for (const r of completedRuns) {
          for (const [k, v] of Object.entries(r.byDriftType ?? {})) {
            types[k] = (types[k] ?? 0) + v;
          }
        }
        for (const k of Object.keys(types)) types[k] = (types[k] / completedRuns.length).toFixed(1);
        return types;
      })(),
    } : null,
    // Per-requirement summary (averaged across runs, no code)
    requirements: mapping.map((m, i) => {
      const allRunResults = completedRuns
        .map(r => r.results?.find(res => res.requirementIndex === i))
        .filter(Boolean);
      const confirmedCount = allRunResults.filter(r => r.status === 'confirmed').length;
      const driftSignals = allRunResults.map(r => r.driftSignal).filter(s => s && s !== 'none');
      const driftTypes = allRunResults.map(r => r.driftType).filter(t => t && t !== 'none');
      const ambiguityCounts = allRunResults.map(r => r.ambiguityCount ?? 0);
      return {
        index: i,
        id: m.id ?? null,
        requirement: m.requirement,
        expected: drifted ? 'disputed' : (m.expected ?? 'confirmed'),
        ...(drifted ? { injectedDriftType: m.driftType, injectedDriftDescription: m.driftDescription } : {}),
        confirmedInRuns: `${confirmedCount}/${completedRuns.length}`,
        status: confirmedCount === completedRuns.length ? 'confirmed' :
                confirmedCount === 0 ? 'disputed' : 'unstable',
        driftSignals: [...new Set(driftSignals)],
        driftTypes: [...new Set(driftTypes)],
        avgAmbiguityCount: ambiguityCounts.length > 0
          ? (ambiguityCounts.reduce((a, b) => a + b, 0) / ambiguityCounts.length).toFixed(1)
          : '0',
      };
    }),
  };

  const paperPath = join(PAPER_RESULTS_DIR, `${label}.json`);
  await writeFile(paperPath, JSON.stringify(paperSummary, null, 2));
  console.error(`Saved (paper): ${paperPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
