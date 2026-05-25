// Prompts for the SpecCheck pipeline.
// Four stages: ambiguity elicitation, formalization, cross-informalization, judgment.

/**
 * Stage 0: Ask the model to surface implicit assumptions in NL requirements
 * BEFORE any formalization. Does NOT ask for a spec.
 */
export function AMBIGUITY_PROMPT(domain, requirements) {
  const reqList = requirements
    .map((r, i) => `### Requirement ${i}\n\n> ${r}`)
    .join('\n\n');

  return `You are a specification analyst reviewing natural language requirements for the "${domain}" domain.

For each requirement, identify implicit assumptions and underspecified aspects that a formalizer would need to resolve. These are gaps that could lead to different valid formalizations — not errors in the requirement itself.

## Requirements

${reqList}

## What to Look For

For each requirement, flag:
1. **Undefined terms** — vocabulary that is context-dependent or has multiple valid interpretations
2. **Boundary cases** — behaviors on empty input, duplicates, None, zero, negative numbers, etc. that are not stated
3. **Type or range assumptions** — implicit assumptions about input/output types or value ranges
4. **Ordering assumptions** — implicit assumptions about element order in inputs or outputs
5. **Other** — any other underspecified aspect that two reasonable formalizers might resolve differently

## Instructions

Be specific. For each assumption, state exactly what is underspecified and why it matters for formalization.

Do NOT formalize the requirements. Only identify gaps.

Call the record_ambiguities tool with one entry per requirement.`;
}

/**
 * Stage 1: Ask model to generate a formal spec from an NL requirement.
 * Two separate calls with different models produce spec A and spec B.
 *
 * @param {string} domain
 * @param {{ index: number, requirement: string }[]} requirements
 * @param {string} formalism - 'hypothesis' or 'lean'
 */
export function FORMALIZE_PROMPT(domain, requirements, formalism) {
  const reqList = requirements
    .map((r, i) => `### Requirement ${i}\n\n> ${r.requirement}`)
    .join('\n\n');

  const formalismInstructions = formalism === 'hypothesis'
    ? `Write a **Python Hypothesis property test suite** for each requirement.

Use @given decorators with appropriate strategies from hypothesis.strategies.
Each test function should have a name starting with test_.
Cover ALL stated invariants, edge cases, and boundary conditions.
Use assume() to filter invalid inputs when needed.
Import from hypothesis and hypothesis.strategies only — no external dependencies.
Output only valid Python code.`
    : `Write a **Lean 4 formal specification** for each requirement.

For each requirement, write:
- A precondition predicate (def <name>_precond ...) — conditions on the inputs
- A postcondition predicate (def <name>_postcond ...) — conditions on the output
- A theorem statement (without proof body) asserting the postcondition holds

Use standard Lean 4 syntax. Use Mathlib types where appropriate (Array, List, Nat, Int).
Cover ALL stated invariants, edge cases, and boundary conditions.
Output only valid Lean 4 code.`;

  return `You are a formal specification engineer working on the "${domain}" domain.

For each natural language requirement below, generate a formal specification that fully captures its intent.

## Requirements

${reqList}

## Instructions

${formalismInstructions}

Be comprehensive. A weak spec that only captures the obvious cases is worse than no spec at all.

Call the record_formalizations tool with one entry per requirement.`;
}

/**
 * Stage 2: Ask a model to informalize ANOTHER model's spec.
 * Critical: this model does NOT see the original NL requirement.
 * Same principle as ClaimCheck's blind informalization.
 *
 * @param {string} domain
 * @param {{ index: number, specCode: string }[]} specs
 * @param {string} formalism
 */
export function CROSS_INFORMALIZE_PROMPT(domain, specs, formalism) {
  const specList = specs
    .map((s, i) => `### Spec ${s.index}\n\n\`\`\`${formalism === 'hypothesis' ? 'python' : 'lean'}\n${s.specCode}\n\`\`\``)
    .join('\n\n');

  return `You are reading formal specifications from the "${domain}" domain and translating them to plain English.

These specifications were written by another model. You did NOT write them and you do NOT know the original natural language requirements they were meant to capture.

## Specifications

${specList}

## Instructions

For each specification, produce a faithful English description of what the code LITERALLY says. Be LITERAL — describe what the spec actually tests or guarantees, not what you think the author intended.

Specifically:
- Describe what properties the spec checks or guarantees
- Note which edge cases and boundary conditions are explicitly covered
- Note what is NOT covered (gaps, missing cases)
- Rate the strength: "trivial" if always true, "weak" if very little is constrained, "moderate" if substantive, "strong" if tightly constrained

Do NOT guess at the original intent. Only describe what the code literally says.

Call the record_cross_informalizations tool with one entry per spec.`;
}

/**
 * Stage 3: Judge both back-translations against the original requirements.
 * Sees: original requirement, back-translation A, back-translation B.
 * Does NOT see the spec code directly — only the back-translations.
 *
 * @param {string} domain
 * @param {{ index: number, requirement: string, infA: object, infB: object }[]} pairs
 */
export function JUDGMENT_PROMPT(domain, pairs) {
  const pairList = pairs.map((p) =>
    `### Requirement ${p.index}

**Original requirement:** ${p.requirement}

**Back-translation of Spec A** (produced without seeing the requirement):
- What it says: ${p.infA.naturalLanguage}
- Coverage: ${p.infA.coverage}
- Gaps: ${p.infA.gaps}
- Strength: ${p.infA.strength}

**Back-translation of Spec B** (produced without seeing the requirement):
- What it says: ${p.infB.naturalLanguage}
- Coverage: ${p.infB.coverage}
- Gaps: ${p.infB.gaps}
- Strength: ${p.infB.strength}`
  ).join('\n\n---\n\n');

  return `You are evaluating formal specifications for the "${domain}" domain.

For each requirement below, you are given two back-translations of two independently generated formal specs. The back-translations were produced by models that did NOT see the original requirement — they describe what each spec literally says.

## Pairs to Evaluate

${pairList}

## Drift Patterns to Watch For

1. **Tautology**: spec tests something that is always true regardless of behavior
2. **Weakened postcondition**: spec checks less than the requirement asks (e.g. requirement says "exactly 5" but spec checks "at least 1")
3. **Narrowed scope**: spec only covers a subset of cases the requirement describes
4. **Missing case**: requirement has multiple conditions but spec only captures some
5. **Wrong property**: spec tests something related but different from what was asked

## Instructions

For each requirement:
1. Compare the original requirement against EACH back-translation independently
2. Assign a drift score (0=no drift, 1=complete drift) and identify the drift type
3. Flag whether the two specs disagreed on what to formalize (different scope, different edge cases, different properties)

Be STRICT. A spec that technically passes its tests but doesn't capture the requirement's intent should be flagged.

Call the record_judgments tool with one entry per requirement.`;
}
