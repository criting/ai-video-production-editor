/**
 * Pure ComfyUI workflow binding helpers (no Electron / localStorage / network).
 */
import type {
  WorkflowCategory,
  WorkflowInputDefinition,
  WorkflowOutputDefinition,
  WorkflowRecord,
} from '../types/productionHierarchy.ts';

export const STORYBOARD_WORKFLOW_CONSTRAINT =
  'Output must be one clean cinematic frame. Do not produce split screens, collages, contact sheets, multi-panel layouts, or repeated images in one frame.';

/** Infer a minimal binding map from common Comfy node types. */
export const inferWorkflowInputs = (graph: Record<string, unknown>): WorkflowInputDefinition[] => {
  const inputs: WorkflowInputDefinition[] = [];
  for (const [nodeId, raw] of Object.entries(graph || {})) {
    const node = raw as { class_type?: string; inputs?: Record<string, unknown> };
    if (!node?.class_type) continue;
    if (node.class_type === 'CLIPTextEncode') {
      const text = String(node.inputs?.text || '');
      const isNegative = /negative|no\b|ugly|blurry/i.test(text) || /neg/i.test(nodeId);
      inputs.push({
        key: isNegative ? 'negative_prompt' : 'prompt',
        label: isNegative ? 'Negative prompt' : 'Prompt',
        type: 'string',
        required: !isNegative,
        binding: { nodeId, inputName: 'text' },
      });
    }
    if (node.class_type === 'EmptyLatentImage' || node.class_type === 'EmptySD3LatentImage') {
      if ('width' in (node.inputs || {})) {
        inputs.push({ key: 'width', label: 'Width', type: 'number', binding: { nodeId, inputName: 'width' }, defaultValue: node.inputs?.width });
      }
      if ('height' in (node.inputs || {})) {
        inputs.push({ key: 'height', label: 'Height', type: 'number', binding: { nodeId, inputName: 'height' }, defaultValue: node.inputs?.height });
      }
    }
    if (node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced') {
      if ('seed' in (node.inputs || {})) {
        inputs.push({ key: 'seed', label: 'Seed', type: 'number', binding: { nodeId, inputName: 'seed' }, defaultValue: node.inputs?.seed });
      }
      if ('steps' in (node.inputs || {})) {
        inputs.push({ key: 'steps', label: 'Steps', type: 'number', binding: { nodeId, inputName: 'steps' }, defaultValue: node.inputs?.steps });
      }
      if ('cfg' in (node.inputs || {})) {
        inputs.push({ key: 'guidance', label: 'CFG / Guidance', type: 'number', binding: { nodeId, inputName: 'cfg' }, defaultValue: node.inputs?.cfg });
      }
    }
    if (/LoadImage/i.test(node.class_type)) {
      inputs.push({
        key: `image_${nodeId}`,
        label: 'Reference / start image',
        type: 'image',
        binding: { nodeId, inputName: 'image' },
      });
    }
  }
  const seen = new Set<string>();
  return inputs.filter((input) => {
    if (seen.has(input.key)) return false;
    seen.add(input.key);
    return true;
  });
};

export const applyWorkflowBindings = (
  workflow: Pick<WorkflowRecord, 'graph' | 'inputs'>,
  values: Record<string, unknown>,
): Record<string, unknown> => {
  const graph = JSON.parse(JSON.stringify(workflow.graph || {})) as Record<string, any>;
  for (const input of workflow.inputs) {
    if (!(input.key in values) || !input.binding) continue;
    const node = graph[input.binding.nodeId];
    if (!node?.inputs) continue;
    node.inputs[input.binding.inputName] = values[input.key];
  }
  return graph;
};

const baseInputs = (): WorkflowInputDefinition[] => ([
  { key: 'prompt', label: 'Prompt / description', type: 'string', required: true },
  { key: 'negative_prompt', label: 'Negative prompt', type: 'string' },
  { key: 'width', label: 'Width', type: 'number', defaultValue: 832 },
  { key: 'height', label: 'Height', type: 'number', defaultValue: 1216 },
  { key: 'seed', label: 'Seed', type: 'number', defaultValue: -1 },
]);

const makeStub = (opts: {
  builtinId: string;
  name: string;
  description: string;
  category: WorkflowCategory;
  inputs?: WorkflowInputDefinition[];
  outputs?: WorkflowOutputDefinition[];
  compatibleModels?: string[];
}): WorkflowRecord => {
  const now = new Date().toISOString();
  return {
    id: `builtin-${opts.builtinId}`,
    name: opts.name,
    description: opts.description,
    category: opts.category,
    graph: {},
    compatibleModels: opts.compatibleModels || [],
    requiredCustomNodes: [],
    requiredModels: [],
    inputs: opts.inputs || baseInputs(),
    outputs: opts.outputs || [{ key: 'image', label: 'Output image', type: 'image' }],
    defaultParameters: {},
    supportedTasks: [opts.category],
    createdAt: now,
    updatedAt: now,
    source: 'builtin',
    builtinId: opts.builtinId,
  };
};

export const createBuiltinStoryboardWorkflowStub = (): WorkflowRecord =>
  makeStub({
    builtinId: 'storyboard-single-frame',
    name: 'Storyboard Single Frame (template)',
    description: `${STORYBOARD_WORKFLOW_CONSTRAINT} Import a ComfyUI API-format graph (or a Local AI catalog t2i/edit workflow) and assign it here.`,
    category: 'storyboard_frame',
    inputs: [
      ...baseInputs(),
      { key: 'shot_size', label: 'Shot size', type: 'string' },
      { key: 'camera_angle', label: 'Camera angle', type: 'string' },
      { key: 'character_refs', label: 'Character references', type: 'images' },
      { key: 'environment_refs', label: 'Environment references', type: 'images' },
    ],
  });

/** All production task templates expected by the Workflow Manager. Graphs start empty until the user imports API JSON or a catalog workflow. */
export const createAllBuiltinWorkflowStubs = (): WorkflowRecord[] => ([
  makeStub({
    builtinId: 'character-identity',
    name: 'Character Identity (template)',
    description: 'Generate consistent character identity references (portrait / full-body). Preserve face and body identity across angles. Import your identity workflow JSON to activate.',
    category: 'character_identity',
    inputs: [
      { key: 'prompt', label: 'Character description', type: 'string', required: true },
      { key: 'identity_refs', label: 'Identity references', type: 'images' },
      { key: 'visual_style', label: 'Visual style', type: 'string' },
      { key: 'aspect_ratio', label: 'Aspect ratio', type: 'string', defaultValue: '3:4' },
      { key: 'seed', label: 'Seed', type: 'number', defaultValue: -1 },
    ],
    outputs: [
      { key: 'image', label: 'Identity reference', type: 'image' },
      { key: 'variations', label: 'Optional variations', type: 'image' },
    ],
  }),
  makeStub({
    builtinId: 'character-outfit',
    name: 'Character Outfit (template)',
    description: 'Change wardrobe without changing facial identity. Requires a character identity reference. Import an edit / IP-Adapter style API workflow to activate.',
    category: 'character_outfit',
    inputs: [
      { key: 'identity_ref', label: 'Character identity reference', type: 'image', required: true },
      { key: 'prompt', label: 'Outfit description', type: 'string', required: true },
      { key: 'clothing_refs', label: 'Clothing references', type: 'images' },
      { key: 'visual_style', label: 'Visual style', type: 'string' },
      { key: 'seed', label: 'Seed', type: 'number', defaultValue: -1 },
    ],
  }),
  makeStub({
    builtinId: 'environment',
    name: 'Environment / Location (template)',
    description: 'Consistent locations and sets: architecture, furniture, lighting, palette. Import your environment API workflow to activate.',
    category: 'environment',
    inputs: [
      { key: 'prompt', label: 'Environment description', type: 'string', required: true },
      { key: 'architecture_refs', label: 'Architecture references', type: 'images' },
      { key: 'lighting', label: 'Lighting', type: 'string' },
      { key: 'time_of_day', label: 'Time of day', type: 'string' },
      { key: 'width', label: 'Width', type: 'number', defaultValue: 1280 },
      { key: 'height', label: 'Height', type: 'number', defaultValue: 720 },
      { key: 'seed', label: 'Seed', type: 'number', defaultValue: -1 },
    ],
  }),
  makeStub({
    builtinId: 'prop',
    name: 'Prop Generation (template)',
    description: 'Individual objects and props with controllable materials and background. Import your prop API workflow to activate.',
    category: 'prop',
    inputs: [
      { key: 'prompt', label: 'Prop description', type: 'string', required: true },
      { key: 'reference_images', label: 'Reference images', type: 'images' },
      { key: 'materials', label: 'Materials', type: 'string' },
      { key: 'background', label: 'Background settings', type: 'string' },
      { key: 'seed', label: 'Seed', type: 'number', defaultValue: -1 },
    ],
  }),
  createBuiltinStoryboardWorkflowStub(),
  makeStub({
    builtinId: 'image-edit-continuity',
    name: 'Image Edit / Continuity (template)',
    description: 'Modify an existing frame while preserving identity and critical continuity. Prefer Local AI catalog “edit” workflows (FLUX / Qwen) via Import from catalog.',
    category: 'image_edit',
    inputs: [
      { key: 'source_image', label: 'Source image', type: 'image', required: true },
      { key: 'prompt', label: 'Edit instruction', type: 'string', required: true },
      { key: 'negative_prompt', label: 'Negative prompt', type: 'string' },
      { key: 'identity_refs', label: 'Identity references', type: 'images' },
      { key: 'seed', label: 'Seed', type: 'number', defaultValue: -1 },
    ],
  }),
  makeStub({
    builtinId: 'image-to-video',
    name: 'Image to Video (template)',
    description: 'Turn an approved storyboard frame into a motion take. Prefer Local AI catalog i2v workflows (Wan / LTX) via Import from catalog.',
    category: 'image_to_video',
    inputs: [
      { key: 'start_frame', label: 'Approved storyboard frame', type: 'image', required: true },
      { key: 'prompt', label: 'Motion description', type: 'string', required: true },
      { key: 'duration', label: 'Duration (seconds)', type: 'number', defaultValue: 5 },
      { key: 'fps', label: 'Frame rate', type: 'number', defaultValue: 24 },
      { key: 'seed', label: 'Seed', type: 'number', defaultValue: -1 },
    ],
    outputs: [{ key: 'video', label: 'Generated video', type: 'video' }],
  }),
  makeStub({
    builtinId: 'text-to-video',
    name: 'Text to Video (template)',
    description: 'Text-driven video where the selected model supports it. Prefer Local AI catalog t2v workflows via Import from catalog. Not every video model accepts identical inputs.',
    category: 'text_to_video',
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'string', required: true },
      { key: 'negative_prompt', label: 'Negative prompt', type: 'string' },
      { key: 'duration', label: 'Duration (seconds)', type: 'number', defaultValue: 5 },
      { key: 'fps', label: 'Frame rate', type: 'number', defaultValue: 24 },
      { key: 'width', label: 'Width', type: 'number', defaultValue: 1280 },
      { key: 'height', label: 'Height', type: 'number', defaultValue: 720 },
      { key: 'seed', label: 'Seed', type: 'number', defaultValue: -1 },
    ],
    outputs: [{ key: 'video', label: 'Generated video', type: 'video' }],
  }),
]);

export const BUILTIN_CATEGORY_ASSIGNMENT_ORDER: WorkflowCategory[] = [
  'character_identity',
  'character_outfit',
  'environment',
  'prop',
  'storyboard_frame',
  'image_edit',
  'image_to_video',
  'text_to_video',
];
