export const CONTEXT_OVER_BROAD_LIMITS = {
  nodes: 25,
  files: 40,
  concepts: 20
} as const;

export const CONTEXT_PACK_LIMITS = {
  nodes: CONTEXT_OVER_BROAD_LIMITS.nodes - 1,
  files: CONTEXT_OVER_BROAD_LIMITS.files - 1,
  concepts: CONTEXT_OVER_BROAD_LIMITS.concepts - 1
} as const;
