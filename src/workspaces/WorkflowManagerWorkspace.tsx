import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { WorkflowCategory, WorkflowLibrary } from '../types/productionHierarchy';
import {
  WORKFLOW_CATEGORIES,
  assignWorkflowToCategory,
  configureComfyUrl,
  deleteWorkflow,
  duplicateWorkflow,
  ensureBuiltinWorkflows,
  getDefaultComfyUrl,
  importCatalogWorkflow,
  importWorkflowJson,
  listCatalogWorkflowOptions,
  loadGenerationJobs,
  loadWorkflowLibrary,
  probeComfyConnection,
  renameWorkflow,
  saveWorkflowLibrary,
  validateWorkflowAgainstServer,
} from '../services/comfyWorkflowManager';

type ConnectionState = Awaited<ReturnType<typeof probeComfyConnection>>;

const WorkflowManagerWorkspace: React.FC = () => {
  const [baseUrl, setBaseUrl] = useState(getDefaultComfyUrl);
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [probing, setProbing] = useState(false);
  const [library, setLibrary] = useState<WorkflowLibrary>(() => ensureBuiltinWorkflows(loadWorkflowLibrary()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<WorkflowCategory | 'all'>('all');
  const [renameValue, setRenameValue] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [validation, setValidation] = useState<{ ok: boolean; missingNodes: string[] } | null>(null);
  const [jobs, setJobs] = useState(() => loadGenerationJobs());
  const [message, setMessage] = useState('');

  const selected = useMemo(
    () => library.workflows.find((workflow) => workflow.id === selectedId) || null,
    [library.workflows, selectedId],
  );

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return library.workflows;
    return library.workflows.filter((workflow) => workflow.category === categoryFilter);
  }, [categoryFilter, library.workflows]);

  const catalogOptions = useMemo(() => listCatalogWorkflowOptions(library), [library]);

  const refreshConnection = useCallback(async (url = baseUrl) => {
    setProbing(true);
    setMessage('');
    try {
      configureComfyUrl(url);
      const result = await probeComfyConnection(url);
      setConnection(result);
      setMessage(result.online ? 'ComfyUI is online.' : (result.error || 'ComfyUI is offline.'));
    } finally {
      setProbing(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    refreshConnection();
    setJobs(loadGenerationJobs());
  }, [refreshConnection]);

  useEffect(() => {
    if (selected) setRenameValue(selected.name);
    else setRenameValue('');
    setValidation(null);
  }, [selected]);

  const persist = (next: WorkflowLibrary) => {
    const saved = saveWorkflowLibrary(next);
    setLibrary(saved);
    return saved;
  };

  const handleImportFile = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const graph = parsed?.prompt && typeof parsed.prompt === 'object'
        ? parsed.prompt
        : (parsed && typeof parsed === 'object' ? parsed : null);
      if (!graph || Array.isArray(graph)) {
        throw new Error('Expected a ComfyUI API-format workflow object (node map).');
      }
      const { library: next, workflow } = importWorkflowJson(library, {
        name: file.name.replace(/\.json$/i, ''),
        category: categoryFilter === 'all' ? 'custom' : categoryFilter,
        graph: graph as Record<string, unknown>,
      });
      persist(next);
      setSelectedId(workflow.id);
      setMessage(`Imported “${workflow.name}”.`);
    } catch (error: any) {
      setImportError(error?.message || String(error));
    }
  };

  const handleValidate = async () => {
    if (!selected) return;
    const result = await validateWorkflowAgainstServer(selected, baseUrl);
    setValidation({ ok: result.ok, missingNodes: result.missingNodes });
  };

  const handleExport = () => {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected.graph, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selected.name.replace(/[^\w.-]+/g, '_') || 'workflow'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="workflow-manager">
      <header className="workflow-manager__header">
        <div>
          <h2 className="workflow-manager__title">ComfyUI Workflow Manager</h2>
          <p className="workflow-manager__subtitle">
            Connect to a local ComfyUI instance, import workflows, assign them to production tasks, and track generation jobs.
          </p>
        </div>
      </header>

      <section className="workflow-manager__section" aria-labelledby="comfy-connection">
        <h3 id="comfy-connection">Connection</h3>
        <div className="workflow-manager__row">
          <label htmlFor="comfy-url">Base URL</label>
          <input
            id="comfy-url"
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="http://127.0.0.1:8188"
          />
          <button type="button" onClick={() => refreshConnection(baseUrl)} disabled={probing}>
            {probing ? 'Testing…' : 'Test connection'}
          </button>
        </div>
        <p className={`workflow-manager__status${connection?.online ? ' is-online' : ' is-offline'}`}>
          {message || (connection?.online ? 'Online' : 'Not connected')}
        </p>
        {!connection?.online && /403/i.test(connection?.error || message || '') && (
          <p className="workflow-manager__note">
            A 403 usually means ComfyUI blocked a browser-origin request. Use the desktop (Electron) app so
            requests go through the local AI bridge, or start ComfyUI with
            {' '}<code>--enable-cors-header</code>
            {' '}(and <code>--listen 0.0.0.0</code> if connecting over LAN). Keep ComfyUI updated; some builds
            also need their security / CSRF middleware configured for local clients.
          </p>
        )}
        {connection?.online && (
          <div className="workflow-manager__models">
            <span>Checkpoints: {connection.models.checkpoints.length}</span>
            <span>VAEs: {connection.models.vae.length}</span>
            <span>LoRAs: {connection.models.loras.length}</span>
            <span>Clips: {connection.models.clips.length}</span>
          </div>
        )}
      </section>

      <section className="workflow-manager__section" aria-labelledby="workflow-library">
        <div className="workflow-manager__section-head">
          <h3 id="workflow-library">Workflows</h3>
          <div className="workflow-manager__row">
            <label htmlFor="workflow-category">Category</label>
            <select
              id="workflow-category"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as WorkflowCategory | 'all')}
            >
              <option value="all">All</option>
              {WORKFLOW_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>{category.label}</option>
              ))}
            </select>
            <label className="workflow-manager__file">
              Import JSON
              <input
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImportFile(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>
        </div>
        {importError && <p className="workflow-manager__error">{importError}</p>}

        <div className="workflow-manager__split">
          <ul className="workflow-manager__list">
            {filtered.map((workflow) => (
              <li key={workflow.id}>
                <button
                  type="button"
                  className={`workflow-manager__list-item${selectedId === workflow.id ? ' is-active' : ''}`}
                  onClick={() => setSelectedId(workflow.id)}
                >
                  <strong>{workflow.name}</strong>
                  <span>{WORKFLOW_CATEGORIES.find((category) => category.id === workflow.category)?.label || workflow.category}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="workflow-manager__empty">No workflows in this category yet.</li>}
          </ul>

          <div className="workflow-manager__detail">
            {!selected ? (
              <p>Select a workflow to inspect, rename, assign, or validate against the connected ComfyUI server.</p>
            ) : (
              <>
                <div className="workflow-manager__row">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    aria-label="Workflow name"
                  />
                  <button
                    type="button"
                    onClick={() => persist(renameWorkflow(library, selected.id, renameValue))}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const { library: next, workflow } = duplicateWorkflow(library, selected.id);
                      persist(next);
                      if (workflow) setSelectedId(workflow.id);
                    }}
                  >
                    Duplicate
                  </button>
                  <button type="button" onClick={handleExport}>Export</button>
                  {selected.source !== 'builtin' && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = deleteWorkflow(library, selected.id);
                        persist(next);
                        setSelectedId(null);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p>{selected.description || 'No description.'}</p>
                <p>
                  Inputs: {selected.inputs.map((input) => input.key).join(', ') || 'none inferred'}
                </p>
                <div className="workflow-manager__row">
                  <label htmlFor="assign-category">Assign to task</label>
                  <select
                    id="assign-category"
                    value={
                      Object.entries(library.assignments || {}).find(([, id]) => id === selected.id)?.[0]
                      || selected.category
                    }
                    onChange={(event) => {
                      const category = event.target.value as WorkflowCategory;
                      persist(assignWorkflowToCategory(library, category, selected.id));
                    }}
                  >
                    {WORKFLOW_CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>{category.label}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void handleValidate()}>
                    Validate on server
                  </button>
                </div>
                {validation && (
                  <p className={validation.ok ? 'workflow-manager__ok' : 'workflow-manager__error'}>
                    {validation.ok
                      ? 'All referenced node types are available on this ComfyUI server.'
                      : `Missing nodes: ${validation.missingNodes.join(', ')}`}
                  </p>
                )}
                {selected.category === 'storyboard_frame' && (
                  <p className="workflow-manager__note">
                    Storyboard workflows must output a single cinematic frame — no multi-panel, collage, or contact-sheet layouts.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="workflow-manager__section" aria-labelledby="catalog-workflows">
        <h3 id="catalog-workflows">Local AI catalog workflows</h3>
        <p className="workflow-manager__note">
          These are real Comfy-Org API graphs shipped with Local AI model downloads (t2i / edit / i2v / t2v).
          Builtin category rows above are templates until you import JSON or add a catalog workflow.
          Character identity, outfit, environment, and prop still need your own API-format graphs.
        </p>
        <ul className="workflow-manager__jobs">
          {catalogOptions.map((option) => (
            <li key={option.key}>
              <strong>{option.modelLabel}</strong>
              <span>{option.kind.toUpperCase()} → {WORKFLOW_CATEGORIES.find((category) => category.id === option.category)?.label}</span>
              <span>{option.source}</span>
              {option.alreadyImported ? (
                <em>In library</em>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const { library: next, workflow } = importCatalogWorkflow(library, option.modelId, option.kind);
                    persist(next);
                    if (workflow) {
                      setSelectedId(workflow.id);
                      setMessage(`Added “${workflow.name}” from the Local AI catalog.`);
                    }
                  }}
                >
                  Add to library
                </button>
              )}
            </li>
          ))}
          {catalogOptions.length === 0 && (
            <li className="workflow-manager__empty">No catalog workflows found.</li>
          )}
        </ul>
      </section>

      <section className="workflow-manager__section" aria-labelledby="task-assignments">
        <h3 id="task-assignments">Task assignments</h3>
        <ul className="workflow-manager__assignments">
          {WORKFLOW_CATEGORIES.map((category) => {
            const assignedId = library.assignments?.[category.id];
            const assigned = assignedId
              ? library.workflows.find((workflow) => workflow.id === assignedId)
              : null;
            return (
              <li key={category.id}>
                <strong>{category.label}</strong>
                <span>{category.description}</span>
                <em>{assigned?.name || 'Unassigned'}</em>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="workflow-manager__section" aria-labelledby="generation-jobs">
        <div className="workflow-manager__section-head">
          <h3 id="generation-jobs">Recent generation jobs</h3>
          <button type="button" onClick={() => setJobs(loadGenerationJobs())}>Refresh</button>
        </div>
        {jobs.length === 0 ? (
          <p className="workflow-manager__empty">No persisted generation jobs yet.</p>
        ) : (
          <ul className="workflow-manager__jobs">
            {jobs.slice(0, 40).map((job) => (
              <li key={job.id}>
                <strong>{job.type}</strong>
                <span>{job.status}</span>
                <span>{job.modelId || '—'}</span>
                <span>{job.comfyPromptId || job.id}</span>
                {job.error && <em className="workflow-manager__error">{job.error}</em>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default WorkflowManagerWorkspace;
