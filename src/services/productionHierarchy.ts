/**
 * Episodic production hierarchy helpers + safe migration from flat projects.
 */
import type { SceneWallState, ShotPrompt, StoryBible } from '../types.ts';
import type {
  EpisodeRecord,
  ProductionHierarchy,
  SceneRecord,
  SeasonRecord,
  SeriesRecord,
  ShotRecord,
  TakeRecord,
} from '../types/productionHierarchy.ts';
import { splitScriptIntoScenes } from '../utils/directorScenes.ts';
import { assignStableShotId } from './cinematicPlanning.ts';

const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const interiorFromSlugline = (slugline: string): SceneRecord['interiorExterior'] => {
  if (/^\s*(INT\.?\s*\/\s*EXT|I\/E)\b/i.test(slugline)) return 'I/E';
  if (/^\s*EST\b/i.test(slugline)) return 'EST';
  if (/^\s*INT\b/i.test(slugline)) return 'INT';
  if (/^\s*EXT\b/i.test(slugline)) return 'EXT';
  return 'unknown';
};

const takesFromShotPrompt = (shot: ShotPrompt): TakeRecord[] => {
  const takes: TakeRecord[] = [];
  const urls = shot.imageVersions?.length
    ? shot.imageVersions
    : (shot.imageUrl ? [shot.imageUrl] : []);
  urls.forEach((url, index) => {
    const rich = shot.generationVersions?.[index];
    takes.push({
      id: rich?.id || newId('take'),
      kind: 'image',
      createdAt: rich?.createdAt || new Date().toISOString(),
      mediaUrl: url,
      prompt: rich?.prompt || shot.prompt,
      modelPrompt: rich?.modelPrompt,
      negativePrompt: rich?.negativePrompt || shot.negativePrompt,
      modelId: rich?.modelId,
      modelFamily: rich?.modelFamily,
      fingerprint: rich?.fingerprint || shot.generationFingerprint,
      generatedBy: rich?.generatedBy || shot.generatedBy,
      rating: index === (shot.selectedVersionIndex ?? urls.length - 1) ? 'pick' : 'alt',
      status: 'completed',
    });
  });
  if (shot.videoUrl) {
    takes.push({
      id: newId('take'),
      kind: 'video',
      createdAt: new Date().toISOString(),
      mediaUrl: shot.videoUrl,
      prompt: shot.motionPrompt || shot.prompt,
      generatedBy: shot.generatedBy,
      rating: 'pick',
      status: 'completed',
    });
  }
  return takes;
};

export const shotPromptToShotRecord = (shot: ShotPrompt, displayNumber: number): ShotRecord => {
  const withId = assignStableShotId(shot);
  const takes = takesFromShotPrompt(withId);
  const selectedImage = withId.imageUrl
    ? takes.find((take) => take.kind === 'image' && take.mediaUrl === withId.imageUrl)
    : takes.find((take) => take.kind === 'image' && take.rating === 'pick');
  return {
    id: withId.shotId || newId('shot'),
    number: displayNumber,
    sceneShotNumber: withId.sceneShotNumber,
    shotLabel: withId.shotLabel,
    narrativePurpose: withId.narrativePurpose,
    actionDescription: withId.actionDescription || withId.description,
    description: withId.description || '',
    prompt: withId.prompt || '',
    negativePrompt: withId.negativePrompt,
    composition: withId.composition,
    subjectPlacement: withId.subjectPlacement,
    shotTypePresetId: withId.shotTypePresetId,
    lightingPresetId: withId.lightingPresetId,
    cameraAngle: withId.cameraAngle,
    cameraMovementPreset: withId.cameraMovementPreset,
    cameraPresetId: withId.cameraPresetId,
    lensPresetId: withId.lensPresetId,
    characters: withId.characters || [],
    environment: withId.environment ?? null,
    products: withId.products,
    continuityAnchors: withId.continuityAnchors,
    visualTriggers: withId.visualTriggers,
    planSource: withId.planSource,
    selectedTakeId: selectedImage?.id,
    takes,
    generationFingerprint: withId.generationFingerprint,
    isStale: withId.isStale,
    staleReasons: withId.staleReasons,
    generationStatus: withId.imageUrl ? 'completed' : 'idle',
    analysisNotes: withId.analysisNotes,
    legacyShotNumber: withId.shot,
    outfitSelections: withId.outfitSelections,
    motionPrompt: withId.motionPrompt,
    contextReferences: withId.contextReferences,
    burstFrame: withId.burstFrame,
  };
};

export const shotRecordToShotPrompt = (shot: ShotRecord, globalNumber: number): ShotPrompt => {
  const imageTakes = shot.takes.filter((take) => take.kind === 'image');
  const selected = imageTakes.find((take) => take.id === shot.selectedTakeId)
    || imageTakes.find((take) => take.rating === 'pick')
    || imageTakes[imageTakes.length - 1];
  const videoTake = shot.takes.find((take) => take.kind === 'video' && take.rating === 'pick')
    || shot.takes.find((take) => take.kind === 'video');
  return {
    shot: globalNumber,
    shotId: shot.id,
    sceneShotNumber: shot.sceneShotNumber,
    shotLabel: shot.shotLabel,
    narrativePurpose: shot.narrativePurpose,
    actionDescription: shot.actionDescription,
    description: shot.description,
    prompt: shot.prompt,
    negativePrompt: shot.negativePrompt,
    composition: shot.composition,
    subjectPlacement: shot.subjectPlacement,
    shotTypePresetId: shot.shotTypePresetId,
    lightingPresetId: shot.lightingPresetId,
    cameraAngle: shot.cameraAngle,
    cameraMovementPreset: shot.cameraMovementPreset,
    cameraPresetId: shot.cameraPresetId,
    lensPresetId: shot.lensPresetId,
    characters: shot.characters,
    environment: shot.environment,
    products: shot.products,
    continuityAnchors: shot.continuityAnchors,
    visualTriggers: shot.visualTriggers,
    planSource: shot.planSource,
    imageUrl: selected?.mediaUrl,
    imageVersions: imageTakes.map((take) => take.mediaUrl),
    selectedVersionIndex: selected
      ? Math.max(0, imageTakes.findIndex((take) => take.id === selected.id))
      : undefined,
    generationVersions: imageTakes.map((take) => ({
      id: take.id,
      createdAt: take.createdAt,
      imageUrl: take.mediaUrl,
      prompt: take.prompt || shot.prompt,
      modelPrompt: take.modelPrompt,
      negativePrompt: take.negativePrompt,
      modelId: take.modelId,
      modelFamily: take.modelFamily,
      fingerprint: take.fingerprint,
      generatedBy: take.generatedBy,
    })),
    generationFingerprint: shot.generationFingerprint,
    isStale: shot.isStale,
    staleReasons: shot.staleReasons,
    videoUrl: videoTake?.mediaUrl,
    generatedBy: selected?.generatedBy,
    analysisNotes: shot.analysisNotes,
    outfitSelections: shot.outfitSelections,
    motionPrompt: shot.motionPrompt,
    contextReferences: shot.contextReferences,
    burstFrame: shot.burstFrame,
  };
};

/** Build scene records from script blocks + flat shots. */
export const buildScenesFromScriptAndShots = (
  script: string,
  shots: ShotPrompt[],
): SceneRecord[] => {
  const blocks = splitScriptIntoScenes(script);
  if (blocks.length === 0) {
    const sceneShots = shots
      .slice()
      .sort((a, b) => a.shot - b.shot)
      .map((shot, index) => shotPromptToShotRecord(shot, index + 1));
    return [{
      id: newId('scene'),
      number: 1,
      slugline: 'UNTITLED SCENE',
      interiorExterior: 'unknown',
      scriptText: script,
      shots: sceneShots,
      productionStatus: 'draft',
    }];
  }

  return blocks.map((block) => {
    const sceneShots = shots
      .filter((shot) => Number(shot.sceneNumber) === block.sceneNumber
        || (!Number.isFinite(shot.sceneNumber) && block.sceneNumber === 1 && shots.every((s) => !Number.isFinite(s.sceneNumber))))
      .sort((a, b) => a.shot - b.shot)
      .map((shot, index) => {
        const record = shotPromptToShotRecord(shot, index + 1);
        return {
          ...record,
          sceneShotNumber: record.sceneShotNumber || index + 1,
          shotLabel: record.shotLabel || `${block.sceneNumber}.${index + 1}`,
        };
      });
    // Orphans with no scene number go into scene 1 only once; otherwise attach unmatched later.
    return {
      id: newId('scene'),
      number: block.sceneNumber,
      slugline: block.slugline,
      interiorExterior: interiorFromSlugline(block.slugline),
      scriptText: block.text,
      shots: sceneShots,
      productionStatus: 'draft' as const,
    };
  });
};

export type MigrateProjectInput = {
  storyBible: StoryBible;
  shotPrompts: ShotPrompt[];
  sceneWall?: SceneWallState | null;
  projectName?: string | null;
};

/**
 * Existing Project → Series with Season 1 / Episode 1.
 * Preserves all shots as Takes; does not destroy media URLs.
 */
export const migrateFlatProjectToHierarchy = (input: MigrateProjectInput): ProductionHierarchy => {
  const title = input.projectName || input.storyBible.title || 'Untitled Series';
  const script = input.storyBible.script || '';
  const scenes = buildScenesFromScriptAndShots(script, input.shotPrompts || []);

  // Attach orphan shots (scene numbers not in script) to a catch-all scene.
  const known = new Set(scenes.map((scene) => scene.number));
  const orphans = (input.shotPrompts || []).filter((shot) => (
    Number.isFinite(shot.sceneNumber) && !known.has(Number(shot.sceneNumber))
  ));
  if (orphans.length > 0) {
    scenes.push({
      id: newId('scene'),
      number: Math.max(0, ...[...known]) + 1,
      slugline: 'ORPHAN SHOTS',
      interiorExterior: 'unknown',
      scriptText: '',
      shots: orphans.sort((a, b) => a.shot - b.shot).map((shot, index) => shotPromptToShotRecord(shot, index + 1)),
      productionStatus: 'draft',
    });
  }

  const episode: EpisodeRecord = {
    id: newId('ep'),
    number: 1,
    title: input.storyBible.title || 'Episode 01',
    logline: input.storyBible.logline || '',
    synopsis: input.storyBible.plotBeats || '',
    script,
    charactersAppearing: Array.from(new Set((input.shotPrompts || []).flatMap((shot) => shot.characters || []))),
    locationsUsed: Array.from(new Set((input.shotPrompts || []).map((shot) => shot.environment).filter(Boolean) as string[])),
    productionStatus: 'in_progress',
    generationStatus: 'idle',
    sceneWall: input.sceneWall || null,
    scenes,
  };

  const season: SeasonRecord = {
    id: newId('season'),
    number: 1,
    title: 'Season 1',
    synopsis: input.storyBible.logline || '',
    productionStatus: 'in_progress',
    episodes: [episode],
  };

  const series: SeriesRecord = {
    id: newId('series'),
    title,
    logline: input.storyBible.logline || '',
    synopsis: input.storyBible.plotBeats || '',
    genre: input.storyBible.projectType,
    targetAudience: input.storyBible.targetAudience,
    format: input.storyBible.productionFormat,
    visualDirection: input.storyBible.selectedStyle,
    productionStatus: 'in_progress',
    seasons: [season],
  };

  return {
    schemaVersion: 1,
    series,
    activeSeasonId: season.id,
    activeEpisodeId: episode.id,
    dualWriteEnabled: true,
    migratedFromProjectVersion: 2,
    migratedAt: new Date().toISOString(),
  };
};

export const ensureProductionHierarchy = (
  hierarchy: ProductionHierarchy | null | undefined,
  input: MigrateProjectInput,
): ProductionHierarchy => {
  if (hierarchy?.series?.seasons?.length && hierarchy.activeEpisodeId) return hierarchy;
  return migrateFlatProjectToHierarchy(input);
};

export const getActiveSeason = (hierarchy: ProductionHierarchy): SeasonRecord | null =>
  hierarchy.series.seasons.find((season) => season.id === hierarchy.activeSeasonId)
  || hierarchy.series.seasons[0]
  || null;

export const getActiveEpisode = (hierarchy: ProductionHierarchy): EpisodeRecord | null => {
  const season = getActiveSeason(hierarchy);
  if (!season) return null;
  return season.episodes.find((episode) => episode.id === hierarchy.activeEpisodeId)
    || season.episodes[0]
    || null;
};

/** Flatten active episode scenes/shots into Hub-compatible ShotPrompt[] with global numbering. */
export const flattenActiveEpisodeToShotPrompts = (hierarchy: ProductionHierarchy): ShotPrompt[] => {
  const episode = getActiveEpisode(hierarchy);
  if (!episode) return [];
  const result: ShotPrompt[] = [];
  let global = 1;
  for (const scene of [...episode.scenes].sort((a, b) => a.number - b.number)) {
    const shots = [...scene.shots].sort((a, b) => a.number - b.number);
    shots.forEach((shot, index) => {
      const prompt = shotRecordToShotPrompt(shot, global);
      result.push({
        ...prompt,
        sceneNumber: scene.number,
        sceneShotNumber: shot.sceneShotNumber || index + 1,
        shotLabel: shot.shotLabel || `${scene.number}.${index + 1}`,
        sceneSlugline: scene.slugline,
      });
      global += 1;
    });
  }
  return result;
};

export const flattenActiveEpisodeScript = (hierarchy: ProductionHierarchy): string =>
  getActiveEpisode(hierarchy)?.script || '';

/**
 * Write Hub-edited shot list + script back into the active episode.
 * Preserves take history when shot ids match.
 */
export const writeActiveEpisodeFromFlat = (
  hierarchy: ProductionHierarchy,
  script: string,
  shotPrompts: ShotPrompt[],
  sceneWall?: SceneWallState | null,
): ProductionHierarchy => {
  if (!hierarchy.dualWriteEnabled) return hierarchy;
  const season = getActiveSeason(hierarchy);
  const episode = getActiveEpisode(hierarchy);
  if (!season || !episode) return hierarchy;

  const previousById = new Map<string, ShotRecord>();
  for (const scene of episode.scenes) {
    for (const shot of scene.shots) previousById.set(shot.id, shot);
  }

  const scenes = buildScenesFromScriptAndShots(script, shotPrompts).map((scene) => ({
    ...scene,
    shots: scene.shots.map((shot) => {
      const previous = previousById.get(shot.id);
      if (!previous) return shot;
      // Keep older takes that are no longer in the flat list (approved history).
      const urls = new Set(shot.takes.map((take) => take.mediaUrl));
      const preserved = previous.takes.filter((take) => !urls.has(take.mediaUrl));
      return {
        ...shot,
        takes: [...preserved, ...shot.takes],
        selectedTakeId: shot.selectedTakeId || previous.selectedTakeId,
      };
    }),
  }));

  const nextEpisode: EpisodeRecord = {
    ...episode,
    script,
    scenes,
    sceneWall: sceneWall === undefined ? episode.sceneWall : sceneWall,
    charactersAppearing: Array.from(new Set(shotPrompts.flatMap((shot) => shot.characters || []))),
    locationsUsed: Array.from(new Set(shotPrompts.map((shot) => shot.environment).filter(Boolean) as string[])),
  };

  const nextSeason: SeasonRecord = {
    ...season,
    episodes: season.episodes.map((entry) => (entry.id === nextEpisode.id ? nextEpisode : entry)),
  };

  return {
    ...hierarchy,
    series: {
      ...hierarchy.series,
      seasons: hierarchy.series.seasons.map((entry) => (entry.id === nextSeason.id ? nextSeason : entry)),
    },
  };
};

export const createEpisode = (
  hierarchy: ProductionHierarchy,
  options?: { title?: string; seasonId?: string; script?: string },
): ProductionHierarchy => {
  const seasonId = options?.seasonId || hierarchy.activeSeasonId;
  const season = hierarchy.series.seasons.find((entry) => entry.id === seasonId);
  if (!season) return hierarchy;
  const number = Math.max(0, ...season.episodes.map((episode) => episode.number)) + 1;
  const episode: EpisodeRecord = {
    id: newId('ep'),
    number,
    title: options?.title || `Episode ${String(number).padStart(2, '0')}`,
    script: options?.script || '',
    logline: '',
    productionStatus: 'draft',
    generationStatus: 'idle',
    scenes: [],
  };
  const nextSeason: SeasonRecord = {
    ...season,
    episodes: [...season.episodes, episode],
  };
  return {
    ...hierarchy,
    activeSeasonId: nextSeason.id,
    activeEpisodeId: episode.id,
    series: {
      ...hierarchy.series,
      seasons: hierarchy.series.seasons.map((entry) => (entry.id === nextSeason.id ? nextSeason : entry)),
    },
  };
};

export const setActiveEpisode = (
  hierarchy: ProductionHierarchy,
  episodeId: string,
): ProductionHierarchy => {
  for (const season of hierarchy.series.seasons) {
    if (season.episodes.some((episode) => episode.id === episodeId)) {
      return {
        ...hierarchy,
        activeSeasonId: season.id,
        activeEpisodeId: episodeId,
      };
    }
  }
  return hierarchy;
};

export const listEpisodes = (hierarchy: ProductionHierarchy) =>
  hierarchy.series.seasons.flatMap((season) =>
    season.episodes.map((episode) => ({
      seasonId: season.id,
      seasonNumber: season.number,
      episodeId: episode.id,
      episodeNumber: episode.number,
      title: episode.title,
      productionStatus: episode.productionStatus,
      shotCount: episode.scenes.reduce((sum, scene) => sum + scene.shots.length, 0),
      sceneCount: episode.scenes.length,
    })),
  );

export const appendTakeToShot = (
  hierarchy: ProductionHierarchy,
  shotId: string,
  take: TakeRecord,
  options?: { select?: boolean },
): ProductionHierarchy => {
  const season = getActiveSeason(hierarchy);
  const episode = getActiveEpisode(hierarchy);
  if (!season || !episode) return hierarchy;
  const nextScenes = episode.scenes.map((scene) => ({
    ...scene,
    shots: scene.shots.map((shot) => {
      if (shot.id !== shotId) return shot;
      const takes = [...shot.takes, take];
      return {
        ...shot,
        takes,
        selectedTakeId: options?.select === false ? shot.selectedTakeId : take.id,
        generationStatus: 'completed' as const,
      };
    }),
  }));
  return writeActiveEpisodeFromFlat(
    {
      ...hierarchy,
      series: {
        ...hierarchy.series,
        seasons: hierarchy.series.seasons.map((entry) => (
          entry.id === season.id
            ? {
              ...entry,
              episodes: entry.episodes.map((ep) => (
                ep.id === episode.id ? { ...ep, scenes: nextScenes } : ep
              )),
            }
            : entry
        )),
      },
    },
    episode.script,
    flattenActiveEpisodeToShotPrompts({
      ...hierarchy,
      series: {
        ...hierarchy.series,
        seasons: hierarchy.series.seasons.map((entry) => (
          entry.id === season.id
            ? {
              ...entry,
              episodes: entry.episodes.map((ep) => (
                ep.id === episode.id ? { ...ep, scenes: nextScenes } : ep
              )),
            }
            : entry
        )),
      },
    }),
  );
};

export const summarizeHierarchy = (hierarchy: ProductionHierarchy) => {
  const episode = getActiveEpisode(hierarchy);
  return {
    seriesTitle: hierarchy.series.title,
    seasonCount: hierarchy.series.seasons.length,
    episodeCount: hierarchy.series.seasons.reduce((sum, season) => sum + season.episodes.length, 0),
    activeEpisodeTitle: episode?.title || null,
    activeEpisodeNumber: episode?.number || null,
    activeSceneCount: episode?.scenes.length || 0,
    activeShotCount: episode?.scenes.reduce((sum, scene) => sum + scene.shots.length, 0) || 0,
    activeTakeCount: episode?.scenes.reduce(
      (sum, scene) => sum + scene.shots.reduce((shotSum, shot) => shotSum + shot.takes.length, 0),
      0,
    ) || 0,
  };
};
