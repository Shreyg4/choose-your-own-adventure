---

## Implementation Plan: HTML-Based CYOA Web Interface

This plan focuses on delivering an **HTML-based website** with a strong emphasis on **Idea 2 (Interactive Graph View)**, fully accounting for the phrasing and ending variations described in Idea 1b. The stack is intentionally lightweight: a Python backend serving a vanilla-JS (or petite-vue/Alpine.js) frontend, keeping deployment simple and the graph fast.

**Critical architectural decision:** `cot-story-graph.mmd` is the **canonical source of truth for edges**. The text parser (`story_parser.py`) is used only as a **suggestion engine** — to hint at links when new pages are imported or edited, and to validate against the graph. The MMD file is never overwritten automatically by parsing; it is updated only through explicit author actions in the graph UI or via a manual "Rebuild from Text" command.

### Tech Stack Decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Backend** | Python **FastAPI** (or Flask) | Reuses existing `build_story_graph.py` logic directly; easy JSON API; single-file or small-module deployment. |
| **Frontend** | Vanilla ES6+ JavaScript modules, optional **Petite Vue** or **Alpine.js** for reactivity | No build step required; works as a pure HTML site; easy to statically export later. |
| **Graph Engine** | **Cytoscape.js** | Handles 100+ nodes smoothly, excellent built-in layouts (Dagre for hierarchical graphs), pure JS, no React dependency. |
| **Styling** | Plain CSS + a tiny normalize sheet | Keeps the project framework-agnostic and easy to theme. |
| **Data Storage** | Filesystem (`cot-story-graph.mmd` + `cot-pages-ocr-v2/`) + a small JSON metadata file (`pages-meta.json`) | **MMD is canonical for links.** Text files are canonical for page content. JSON stores layout positions and manual overrides (e.g. `isEnding`, `x/y`, `tags`). |

---

### Phase 1: Backend API — MMD-Centric Architecture

**Goal:** Build an API where the graph edges come from `cot-story-graph.mmd`, and parsing is strictly advisory.

1. **Create `mmd_loader.py` — MMD parser & writer:**
   - **`load_graph(mmd_path)`:** Parse `graph TD` Mermaid syntax into a clean JSON structure (`nodes`, `edges`). This becomes the *only* source of truth for edges served by `/api/graph`.
   - **`save_graph(mmd_path, graph_json)`:** Write the in-memory graph back to `cot-story-graph.mmd` in canonical Mermaid format. This is called only when the author explicitly modifies the graph (add/delete edge, rebuild, etc.).

2. **Refactor `build_story_graph.py` into `story_parser.py` (suggestion engine only):**
   - Extract `parse_pages()`, `extract_links()`, and terminal detection.
   - Expand terminal detection to: `The End`, `THE END`, `End Story`, `Story Ends`, `End.` (trailing), plus manual `isEnding` flag.
   - Keep the OCR-resilient regex but expose it as a utility: `suggest_edges(page_text) → List[int]`.
   - **`suggest_graph_delta(pages_dir, current_graph)`:** Run the parser over all text files and return a diff report:
     - *Suggested new edges* (found in text but missing in MMD).
     - *Orphan edges* (in MMD but not found in text — possibly intentional).
     - *New terminals* detected.
     - *Broken links* (edges pointing to non-existent pages).

3. **Create FastAPI app (`main.py`) with endpoints:**
   - `GET /api/graph` → returns graph JSON **parsed directly from `cot-story-graph.mmd`**. Nodes are unioned with pages found in `cot-pages-ocr-v2/` (so pages with text but no edges yet still appear, dashed).
   - `GET /api/pages` → list pages from `cot-pages-ocr-v2/`, enriched with metadata (`isEnding`, tags). **Outgoing links come from the MMD graph, not from parsing.**
   - `GET /api/pages/{page_num}` → raw text.
   - `GET /api/pages/{page_num}/suggestions` → runs `story_parser.py` on *just this page* and returns the parser-suggested edges and terminal flag. Used by the side panel to show "Parser found these links."
   - `POST /api/pages/{page_num}` → saves text to disk **only**. Does **not** touch the MMD. Returns the saved text and the current parser suggestions.
   - `POST /api/pages/{page_num}/meta` → updates `pages-meta.json` overrides (`isEnding`, `x`, `y`, `tags`).
   - `POST /api/graph/edges` → body `{source, target}` or `{source, target, action}`; adds edge to MMD and saves it. This is how new links are committed.
   - `DELETE /api/graph/edges` → removes edge from MMD and saves it.
   - `POST /api/graph/rebuild` → runs `story_parser.py` over **all** pages, computes a suggested graph, and presents a preview diff. The author must confirm (via a follow-up `POST /api/graph/rebuild/confirm`) before the MMD is actually overwritten.
   - `POST /api/import` → uploads new `.txt` files, writes them to `cot-pages-ocr-v2/`, then runs `suggest_graph_delta()` to produce a diff report against the current MMD. The MMD is **not** changed until the author clicks individual "Add to Graph" actions or runs **Rebuild**.
   - `POST /api/export` → runs `write_all_stories.py` and `render_story_graph_svg.py` (using the canonical MMD), then generates a static `dist/` reader site and zips everything.

4. **Metadata JSON (`output/pages-meta.json`):**
   - Stores node positions (`x`, `y`) so Cytoscape layouts survive reloads.
   - Stores manual `isEnding` and `tags`.
   - Does **not** store edges — edges live in the MMD file.

---

### Phase 2: Reader Mode (Static-Friendly SPA)

**Goal:** Read the story using the **MMD graph** to determine which choices are clickable.

1. **HTML shell (`/static/reader.html`):**
   - Simple book-like layout with header, page text area, and footer breadcrumb.

2. **JavaScript renderer (`reader.js`):**
   - Fetch page text and the page's **outgoing edges from `/api/graph`** (or from a cached JSON blob in static mode).
   - Render the text. To linkify choices, do **not** rely solely on regex. Instead:
     1. Use regex to find candidate choice lines.
     2. For each candidate, check if the referenced page number appears in the MMD edge list for this page.
     3. Only turn it into a `<a href="/read/X">` if the MMD confirms the edge exists.
   - If no MMD edges exist and the page is not marked as an ending, show the sequential fallback link: *"Continue to page {n+1}"*.
   - Terminal pages (marked red in metadata or detected by parser) get a styled "The End" overlay.

3. **Static export:**
   - Pre-render every page using the canonical MMD edge list, producing plain HTML with verified links only.

---

### Phase 3: Interactive Graph Authoring Tool (The Core Feature)

**Goal:** A full-page graph editor where authors manipulate the **canonical MMD graph** directly. Parsing is used for hints, not for automatic graph mutation.

1. **HTML shell (`/static/graph.html`):**
   - Full-screen Cytoscape canvas.
   - Floating toolbar: layout controls, "Add Node", "Rebuild from Text", "Upload Pages", "Export".
   - Right-side collapsible panel for text editing and metadata.

2. **Graph initialization (`graph.js`):**
   - Fetch `/api/graph` (which reads the MMD) and populate Cytoscape.
   - Visual styles:
     - **Blue fill** = start page / main trunk.
     - **Red fill** = terminal (`isEnding == true`).
     - **Gray fill** = normal story page.
     - **Dashed border** = page has a text file but **no edges** in the MMD yet (orphan page).
     - **Dashed node** = placeholder (edge exists in MMD but no text file yet).
   - Layout positions loaded from `pages-meta.json`; fallback to Dagre layout.

3. **Node selection & side-panel editing:**
   - Click a node to open the side panel.
   - Panel contents:
     - `<textarea>` with the page text (editable if file exists).
     - **MMD Outgoing Edges** list (from the MMD graph) with "Remove" buttons and target-page jump links.
     - **Parser Suggestions** section: calls `GET /api/pages/{page_num}/suggestions` and shows detected links. For each suggested link not yet in the MMD, show an **"Add Edge"** button that POSTs to `/api/graph/edges`.
     - **"Mark as Ending"** checkbox.
   - Saving the text (`POST /api/pages/{page_num}`) only writes the `.txt` file. The graph does **not** auto-update. Instead, the suggestions section refreshes, and the author manually approves any new edges.

4. **Graph manipulation features:**
   - **Add Edge:** Shift-click target after selecting source, or use the side-panel "Add Edge" input. POSTs to `/api/graph/edges` and re-renders the edge from the MMD.
   - **Delete Edge:** Click an edge and press Delete, or use the side-panel remove button. Calls `DELETE /api/graph/edges`.
   - **Add Node:** Toolbar button creates a new page number node in the MMD (no edges yet).
   - **Re-layout & Save Positions:** Buttons to run Dagre and persist `(x, y)` back to `/api/pages/{page_num}/meta`.

5. **Upload & suggestion workflow:**
   - Drag-and-drop `.txt` files → `POST /api/import`.
   - The response shows a **suggestion diff** (not an auto-sync):
     - *Parser suggests 3 new edges*
     - *2 pages have no edges yet*
     - *1 broken link detected (MMD references page 99, but file missing)*
   - The author can:
     1. Click **"Apply Suggestion"** on individual edges to add them to the MMD one by one.
     2. Click **"Rebuild Graph from Text"** to see a full preview of replacing the entire MMD with parser output, then confirm.

6. **Handling text variations explicitly:**
   - The side panel shows the raw regex matches (e.g. *"Matched: `tum to page 4`, `turn to page 22`"*).
   - If a match is wrong, the author simply ignores it — the MMD is not affected.
   - If the parser misses a phrase, the author can manually add the edge in the graph, or tweak the regex in a settings modal and re-run suggestions.

---

### Phase 4: Polish, Export, and Integration

**Goal:** Tie reader and graph together, ensuring the MMD remains the canonical backbone.

1. **Navigation between modes:**
   - Double-click a graph node → open Reader Mode for that page.
   - Reader Mode "Edit in Graph" button → select that node in the graph view.

2. **Export pipeline:**
   - `/api/export`:
     - Runs `render_story_graph_svg.py` and `write_all_stories.py` from the canonical MMD.
     - Generates the static `dist/` reader site using MMD-verified links.
     - Zips `dist/` + `cot-pages-ocr-v2/` + `cot-story-graph.mmd` + `cot-story-graph.svg`.

3. **Path Explorer:**
   - Reads `output/cot-stories/` (generated from the MMD) and lists complete paths as clickable sequences.

4. **Quality checks:**
   - Unit tests for `mmd_loader.py` (round-trip parse/write preserves edges).
   - Unit tests for `story_parser.py` with edge-case phrasings (`tum`, `turn`, `go to page`, `End Story`).
   - Integration test: modify a page text, verify `/api/graph` is unchanged, then add an edge via `/api/graph/edges`, verify `/api/graph` now includes it.

---

### Phase 5: Deployment Options

**Development:**
```bash
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn
uvicorn main:app --reload
```
Open `http://localhost:8000/static/index.html`.

**Static hosting (Reader Mode only):**
- Run the export script, then serve the `dist/` folder with any static host (GitHub Pages, Netlify, etc.).

**Full authoring tool hosting:**
- Deploy the FastAPI app behind a lightweight reverse proxy (e.g. `nginx` or `caddy`).
- No database required; ensure `output/`, `cot-pages-ocr-v2/`, and `cot-story-graph.mmd` are writable.

---

### Summary of Deliverables by Phase

| Phase | Deliverable |
|-------|-------------|
| 1 | `mmd_loader.py`, `story_parser.py`, `main.py` (FastAPI), `/api/graph` reading MMD, suggestion endpoints |
| 2 | `reader.html`, `reader.js`, static pre-rendering using MMD edges |
| 3 | `graph.html`, `graph.js`, Cytoscape integration with MMD-centric editing, suggestion side panel |
| 4 | Export endpoint, Path Explorer, navigation between modes, tests |
| 5 | README with run instructions, sample deployment configs |

This plan keeps the implementation **simple, HTML-centric, and tightly integrated** with the existing Python extraction pipeline, while making `cot-story-graph.mmd` the immutable backbone of the interactive graph experience.
