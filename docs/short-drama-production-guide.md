# Short Drama Production Guide

The practical path to make **vertical microdramas** and **episodic short dramas** inside this app — using Project Hub, episodes, cinematic storyboards, Takes, Local AI / ComfyUI, filming, edit, and export.

If you only read one docs page for short-form narrative, use this one. Related deep-dives:

| Topic | Doc |
| --- | --- |
| First launch | `docs/FIRST_10_MINUTES.md` |
| General UI map | `docs/ui-production-workflow-guide.md` |
| Local models / ComfyUI downloads | `docs/local-ai.md` |
| Workflow Manager + 403 + episodic hierarchy | `docs/comfyui-workflow-manager-and-episodic-production.md` |

---

## 0. What “short drama” means here

Pick the format that matches the product you are shipping:

| Goal | Production format in Project | Aspect | Episode length (typical) |
| --- | --- | --- | --- |
| Vertical series for TikTok / Reels / Shorts | **Microdrama** | **9:16** | 60–120 seconds per episode |
| Festival / YouTube short | **Short film** | **16:9** | One film, few scenes |
| Multi-episode widescreen series | **Feature / Series** | widescreen | Longer episodes + Scene Wall |

This guide optimizes for **Microdrama** (vertical episodic) first, then notes where Short film differs.

**Core loop (every episode):**

```text
Series bible (once)
  → Episode script (hook → escalation → cliffhanger)
    → Concept lock (faces, wardrobe, locations)
      → Cinematic storyboard (distinct shots + Takes)
        → Approve frames
          → Film (image-to-video)
            → Edit + sound
              → Export 9:16
                → Next episode (reuse series continuity)
```

---

## 1. One-time studio setup

### 1.1 Desktop app + project folder

1. Use the **desktop (Electron)** build for local projects and ComfyUI.  
2. **Project menu →** create or open a **local project folder** before heavy generation so media stays on disk.  
3. UI mode: **Standard** or **Pro** (Simple hides too much of the pipeline).

### 1.2 Keys vs local-first

You can mix providers:

| Path | What you need |
| --- | --- |
| **Local-first** (recommended for continuity + cost control) | ComfyUI running; models downloaded in **Local AI**; optional local LLM |
| Cloud BYOK | Gemini / fal / Replicate / etc. in Settings for script help and cloud video |

Local ComfyUI connection: **Project → Workflows**. If you see **403 Forbidden**, see `docs/comfyui-workflow-manager-and-episodic-production.md` §1 (desktop local bridge + `--enable-cors-header`).

### 1.3 Models that matter for short drama

In **Local AI → Image & video models**, download what your GPU can hold. Practical starter set:

| Task | Example local model (catalog) |
| --- | --- |
| Character / env / storyboard stills | FLUX.2 Klein 4B or Z-Image Turbo |
| Continuity edits | FLUX / Qwen **edit** workflows |
| Episode motion | Wan 2.2 i2v (or LTX if you have VRAM) |

Then in **Workflows**:

1. Test ComfyUI connection.  
2. Confirm the **8 task templates** exist (identity, outfit, environment, prop, storyboard, edit, i2v, t2v).  
3. Under **Local AI catalog workflows**, **Add to library** at least: one **t2i** or **edit**, one **i2v**.  
4. Assign them to Storyboard Frame / Image Edit / Image to Video.

Templates for character/outfit/env/prop are schemas until you import API JSON — do not expect empty templates to generate.

---

## 2. Start the series (not just a one-off script)

### 2.1 Create the project as a Series

1. Open **Project**.  
2. Save once — the app migrates the project into:

```text
Series → Season 1 → Episode 01
```

3. Use the **episode bar** at the top of Project Hub to see Series / Season / Episode context.  
4. Set **production format** to **Microdrama** (locks 9:16 look suffixes, shorter shot duration, vertical tips).

### 2.2 Lock the series bible early (Script / World / Concept)

Before Episode 02 exists, decide what must never drift:

| Lock once at Series level | Allow per episode |
| --- | --- |
| Lead face / body identity | Outfit for that episode’s day |
| Recurring locations | Lighting / time of day |
| Visual style / look | Episode-specific props |
| Casting names | Special makeup / injury |

In Hub phases:

1. **Script** — series logline + Episode 01 screenplay (or use Microdrama workspace structure below).  
2. **World** (optional) — rules, locations, tone.  
3. **Concept** — generate **character identity** and **environment** references first. Approve them. Do not storyboard until faces and rooms are locked.

**Rule:** changing Mara’s coat in Episode 4 must not rewrite her face for Episodes 1–3. Use outfit / episode overrides; keep base identity references stable.

---

## 3. Write like a microdrama (not a feature)

### 3.1 Use the Microdrama workspace for structure

Sidebar → **Project → Microdrama** (or set format to Microdrama and stay in Hub Script).

Write each episode in three beats:

| Beat | Time | Job |
| --- | --- | --- |
| **Hook** | 0–15s | Peak conflict *immediately* — betrayal, slap, reveal, ultimatum |
| **Escalation** | ~15–60s | Raise stakes; no idle exposition |
| **Freeze** | ~60–90s+ | Cliffhanger with **no emotional closure** |

Then paste/sync into Project **Script** so scene splitting and the Director/Shot Planner can see sluglines.

### 3.2 Screenplay hygiene that the app rewards

- Use real sluglines: `INT. PENTHOUSE - NIGHT`  
- Name characters consistently (`MARA`, not `the woman` then `Mara`).  
- One location change = new scene.  
- End every episode on an unresolved question or visual freeze.

Example shape:

```text
INT. RECORDING BOOTH - NIGHT

MARA hits play. A voice that should not exist speaks her name.

INT. HALLWAY - NIGHT

She freezes at the door. The recording is still playing behind her —
but the booth is empty.
```

---

## 4. Concept lock (the continuity firewall)

**Phase: Concept**

Order of operations:

1. **Leads** — identity stills (front + optional angles). Mark approved.  
2. **Wardrobe** — episode outfit as a *separate* reference, not a new face.  
3. **Locations** — one hero plate per recurring room.  
4. **Props** — only story-critical objects (ring, contract, phone, weapon).  
5. **Style** — one look (Microdrama already injects glossy vertical look suffixes).

Do **not** generate random clothing per storyboard frame. Attach outfit selections on shots when the Hub supports them; otherwise keep the same outfit reference pinned for the whole episode day.

---

## 5. Cinematic storyboard (this is where most quality is won)

**Phase: Storyboard** (+ **Director** tool)

### 5.1 Plan shots; do not prompt dump

Use **Director / Generate from Script** so the pipeline is:

```text
Screenplay → scenes → beats → shot plan → prompts → images → Takes
```

You want **coverage that changes information**, not four medium shots of the same pose:

1. Medium — Mara hears the voice  
2. ECU — finger on the play button  
3. Insert — waveform / phone UI  
4. CU — reaction  
5. OTS — into the empty booth  

Avoid multi-panel / contact-sheet workflows. Storyboard assignment must be a **single cinematic frame** graph.

### 5.2 Keep fields separate

| Field | Use for |
| --- | --- |
| Action / narrative | What happens in the story |
| Director shot notes | Camera size, angle, motivation |
| Image prompt | Model-optimized still description |
| Negative prompt | Multi-panel, collage, text, identity drift |

### 5.3 Takes (never overwrite approved frames)

Every generation should land as a **Take** (version history):

- Generate multiple takes  
- Compare  
- Mark **pick** / reject  
- Regenerate from a take without deleting the approved one  

If prompts go **stale** (character ref, wardrobe, env, or script changed), regenerate **prompts** first; do not auto-destroy approved takes.

### 5.4 Aspect ratio

For Microdrama: keep storyboard and filming at **9:16**. Vertical composition rules in the Hub bias toward centered subjects, disciplined headroom, and avoiding wide lateral pans that clip faces.

---

## 6. Filming (still → motion)

**Phase: Filming**

Preferred path for short drama continuity:

1. Use the **approved storyboard Take** as start frame.  
2. Prefer **image-to-video** over text-to-video for the same episode look.  
3. Motion prompt = *what moves*, not a rewrite of the whole scene.  
4. Keep clips short (format default ~4s for microdrama shots); assemble rhythm in Edit.

Local: assigned **Image to Video** workflow (Wan / LTX catalog).  
Cloud: Seedance / Kling / Veo / etc. with your keys — still start from the approved frame when the model allows.

---

## 7. Review, then Edit and Export

### 7.1 Review phase

Check:

- Same face across shots  
- Same outfit within the episode day  
- Same room geography  
- Hook lands in first 3 seconds of the assembly  
- Cliffhanger still unresolved  

Reject broken takes; re-film only the failed shot numbers.

### 7.2 Edit

**Edit** workspace:

1. Drop filmed clips in episode order.  
2. Trim to breath / reaction; do not dilute the hook.  
3. Add VO / SFX / music (cliffhanger audio: suspended chord, vacuum silence, or heartbeat — Microdrama tools call these out).  
4. Color last, after timing works.

### 7.3 Export

**Export** → TikTok / Instagram / Shorts-style **9:16** preset. Version the filename: `SeriesTitle_S01E01_v003.mp4`.

---

## 8. Multi-episode series workflow

1. Finish Episode 01 through Review (or at least approved storyboard + key filmed shots).  
2. **Save**.  
3. Episode bar → **New episode**.  
4. Write Episode 02 with a new hook that *depends* on Episode 01’s freeze.  
5. Reuse **series** character and location references; only add episode wardrobe/state overrides.  
6. Storyboard Episode 02; if series style or a lead’s base identity changed, expect stale flags — regenerate affected prompts, keep old approved takes.

Switching episodes restores that episode’s script and shots; it does not delete the previous episode.

---

## 9. Recommended production checklist (print this)

### Series bootstrap

- [ ] Desktop app + project folder  
- [ ] Format = Microdrama (or Short film if 16:9)  
- [ ] ComfyUI connected (or cloud keys ready)  
- [ ] Catalog storyboard + i2v workflows in Workflow Manager  
- [ ] Series logline + casting names locked  

### Per episode

- [ ] Hook / Escalation / Freeze written  
- [ ] Script sluglines clean  
- [ ] Concept refs approved for appearing characters + locations  
- [ ] Shot plan has varied coverage (not duplicate mediums)  
- [ ] Storyboard Takes approved (picks locked)  
- [ ] Filmed from approved frames  
- [ ] Continuity review passed  
- [ ] Timeline cut + export 9:16  

---

## 10. Quality bar: what “good” looks like

| Good | Bad |
| --- | --- |
| Episode opens mid-conflict | 20s of walking + establishing without stakes |
| Each shot reveals new info | Four near-identical full-body frames |
| Same face all episode | “Sister” who looks like a new actor every shot |
| Outfit stable for the day | Random wardrobe every generate |
| Cliffhanger denies closure | Soft smile fade-out |
| Takes preserved | Overwriting the only good frame |

---

## 11. Troubleshooting (short-drama specific)

| Problem | Fix |
| --- | --- |
| Faces drift | Stop storyboard; regenerate **identity** refs; pin them; mark stale shots and regen prompts |
| Everything looks the same | Re-run Director coverage; force ECU / insert / OTS / reaction mix |
| Multi-panel storyboard image | Wrong workflow — assign single-frame storyboard / catalog t2i |
| 403 on Workflows | Desktop bridge + ComfyUI CORS guide |
| Cannot scroll long Hub / Workflows pages | Update past the main-surface overflow fix |
| Episode 02 empty | Expected for new episode — previous work is under Episode 01 in the picker |
| Local generate fails “missing nodes” | Update ComfyUI; import a catalog workflow that matches installed models |

---

## 12. Fast path (90-minute first episode)

1. New project → Microdrama → save.  
2. Microdrama workspace: write Hook / Escalation / Freeze (~15 min).  
3. Concept: 1 lead + 1 location approved (~20 min).  
4. Storyboard: generate 6–10 distinct shots; pick Takes (~30 min).  
5. Film 4–6 hero shots i2v (~15 min).  
6. Edit + export vertical draft (~10 min).  
7. Only then start Episode 02.

Do not polish Episode 01’s marketing posters before the cliffhanger cut works.

---

*This guide reflects the app after episodic hierarchy, cinematic planning, Takes, and ComfyUI Workflow Manager landed on main. For engine-level ComfyUI details, use `docs/comfyui-workflow-manager-and-episodic-production.md`.*
