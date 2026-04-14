# Brainstorm: Web Interface for CYOA Adventure Stories

## Current State

We have 111 extracted OCR text pages in `output/cot-pages-ocr-v2/` (e.g. `02-CoT.txt`, `03-CoT.txt`).
Each file starts with a header like `Page 2`, followed by the story text and choice prompts such as:

```
If you decide to start back home,
tum to page 4.

If you decide to wait,
tum to page 5.
```

A Python script (`build_story_graph.py`) already parses these pages using regex to detect
"turn to page X" links, builds a Mermaid graph (`cot-story-graph.mmd`), and renders an SVG.
Some pages are terminal endings (colored red in the SVG), some are on the main trunk
(colored blue), and others are branching points.

## Goal

Create a web-based interface with two primary modes:
1. **Reader Mode** – read the story interactively, clicking links to navigate between pages.
2. **Authoring Tool** – visualize, edit, and extend the story graph; import new pages and have the graph sync automatically.

---

## Idea 1: Page Parsing & Link Detection (Server-Side)

**Concept:** Re-use the existing regex logic from `build_story_graph.py` in a small backend API.
When the server scans `cot-pages-ocr-v2/`, it derives the page number from the filename
(`02-CoT.txt` → page `2`) and parses the body to find "Go to page xx" references.

**How it works:**
- **Filename as source of truth:** The filename gives the canonical page number. This avoids relying on the `Page X` header, which can have OCR errors.
- **Regex link extraction:** Scan each page for patterns like `turn to page 4`, `go to page 22`, `tum to page 5` (handling OCR artifacts).
- **Auto-linkify:** In Reader Mode, replace detected choice text with clickable `<a href="/page/4">` links so the user can navigate seamlessly.
- **Sequential fallback:** If a page has no explicit choices and does not contain "THE END", assume it continues to the next numbered page (page `n` → page `n+1`), matching the existing graph logic.

**Benefits:**
- Leverages existing, battle-tested regex patterns.
- Minimal backend state; the filesystem remains the source of truth.
- New pages dropped into the folder can be picked up on the next scan.

---

## Idea 2: Interactive Graph View (Authoring Tool)

**Concept:** A visual graph editor where nodes = pages and edges = choices/continuations.
Authors can pan, zoom, click nodes to edit text, and drag to re-layout.

**How it works:**
- **Parse Mermaid or build JSON directly:** Instead of only rendering static SVG, parse `cot-story-graph.mmd` (or have the backend expose a `/api/graph` JSON endpoint) to feed a client-side graph library like **Cytoscape.js**, **D3.js**, or **React Flow**.
- **Editable nodes:** Click a node to open a side panel showing the page text. Edit the text, and on save the backend re-parses links and updates the graph JSON automatically.
- **Visual cues:**
  - **Blue** = main trunk / start path.
  - **Red** = terminal / ending page.
  - **Gray** = regular branching page.
  - **Dashed border** = page has no text file yet (placeholder / unfinished).
- **Graph manipulation:**
  - Add a new node (new page number).
  - Draw an edge from one page to another to create a new choice.
  - Delete an edge to remove a choice.
  - When a new page file is uploaded or saved, the graph re-syncs automatically.

**Benefits:**
- Authors can see the "shape" of the story at a glance.
- Unfinished pages (dangling edges with no target file) are immediately visible.
- Cyclic paths and converging branches are easy to spot.

---

## Idea 3: Automatic Sync on Import

**Concept:** When an author uploads a batch of new `.txt` files, the system parses them,
rebuilds the graph, and updates the visual editor without manual steps.

**How it works:**
- **Upload dropzone:** Drag-and-drop `.txt` files into the web UI.
- **Validation:** Check for duplicate page numbers, missing story headers, or un-parseable text.
- **Background re-parse:** A lightweight endpoint runs the page parser over the entire
  `cot-pages-ocr-v2/` directory and emits a fresh JSON graph.
- **Diff preview:** Before committing, show the author what changed:
  - New pages added.
  - New edges detected.
  - Broken edges (links pointing to non-existent pages).
  - Terminal pages newly identified.
- **One-click commit:** Save the new files and regenerate `cot-story-graph.mmd` and `.svg`.

**Benefits:**
- Keeps the filesystem and the graph in sync.
- Prevents broken links by surfacing dangling references immediately.
- Authors can iterate quickly: upload → review graph → adjust → re-upload.

---

## Idea 4: Reader Mode as a Single-Page App (SPA)

**Concept:** A clean, book-like reading experience where each page is rendered with
clickable choice links.

**How it works:**
- **Route per page:** `/read/2`, `/read/3`, etc.
- **Page renderer:** Fetch the raw text for the page from the backend, sanitize it,
  and auto-convert "turn to page X" lines into styled choice buttons or inline links.
- **History trail:** Show a breadcrumb or mini-timeline of pages visited so the reader
  can backtrack (e.g. `2 → 3 → 5 → 6`).
- **Keyboard navigation:** Press `1`, `2`, `3` to select the first, second, third choice.
- **Bookmarking:** Save the current path in `localStorage` or URL query params so the
  reader can resume later.
- **Progress indicator:** A small graph thumbnail or "map" in the corner showing where
  you are in the overall story.

**Benefits:**
- Simple, focused UI that mirrors the physical book experience.
- Works on mobile (touch-friendly choice buttons).
- Can be exported as static HTML once the story is finalized.

---

## Idea 5: Split-Pane Authoring UI

**Concept:** Combine the text editor and the graph view side-by-side.

**How it works:**
- **Left pane:** Text editor for the currently selected page.
- **Right pane:** Live graph view that updates as you type.
- **Live link detection:** As the author types "If you run, turn to page 12," the graph
  immediately draws a new edge to node 12 (creating a dashed placeholder if 12 does not exist yet).
- **Quick-jump:** Click any node in the graph to load that page into the editor.
- **Batch edit:** Multi-select nodes to rename page numbers or apply bulk operations.

**Benefits:**
- Tight feedback loop between writing and visual structure.
- Helps authors avoid numbering mistakes (e.g. two pages both claiming to be page 10).

---

## Idea 6: Handling Non-Story Pages

**Concept:** Some pages (e.g. `117-CoT.txt` = "About the Author", `119-CoT.txt` = book list)
are not part of the narrative graph.

**How it works:**
- **Auto-filter:** If a page contains no outgoing links and no incoming links from any
  story page, mark it as **metadata / non-story** and gray it out in the graph.
- **Manual tag:** Allow authors to tag a page as `start`, `ending`, `story`, or `metadata`.
- **Hide toggle:** In Reader Mode, skip metadata pages unless explicitly linked.
  In Authoring Mode, show them in a separate "Extras" section.

**Benefits:**
- Keeps the graph clean and focused on the actual adventure.
- Prevents readers from accidentally landing on a "Books by this publisher" page.

---

## Idea 7: Export & Publishing Pipeline

**Concept:** Once the story is complete, generate a static site that can be hosted anywhere.

**How it works:**
- **Static export button:** Produce a zip of plain HTML/CSS/JS where each page is a
  pre-rendered file with no server needed.
- **Regenerate canonical outputs:** On export, also run the existing Python scripts
  (`build_story_graph.py`, `write_all_stories.py`, `render_story_graph_svg.py`) to ensure
  `cot-story-graph.mmd`, `cot-story-graph.svg`, and `cot-stories/` stay up to date.
- **Path explorer:** A bonus feature listing all 45 (or however many) complete story paths,
  letting a reader click any path to "play through" it automatically.

**Benefits:**
- Satisfies the Fork-Instructions goal of offering a static reading experience.
- Preserves the existing Python toolchain as the canonical backend.

---

## Open Questions to Resolve Later

1. **Tech stack:** Should the web UI be a lightweight Python Flask/FastAPI backend + vanilla JS,
   or a more modern React/Vue + Node setup?
2. **Graph library:** Cytoscape.js (performance, easy layout) vs. React Flow (React-native,
   great for editing) vs. D3 (full control, more work).
3. **State storage:** Do we store graph edits back to `.mmd` only, or maintain a JSON/DB
   representation for richer metadata (page titles, tags, coordinates)?
4. **OCR cleanup workflow:** Should the web UI include a spell-check or "suggest fix" feature
   for obvious OCR errors (e.g. `tum` → `turn`) before saving?

---

## Summary of Recommended Path

1. Build a small **FastAPI/Flask backend** that serves the existing `cot-pages-ocr-v2/` files
   and exposes a `/api/graph` JSON endpoint derived from `build_story_graph.py` logic.
2. Build a **Reader Mode SPA** that fetches page text and auto-linkifies "turn to page X" choices.
3. Build an **Authoring Tool** with a **Cytoscape.js** or **React Flow** graph view that consumes
   the same JSON graph.
4. Implement **auto-sync:** uploading or editing a page triggers a re-parse, updates the graph
   JSON, and highlights any broken links.
5. Add a **static export** feature that writes out plain HTML and re-runs the canonical Python scripts.
