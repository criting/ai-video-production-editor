/**
 * Unified cinematic shot planning helpers shared by Director apply, Generate from Script,
 * coverage review, diversity validation, and single-frame prompt constraints.
 * Pure functions — no React / Electron imports.
 */
import type { ReferenceItem, ShotPrompt } from '../types';
import {
  DIRECTOR_FORMAT_RULES,
  DIRECTOR_COVERAGE_RULE,
  DIRECTOR_COUNT_RULE,
  DIRECTOR_NAMES_RULE,
  DIRECTOR_PROMPT_RULE,
  DIRECTOR_MOVE_RULE,
  DIRECTOR_SHOT_TYPES,
  DIRECTOR_LIGHTING,
  DIRECTOR_CAMERA_MOVES,
  hasDialogue,
  locationsForScene,
  charactersInScene,
  propsInScene,
  sceneTargetShots,
  shotSize as directorShotSize,
  type DirectorSceneSummary,
} from '../utils/directorAgent.ts';
import { splitScriptIntoScenes, type ScriptSceneBlock } from '../utils/directorScenes.ts';

/** Canonical cinematic shot sizes for planning and diversity checks. */
export const CINEMATIC_SHOT_SIZES = [
  'extreme_wide',
  'wide',
  'full',
  'medium',
  'medium_closeup',
  'closeup',
  'extreme_closeup',
  'ots',
  'pov',
  'insert',
  'detail',
] as const;

export type CinematicShotSize = (typeof CINEMATIC_SHOT_SIZES)[number];

export type CoverageNeed =
  | 'establishing'
  | 'master'
  | 'ots_a'
  | 'ots_b'
  | 'reverse'
  | 'reaction'
  | 'ecu_emotion'
  | 'insert_prop'
  | 'cutaway'
  | 'pov'
  | 'hook'
  | 'freeze';

export type CoveragePlanItem = {
  need: CoverageNeed;
  preferredSize: CinematicShotSize;
  rationale: string;
  required: boolean;
};

export type DiversityIssue = {
  shot: number;
  kind:
    | 'consecutive_size'
    | 'repeated_angle'
    | 'repeated_placement'
    | 'near_identical_composition'
    | 'repeated_portrait'
    | 'no_visual_advance';
  message: string;
  suggestion: string;
};

export type GenerationPackage = {
  cinematicPrompt: string;
  modelPrompt: string;
  negativePrompt: string;
  modelId: string;
  modelFamily: string;
  aspectRatio: string;
  referencesSubmitted: Array<{ id: string; name: string; role: string }>;
  cameraBody: string;
  lens: string;
  parameters: Record<string, string | number | boolean | null>;
};

const SIZE_ALIASES: Record<string, CinematicShotSize> = {
  extreme_wide: 'extreme_wide',
  extreme_wide_shot: 'extreme_wide',
  ews: 'extreme_wide',
  establishing: 'extreme_wide',
  wide: 'wide',
  wide_shot: 'wide',
  ws: 'wide',
  full: 'full',
  full_body: 'full',
  full_shot: 'full',
  medium: 'medium',
  medium_shot: 'medium',
  ms: 'medium',
  cowboy: 'medium',
  medium_closeup: 'medium_closeup',
  medium_close_up: 'medium_closeup',
  mcu: 'medium_closeup',
  portrait: 'medium_closeup',
  closeup: 'closeup',
  close_up: 'closeup',
  cu: 'closeup',
  extreme_closeup: 'extreme_closeup',
  extreme_close_up: 'extreme_closeup',
  ecu: 'extreme_closeup',
  ots: 'ots',
  over_the_shoulder: 'ots',
  pov: 'pov',
  insert: 'insert',
  b_roll: 'detail',
  detail: 'detail',
  macro: 'extreme_closeup',
};

/** Map Hub / Director preset ids onto the cinematic size taxonomy. */
export const normalizeCinematicShotSize = (value?: string | null): CinematicShotSize | null => {
  if (!value) return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return SIZE_ALIASES[key] || null;
};

export const cinematicSizeFromShot = (
  shot: Pick<ShotPrompt, 'shotTypePresetId' | 'cameraAngle' | 'prompt'>,
): CinematicShotSize => {
  const fromPreset = normalizeCinematicShotSize(shot.shotTypePresetId);
  if (fromPreset) return fromPreset;
  const coarse = directorShotSize(shot);
  if (coarse === 'ots') return 'ots';
  if (coarse === 'insert') return 'insert';
  if (coarse === 'close') return 'closeup';
  if (coarse === 'wide') return 'wide';
  if (coarse === 'medium') return 'medium';
  return 'medium';
};

/** Director rules text shared by every shot-planning route (including Generate from Script). */
export const buildUnifiedPlanningRules = (productionFormat?: string): string => {
  const formatRules = (DIRECTOR_FORMAT_RULES[productionFormat || ''] || [])
    .map((rule, index) => `${8 + index}. ${rule}`)
    .join('\n');
  return [
    `1. ${DIRECTOR_COUNT_RULE}`,
    `2. ${DIRECTOR_COVERAGE_RULE}`,
    `3. ${DIRECTOR_NAMES_RULE}`,
    `4. ${DIRECTOR_PROMPT_RULE}`,
    `5. ${DIRECTOR_MOVE_RULE}`,
    '6. Every shot MUST include sceneNumber and sceneShotNumber. Never leave a shot without a scene.',
    '7. Vary shot sizes deliberately — do not default every shot to medium / portrait / full-body.',
    '8. Prefer structured ids from the authorized lists; keep lens/camera body OUT of the still prompt when UI presets will supply them.',
    formatRules,
    '',
    `Authorized ShotType: ${DIRECTOR_SHOT_TYPES.join(', ')}`,
    `Authorized Lighting: ${DIRECTOR_LIGHTING.join(', ')}`,
    `Authorized CameraMovement: ${DIRECTOR_CAMERA_MOVES.join(', ')}`,
    `Preferred cinematic sizes: ${CINEMATIC_SHOT_SIZES.join(', ')}`,
  ].filter(Boolean).join('\n');
};

/**
 * Analyse a scene and propose the visual coverage it needs.
 * Suggestions only — the LLM / Director still writes the actual shots.
 */
export const planSceneCoverage = (
  scene: ScriptSceneBlock,
  references: ReferenceItem[],
  format?: string,
): CoveragePlanItem[] => {
  const plan: CoveragePlanItem[] = [];
  const dialogue = hasDialogue(scene.text);
  const cast = charactersInScene(scene, references);
  const places = locationsForScene(scene, references);
  const props = propsInScene(scene, references);
  const target = sceneTargetShots(scene.text, format);
  const isMicro = format === 'microdrama';

  if (isMicro) {
    plan.push({
      need: 'hook',
      preferredSize: 'extreme_closeup',
      rationale: 'Microdrama: open mid-crisis on the most striking face or action detail.',
      required: true,
    });
  }

  if (places.length > 0 || /\b(INT\.|EXT\.|EST\.)/i.test(scene.slugline)) {
    plan.push({
      need: 'establishing',
      preferredSize: isMicro ? 'wide' : 'extreme_wide',
      rationale: 'New location / time: establish geography before coverage.',
      required: !isMicro,
    });
  }

  if (dialogue && cast.length >= 2) {
    plan.push({ need: 'master', preferredSize: 'medium', rationale: 'Dialogue master / two-shot for geography of the conversation.', required: true });
    plan.push({ need: 'ots_a', preferredSize: 'ots', rationale: 'Over-the-shoulder coverage from side A.', required: true });
    plan.push({ need: 'ots_b', preferredSize: 'ots', rationale: 'Reverse over-the-shoulder from side B.', required: true });
    plan.push({ need: 'reaction', preferredSize: 'closeup', rationale: 'Reaction close-up on the key line.', required: true });
  } else if (dialogue) {
    plan.push({ need: 'master', preferredSize: 'medium', rationale: 'Single-character dialogue still needs a readable master.', required: true });
    plan.push({ need: 'reaction', preferredSize: 'closeup', rationale: 'Emotional close-up for the spoken beat.', required: true });
  }

  if (cast.length > 0) {
    plan.push({
      need: 'ecu_emotion',
      preferredSize: 'extreme_closeup',
      rationale: 'Emotional detail (eyes, hands, micro-expression) for intensity.',
      required: isMicro,
    });
  }

  if (props.length > 0) {
    plan.push({
      need: 'insert_prop',
      preferredSize: 'insert',
      rationale: `Insert for important prop(s): ${props.slice(0, 3).join(', ')}.`,
      required: true,
    });
  }

  if (/\b(looks?|watches?|sees?|stares?|gaze|through (the )?eyes)\b/i.test(scene.text)) {
    plan.push({ need: 'pov', preferredSize: 'pov', rationale: 'Narrative POV cue detected in the scene text.', required: false });
  }

  if (places.length > 0 && target >= 8) {
    plan.push({ need: 'cutaway', preferredSize: 'detail', rationale: 'Environmental cutaway for pacing / atmosphere.', required: false });
  }

  if (isMicro) {
    plan.push({
      need: 'freeze',
      preferredSize: 'closeup',
      rationale: 'Microdrama: end on an unresolved close-up freeze.',
      required: true,
    });
  }

  return plan;
};

/** Detect repetitive compositions that do not advance the scene. */
export const validateShotDiversity = (shots: ShotPrompt[]): DiversityIssue[] => {
  const issues: DiversityIssue[] = [];
  if (shots.length < 2) return issues;

  const ordered = [...shots].sort((a, b) => a.shot - b.shot);
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    const prevSize = cinematicSizeFromShot(prev);
    const currSize = cinematicSizeFromShot(curr);

    if (prevSize === currSize && prev.sceneNumber === curr.sceneNumber) {
      issues.push({
        shot: curr.shot,
        kind: 'consecutive_size',
        message: `Shots ${prev.shot} and ${curr.shot} share size "${currSize}".`,
        suggestion: `Change shot ${curr.shot} to a contrasting size (e.g. ${suggestContrastSize(currSize)}).`,
      });
    }

    const normalizeCamAngle = (value?: string) => String(value || '').trim().toLocaleLowerCase();
    const earlierCam = normalizeCamAngle(prev.cameraAngle);
    const laterCam = normalizeCamAngle(curr.cameraAngle);
    if (earlierCam && laterCam && earlierCam === laterCam && prev.sceneNumber === curr.sceneNumber) {
      issues.push({
        shot: curr.shot,
        kind: 'repeated_angle',
        message: `Repeated camera angle "${curr.cameraAngle}" on consecutive shots.`,
        suggestion: 'Use a reverse, higher/lower angle, or OTS to advance coverage.',
      });
    }

    const prevPlace = subjectPlacementKey(prev);
    const currPlace = subjectPlacementKey(curr);
    if (prevPlace && currPlace && prevPlace === currPlace && prevSize === currSize) {
      issues.push({
        shot: curr.shot,
        kind: 'repeated_placement',
        message: 'Same subject placement and size as the previous shot.',
        suggestion: 'Reframe (rule of thirds opposite side, centered for power, or insert detail).',
      });
    }

    if (nearIdenticalComposition(prev, curr)) {
      issues.push({
        shot: curr.shot,
        kind: 'near_identical_composition',
        message: `Shot ${curr.shot} is nearly identical to shot ${prev.shot}.`,
        suggestion: 'Keep matching frames only when continuity requires a match cut; otherwise change size or axis.',
      });
    }

    if (
      ['closeup', 'medium_closeup', 'extreme_closeup'].includes(currSize)
      && ['closeup', 'medium_closeup', 'extreme_closeup'].includes(prevSize)
      && samePrimaryCharacter(prev, curr)
      && i >= 2
      && ['closeup', 'medium_closeup', 'extreme_closeup'].includes(cinematicSizeFromShot(ordered[i - 2]))
    ) {
      issues.push({
        shot: curr.shot,
        kind: 'repeated_portrait',
        message: 'Three consecutive character portraits without a coverage change.',
        suggestion: 'Insert a reverse, insert, or wider master before another portrait.',
      });
    }
  }

  return issues;
};

const suggestContrastSize = (size: CinematicShotSize): CinematicShotSize => {
  const map: Record<CinematicShotSize, CinematicShotSize> = {
    extreme_wide: 'closeup',
    wide: 'medium_closeup',
    full: 'closeup',
    medium: 'wide',
    medium_closeup: 'wide',
    closeup: 'wide',
    extreme_closeup: 'medium',
    ots: 'closeup',
    pov: 'medium',
    insert: 'medium',
    detail: 'wide',
  };
  return map[size];
};

const subjectPlacementKey = (shot: ShotPrompt) => {
  if (shot.subjectPlacement?.trim()) return shot.subjectPlacement.trim().toLowerCase();
  const text = `${shot.prompt || ''} ${shot.description || ''}`.toLowerCase();
  if (/centered|centre|center frame|dead center/.test(text)) return 'center';
  if (/left (?:third|frame|side)/.test(text)) return 'left';
  if (/right (?:third|frame|side)/.test(text)) return 'right';
  return '';
};

const samePrimaryCharacter = (a: ShotPrompt, b: ShotPrompt) => {
  const aName = (a.characters || [])[0]?.toLowerCase();
  const bName = (b.characters || [])[0]?.toLowerCase();
  return Boolean(aName && bName && aName === bName);
};

const nearIdenticalComposition = (a: ShotPrompt, b: ShotPrompt) => {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 160);
  const ap = normalize(a.prompt || a.description || '');
  const bp = normalize(b.prompt || b.description || '');
  if (!ap || !bp) return false;
  if (ap === bp) return true;
  const aWords = new Set(ap.split(/\s+/));
  const bWords = bp.split(/\s+/);
  const overlap = bWords.filter((word) => aWords.has(word)).length;
  return overlap / Math.max(bWords.length, 1) > 0.85 && cinematicSizeFromShot(a) === cinematicSizeFromShot(b);
};

/** Explicit single-frame constraints appended to still prompts (not Burst Frame). */
export const SINGLE_FRAME_CONSTRAINTS = [
  'Single cinematic frame only.',
  'One camera setup, one captured moment.',
  'Do not create split screens, collages, contact sheets, multi-panel layouts, comic strips, storyboard grids, or multiple camera views in one image.',
].join(' ');

export const WEATHER_INTERIOR_CONSTRAINT =
  'If weather (rain, snow, fog) is outside a window or doorway, keep the interior dry and unaffected unless the screenplay explicitly places weather indoors.';

export const appendSingleFrameConstraints = (prompt: string, options?: { weatherAware?: boolean }) => {
  const parts = [String(prompt || '').trim(), SINGLE_FRAME_CONSTRAINTS];
  if (options?.weatherAware !== false) parts.push(WEATHER_INTERIOR_CONSTRAINT);
  return parts.filter(Boolean).join(' ');
};

export const ensureShotHasScene = (shot: ShotPrompt, fallbackSceneNumber = 1): ShotPrompt => {
  if (Number.isFinite(shot.sceneNumber)) return shot;
  return {
    ...shot,
    sceneNumber: fallbackSceneNumber,
    sceneShotNumber: shot.sceneShotNumber ?? shot.shot,
    shotLabel: shot.shotLabel || `${fallbackSceneNumber}.${shot.sceneShotNumber ?? shot.shot}`,
  };
};

export const assignStableShotId = (shot: ShotPrompt, existing?: string): ShotPrompt => {
  if (shot.shotId) return shot;
  const id = existing || `shot-${shot.sceneNumber ?? 'x'}-${shot.sceneShotNumber ?? shot.shot}-${Math.random().toString(36).slice(2, 10)}`;
  return { ...shot, shotId: id };
};

export const renumberSceneShots = (shots: ShotPrompt[]): ShotPrompt[] => {
  const byScene = new Map<number, ShotPrompt[]>();
  const unnumbered: ShotPrompt[] = [];
  for (const shot of [...shots].sort((a, b) => a.shot - b.shot)) {
    if (!Number.isFinite(shot.sceneNumber)) {
      unnumbered.push(shot);
      continue;
    }
    const scene = Number(shot.sceneNumber);
    const list = byScene.get(scene) || [];
    list.push(shot);
    byScene.set(scene, list);
  }
  const result: ShotPrompt[] = [];
  let global = 1;
  const sceneNumbers = [...byScene.keys()].sort((a, b) => a - b);
  for (const sceneNumber of sceneNumbers) {
    const list = byScene.get(sceneNumber) || [];
    list.forEach((shot, index) => {
      result.push({
        ...shot,
        shot: global,
        sceneNumber,
        sceneShotNumber: index + 1,
        shotLabel: `${sceneNumber}.${index + 1}`,
      });
      global += 1;
    });
  }
  for (const shot of unnumbered) {
    result.push({ ...shot, shot: global });
    global += 1;
  }
  return result;
};

export const summarizeCoverageForScenes = (
  script: string,
  references: ReferenceItem[],
  format?: string,
): Array<DirectorSceneSummary & { coverage: CoveragePlanItem[] }> => {
  return splitScriptIntoScenes(script).map((scene) => {
    const coverage = planSceneCoverage(scene, references, format);
    return {
      sceneNumber: scene.sceneNumber,
      slugline: scene.slugline,
      characters: scene.text.length,
      targetShots: sceneTargetShots(scene.text, format),
      dialogue: hasDialogue(scene.text),
      cast: charactersInScene(scene, references),
      locations: locationsForScene(scene, references),
      props: propsInScene(scene, references),
      existingShots: 0,
      shotsWithFrames: 0,
      coverage,
    };
  });
};

/** Map Director / planner shot type ids onto Hub SHOT_TYPE_PRESETS ids. */
export const mapCinematicSizeToPresetId = (size?: string | null): string | undefined => {
  const normalized = normalizeCinematicShotSize(size) || size?.trim().toLowerCase();
  if (!normalized) return undefined;
  const map: Record<string, string> = {
    extreme_wide: 'extreme_wide',
    wide: 'wide',
    full: 'full_body',
    medium: 'medium',
    medium_closeup: 'portrait',
    closeup: 'closeup',
    extreme_closeup: 'extreme_closeup',
    ots: 'ots',
    pov: 'pov',
    insert: 'b_roll',
    detail: 'b_roll',
    portrait: 'portrait',
    full_body: 'full_body',
    b_roll: 'b_roll',
    establishing: 'establishing',
  };
  if (map[normalized]) return map[normalized];
  return (DIRECTOR_SHOT_TYPES as readonly string[]).includes(normalized) ? normalized : undefined;
};
