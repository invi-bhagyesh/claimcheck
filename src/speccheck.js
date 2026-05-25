import { callWithTool, resetTokenUsage, getTokenUsage } from './api.js';
import {
  AMBIGUITY_TOOL,
  FORMALIZE_TOOL,
  CROSS_INFORMALIZE_TOOL,
  JUDGMENT_TOOL,
} from './speccheck-schemas.js';
import {
  AMBIGUITY_PROMPT,
  FORMALIZE_PROMPT,
  CROSS_INFORMALIZE_PROMPT,
  JUDGMENT_PROMPT,
} from './speccheck-prompts.js';

const MODEL_DEFAULTS = {
  api:     { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-5-20250929' },
  vertex:  { haiku: 'claude-haiku-4-5',          sonnet: 'claude-sonnet-4-6'          },
  bedrock: { haiku: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', sonnet: 'us.anthropic.claude-sonnet-4-6' },
};

function defaultModels(opts) {
  if (opts.vertex) return MODEL_DEFAULTS.vertex;
  if (opts.bedrock) return MODEL_DEFAULTS.bedrock;
  return MODEL_DEFAULTS.api;
}

/**
 * Run the SpecCheck pipeline on a set of NL requirements.
 *
 * Stages:
 *   0. Ambiguity elicitation (haiku): surface implicit assumptions per requirement
 *   1. Dual formalization (haiku + sonnet independently): generate specs A and B
 *   2. Cross-informalization (each model reads the other's spec, blind)
 *   3. Round-robin judgment (sonnet): score both back-translations vs original requirements
 *   4. Aggregation (deterministic): compute final verdict
 *
 * @param {{
 *   requirements: string[],
 *   domain: string,
 *   formalism: 'hypothesis' | 'lean',
 *   options?: {
 *     modelA?: string,
 *     modelB?: string,
 *     judgeModel?: string,
 *     verbose?: boolean,
 *     log?: Function,
 *   }
 * }} params
 * @returns {Promise<{ results: object[], tokenUsage: object }>}
 */
export async function speccheck({ requirements, domain, formalism = 'hypothesis', options = {} }) {
  resetTokenUsage();

  const log = options.log ?? (() => {});
  const defaults = defaultModels(options);
  const modelA = options.modelA ?? defaults.haiku;
  const modelB = options.modelB ?? defaults.sonnet;
  const judgeModel = options.judgeModel ?? defaults.sonnet;
  const verbose = options.verbose ?? false;
  const skipAmbiguity = options.noAmbiguity ?? false;     // B2: round-robin only
  const skipRoundRobin = options.noRoundRobin ?? false;   // B3: ambiguity only
  const singleModel = options.singleModel ?? false;       // B1: one model, sonnet judges blind
  // prewrittenSpecs: array of { index, specCode } — skips Stages 0+1, uses these as both spec A and B
  const prewrittenSpecs = options.prewrittenSpecs ?? null;

  const items = requirements.map((r, i) => ({ index: i, requirement: r }));

  // ---------------------------------------------------------------------------
  // Stage 0: Ambiguity elicitation (haiku, one batch call)
  // ---------------------------------------------------------------------------

  log(`[speccheck] Stage 0: Eliciting ambiguities for ${items.length} requirement(s)...`);

  let ambiguities = [];
  if (prewrittenSpecs || singleModel || skipAmbiguity) {
    // Sensitivity mode / B1 / B2: no ambiguity elicitation
    const reason = prewrittenSpecs ? 'prewritten-specs' : singleModel ? '--single-model' : '--no-ambiguity';
    log(`[speccheck] Stage 0: Skipped (${reason})`);
    ambiguities = items.map(item => ({ requirementIndex: item.index, assumptions: [], ambiguityCount: 0 }));
  } else {
    const ambiguityResponse = await callWithTool({
      model: modelA,
      prompt: AMBIGUITY_PROMPT(domain, requirements),
      tool: AMBIGUITY_TOOL,
      toolChoice: { type: 'tool', name: 'record_ambiguities' },
      verbose,
      maxTokens: 4096,
    });
    ambiguities = ambiguityResponse.input.ambiguities;
    if (verbose) {
      for (const a of ambiguities) {
        log(`[speccheck] Req ${a.requirementIndex}: ${a.ambiguityCount} assumption(s) flagged`);
      }
    }
  }

  const ambiguityByIndex = new Map(ambiguities.map(a => [a.requirementIndex, a]));

  // ---------------------------------------------------------------------------
  // Stage 1: Dual independent formalization (haiku=A, sonnet=B, two batch calls)
  // ---------------------------------------------------------------------------

  let specAByIndex, specBByIndex;

  if (prewrittenSpecs) {
    // Sensitivity mode: inject pre-written (drifted) specs, skip formalization entirely
    log(`[speccheck] Stage 1: Skipped (prewritten-specs mode — injecting ${prewrittenSpecs.length} pre-written spec(s))`);
    const specMap = new Map(prewrittenSpecs.map(s => [s.index, s]));
    specAByIndex = new Map(items.map(item => [item.index, { requirementIndex: item.index, specCode: specMap.get(item.index)?.specCode ?? '' }]));
    specBByIndex = new Map(items.map(item => [item.index, { requirementIndex: item.index, specCode: specMap.get(item.index)?.specCode ?? '' }]));
  } else {
    log(`[speccheck] Stage 1: Formalizing with model A (${modelA})...`);

    const formalizeAResponse = await callWithTool({
      model: modelA,
      prompt: FORMALIZE_PROMPT(domain, items, formalism),
      tool: FORMALIZE_TOOL,
      toolChoice: { type: 'tool', name: 'record_formalizations' },
      verbose,
      maxTokens: 16000,
    });

    const specsA = formalizeAResponse.input.formalizations;
    specAByIndex = new Map(specsA.map(s => [s.requirementIndex, s]));

    const skipModelB = singleModel || skipRoundRobin;
    log(`[speccheck] Stage 1: Formalizing with model B (${skipModelB ? 'skipped' : modelB})...`);

    let specsB;
    if (!skipModelB) {
      const formalizeBResponse = await callWithTool({
        model: modelB,
        prompt: FORMALIZE_PROMPT(domain, items, formalism),
        tool: FORMALIZE_TOOL,
        toolChoice: { type: 'tool', name: 'record_formalizations' },
        verbose,
        maxTokens: 16000,
      });
      specsB = formalizeBResponse.input.formalizations;
    } else {
      // B1 / B3: reuse model A's specs as spec B
      specsB = specsA.map(s => ({ ...s }));
    }

    specBByIndex = new Map(specsB.map(s => [s.requirementIndex, s]));
  }

  // ---------------------------------------------------------------------------
  // Stage 2: Cross-informalization (each model reads the OTHER's spec, blind)
  // Model B (sonnet) informalizes model A's specs
  // Model A (haiku) informalizes model B's specs
  // ---------------------------------------------------------------------------

  // In B1 (single-model): sonnet informalizes haiku's spec (blind) — no model B spec exists.
  // In B3 (ambiguity-only): sonnet informalizes haiku's spec (same spec used for both A and B).
  // In B2/B4 (round-robin): sonnet informalizes haiku's spec, haiku informalizes sonnet's spec.
  log(`[speccheck] Stage 2: Sonnet informalizes model A's specs (blind)...`);

  const infAItems = items
    .filter(item => specAByIndex.has(item.index))
    .map(item => ({ index: item.index, specCode: specAByIndex.get(item.index).specCode }));

  const infAResponse = await callWithTool({
    model: judgeModel, // always sonnet — blind informalization of haiku's spec
    prompt: CROSS_INFORMALIZE_PROMPT(domain, infAItems, formalism),
    tool: CROSS_INFORMALIZE_TOOL,
    toolChoice: { type: 'tool', name: 'record_cross_informalizations' },
    verbose,
    maxTokens: 8192,
  });

  const infA = infAResponse.input.informalizations;
  const infAByIndex = new Map(infA.map(i => [i.requirementIndex, i]));

  // In prewritten / B1 / B3: skip second informalization (only one spec exists)
  // In B2 / B4: haiku informalizes sonnet's spec
  const skipModelB = prewrittenSpecs || singleModel || skipRoundRobin;
  let infBByIndex;
  if (!skipModelB) {
    log(`[speccheck] Stage 2: Model A informalizes model B's specs...`);

    const infBItems = items
      .filter(item => specBByIndex.has(item.index))
      .map(item => ({ index: item.index, specCode: specBByIndex.get(item.index).specCode }));

    const infBResponse = await callWithTool({
      model: modelA,
      prompt: CROSS_INFORMALIZE_PROMPT(domain, infBItems, formalism),
      tool: CROSS_INFORMALIZE_TOOL,
      toolChoice: { type: 'tool', name: 'record_cross_informalizations' },
      verbose,
      maxTokens: 8192,
    });

    const infB = infBResponse.input.informalizations;
    infBByIndex = new Map(infB.map(i => [i.requirementIndex, i]));
  } else {
    // B1 / B3: reuse sonnet's informalization of haiku's spec for both positions
    log(`[speccheck] Stage 2: Single informalization (${singleModel ? 'B1' : 'B3'} mode)`);
    infBByIndex = new Map(infA.map(i => [i.requirementIndex, i]));
  }

  // ---------------------------------------------------------------------------
  // Stage 3: Round-robin judgment (sonnet, one batch call)
  // Judge sees: original requirement + both back-translations (NOT spec code)
  // ---------------------------------------------------------------------------

  log(`[speccheck] Stage 3: Judging ${items.length} pair(s)...`);

  const judgmentPairs = items
    .filter(item => infAByIndex.has(item.index) && infBByIndex.has(item.index))
    .map(item => ({
      index: item.index,
      requirement: item.requirement,
      infA: infAByIndex.get(item.index),
      infB: infBByIndex.get(item.index),
    }));

  const judgmentResponse = await callWithTool({
    model: judgeModel,
    prompt: JUDGMENT_PROMPT(domain, judgmentPairs),
    tool: JUDGMENT_TOOL,
    toolChoice: { type: 'tool', name: 'record_judgments' },
    verbose,
    maxTokens: 8192,
  });

  const judgments = judgmentResponse.input.judgments;
  const judgmentByIndex = new Map(judgments.map(j => [j.requirementIndex, j]));

  // ---------------------------------------------------------------------------
  // Stage 4: Aggregation (deterministic)
  // Final verdict: confirmed only if BOTH specs match.
  // driftSignal: which technique detected drift (round-robin, ambiguity, both, neither)
  // ---------------------------------------------------------------------------

  log(`[speccheck] Stage 4: Aggregating results...`);

  const results = items.map(item => {
    const ambiguity = ambiguityByIndex.get(item.index);
    const specA = specAByIndex.get(item.index);
    const specB = specBByIndex.get(item.index);
    const iA = infAByIndex.get(item.index);
    const iB = infBByIndex.get(item.index);
    const judgment = judgmentByIndex.get(item.index);

    if (!specA || !specB || !iA || !iB || !judgment) {
      return {
        requirementIndex: item.index,
        requirement: item.requirement,
        status: 'error',
        error: 'Missing data from one or more pipeline stages',
      };
    }

    const aMatches = judgment.specA.match;
    const bMatches = judgment.specB.match;
    const modelsDisagreed = judgment.modelsDisagreed;
    const highAmbiguity = (ambiguity?.ambiguityCount ?? 0) >= 2;

    // Final status: confirmed only if both specs match
    const status = (aMatches && bMatches) ? 'confirmed' : 'disputed';

    // Drift signal: which technique caught the drift
    let driftSignal = 'none';
    if (status === 'disputed') {
      const roundRobinCaught = !aMatches || !bMatches;
      const ambiguityCaught = highAmbiguity;
      if (roundRobinCaught && ambiguityCaught) driftSignal = 'both';
      else if (roundRobinCaught) driftSignal = 'round-robin';
      else if (ambiguityCaught) driftSignal = 'ambiguity';
      else driftSignal = 'neither';
    }

    // Drift type: use the worse of the two specs
    const driftType = (!aMatches && judgment.specA.driftType !== 'none')
      ? judgment.specA.driftType
      : judgment.specB.driftType;

    return {
      requirementIndex: item.index,
      requirement: item.requirement,
      status,
      driftSignal,
      driftType,
      modelsDisagreed,
      ambiguityCount: ambiguity?.ambiguityCount ?? 0,
      ambiguityAssumptions: ambiguity?.assumptions ?? [],
      specA: {
        code: specA.specCode,
        notes: specA.notes,
        informalization: iA,
        judgment: judgment.specA,
      },
      specB: {
        code: specB.specCode,
        notes: specB.notes,
        informalization: iB,
        judgment: judgment.specB,
      },
      disagreementDescription: judgment.disagreementDescription,
    };
  });

  log(`[speccheck] Done. Confirmed: ${results.filter(r => r.status === 'confirmed').length}, Disputed: ${results.filter(r => r.status === 'disputed').length}`);

  return { results, tokenUsage: getTokenUsage() };
}
