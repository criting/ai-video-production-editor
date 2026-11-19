# ComfyUI Workflow Manager & Episodic Production Guide

This guide covers:

1. How to fix **ComfyUI 403 Forbidden** when testing the connection  
2. How to use the **ComfyUI Workflow Manager**  
3. Everything new from the recent product PRs (Electron stability, cinematic storyboard pipeline, episodic hierarchy)

For the end-to-end creative playbook (hooks, continuity, storyboard Takes, multi-episode), see [Short Drama Production Guide](./short-drama-production-guide.md).

---

## 1. Fixing “ComfyUI request failed: 403 Forbidden”

### What the error means

The app reached something at `http://127.0.0.1:8188`, but ComfyUI (or a security layer in front of it) **refused** the request. This is not “ComfyUI is offline” — offline usually looks like a connection refused / timeout error.

### Most common cause in this app

The Workflow Manager (and older ComfyUI client code) was calling ComfyUI with **browser `fetch()` from the renderer**. Many recent ComfyUI builds treat those requests as cross-origin / CSRF-sensitive and respond with **403** when they see a browser `Origin` header.

Local AI text models and Draw Things already avoid this by going through the **Electron `localAi` bridge** (main process HTTP, no browser Origin). ComfyUI JSON calls now use that same bridge in the desktop app.

### Fix checklist (do these in order)

#### A. Use the desktop (Electron) app

1. Run the **Electron / desktop** build of the editor, not a plain browser tab of the Vite dev site alone (unless you also configure ComfyUI CORS — see C).
2. After updating to a build that includes the local-bridge fix, **fully quit and restart** the app.
3. Open **Project → Workflows** (Workflow Manager).
4. Confirm Base URL is `http://127.0.0.1:8188` (or your actual Comfy port).
5. Click **Test connection**.

If you are on a build *before* the bridge fix, skip to B/C below, or update first.

#### B. Confirm ComfyUI is actually healthy

In a normal browser or terminal on the same machine:

```bash
curl -s http://127.0.0.1:8188/system_stats | head
```

- If this also returns **403**, ComfyUI itself is locking down API access — fix ComfyUI flags (section C).
- If this returns JSON stats, ComfyUI is fine and the problem was the app’s request path (use desktop + updated bridge).

#### C. Start ComfyUI with CORS / listen flags

How you launch ComfyUI depends on install type:

**Classic ComfyUI (Python / `main.py`):**

```bash
python main.py --enable-cors-header --listen 127.0.0.1 --port 8188
```

If the editor runs on another device on your LAN:

```bash
python main.py --enable-cors-header --listen 0.0.0.0 --port 8188
```

Then set Base URL in the app to `http://<that-machine-ip>:8188`.

**ComfyUI Desktop:**  
Use its settings / launch options UI if available to enable CORS, or launch the embedded server with equivalent flags. Keep Desktop updated — security middleware behaviour changes between versions.

**Extra security / auth builds:**  
If you installed custom middleware, reverse proxies, or API tokens:

- Disable auth for pure localhost development, **or**
- Configure the allowlist for local clients  
- Do not put ComfyUI on the public internet without auth

#### D. Still stuck?

| Symptom | Likely cause | Action |
| --- | --- | --- |
| 403 only from the app, `curl` works | Renderer Origin / CSRF | Desktop app + local bridge; restart app |
| 403 from `curl` too | ComfyUI security | `--enable-cors-header`, listen flags, check middleware |
| Connection refused | ComfyUI not running / wrong port | Start ComfyUI; match Base URL |
| Works in Images workspace, fails in Workflows | Stale Workflow Manager build | Update / restart; both now share `comfyUiService` |

---

## 2. Using the ComfyUI Workflow Manager

**Where:** Sidebar → **Project** → **Workflows**  
(Advanced / Pro UI modes show it next to **Local AI**.)

### 2.1 Connection panel

1. Set **Base URL** (default `http://127.0.0.1:8188`).
2. Click **Test connection**.
3. On success you should see online status plus counts of checkpoints, VAEs, LoRAs, and CLIP models discovered from ComfyUI’s `/object_info` API.

The URL is shared with **Images** and **Local AI** (same `comfyui_config_v1` setting).

### 2.2 Workflow library

Workflows are API-format ComfyUI graphs (the node map ComfyUI’s `/prompt` endpoint expects — not always identical to a UI “Save” file; export **API format** from ComfyUI when possible).

**Import**

1. In ComfyUI, use **Save (API Format)** / export the prompt JSON.
2. In Workflow Manager → **Import JSON**.
3. The importer stores the graph, tries to **infer bindings** for common nodes (`CLIPTextEncode` → prompt / negative, `KSampler` → seed / steps / CFG, `EmptyLatentImage` → size, `LoadImage` → reference image).

**Manage**

- **Rename**, **Duplicate**, **Export**, **Delete** (built-in templates are protected).
- Filter by **category**.

**Validate on server**

Select a workflow → **Validate on server**. The app checks which `class_type` nodes are missing from the connected ComfyUI. Missing nodes usually mean: outdated ComfyUI, or a custom node pack not installed. The manager does **not** auto-download custom nodes or large models.

### 2.3 Workflow categories (production tasks)

| Category | What ships by default | How to make it executable |
| --- | --- | --- |
| Character Identity | Builtin **template** (empty graph + input schema) | Import your identity API JSON |
| Character Outfit | Builtin template | Import edit / identity-preserving outfit JSON |
| Environment | Builtin template | Import environment API JSON |
| Prop | Builtin template | Import prop API JSON |
| Storyboard Frame | Builtin template + optional Local AI **t2i** catalog graphs | Import JSON **or** add a catalog t2i workflow |
| Image Edit / Continuity | Builtin template + Local AI **edit** catalog graphs | Prefer **Add to library** from catalog (FLUX / Qwen edit) |
| Image to Video | Builtin template + Local AI **i2v** catalog graphs | Prefer catalog Wan / LTX i2v |
| Text to Video | Builtin template + Local AI **t2v** catalog graphs | Prefer catalog t2v where available |
| Custom | Only what you import | Import any API-format JSON |

**Honest status:** We do **not** ship finished custom-node graphs for every production category. We ship:

1. **Eight builtin templates** (one per production task) with the right metadata and inputs so assignments exist.  
2. **Real executable graphs** from the Local AI model catalog (t2i / edit / i2v / t2v) via **Local AI catalog workflows → Add to library**.  
3. Full support for **your** ComfyUI API-format exports.

Character / outfit / environment / prop consistency workflows are intentionally templates until you plug in the graphs that match *your* installed nodes and models.

**Assign to task:** pick a workflow and set which production task it serves. Assignments are stored in the workflow library (currently local to the app machine).

### 2.4 Storyboard single-frame rule

Storyboard workflows must output **one clean cinematic frame**. Avoid graphs that produce:

- Split screens / multi-panel layouts  
- Contact sheets / collages  
- Repeated images in one render  

A built-in **Storyboard Single Frame (template)** documents this constraint. Replace its empty graph by importing your real API workflow and assigning it to **Storyboard Frame**.

### 2.5 Generation jobs panel

Recent generation job records (status, model, Comfy prompt id, errors) appear at the bottom. This is the foundation for the unified job lifecycle (pending → queued → running → completed / failed / cancelled → review / approved / rejected). Full Hub wiring of every generate button through this queue continues in later iterations; the manager already persists history locally.

### 2.6 Recommended day-to-day flow

1. Start ComfyUI (with CORS flags if needed).  
2. **Local AI** → download/install the models you need into ComfyUI’s `models` folder.  
3. **Workflows** → test connection → import / assign workflows per task.  
4. **Project Hub** → work on the active episode’s script / storyboard.  
5. Generate storyboard frames / video using the assigned local models.  
6. Prefer **Takes** / version history over overwriting approved frames (see §3.3).

---

## 3. What’s new in the recent PRs

### 3.1 PR #1 — Electron project unload & storyboard delete

**Problem fixed:** After some AI generations, or when deleting storyboard shots, the Electron app could unload / close the open project unexpectedly.

**What changed:** Project lifecycle and storyboard delete paths were hardened so generation and shot removal no longer tear down the open project session.

**How you use it:** Invisible when working correctly — open a project, generate, delete shots; the project stays loaded.

---

### 3.2 PR #2 — Cinematic storyboard & production pipeline overhaul

This is the large “director / shot planner” upgrade.

#### Intelligent planning (not raw screenplay → image)

Pipeline shape:

```
Screenplay → Scene analysis → Narrative beats → Shot Planner
  → Shot breakdown → Model-ready prompts → Image gen → Take / version selection
```

The planner understands coverage needs (establishing, OTS, reaction, insert, close-ups, etc.) and aims for **visually distinct** shots instead of four near-identical mediums of the same subject.

#### Separate narrative vs image prompts

Shots keep distinct fields where supported:

- Narrative / action description  
- Director shot description  
- Image-generation prompt  
- Negative prompt  

Screenplay prose is **not** blindly dumped into the image model.

#### Dependency-aware regeneration

When character references, wardrobe, environment, visual style, or screenplay change, affected shots can be marked **stale / needs review**. Regenerating prompts does **not** silently destroy approved images — version / take history is preserved.

#### Local generation honesty

Draw Things and ComfyUI/catalog paths got clearer planning: what a model can actually accept (e.g. single start image vs multi-ref), single-frame constraints, and camera/lens framing helpers.

#### Sample / tests

Includes Silence Index–style sample screenplay fixtures and automated tests for scene split, coverage, diversity, and dependency invalidation.

---

### 3.3 PR #3 — Episodic production hierarchy + ComfyUI Workflow Manager

#### Production hierarchy

```
Series
 └── Season
      └── Episode
           └── Scene
                └── Shot
                     └── Take
```

**Series** is the shared source of truth (title, logline, visual direction, libraries conceptually at series scope).  
**Season / Episode** hold arc and episode-specific script, scenes, and production status.  
**Shot** is the cinematic unit (camera, framing, prompts, workflow id, stale flags).  
**Take** is one generation attempt or approved variation (media, model, seed, prompt, status). Approved takes are **not** auto-overwritten.

#### Safe migration of existing projects

On load/save:

| Old | New |
| --- | --- |
| Project | Series |
| Script + Hub storyboard | Season 1 / Episode 1 |
| Scenes from screenplay | Episode scenes |
| Storyboard frames | Shots |
| `imageVersions` / generation history | Takes |

Existing Hub editing still works: the **active episode** dual-writes to legacy `storyBible.script` + `shotPrompts` so Project Hub does not break.

#### Episode navigator

On Project Hub you get a bar showing:

`Series / Season / Episode` context, shot/take counts, episode picker, **New episode**.

Switching episodes flushes the current script/shots into the previous episode, then loads the selected episode’s script and shot list. Creating a new episode starts an empty workspace without wiping the previous episode’s data.

#### Continuity inheritance (foundation)

Series → Season → Episode → Scene → Shot inheritance helpers allow lower levels to **override** values (e.g. wardrobe in Episode 4) without silently mutating the parent series definition. UI badges for inherited vs overridden fields expand from this foundation.

#### ComfyUI Workflow Manager (this document §2)

First-class local workflow engine UI: connection, model discovery counts, import/export, category assignment, validation, job history — without assuming specific custom nodes are installed.

---

## 4. Mental model: how the pieces fit

```
┌─────────────────────────────────────────────────────────┐
│ Series workspace (bible, characters, environments)      │
│   └── Season → Episode workspace                        │
│         ├── Script / Scenes                             │
│         ├── Storyboard (Shots → Takes)                  │
│         └── Generation uses Workflow Manager assignments│
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
              Generic generation interface
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
     ComfyUI adapter              Other backends
     (Workflow Manager +          (Draw Things, cloud
      localAi bridge)              providers later)
```

**Local-first:** you can run the pipeline on your GPU with ComfyUI. Cloud providers remain optional BYOK paths; nothing requires a subscription to generate locally.

---

## 5. Quick start checklist (episodic + ComfyUI)

1. Update / rebuild the desktop app; quit fully and relaunch.  
2. Start ComfyUI (`--enable-cors-header` if you ever hit 403 from a browser origin).  
3. **Local AI** → point at ComfyUI `models` folder → download FLUX / Wan / etc. as needed.  
4. **Workflows** → Test connection → import storyboard + i2v workflows → assign categories.  
5. Open or create a project → save once (creates Series / Season 1 / Episode 1).  
6. Write / paste the Episode 01 screenplay in Project Hub.  
7. Run cinematic shot planning / generate storyboard; review Takes; approve picks.  
8. Add **Episode 02** from the episode bar when ready; switch freely without losing Episode 01.

---

## 6. Troubleshooting index

| Issue | Fix |
| --- | --- |
| 403 Forbidden on Test connection | §1 of this guide |
| Cannot scroll long screens | Update to the build that sets `.app-main-surface` to `overflow-y: auto`; restart the desktop app |
| Only one workflow listed | Open Workflows once after update — builtin templates for all 8 categories are seeded automatically |
| Template has empty graph / won’t run | Expected for identity/outfit/env/prop until you import API JSON or add a catalog workflow |
| Missing nodes on Validate | Update ComfyUI; install required custom nodes manually; do not expect auto-download |
| Models list empty but online | ComfyUI `/object_info` has no loader choices yet — install checkpoints into the models folder |
| Episode switch “lost” shots | Confirm you saved; shots live on the previous episode — switch back |
| Approved image disappeared after regen | Should not happen for Takes; check Take / version history on the shot |
| Multi-panel storyboard image | Wrong workflow — assign a single-frame storyboard graph |

---

## 7. Related docs in this repo

- `docs/local-ai.md` — Local LLMs, ComfyUI model download catalog, Draw Things  
- `docs/FIRST_10_MINUTES.md` — Getting started  
- `docs/model-providers.md` — Cloud BYOK providers  

---

*Guide version aligned with main after merge of PRs #1–#3, plus the ComfyUI local-bridge 403 fix.*
