/**
 * ComfyUI Workflow Manager — first-class local workflow library + connection helpers.
 * Uses ComfyUI HTTP API; does not assume custom nodes beyond what a workflow declares.
 */
import {
  getComfyUiHealth,
  listComfyUiModels,
  testComfyUiConnection,
} from './comfyUiService.ts';
import { getComfyBaseUrl, setComfyBaseUrl, findMissingNodes } from './localModelService.ts';
import type {
  GenerationJobRecord,
  WorkflowCategory,
  WorkflowLibrary,
  WorkflowRecord,
} from '../types/productionHierarchy.ts';
import {
  STORYBOARD_WORKFLOW_CONSTRAINT,
  applyWorkflowBindings,
  createBuiltinStoryboardWorkflowStub,
  inferWorkflowInputs,
} from './comfyWorkflowBindings.ts';

export {
  STORYBOARD_WORKFLOW_CONSTRAINT,
  applyWorkflowBindings,
  createBuiltinStoryboardWorkflowStub,
  inferWorkflowInputs,
} from './comfyWorkflowBindings.ts';

const WORKFLOW_LIBRARY_KEY = 'comfy_workflow_library_v1';
const JOBS_KEY = 'comfy_generation_jobs_v1';

const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const WORKFLOW_CATEGORIES: Array<{ id: WorkflowCategory; label: string; description: string }> = [
  { id: 'character_identity', label: 'Character Identity', description: 'Consistent character reference images' },
  { id: 'character_outfit', label: 'Character Outfit', description: 'Wardrobe without changing identity' },
  { id: 'environment', label: 'Environment', description: 'Locations and sets' },
  { id: 'prop', label: 'Prop', description: 'Objects and props' },
  { id: 'storyboard_frame', label: 'Storyboard Frame', description: 'Single cinematic storyboard still' },
  { id: 'image_edit', label: 'Image Edit / Continuity', description: 'Edit while preserving identity' },
  { id: 'image_to_video', label: 'Image to Video', description: 'Approved frame → motion' },
  { id: 'text_to_video', label: 'Text to Video', description: 'Text-driven video where supported' },
  { id: 'custom', label: 'Custom', description: 'User-imported workflows' },
];

export const getDefaultComfyUrl = () => getComfyBaseUrl();

export const configureComfyUrl = (url: string) => setComfyBaseUrl(url);

export const probeComfyConnection = async (baseUrl = getComfyBaseUrl()) => {
  try {
    await testComfyUiConnection(baseUrl);
    const health = await getComfyUiHealth(baseUrl);
    const models = await listComfyUiModels(baseUrl).catch(() => ({
      checkpoints: [],
      vae: [],
      loras: [],
      clips: [],
    }));
    return {
      online: true,
      baseUrl,
      health,
      models,
      error: undefined as string | undefined,
    };
  } catch (error: any) {
    return {
      online: false,
      baseUrl,
      health: null,
      models: { checkpoints: [], vae: [], loras: [], clips: [] },
      error: error?.message || String(error),
    };
  }
};

export const emptyWorkflowLibrary = (): WorkflowLibrary => ({
  schemaVersion: 1,
  workflows: [],
  assignments: {},
  updatedAt: new Date().toISOString(),
});

export const loadWorkflowLibrary = (): WorkflowLibrary => {
  try {
    const raw = localStorage.getItem(WORKFLOW_LIBRARY_KEY);
    if (!raw) return emptyWorkflowLibrary();
    const parsed = JSON.parse(raw) as WorkflowLibrary;
    if (!parsed || !Array.isArray(parsed.workflows)) return emptyWorkflowLibrary();
    return parsed;
  } catch {
    return emptyWorkflowLibrary();
  }
};

export const saveWorkflowLibrary = (library: WorkflowLibrary) => {
  const next = { ...library, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(WORKFLOW_LIBRARY_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
};


export const importWorkflowJson = (
  library: WorkflowLibrary,
  payload: {
    name: string;
    description?: string;
    category?: WorkflowCategory;
    graph: Record<string, unknown>;
    requiredCustomNodes?: string[];
    requiredModels?: string[];
    compatibleModels?: string[];
  },
): { library: WorkflowLibrary; workflow: WorkflowRecord } => {
  const now = new Date().toISOString();
  const workflow: WorkflowRecord = {
    id: newId('wf'),
    name: payload.name.trim() || 'Imported workflow',
    description: payload.description,
    category: payload.category || 'custom',
    graph: payload.graph,
    compatibleModels: payload.compatibleModels || [],
    requiredCustomNodes: payload.requiredCustomNodes || [],
    requiredModels: payload.requiredModels || [],
    inputs: inferWorkflowInputs(payload.graph),
    outputs: [{ key: 'image', label: 'Output image', type: 'image' }],
    defaultParameters: {},
    supportedTasks: [payload.category || 'custom'],
    createdAt: now,
    updatedAt: now,
    source: 'import',
  };
  const next = saveWorkflowLibrary({
    ...library,
    workflows: [...library.workflows, workflow],
  });
  return { library: next, workflow };
};

export const duplicateWorkflow = (library: WorkflowLibrary, workflowId: string) => {
  const source = library.workflows.find((workflow) => workflow.id === workflowId);
  if (!source) return { library, workflow: null as WorkflowRecord | null };
  const now = new Date().toISOString();
  const workflow: WorkflowRecord = {
    ...source,
    id: newId('wf'),
    name: `${source.name} (copy)`,
    createdAt: now,
    updatedAt: now,
    source: 'user',
    builtinId: undefined,
  };
  const next = saveWorkflowLibrary({
    ...library,
    workflows: [...library.workflows, workflow],
  });
  return { library: next, workflow };
};

export const renameWorkflow = (library: WorkflowLibrary, workflowId: string, name: string) => {
  const next = saveWorkflowLibrary({
    ...library,
    workflows: library.workflows.map((workflow) => (
      workflow.id === workflowId
        ? { ...workflow, name: name.trim() || workflow.name, updatedAt: new Date().toISOString() }
        : workflow
    )),
  });
  return next;
};

export const deleteWorkflow = (library: WorkflowLibrary, workflowId: string) => {
  const assignments = { ...(library.assignments || {}) };
  for (const [category, id] of Object.entries(assignments)) {
    if (id === workflowId) delete assignments[category as WorkflowCategory];
  }
  return saveWorkflowLibrary({
    ...library,
    workflows: library.workflows.filter((workflow) => workflow.id !== workflowId),
    assignments,
  });
};

export const assignWorkflowToCategory = (
  library: WorkflowLibrary,
  category: WorkflowCategory,
  workflowId: string | null,
) => {
  const assignments = { ...(library.assignments || {}) };
  if (!workflowId) delete assignments[category];
  else assignments[category] = workflowId;
  return saveWorkflowLibrary({ ...library, assignments });
};

export const getAssignedWorkflow = (library: WorkflowLibrary, category: WorkflowCategory) => {
  const id = library.assignments?.[category];
  return id ? library.workflows.find((workflow) => workflow.id === id) || null : null;
};


export const validateWorkflowAgainstServer = async (
  workflow: WorkflowRecord,
  baseUrl = getComfyBaseUrl(),
) => {
  const missingNodes = await findMissingNodes(baseUrl, workflow.graph);
  return {
    ok: missingNodes.length === 0,
    missingNodes,
    requiredModels: workflow.requiredModels || [],
    requiredCustomNodes: workflow.requiredCustomNodes || [],
  };
};


export const ensureBuiltinWorkflows = (library: WorkflowLibrary): WorkflowLibrary => {
  if (library.workflows.some((workflow) => workflow.builtinId === 'storyboard-single-frame')) {
    return library;
  }
  const stub = createBuiltinStoryboardWorkflowStub();
  const next = {
    ...library,
    workflows: [...library.workflows, stub],
    assignments: {
      ...(library.assignments || {}),
      storyboard_frame: library.assignments?.storyboard_frame || stub.id,
    },
  };
  return saveWorkflowLibrary(next);
};

// ---------------------------------------------------------------------------
// Generation jobs (localStorage-backed; complements in-memory taskCenter)
// ---------------------------------------------------------------------------

export const loadGenerationJobs = (): GenerationJobRecord[] => {
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveGenerationJobs = (jobs: GenerationJobRecord[]) => {
  try {
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs.slice(-200)));
  } catch {
    /* ignore */
  }
  return jobs;
};

export const createGenerationJob = (
  partial: Omit<GenerationJobRecord, 'id' | 'createdAt' | 'status'> & { status?: GenerationJobRecord['status'] },
): GenerationJobRecord => {
  const job: GenerationJobRecord = {
    ...partial,
    id: newId('job'),
    status: partial.status || 'pending',
    createdAt: new Date().toISOString(),
  };
  const jobs = loadGenerationJobs();
  saveGenerationJobs([job, ...jobs]);
  return job;
};

export const updateGenerationJob = (
  jobId: string,
  patch: Partial<GenerationJobRecord>,
): GenerationJobRecord | null => {
  const jobs = loadGenerationJobs();
  let updated: GenerationJobRecord | null = null;
  const next = jobs.map((job) => {
    if (job.id !== jobId) return job;
    updated = { ...job, ...patch };
    return updated;
  });
  saveGenerationJobs(next);
  return updated;
};

export const cancelGenerationJob = (jobId: string) =>
  updateGenerationJob(jobId, { status: 'cancelled', completedAt: new Date().toISOString() });
