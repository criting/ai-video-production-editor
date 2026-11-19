import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendSingleFrameConstraints,
  assignStableShotId,
  buildUnifiedPlanningRules,
  cinematicSizeFromShot,
  ensureShotHasScene,
  mapCinematicSizeToPresetId,
  normalizeCinematicShotSize,
  planSceneCoverage,
  renumberSceneShots,
  SINGLE_FRAME_CONSTRAINTS,
  validateShotDiversity,
} from './cinematicPlanning.ts';
import { splitScriptIntoScenes } from '../utils/directorScenes.ts';
import { buildSceneShots } from '../utils/directorAgent.ts';
import { SILENCE_INDEX_SAMPLE_REFERENCES, SILENCE_INDEX_SAMPLE_SCRIPT } from '../fixtures/silenceIndexSampleScreenplay.ts';
import { framingOnlyShotTypePrompt, stripConflictingCameraLensText, resolveEffectiveCameraConfig, snapshotHubCameraLensOntoShot } from './shotCameraLens.ts';
import {
  appendGenerationVersion,
  buildShotDependencyFingerprint,
  invalidateShotsForReferenceChange,
  selectShotsForGeneration,
} from './shotDependency.ts';
import { detectDrawThingsModelFamily, planDrawThingsReferences } from './drawThingsPlanning.ts';
import { adaptPromptPackageForModel, resolvePromptFamily } from './promptStyle.ts';
import type { ShotPrompt } from '../types.ts';

test('scene assignment: sample screenplay splits into two scenes with deterministic numbers', () => {
  const scenes = splitScriptIntoScenes(SILENCE_INDEX_SAMPLE_SCRIPT);
  assert.equal(scenes.length, 2);
  assert.equal(scenes[0].sceneNumber, 1);
  assert.equal(scenes[1].sceneNumber, 2);
  assert.match(scenes[0].slugline, /OBSERVATION GALLERY/i);
  assert.match(scenes[1].slugline, /ARCHIVE CORRIDOR/i);
});

test('coverage planner requests establishing, OTS, reaction, insert, and microdrama hook/freeze', () => {
  const scenes = splitScriptIntoScenes(SILENCE_INDEX_SAMPLE_SCRIPT);
  const plan = planSceneCoverage(scenes[0], SILENCE_INDEX_SAMPLE_REFERENCES as any, 'microdrama');
  const needs = new Set(plan.map((item) => item.need));
  assert.ok(needs.has('hook'));
  assert.ok(needs.has('ots_a') || needs.has('master'));
  assert.ok(needs.has('reaction') || needs.has('ecu_emotion'));
  assert.ok(needs.has('insert_prop'));
  assert.ok(needs.has('freeze'));
});

test('Director treatment conversion maps props and keeps scene numbering', () => {
  const scenes = splitScriptIntoScenes(SILENCE_INDEX_SAMPLE_SCRIPT);
  const { shots, warnings } = buildSceneShots(scenes[0], [
    {
      prompt: 'Mara at the rain-streaked window, dry interior, token in fist',
      description: 'Mara watches the city',
      characters: ['Mara Vale'],
      environment: 'Observation Gallery',
      props: ['Silence Index Token'],
      shotType: 'closeup',
      lighting: 'cinematic',
      cameraAngle: 'eye-level',
      rationale: 'Hook on Mara and the token',
    },
    {
      prompt: 'Damien enters dripping, Mara turns',
      description: 'Damien arrives',
      characters: ['Mara Vale', 'Damien Crowe'],
      environment: 'Observation Gallery',
      shotType: 'ots',
      lighting: 'dramatic',
      cameraAngle: 'over-the-shoulder',
    },
  ], SILENCE_INDEX_SAMPLE_REFERENCES as any);
  assert.equal(warnings.length, 0);
  assert.equal(shots[0].sceneNumber, 1);
  assert.equal(shots[0].sceneShotNumber, 1);
  assert.equal(shots[0].shotLabel, '1.1');
  assert.deepEqual(shots[0].products, ['Silence Index Token']);
  assert.equal(shots[1].shotLabel, '1.2');
});

test('shot numbering renumbers globally and within scenes', () => {
  const shots = renumberSceneShots([
    { shot: 9, sceneNumber: 2, sceneShotNumber: 5, prompt: 'b', description: 'b', characters: [], environment: null },
    { shot: 3, sceneNumber: 1, sceneShotNumber: 2, prompt: 'a', description: 'a', characters: [], environment: null },
    { shot: 1, sceneNumber: 1, sceneShotNumber: 1, prompt: 'a0', description: 'a0', characters: [], environment: null },
  ] as ShotPrompt[]);
  assert.deepEqual(shots.map((shot) => shot.shot), [1, 2, 3]);
  assert.deepEqual(shots.map((shot) => shot.shotLabel), ['1.1', '1.2', '2.1']);
});

test('every shot without a scene gets a scene assignment', () => {
  const shot = ensureShotHasScene({
    shot: 1,
    prompt: 'x',
    description: 'x',
    characters: [],
    environment: null,
  } as ShotPrompt, 2);
  assert.equal(shot.sceneNumber, 2);
  assert.ok(shot.shotLabel);
});

test('diversity validator flags consecutive identical sizes and suggests contrast', () => {
  const issues = validateShotDiversity([
    { shot: 1, sceneNumber: 1, shotTypePresetId: 'closeup', prompt: 'Mara face', description: '', characters: ['Mara Vale'], environment: null },
    { shot: 2, sceneNumber: 1, shotTypePresetId: 'closeup', prompt: 'Mara face again', description: '', characters: ['Mara Vale'], environment: null },
  ] as ShotPrompt[]);
  assert.ok(issues.some((issue) => issue.kind === 'consecutive_size'));
  assert.ok(issues[0].suggestion.length > 0);
});

test('single-frame constraints are appended and forbid multi-panel language', () => {
  const out = appendSingleFrameConstraints('Mara holds the token');
  assert.match(out, /Single cinematic frame only/i);
  assert.ok(out.includes(SINGLE_FRAME_CONSTRAINTS));
  assert.match(out, /split screens|collages|contact sheets/i);
});

test('camera/lens consistency strips conflicting mm text when presets are authoritative', () => {
  const cleaned = stripConflictingCameraLensText('Medium shot, 85mm portrait lens, Mara at the window', {
    stripLens: true,
    stripCameraBody: true,
  });
  assert.ok(!/85\s?mm/i.test(cleaned));
  assert.ok(!/portrait lens/i.test(cleaned));
  assert.match(cleaned, /Mara at the window/i);
  assert.equal(framingOnlyShotTypePrompt('medium shot, waist-up framing, 35mm lens'), 'medium shot, waist-up framing');
});

test('effective camera prefers shot lock over hub defaults', () => {
  const config = resolveEffectiveCameraConfig({
    shot: { cameraPresetId: 'arri-alexa35', lensPresetId: '85mm', manualLensOverride: true },
    hubCameraPresetId: 'auto',
    hubLensPresetId: '50mm',
    cameraPresets: [
      { id: 'auto', label: 'Auto', prompt: '' },
      { id: 'arri-alexa35', label: 'ARRI Alexa 35', prompt: 'shot on ARRI Alexa 35' },
    ],
    lensPresets: [
      { id: '50mm', label: '50mm', prompt: '50mm standard lens' },
      { id: '85mm', label: '85mm Portrait', prompt: '85mm portrait lens' },
    ],
  });
  assert.equal(config.lensPresetId, '85mm');
  assert.equal(config.cameraPresetId, 'arri-alexa35');
  assert.equal(config.source, 'manual');
  const snapped = snapshotHubCameraLensOntoShot({
    shot: 1,
    prompt: 'x',
    description: 'x',
    characters: [],
    environment: null,
  } as ShotPrompt, 'film-35mm', '35mm');
  assert.equal(snapped.cameraPresetId, 'film-35mm');
  assert.equal(snapped.lensPresetId, '35mm');
});

test('Draw Things reference plan is honest about single-image HTTP limits', () => {
  assert.equal(detectDrawThingsModelFamily('flux1-dev-kontext'), 'flux-kontext');
  assert.equal(detectDrawThingsModelFamily('sdxl-base'), 'sdxl');
  const plan = planDrawThingsReferences({
    model: 'flux1-dev-kontext',
    references: [
      { id: '1', name: 'Mara Vale', role: 'character', type: 'character', imageUrl: 'a' },
      { id: '2', name: 'Observation Gallery', role: 'environment', type: 'environment', imageUrl: 'b' },
    ],
  });
  assert.equal(plan.submitted.length, 1);
  assert.equal(plan.submitted[0].name, 'Mara Vale');
  assert.ok(plan.discarded.length >= 1);
  assert.equal(plan.recommendComfyUi, true);
  assert.match(plan.limitation, /exactly one|single/i);
});

test('prompt transformation keeps original separate and drops Flux negatives', () => {
  assert.equal(resolvePromptFamily('draw-things', 'image'), 'draw-things-flux');
  assert.equal(resolvePromptFamily('sdxl-juggernaut', 'image'), 'sdxl');
  assert.equal(resolvePromptFamily('qwen-image-21-fal', 'image'), 'qwen-image');
  const pkg = adaptPromptPackageForModel(
    'flux',
    'Mara holds the token. Medium shot. no text, no watermark',
    { kind: 'image', aspectRatio: '9:16', negatives: ['blurry'] },
  );
  assert.match(pkg.originalPrompt, /no text/);
  assert.ok(!/watermark|Avoid|blurry/i.test(pkg.modelPrompt));
  assert.match(pkg.negativePrompt, /text|watermark|blurry/i);
  assert.equal(pkg.embedNegativesInPrompt, false);
});

test('dependency invalidation is selective for outfit vs establishing shots', () => {
  const maraClose: ShotPrompt = {
    shot: 1,
    sceneNumber: 1,
    prompt: 'Mara close-up',
    description: 'Mara',
    characters: ['Mara Vale'],
    environment: 'Observation Gallery',
    outfitSelections: { 'char-mara': 'outfit-mara-gallery' },
    imageUrl: 'https://example.com/1.png',
  };
  const galleryWide: ShotPrompt = {
    shot: 2,
    sceneNumber: 1,
    prompt: 'Empty gallery establishing',
    description: 'Gallery',
    characters: [],
    environment: 'Observation Gallery',
    imageUrl: 'https://example.com/2.png',
  };
  const next = invalidateShotsForReferenceChange([maraClose, galleryWide], {
    type: 'outfit',
    referenceId: 'char-mara',
    outfitId: 'outfit-mara-gallery',
  });
  assert.equal(next[0].isStale, true);
  assert.equal(next[1].isStale, undefined);
});

test('generation modes select pending, stale, and all correctly', () => {
  const shots = [
    { shot: 1, prompt: 'a', description: 'a', characters: [], environment: null, imageUrl: undefined },
    { shot: 2, prompt: 'b', description: 'b', characters: [], environment: null, imageUrl: 'x', isStale: true },
    { shot: 3, prompt: 'c', description: 'c', characters: [], environment: null, imageUrl: 'y' },
  ] as ShotPrompt[];
  assert.deepEqual(selectShotsForGeneration(shots, 'pending').map((shot) => shot.shot), [1]);
  assert.deepEqual(selectShotsForGeneration(shots, 'stale').map((shot) => shot.shot), [1, 2]);
  assert.deepEqual(selectShotsForGeneration(shots, 'all').map((shot) => shot.shot), [1, 2, 3]);
});

test('version history preserves previous image when appending a replacement', () => {
  const base = {
    shot: 1,
    prompt: 'Mara',
    description: 'Mara',
    characters: ['Mara Vale'],
    environment: null,
    imageUrl: 'old.png',
    imageVersions: ['old.png'],
  } as ShotPrompt;
  const fingerprint = buildShotDependencyFingerprint({
    shot: base,
    script: SILENCE_INDEX_SAMPLE_SCRIPT,
    stylePrompt: 'noir',
    aspectRatio: '9:16',
    references: SILENCE_INDEX_SAMPLE_REFERENCES as any,
  });
  const next = appendGenerationVersion(base, {
    imageUrl: 'new.png',
    prompt: 'Mara updated',
    fingerprint,
    generatedBy: 'test',
  });
  assert.equal(next.imageUrl, 'new.png');
  assert.deepEqual(next.imageVersions, ['old.png', 'new.png']);
  assert.equal(next.generationVersions?.length, 1);
  assert.equal(next.isStale, false);
});

test('shot size taxonomy and stable ids', () => {
  assert.equal(normalizeCinematicShotSize('Medium Close-Up'), 'medium_closeup');
  assert.equal(mapCinematicSizeToPresetId('full'), 'full_body');
  assert.equal(cinematicSizeFromShot({ shotTypePresetId: 'ots', prompt: '' }), 'ots');
  const withId = assignStableShotId({
    shot: 1,
    sceneNumber: 1,
    sceneShotNumber: 1,
    prompt: 'x',
    description: 'x',
    characters: [],
    environment: null,
  } as ShotPrompt);
  assert.ok(withId.shotId);
  assert.match(buildUnifiedPlanningRules('microdrama'), /Vertical 9:16|Authorized ShotType/i);
});
