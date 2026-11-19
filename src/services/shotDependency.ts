/**
 * Dependency-aware invalidation and generation versioning for storyboard shots.
 */
import type {
  ReferenceItem,
  ShotDependencyFingerprint,
  ShotGenerationVersion,
  ShotPrompt,
  StoryBible,
} from '../types';

export type { ShotDependencyFingerprint, ShotGenerationVersion };

export type InvalidationReason =
  | 'script'
  | 'style'
  | 'aspect'
  | 'camera'
  | 'lens'
  | 'shot_type'
  | 'lighting'
  | 'prompt'
  | 'character'
  | 'outfit'
  | 'environment'
  | 'prop';

const simpleHash = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

export const hashText = (value: string | null | undefined) => simpleHash(String(value || '').trim());

export const buildShotDependencyFingerprint = (options: {
  shot: ShotPrompt;
  script: string;
  stylePrompt?: string;
  aspectRatio?: string;
  references: ReferenceItem[];
  hubCameraPresetId?: string;
  hubLensPresetId?: string;
}): ShotDependencyFingerprint => {
  const { shot, script, stylePrompt, aspectRatio, references, hubCameraPresetId, hubLensPresetId } = options;
  const byName = new Map(references.map((ref) => [ref.name.trim().toLowerCase(), ref]));
  const characterHashes = (shot.characters || []).map((name) => {
    const ref = byName.get(name.trim().toLowerCase());
    return hashText(`${name}|${ref?.imageUrl || ''}|${ref?.description || ''}`);
  });
  const outfitHashes = Object.entries(shot.outfitSelections || {}).map(([characterId, outfitId]) => {
    const character = references.find((ref) => ref.id === characterId);
    const outfit = character?.outfits?.find((item) => item.id === outfitId);
    return hashText(`${characterId}|${outfitId}|${outfit?.imageUrl || ''}|${outfit?.prompt || ''}`);
  });
  const environmentRef = shot.environment
    ? byName.get(shot.environment.trim().toLowerCase())
    : null;
  const propHashes = (shot.products || []).map((name) => {
    const ref = byName.get(name.trim().toLowerCase());
    return hashText(`${name}|${ref?.imageUrl || ''}|${ref?.description || ''}`);
  });
  return {
    scriptHash: hashText(script),
    styleHash: hashText(stylePrompt),
    aspectRatio: aspectRatio || '16:9',
    cameraPresetId: shot.cameraPresetId || hubCameraPresetId || 'auto',
    lensPresetId: shot.lensPresetId || hubLensPresetId || 'auto',
    shotTypePresetId: shot.shotTypePresetId || '',
    lightingPresetId: shot.lightingPresetId || '',
    promptHash: hashText(shot.prompt || shot.description || ''),
    characterHashes,
    outfitHashes,
    environmentHash: environmentRef
      ? hashText(`${environmentRef.name}|${environmentRef.imageUrl || ''}|${environmentRef.description || ''}`)
      : (shot.environment ? hashText(shot.environment) : null),
    propHashes,
  };
};

export const diffFingerprints = (
  previous: ShotDependencyFingerprint | null | undefined,
  next: ShotDependencyFingerprint,
): InvalidationReason[] => {
  if (!previous) return [];
  const reasons: InvalidationReason[] = [];
  if (previous.scriptHash !== next.scriptHash) reasons.push('script');
  if (previous.styleHash !== next.styleHash) reasons.push('style');
  if (previous.aspectRatio !== next.aspectRatio) reasons.push('aspect');
  if (previous.cameraPresetId !== next.cameraPresetId) reasons.push('camera');
  if (previous.lensPresetId !== next.lensPresetId) reasons.push('lens');
  if (previous.shotTypePresetId !== next.shotTypePresetId) reasons.push('shot_type');
  if (previous.lightingPresetId !== next.lightingPresetId) reasons.push('lighting');
  if (previous.promptHash !== next.promptHash) reasons.push('prompt');
  if (previous.characterHashes.join(',') !== next.characterHashes.join(',')) reasons.push('character');
  if (previous.outfitHashes.join(',') !== next.outfitHashes.join(',')) reasons.push('outfit');
  if (previous.environmentHash !== next.environmentHash) reasons.push('environment');
  if (previous.propHashes.join(',') !== next.propHashes.join(',')) reasons.push('prop');
  return reasons;
};

export const markShotStale = (shot: ShotPrompt, reasons: InvalidationReason[]): ShotPrompt => {
  if (reasons.length === 0) return { ...shot, isStale: false, staleReasons: undefined };
  return {
    ...shot,
    isStale: true,
    staleReasons: reasons,
  };
};

/**
 * When Mara's outfit changes, only invalidate shots that reference Mara with that outfit
 * (or any Mara outfit selection). Establishing shots without Mara stay fresh.
 */
export const invalidateShotsForReferenceChange = (
  shots: ShotPrompt[],
  change: {
    type: 'character' | 'outfit' | 'environment' | 'prop' | 'script' | 'style' | 'aspect';
    referenceName?: string;
    referenceId?: string;
    outfitId?: string;
  },
): ShotPrompt[] => {
  const nameKey = change.referenceName?.trim().toLowerCase();
  return shots.map((shot) => {
    if (change.type === 'script' || change.type === 'style' || change.type === 'aspect') {
      return shot.imageUrl ? markShotStale(shot, [change.type]) : shot;
    }
    if (change.type === 'character') {
      const hit = (shot.characters || []).some((name) => name.trim().toLowerCase() === nameKey)
        || (change.referenceId && shot.outfitSelections?.[change.referenceId]);
      return hit && shot.imageUrl ? markShotStale(shot, ['character']) : shot;
    }
    if (change.type === 'outfit') {
      const hit = change.referenceId
        && shot.outfitSelections?.[change.referenceId]
        && (!change.outfitId || shot.outfitSelections[change.referenceId] === change.outfitId);
      return hit && shot.imageUrl ? markShotStale(shot, ['outfit']) : shot;
    }
    if (change.type === 'environment') {
      const hit = Boolean(shot.environment && shot.environment.trim().toLowerCase() === nameKey);
      return hit && shot.imageUrl ? markShotStale(shot, ['environment']) : shot;
    }
    if (change.type === 'prop') {
      const hit = (shot.products || []).some((name) => name.trim().toLowerCase() === nameKey);
      return hit && shot.imageUrl ? markShotStale(shot, ['prop']) : shot;
    }
    return shot;
  });
};

export const refreshShotFingerprints = (
  shots: ShotPrompt[],
  context: {
    script: string;
    stylePrompt?: string;
    aspectRatio?: string;
    references: ReferenceItem[];
    hubCameraPresetId?: string;
    hubLensPresetId?: string;
  },
): ShotPrompt[] => shots.map((shot) => {
  const next = buildShotDependencyFingerprint({ shot, ...context });
  const reasons = diffFingerprints(shot.generationFingerprint, next);
  const withFp = { ...shot, generationFingerprint: next };
  if (!shot.imageUrl) return { ...withFp, isStale: false, staleReasons: undefined };
  return reasons.length ? markShotStale(withFp, reasons) : { ...withFp, isStale: false, staleReasons: undefined };
});

export type GenerateShotMode = 'pending' | 'stale' | 'selected' | 'all';

export const selectShotsForGeneration = (
  shots: ShotPrompt[],
  mode: GenerateShotMode,
  selectedShotNumbers?: number[],
): ShotPrompt[] => {
  const selected = new Set(selectedShotNumbers || []);
  return shots.filter((shot) => {
    if (shot.isGenerating) return false;
    if (mode === 'pending') return !shot.imageUrl;
    if (mode === 'stale') return Boolean(shot.isStale) || !shot.imageUrl;
    if (mode === 'selected') return selected.has(shot.shot);
    return true; // all
  });
};

export const appendGenerationVersion = (
  shot: ShotPrompt,
  version: Omit<ShotGenerationVersion, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
): ShotPrompt => {
  const entry: ShotGenerationVersion = {
    id: version.id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: version.createdAt || new Date().toISOString(),
    imageUrl: version.imageUrl,
    prompt: version.prompt,
    modelPrompt: version.modelPrompt,
    negativePrompt: version.negativePrompt,
    modelId: version.modelId,
    modelFamily: version.modelFamily,
    fingerprint: version.fingerprint,
    generatedBy: version.generatedBy,
  };
  const previousUrls = shot.imageVersions || (shot.imageUrl ? [shot.imageUrl] : []);
  const imageVersions = previousUrls.includes(entry.imageUrl)
    ? previousUrls
    : [...previousUrls, entry.imageUrl];
  const generationVersions = [...(shot.generationVersions || []), entry];
  return {
    ...shot,
    imageUrl: entry.imageUrl,
    imageVersions,
    selectedVersionIndex: imageVersions.length - 1,
    generationVersions,
    generationFingerprint: entry.fingerprint,
    isStale: false,
    staleReasons: undefined,
    generatedBy: entry.generatedBy || shot.generatedBy,
  };
};

export const restoreGenerationVersion = (shot: ShotPrompt, versionId: string): ShotPrompt => {
  const version = (shot.generationVersions || []).find((entry) => entry.id === versionId);
  if (!version) return shot;
  const imageVersions = shot.imageVersions || [];
  const index = imageVersions.indexOf(version.imageUrl);
  return {
    ...shot,
    imageUrl: version.imageUrl,
    selectedVersionIndex: index >= 0 ? index : shot.selectedVersionIndex,
    prompt: version.prompt || shot.prompt,
    generatedBy: version.generatedBy || shot.generatedBy,
    generationFingerprint: version.fingerprint,
    isStale: false,
    staleReasons: undefined,
  };
};

export const clearGeneratedImage = (shot: ShotPrompt): ShotPrompt => ({
  ...shot,
  imageUrl: undefined,
  selectedVersionIndex: undefined,
  isGenerating: false,
  isStale: false,
  staleReasons: undefined,
});

export const scriptHashFromBible = (bible: Pick<StoryBible, 'script'>) => hashText(bible.script || '');
