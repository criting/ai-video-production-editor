/**
 * Series → Season → Episode → Scene → Shot → Take
 *
 * Additive local-first hierarchy for episodic productions.
 * Active episode content dual-writes into legacy StoryBible.script + ShotPrompt[]
 * so Project Hub keeps working during migration.
 */
import type {
  SceneWallState,
  ShotDependencyFingerprint,
  ShotPrompt,
  ShotPlanSource,
} from '../types';

export type ProductionStatus =
  | 'draft'
  | 'in_progress'
  | 'needs_review'
  | 'approved'
  | 'locked'
  | 'archived';

export type GenerationStatus =
  | 'idle'
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'needs_review'
  | 'approved'
  | 'rejected';

export type ContinuityOverrideScope = 'series' | 'season' | 'episode' | 'scene' | 'shot';

export type ContinuityOverrideMarker = {
  field: string;
  scope: ContinuityOverrideScope;
  inheritedFromId?: string;
  overridden: boolean;
};

export type TakeRecord = {
  id: string;
  kind: 'image' | 'video';
  createdAt: string;
  /** Relative project path or data/file URL while unsaved. */
  mediaUrl: string;
  mediaPath?: string;
  prompt?: string;
  modelPrompt?: string;
  negativePrompt?: string;
  modelId?: string;
  modelFamily?: string;
  workflowId?: string;
  workflowParams?: Record<string, unknown>;
  seed?: number;
  steps?: number;
  guidance?: number;
  fingerprint?: ShotDependencyFingerprint;
  generatedBy?: string;
  parentTakeId?: string;
  rating?: 'pick' | 'alt' | 'reject';
  status?: GenerationStatus;
  parameters?: Record<string, string | number | boolean | null>;
  referenceImageUrls?: string[];
};

export type ShotRecord = {
  id: string;
  number: number;
  sceneShotNumber?: number;
  shotLabel?: string;
  narrativePurpose?: string;
  actionDescription?: string;
  description: string;
  prompt: string;
  negativePrompt?: string;
  composition?: string;
  subjectPlacement?: string;
  shotTypePresetId?: string;
  lightingPresetId?: string;
  cameraAngle?: string;
  cameraMovementPreset?: string;
  cameraPresetId?: string;
  lensPresetId?: string;
  characters: string[];
  environment: string | null;
  products?: string[];
  continuityAnchors?: string[];
  visualTriggers?: string[];
  planSource?: ShotPlanSource;
  selectedTakeId?: string;
  takes: TakeRecord[];
  generationFingerprint?: ShotDependencyFingerprint;
  isStale?: boolean;
  staleReasons?: string[];
  workflowId?: string;
  generationStatus?: GenerationStatus;
  continuityNotes?: string;
  analysisNotes?: string[];
  /** Legacy bridge fields kept when flattening to ShotPrompt. */
  legacyShotNumber?: number;
  outfitSelections?: Record<string, string>;
  motionPrompt?: string;
  contextReferences?: ShotPrompt['contextReferences'];
  burstFrame?: ShotPrompt['burstFrame'];
  overrides?: ContinuityOverrideMarker[];
};

export type SceneRecord = {
  id: string;
  number: number;
  slugline: string;
  interiorExterior?: 'INT' | 'EXT' | 'I/E' | 'EST' | 'unknown';
  location?: string;
  timeOfDay?: string;
  scriptText?: string;
  description?: string;
  narrativePurpose?: string;
  charactersPresent?: string[];
  continuityRequirements?: string[];
  productionStatus?: ProductionStatus;
  shots: ShotRecord[];
};

export type EpisodeRecord = {
  id: string;
  number: number;
  title: string;
  logline?: string;
  synopsis?: string;
  script: string;
  runtimeTargetSeconds?: number;
  narrativePurpose?: string;
  openingHook?: string;
  storyBeats?: string;
  endingHook?: string;
  charactersAppearing?: string[];
  locationsUsed?: string[];
  productionStatus?: ProductionStatus;
  generationStatus?: GenerationStatus;
  continuityNotes?: string;
  sceneWall?: SceneWallState | null;
  scenes: SceneRecord[];
  /** Episode-level wardrobe / appearance overrides keyed by series reference id. */
  appearanceOverrides?: Record<string, {
    outfitId?: string;
    notes?: string;
    referenceImageUrl?: string;
  }>;
};

export type SeasonRecord = {
  id: string;
  number: number;
  title: string;
  synopsis?: string;
  seasonArc?: string;
  mainConflict?: string;
  characterDevelopment?: string;
  continuityNotes?: string;
  productionStatus?: ProductionStatus;
  episodes: EpisodeRecord[];
};

export type SeriesRecord = {
  id: string;
  title: string;
  logline?: string;
  synopsis?: string;
  genre?: string;
  tone?: string;
  language?: string;
  targetAudience?: string;
  format?: string;
  visualDirection?: string;
  continuityRules?: string;
  productionStatus?: ProductionStatus;
  seasons: SeasonRecord[];
};

export type ProductionHierarchy = {
  schemaVersion: 1;
  series: SeriesRecord;
  activeSeasonId: string;
  activeEpisodeId: string;
  /** When true, Hub edits to script/shots write back into the active episode. */
  dualWriteEnabled: boolean;
  migratedFromProjectVersion?: number;
  migratedAt?: string;
};

export type WorkflowCategory =
  | 'character_identity'
  | 'character_outfit'
  | 'environment'
  | 'prop'
  | 'storyboard_frame'
  | 'image_edit'
  | 'image_to_video'
  | 'text_to_video'
  | 'custom';

export type WorkflowInputDefinition = {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'image' | 'images' | 'select' | 'json';
  required?: boolean;
  description?: string;
  defaultValue?: unknown;
  options?: string[];
  /** Comfy node id + input name for binding. */
  binding?: { nodeId: string; inputName: string };
};

export type WorkflowOutputDefinition = {
  key: string;
  label: string;
  type: 'image' | 'video' | 'json' | 'text';
  description?: string;
};

export type WorkflowRecord = {
  id: string;
  name: string;
  description?: string;
  category: WorkflowCategory;
  /** API-format ComfyUI prompt graph (node map). */
  graph: Record<string, unknown>;
  compatibleModels?: string[];
  requiredCustomNodes?: string[];
  requiredModels?: string[];
  inputs: WorkflowInputDefinition[];
  outputs: WorkflowOutputDefinition[];
  defaultParameters?: Record<string, unknown>;
  supportedTasks?: string[];
  createdAt: string;
  updatedAt: string;
  source?: 'catalog' | 'import' | 'builtin' | 'user';
  builtinId?: string;
};

export type WorkflowLibrary = {
  schemaVersion: 1;
  workflows: WorkflowRecord[];
  assignments?: Partial<Record<WorkflowCategory, string>>;
  updatedAt?: string;
};

export type GenerationJobType =
  | 'storyboard_frame'
  | 'character_identity'
  | 'character_outfit'
  | 'environment'
  | 'prop'
  | 'image_edit'
  | 'image_to_video'
  | 'text_to_video'
  | 'custom';

export type GenerationJobRecord = {
  id: string;
  type: GenerationJobType;
  status: GenerationStatus;
  entity: {
    seriesId?: string;
    seasonId?: string;
    episodeId?: string;
    sceneId?: string;
    shotId?: string;
    takeId?: string;
    referenceId?: string;
  };
  modelId?: string;
  workflowId?: string;
  prompt?: string;
  negativePrompt?: string;
  seed?: number;
  parameters?: Record<string, unknown>;
  referenceImageUrls?: string[];
  comfyPromptId?: string;
  progress?: number;
  resultUrls?: string[];
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  provider?: 'comfyui' | 'draw-things' | 'cloud' | 'other';
};
