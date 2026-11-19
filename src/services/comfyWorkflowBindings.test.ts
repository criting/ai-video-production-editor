import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORYBOARD_WORKFLOW_CONSTRAINT,
  applyWorkflowBindings,
  createBuiltinStoryboardWorkflowStub,
  inferWorkflowInputs,
} from './comfyWorkflowBindings.ts';

test('Comfy workflow binding inference maps CLIP and sampler inputs', () => {
  const inputs = inferWorkflowInputs({
    '3': { class_type: 'CLIPTextEncode', inputs: { text: 'a cinematic frame' } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry, ugly' } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 832, height: 1216 } },
    '6': { class_type: 'KSampler', inputs: { seed: 1, steps: 20, cfg: 7 } },
  });
  assert.ok(inputs.some((input) => input.key === 'prompt'));
  assert.ok(inputs.some((input) => input.key === 'negative_prompt'));
  assert.ok(inputs.some((input) => input.key === 'seed'));
  assert.ok(inputs.some((input) => input.key === 'width'));
});

test('applyWorkflowBindings writes values into bound nodes', () => {
  const workflow = {
    graph: {
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'old' } },
    },
    inputs: inferWorkflowInputs({
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'old' } },
    }),
  };
  const next = applyWorkflowBindings(workflow, { prompt: 'new cinematic prompt' });
  assert.equal((next['3'] as any).inputs.text, 'new cinematic prompt');
});

test('builtin storyboard stub enforces single-frame constraint', () => {
  const stub = createBuiltinStoryboardWorkflowStub();
  assert.equal(stub.category, 'storyboard_frame');
  assert.match(stub.description || '', /one clean cinematic frame/i);
  assert.match(STORYBOARD_WORKFLOW_CONSTRAINT, /contact sheets/i);
});
