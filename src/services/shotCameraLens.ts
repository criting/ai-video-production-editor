/**
 * Authoritative camera body + lens resolution for storyboard generation.
 * Prevents free-text lens descriptions from fighting UI presets.
 */
import type { ShotPrompt } from '../types';

export type CameraLensPreset = {
  id: string;
  label: string;
  prompt: string;
  aspectRatioOverride?: string;
  aspectRatioHint?: string;
};

export type EffectiveCameraConfig = {
  cameraPresetId: string;
  lensPresetId: string;
  cameraLabel: string;
  lensLabel: string;
  cameraPrompt: string;
  lensPrompt: string;
  aspectRatioOverride?: string;
  aspectRatioHint?: string;
  /** True when the shot stores its own camera/lens rather than inheriting hub defaults. */
  shotLocked: boolean;
  source: 'shot' | 'hub' | 'manual';
};

const LENS_MM_RX = /\b(\d{2,3})\s?-?\s?mm(?:\s+(?:lens|prime|glass))?\b/gi;
const LENS_WORD_RX = /\b(ultra[- ]?wide|telephoto|anamorphic|portrait lens|probe lens|tilt[- ]?shift|vintage lens)\b/gi;
const CAMERA_BODY_RX = /\b(shot on|filmed (?:with|on)|captured (?:with|on)|arri|alexa|red v-?raptor|sony venice|blackmagic|imax|iphone)\b[^.!]*/gi;

/** Strip lens/camera-body clauses from LLM prose when structured presets will supply them. */
export const stripConflictingCameraLensText = (prompt: string, options?: { stripLens?: boolean; stripCameraBody?: boolean }) => {
  let text = String(prompt || '');
  if (options?.stripLens !== false) {
    text = text
      .replace(/\b\d{2,3}\s?-?\s?mm\s+(?:lens|prime|glass)\b/gi, '')
      .replace(LENS_MM_RX, '')
      .replace(LENS_WORD_RX, '');
  }
  if (options?.stripCameraBody !== false) {
    text = text.replace(CAMERA_BODY_RX, '');
  }
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/([,;]){2,}/g, '$1')
    .replace(/^\s*[,;.\s]+|[,;.\s]+$/g, '')
    .trim();
};

/** Framing-only shot-type text (no embedded focal lengths). */
export const framingOnlyShotTypePrompt = (prompt: string) =>
  stripConflictingCameraLensText(prompt, { stripLens: true, stripCameraBody: true });

export const resolveEffectiveCameraConfig = (options: {
  shot: Pick<ShotPrompt, 'cameraPresetId' | 'lensPresetId' | 'manualCameraOverride' | 'manualLensOverride'>;
  hubCameraPresetId: string;
  hubLensPresetId: string;
  cameraPresets: CameraLensPreset[];
  lensPresets: CameraLensPreset[];
}): EffectiveCameraConfig => {
  const { shot, hubCameraPresetId, hubLensPresetId, cameraPresets, lensPresets } = options;
  const cameraId = shot.manualCameraOverride && shot.cameraPresetId
    ? shot.cameraPresetId
    : (shot.cameraPresetId || hubCameraPresetId || 'auto');
  const lensId = shot.manualLensOverride && shot.lensPresetId
    ? shot.lensPresetId
    : (shot.lensPresetId || hubLensPresetId || 'auto');
  const camera = cameraPresets.find((preset) => preset.id === cameraId) || cameraPresets[0];
  const lens = lensPresets.find((preset) => preset.id === lensId) || lensPresets[0];
  const shotLocked = Boolean(
    (shot.cameraPresetId && shot.cameraPresetId !== hubCameraPresetId)
    || (shot.lensPresetId && shot.lensPresetId !== hubLensPresetId)
    || shot.manualCameraOverride
    || shot.manualLensOverride,
  );
  return {
    cameraPresetId: camera?.id || 'auto',
    lensPresetId: lens?.id || 'auto',
    cameraLabel: camera?.label || 'Auto',
    lensLabel: lens?.label || 'Auto',
    cameraPrompt: camera?.prompt || '',
    lensPrompt: lens?.prompt || '',
    aspectRatioOverride: lens?.aspectRatioOverride,
    aspectRatioHint: lens?.aspectRatioHint,
    shotLocked,
    source: shot.manualCameraOverride || shot.manualLensOverride
      ? 'manual'
      : (shot.cameraPresetId || shot.lensPresetId ? 'shot' : 'hub'),
  };
};

/**
 * Build the camera/lens clause for the generation prompt from the authoritative presets only.
 * Does not re-introduce free-text lens language from the cinematic prompt.
 */
export const buildAuthoritativeCameraLensClause = (config: EffectiveCameraConfig) =>
  [config.cameraPrompt, config.lensPrompt].filter(Boolean).join(', ');

/** Snapshot hub camera/lens onto a shot without marking manual override (Director apply). */
export const snapshotHubCameraLensOntoShot = <T extends ShotPrompt>(
  shot: T,
  hubCameraPresetId: string,
  hubLensPresetId: string,
): T => ({
  ...shot,
  cameraPresetId: shot.cameraPresetId || hubCameraPresetId || 'auto',
  lensPresetId: shot.lensPresetId || hubLensPresetId || 'auto',
});
