/**
 * Pure ComfyUI workflow binding helpers (no Electron / localStorage / network).
 */
import type { WorkflowInputDefinition, WorkflowOutputDefinition, WorkflowRecord } from '../types/productionHierarchy.ts';

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

export const createBuiltinStoryboardWorkflowStub = (): WorkflowRecord => {
  const now = new Date().toISOString();
  const outputs: WorkflowOutputDefinition[] = [{ key: 'image', label: 'Storyboard frame', type: 'image' }];
  return {
    id: 'builtin-storyboard-single-frame',
    name: 'Storyboard Single Frame (template)',
    description: STORYBOARD_WORKFLOW_CONSTRAINT,
    category: 'storyboard_frame',
    graph: {},
    compatibleModels: [],
    requiredCustomNodes: [],
    requiredModels: [],
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'string', required: true },
      { key: 'negative_prompt', label: 'Negative prompt', type: 'string' },
      { key: 'width', label: 'Width', type: 'number', defaultValue: 832 },
      { key: 'height', label: 'Height', type: 'number', defaultValue: 1216 },
      { key: 'seed', label: 'Seed', type: 'number', defaultValue: -1 },
    ],
    outputs,
    defaultParameters: {},
    supportedTasks: ['storyboard_frame'],
    createdAt: now,
    updatedAt: now,
    source: 'builtin',
    builtinId: 'storyboard-single-frame',
  };
};
