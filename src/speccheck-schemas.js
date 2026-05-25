// Tool schemas for the SpecCheck pipeline.
// Four stages: ambiguity elicitation, formalization, cross-informalization, judgment.

export const AMBIGUITY_TOOL = {
  name: 'record_ambiguities',
  description: 'Record implicit assumptions and underspecified aspects of a natural language requirement.',
  input_schema: {
    type: 'object',
    properties: {
      ambiguities: {
        type: 'array',
        description: 'One entry per requirement.',
        items: {
          type: 'object',
          properties: {
            requirementIndex: {
              type: 'integer',
              description: 'Zero-based index of the requirement.',
            },
            assumptions: {
              type: 'array',
              description: 'List of 1-5 implicit assumptions or underspecified aspects.',
              items: {
                type: 'object',
                properties: {
                  category: {
                    type: 'string',
                    enum: ['undefined-term', 'boundary-case', 'type-assumption', 'ordering', 'other'],
                    description: 'Category of the assumption.',
                  },
                  description: {
                    type: 'string',
                    description: 'One sentence describing the implicit assumption or underspecified aspect.',
                  },
                },
                required: ['category', 'description'],
              },
              minItems: 0,
              maxItems: 5,
            },
            ambiguityCount: {
              type: 'integer',
              description: 'Total number of assumptions flagged (0-5).',
            },
          },
          required: ['requirementIndex', 'assumptions', 'ambiguityCount'],
        },
      },
    },
    required: ['ambiguities'],
  },
};

export const FORMALIZE_TOOL = {
  name: 'record_formalizations',
  description: 'Record formal specifications generated from natural language requirements.',
  input_schema: {
    type: 'object',
    properties: {
      formalizations: {
        type: 'array',
        description: 'One formalization per requirement.',
        items: {
          type: 'object',
          properties: {
            requirementIndex: {
              type: 'integer',
              description: 'Zero-based index of the requirement.',
            },
            specCode: {
              type: 'string',
              description: 'The generated formal specification as a code string.',
            },
            notes: {
              type: 'string',
              description: 'Any assumptions made during formalization, or edge cases handled.',
            },
          },
          required: ['requirementIndex', 'specCode', 'notes'],
        },
      },
    },
    required: ['formalizations'],
  },
};

export const CROSS_INFORMALIZE_TOOL = {
  name: 'record_cross_informalizations',
  description: 'Record English back-translations of formal specifications produced by another model.',
  input_schema: {
    type: 'object',
    properties: {
      informalizations: {
        type: 'array',
        description: 'One back-translation per spec.',
        items: {
          type: 'object',
          properties: {
            requirementIndex: {
              type: 'integer',
              description: 'Zero-based index of the original requirement.',
            },
            naturalLanguage: {
              type: 'string',
              description: 'Plain English description of what the spec literally says. Be literal — do not guess intent.',
            },
            coverage: {
              type: 'string',
              description: 'Which aspects of the requirement does this spec cover?',
            },
            gaps: {
              type: 'string',
              description: 'Which aspects of a typical requirement like this are NOT covered? List any missing edge cases or boundary conditions.',
            },
            strength: {
              type: 'string',
              enum: ['trivial', 'weak', 'moderate', 'strong'],
              description: 'How strongly does the spec constrain the behavior? "trivial" if always true, "weak" if very little constrained, "moderate" if substantive, "strong" if tightly constrained.',
            },
          },
          required: ['requirementIndex', 'naturalLanguage', 'coverage', 'gaps', 'strength'],
        },
      },
    },
    required: ['informalizations'],
  },
};

export const JUDGMENT_TOOL = {
  name: 'record_judgments',
  description: 'Record drift judgments comparing back-translations against original requirements.',
  input_schema: {
    type: 'object',
    properties: {
      judgments: {
        type: 'array',
        description: 'One judgment per requirement.',
        items: {
          type: 'object',
          properties: {
            requirementIndex: {
              type: 'integer',
              description: 'Zero-based index of the requirement.',
            },
            // Judgment on model A's spec (via model B's back-translation)
            specA: {
              type: 'object',
              properties: {
                match: {
                  type: 'boolean',
                  description: 'True if spec A faithfully expresses the requirement.',
                },
                driftScore: {
                  type: 'number',
                  description: 'Drift score 0-1 where 0=no drift, 1=complete drift.',
                },
                driftType: {
                  type: 'string',
                  enum: ['none', 'tautology', 'weakened-postcondition', 'narrowed-scope', 'missing-case', 'wrong-property'],
                  description: 'Category of drift detected, or "none" if match is true.',
                },
                explanation: {
                  type: 'string',
                  description: 'Brief explanation of the judgment.',
                },
              },
              required: ['match', 'driftScore', 'driftType', 'explanation'],
            },
            // Judgment on model B's spec (via model A's back-translation)
            specB: {
              type: 'object',
              properties: {
                match: {
                  type: 'boolean',
                  description: 'True if spec B faithfully expresses the requirement.',
                },
                driftScore: {
                  type: 'number',
                  description: 'Drift score 0-1 where 0=no drift, 1=complete drift.',
                },
                driftType: {
                  type: 'string',
                  enum: ['none', 'tautology', 'weakened-postcondition', 'narrowed-scope', 'missing-case', 'wrong-property'],
                  description: 'Category of drift detected, or "none" if match is true.',
                },
                explanation: {
                  type: 'string',
                  description: 'Brief explanation of the judgment.',
                },
              },
              required: ['match', 'driftScore', 'driftType', 'explanation'],
            },
            // Did the two models disagree on what to formalize?
            modelsDisagreed: {
              type: 'boolean',
              description: 'True if spec A and spec B differ meaningfully in what they formalize.',
            },
            disagreementDescription: {
              type: 'string',
              description: 'If models disagreed, describe what they disagreed on.',
            },
          },
          required: ['requirementIndex', 'specA', 'specB', 'modelsDisagreed', 'disagreementDescription'],
        },
      },
    },
    required: ['judgments'],
  },
};
