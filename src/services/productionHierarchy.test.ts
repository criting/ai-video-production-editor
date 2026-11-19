import test from 'node:test';
import assert from 'node:assert/strict';
import type { ShotPrompt, StoryBible } from '../types.ts';
import {
  createEpisode,
  flattenActiveEpisodeToShotPrompts,
  getActiveEpisode,
  listEpisodes,
  migrateFlatProjectToHierarchy,
  setActiveEpisode,
  writeActiveEpisodeFromFlat,
  appendTakeToShot,
  summarizeHierarchy,
} from './productionHierarchy.ts';
import {
  applyOverride,
  clearOverride,
  resolveContinuityField,
} from './continuityInheritance.ts';

const sampleBible = (): StoryBible => ({
  logline: 'A archivist hears a voice that should not exist.',
  characters: [{ name: 'Mara Vale', description: 'Archivist' }],
  plotBeats: 'Recording → Archive → Silence',
  productionGuidelines: '',
  script: `INT. OBSERVATION GALLERY - NIGHT

Mara listens to a recording.

INT. ARCHIVE CORRIDOR - NIGHT

She walks the stacks.`,
  title: 'The Silence Index',
});

const sampleShots = (): ShotPrompt[] => ([
  {
    shot: 1,
    sceneNumber: 1,
    description: 'Mara at the console',
    prompt: 'cinematic medium shot of Mara',
    characters: ['Mara Vale'],
    environment: 'Observation Gallery',
    imageUrl: 'file:///media/s1.png',
    imageVersions: ['file:///media/s1.png', 'file:///media/s1b.png'],
  },
  {
    shot: 2,
    sceneNumber: 2,
    description: 'Corridor walk',
    prompt: 'wide shot corridor',
    characters: ['Mara Vale'],
    environment: 'Archive Corridor',
    imageUrl: 'file:///media/s2.png',
  },
]);

test('migrateFlatProjectToHierarchy creates Series/Season/Episode with takes preserved', () => {
  const hierarchy = migrateFlatProjectToHierarchy({
    storyBible: sampleBible(),
    shotPrompts: sampleShots(),
    projectName: 'The Silence Index',
  });
  assert.equal(hierarchy.series.title, 'The Silence Index');
  assert.equal(hierarchy.series.seasons.length, 1);
  assert.equal(hierarchy.series.seasons[0].episodes.length, 1);
  const episode = getActiveEpisode(hierarchy);
  assert.ok(episode);
  assert.equal(episode!.scenes.length, 2);
  const firstShot = episode!.scenes[0].shots[0];
  assert.equal(firstShot.takes.length, 2);
  assert.ok(firstShot.selectedTakeId);
  const summary = summarizeHierarchy(hierarchy);
  assert.equal(summary.activeShotCount, 2);
  assert.equal(summary.activeTakeCount, 3);
});

test('episode switch dual-write preserves previous episode script and shots', () => {
  let hierarchy = migrateFlatProjectToHierarchy({
    storyBible: sampleBible(),
    shotPrompts: sampleShots(),
  });
  hierarchy = writeActiveEpisodeFromFlat(hierarchy, sampleBible().script, sampleShots());
  hierarchy = createEpisode(hierarchy, { title: 'The Original' });
  assert.equal(listEpisodes(hierarchy).length, 2);
  assert.equal(getActiveEpisode(hierarchy)?.title, 'The Original');
  assert.equal(getActiveEpisode(hierarchy)?.scenes.length, 0);

  // Switch back to episode 1
  const episode1Id = hierarchy.series.seasons[0].episodes[0].id;
  hierarchy = setActiveEpisode(hierarchy, episode1Id);
  const flat = flattenActiveEpisodeToShotPrompts(hierarchy);
  assert.equal(flat.length, 2);
  assert.equal(flat[0].sceneNumber, 1);
  assert.match(getActiveEpisode(hierarchy)!.script, /OBSERVATION GALLERY/i);
});

test('appendTakeToShot never drops prior takes', () => {
  let hierarchy = migrateFlatProjectToHierarchy({
    storyBible: sampleBible(),
    shotPrompts: sampleShots(),
  });
  const shotId = getActiveEpisode(hierarchy)!.scenes[0].shots[0].id;
  hierarchy = appendTakeToShot(hierarchy, shotId, {
    id: 'take-new',
    kind: 'image',
    createdAt: new Date().toISOString(),
    mediaUrl: 'file:///media/s1c.png',
    status: 'completed',
    rating: 'pick',
  });
  const shot = getActiveEpisode(hierarchy)!.scenes[0].shots[0];
  assert.ok(shot.takes.length >= 3);
  assert.equal(shot.selectedTakeId, 'take-new');
});

test('continuity inheritance: episode override does not mutate series', () => {
  const series = { wardrobe: 'grey coat' };
  const episode = applyOverride(undefined, 'wardrobe', 'rain jacket');
  const resolved = resolveContinuityField('wardrobe', { series, episode });
  assert.equal(resolved.value, 'rain jacket');
  assert.equal(resolved.overridden, true);
  assert.equal(series.wardrobe, 'grey coat');
  const cleared = clearOverride(episode, 'wardrobe');
  const fallback = resolveContinuityField('wardrobe', { series, episode: cleared });
  assert.equal(fallback.value, 'grey coat');
  assert.equal(fallback.overridden, false);
});
