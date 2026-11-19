/**
 * Pure Draw Things model-family + reference planning helpers (no HTTP / localStorage).
 */

export type DrawThingsModelFamily =
  | 'flux'
  | 'flux-kontext'
  | 'sdxl'
  | 'qwen-edit'
  | 'sd15'
  | 'unknown';

export const isDrawThingsEditModel = (model?: string) => /kontext|klein|[_-]edit/i.test(model || '');

/** Best-effort family detection from the model string Draw Things reports on GET /. */
export const detectDrawThingsModelFamily = (model?: string | null): DrawThingsModelFamily => {
  const id = String(model || '').toLowerCase();
  if (!id) return 'unknown';
  if (/kontext/.test(id)) return 'flux-kontext';
  if (/qwen/.test(id) && /edit/.test(id)) return 'qwen-edit';
  if (/flux|klein/.test(id)) return 'flux';
  if (/sdxl|xl[_-]?base|juggernaut|realvisxl|pony/.test(id)) return 'sdxl';
  if (/sd[_-]?1\.?5|v1-5|realistic.?vision(?!xl)/.test(id)) return 'sd15';
  return 'unknown';
};

export type DrawThingsReferencePlan = {
  requested: Array<{ id?: string; name: string; role: string }>;
  submitted: Array<{ id?: string; name: string; role: string }>;
  discarded: Array<{ id?: string; name: string; role: string; reason: string }>;
  limitation: string;
  recommendComfyUi: boolean;
  modelFamily: DrawThingsModelFamily;
  isEditModel: boolean;
};

/**
 * Honest reference accounting for Draw Things HTTP (exactly one start image).
 * Prefer the primary character identity reference when several concept images exist.
 */
export const planDrawThingsReferences = (options: {
  model?: string | null;
  modelFamilyOverride?: DrawThingsModelFamily | null;
  references: Array<{ id?: string; name: string; role?: string; type?: string; imageUrl?: string | null }>;
  startImageName?: string;
}): DrawThingsReferencePlan => {
  const modelFamily = options.modelFamilyOverride || detectDrawThingsModelFamily(options.model);
  const isEditModel = isDrawThingsEditModel(options.model) || modelFamily === 'flux-kontext' || modelFamily === 'qwen-edit';
  const requested = options.references
    .filter((ref) => ref.imageUrl)
    .map((ref) => ({ id: ref.id, name: ref.name, role: ref.role || ref.type || 'reference' }));

  const preferCharacter = [...requested].sort((a, b) => {
    const score = (role: string) => (/character|identity|cast/.test(role) ? 0 : /wardrobe|outfit/.test(role) ? 1 : 2);
    return score(a.role) - score(b.role);
  });

  const primary = isEditModel && preferCharacter.length > 0
    ? preferCharacter[0]
    : (options.startImageName ? { name: options.startImageName, role: 'start-image' } : null);

  const submitted = primary ? [primary] : [];
  const discarded = requested
    .filter((ref) => !submitted.some((item) => item.name === ref.name && item.role === ref.role))
    .map((ref) => ({
      ...ref,
      reason: 'Draw Things HTTP accepts exactly one start image; remaining references stay in the text prompt only.',
    }));

  return {
    requested,
    submitted,
    discarded,
    limitation: isEditModel
      ? 'Draw Things HTTP edit models use a single start/reference image. Extra concept images are not uploaded — use a ComfyUI multi-ref workflow when you need several identity locks.'
      : 'Draw Things HTTP txt2img sends no reference images. Concept references influence the prompt text only unless you switch to an edit model or ComfyUI.',
    recommendComfyUi: requested.length > 1,
    modelFamily,
    isEditModel,
  };
};
