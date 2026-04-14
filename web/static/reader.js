(function () {
  const API_BASE = '';
  const pageContent = document.getElementById('page-content');
  const choicesDiv = document.getElementById('choices');
  const terminalOverlay = document.getElementById('terminal-overlay');
  const sequentialFallback = document.getElementById('sequential-fallback');
  const pageNumSpan = document.getElementById('page-num');
  const breadcrumbDiv = document.getElementById('breadcrumb');
  const backBtn = document.getElementById('back-btn');
  const restartBtn = document.getElementById('restart-btn');
  const editGraphLink = document.getElementById('edit-graph-link');
  const editGraphBtn = document.getElementById('edit-graph-btn');

  const CHOICE_RE = /\b(?:turn|tum|go|follow|take|return)\b[^\n]{0,120}?\b(?:to|ta|io)\b[^\n]{0,20}?(?:page|poge|p\.)\s*([0-9]{1,3})/gi;

  function getPageFromHash() {
    const m = location.hash.match(/^#(\d+)$/);
    return m ? parseInt(m[1], 10) : 2;
  }

  function pushHistory(page) {
    let hist = JSON.parse(sessionStorage.getItem('cyoa_history') || '[]');
    if (hist[hist.length - 1] !== page) {
      hist.push(page);
      sessionStorage.setItem('cyoa_history', JSON.stringify(hist));
    }
    updateBreadcrumb(hist);
  }

  function popHistory() {
    let hist = JSON.parse(sessionStorage.getItem('cyoa_history') || '[]');
    hist.pop();
    sessionStorage.setItem('cyoa_history', JSON.stringify(hist));
    updateBreadcrumb(hist);
    return hist[hist.length - 1] || 2;
  }

  function updateBreadcrumb(hist) {
    if (!hist.length) {
      breadcrumbDiv.textContent = '';
      return;
    }
    breadcrumbDiv.textContent = 'Path: ' + hist.join(' → ');
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }

  function linkifyText(text, outgoing) {
    const outgoingSet = new Set(outgoing);
    const lines = text.split('\n');
    const resultLines = [];
    const choiceLinks = [];

    for (const line of lines) {
      let replaced = false;
      let m;
      CHOICE_RE.lastIndex = 0;
      while ((m = CHOICE_RE.exec(line)) !== null) {
        const target = parseInt(m[1], 10);
        if (outgoingSet.has(target)) {
          choiceLinks.push(target);
          resultLines.push(`<a class="choice-link" href="#${target}" data-target="${target}">${line.trim()}</a>`);
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        resultLines.push(line);
      }
    }
    return { html: resultLines.join('\n'), choiceLinks };
  }

  async function loadPage(page) {
    pageNumSpan.textContent = `Page ${page}`;
    editGraphLink.href = `/graph.html#page=${page}`;
    if (editGraphBtn) editGraphBtn.href = `/graph.html#page=${page}`;

    const [pageData, graphData] = await Promise.all([
      fetchJSON(`${API_BASE}/api/pages/${page}`).catch(() => null),
      fetchJSON(`${API_BASE}/api/graph`).catch(() => null),
    ]);

    if (!pageData) {
      pageContent.textContent = 'Page not found.';
      choicesDiv.innerHTML = '';
      return;
    }

    // Find outgoing edges from MMD graph for this page
    let outgoing = [];
    if (graphData) {
      const nodeId = `P${page}`;
      outgoing = graphData.edges
        .filter(e => e.source === nodeId)
        .map(e => parseInt(e.target.replace('P', ''), 10));
    }

    const metaNode = graphData?.nodes?.find(n => n.page === page);
    const isEnding = metaNode?.isEnding || false;

    const { html, choiceLinks } = linkifyText(pageData.text, outgoing);
    pageContent.innerHTML = html;

    // Collect any extra MMD edges that regex missed and render them as buttons
    const linkedSet = new Set(choiceLinks);
    const extraChoices = outgoing.filter(t => !linkedSet.has(t));

    choicesDiv.innerHTML = '';
    extraChoices.forEach(target => {
      const a = document.createElement('a');
      a.className = 'choice-link';
      a.href = `#${target}`;
      a.textContent = `Go to page ${target}`;
      choicesDiv.appendChild(a);
    });

    if (isEnding) {
      terminalOverlay.classList.remove('hidden');
      sequentialFallback.classList.add('hidden');
    } else {
      terminalOverlay.classList.add('hidden');
      if (outgoing.length === 0 && choiceLinks.length === 0) {
        const nextPage = page + 1;
        const fbLink = sequentialFallback.querySelector('a');
        fbLink.href = `#${nextPage}`;
        fbLink.textContent = `Continue to page ${nextPage}`;
        sequentialFallback.classList.remove('hidden');
      } else {
        sequentialFallback.classList.add('hidden');
      }
    }

    pushHistory(page);
  }

  window.addEventListener('hashchange', () => {
    loadPage(getPageFromHash());
  });

  backBtn.addEventListener('click', () => {
    const prev = popHistory();
    location.hash = `#${prev}`;
  });

  restartBtn.addEventListener('click', () => {
    sessionStorage.removeItem('cyoa_history');
    location.hash = '#2';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      const links = choicesDiv.querySelectorAll('a.choice-link');
      if (links[idx]) links[idx].click();
    }
  });

  const startPage = getPageFromHash();
  if (!sessionStorage.getItem('cyoa_history')) {
    sessionStorage.setItem('cyoa_history', JSON.stringify([startPage]));
  }
  updateBreadcrumb(JSON.parse(sessionStorage.getItem('cyoa_history') || '[]'));
  loadPage(startPage);
})();
