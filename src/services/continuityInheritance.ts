/**
 * Continuity inheritance: Series → Season → Episode → Scene → Shot.
 * Lower levels may override without mutating parents.
 */
import type { ContinuityOverrideMarker, ContinuityOverrideScope } from '../types/productionHierarchy.ts';

export type ContinuityFieldValue = string | number | boolean | null | undefined;

export type ContinuityLayerValues = Partial<Record<string, ContinuityFieldValue>>;

export type ContinuityStack = {
  series?: ContinuityLayerValues;
  season?: ContinuityLayerValues;
  episode?: ContinuityLayerValues;
  scene?: ContinuityLayerValues;
  shot?: ContinuityLayerValues;
};

export type ResolvedContinuityField = {
  field: string;
  value: ContinuityFieldValue;
  scope: ContinuityOverrideScope;
  overridden: boolean;
  inheritedFromId?: string;
  marker: ContinuityOverrideMarker;
};

const SCOPE_ORDER: ContinuityOverrideScope[] = ['series', 'season', 'episode', 'scene', 'shot'];

const hasOwn = (layer: ContinuityLayerValues | undefined, field: string) =>
  Boolean(layer && Object.prototype.hasOwnProperty.call(layer, field) && layer[field] !== undefined);

/**
 * Resolve one field through the inheritance stack.
 * The deepest defined value wins; parent values are never mutated.
 */
export const resolveContinuityField = (
  field: string,
  stack: ContinuityStack,
  ids?: Partial<Record<ContinuityOverrideScope, string>>,
): ResolvedContinuityField => {
  let value: ContinuityFieldValue;
  let scope: ContinuityOverrideScope = 'series';
  let definedAt: ContinuityOverrideScope | null = null;

  for (const candidate of SCOPE_ORDER) {
    if (hasOwn(stack[candidate], field)) {
      value = stack[candidate]![field];
      scope = candidate;
      definedAt = candidate;
    }
  }

  const overridden = definedAt !== null && definedAt !== 'series';
  const inheritedFromId = definedAt && definedAt !== 'shot'
    ? ids?.[definedAt]
    : (definedAt === 'shot' ? ids?.scene || ids?.episode : ids?.series);

  return {
    field,
    value,
    scope: definedAt || 'series',
    overridden,
    inheritedFromId,
    marker: {
      field,
      scope: definedAt || 'series',
      overridden,
      inheritedFromId,
    },
  };
};

export const resolveContinuityFields = (
  fields: string[],
  stack: ContinuityStack,
  ids?: Partial<Record<ContinuityOverrideScope, string>>,
): Record<string, ResolvedContinuityField> => {
  const result: Record<string, ResolvedContinuityField> = {};
  for (const field of fields) {
    result[field] = resolveContinuityField(field, stack, ids);
  }
  return result;
};

/** Build override markers for UI badges (inherited vs overridden). */
export const buildOverrideMarkers = (
  fields: string[],
  stack: ContinuityStack,
  ids?: Partial<Record<ContinuityOverrideScope, string>>,
): ContinuityOverrideMarker[] =>
  fields.map((field) => resolveContinuityField(field, stack, ids).marker);

/**
 * Apply a shot/episode-level override without touching parent layers.
 * Returns a new overrides map for the target scope only.
 */
export const applyOverride = (
  current: ContinuityLayerValues | undefined,
  field: string,
  value: ContinuityFieldValue,
): ContinuityLayerValues => ({
  ...(current || {}),
  [field]: value,
});

/**
 * Clear an override so the value falls back to the parent scope.
 */
export const clearOverride = (
  current: ContinuityLayerValues | undefined,
  field: string,
): ContinuityLayerValues => {
  if (!current || !(field in current)) return current || {};
  const next = { ...current };
  delete next[field];
  return next;
};

export const CONTINUITY_CHARACTER_FIELDS = [
  'appearance',
  'hairstyle',
  'bodyType',
  'distinguishingFeatures',
  'wardrobe',
  'makeup',
  'ageAppearance',
] as const;

export const CONTINUITY_ENVIRONMENT_FIELDS = [
  'description',
  'architecture',
  'furniture',
  'lighting',
  'colorPalette',
  'layout',
  'props',
  'continuityInstructions',
] as const;
