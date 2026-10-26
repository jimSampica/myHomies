(() => {
  const records = new Map();
  let queued = false;
  let owner = null, toolbar = null, scan = null;
  function profileHandle(href) {
    if (!href) return null;
    const url = new URL(href, location.origin);
    return url.origin === location.origin ? url.pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i)?.[1]?.toLowerCase() : null;
  }
  function viewer() {
    return profileHandle(document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.href);
  }
  function onOwnFollowers() {
    return owner && location.pathname.toLowerCase().replace(/\/$/, '') === `/${owner}/followers` && viewer() === owner;
  }
  async function loadCache() {
    const expected = owner;
    const result = await browser.runtime.sendMessage({type: 'snapshot', owner});
    if (owner === expected) merge(result.records);
  }
  function setProgress(text) {
    const status = toolbar?.querySelector('[role="status"]');
    if (status && status.textContent !== text) status.textContent = text;
  }
  function updateToolbar() {
    const current = viewer();
    if (current !== owner) {
      owner = current;
      records.clear();
      if (scan) scan.stopped = true;
      loadCache().catch(() => {});
    }
    if (!onOwnFollowers()) {
      if (scan) scan.stopped = true;
      toolbar?.remove(); toolbar = null;
      return;
    }
    if (toolbar?.isConnected) return;
    const main = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main');
    if (!main) return;
    toolbar = document.createElement('section');
    toolbar.className = 'myhomies-toolbar';
    const start = document.createElement('button'), stop = document.createElement('button');
    const status = document.createElement('span');
    start.textContent = 'Build follower cache'; stop.textContent = 'Stop'; stop.hidden = true;
    status.setAttribute('role', 'status');
    status.textContent = 'Scrolls this list and saves followers locally.';
    start.addEventListener('click', () => buildCache(start, stop));
    stop.addEventListener('click', () => { if (scan) scan.stopped = true; });
    toolbar.append(start, stop, status);
    main.prepend(toolbar);
  }
  async function buildCache(start, stop) {
    if (scan || !onOwnFollowers()) return;
    const run = {stopped: false, owner, seen: new Set(), count: 0};
    scan = run; start.disabled = true; stop.hidden = false;
    let idle = 0;
    const started = Date.now();
    try {
      while (!run.stopped && onOwnFollowers() && owner === run.owner) {
        const handles = [];
        const main = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main');
        for (const cell of main?.querySelectorAll('[data-testid="UserCell"]') || []) {
          const handle = [...cell.querySelectorAll('a[href]')].map(link => profileHandle(link.href)).find(Boolean);
          if (handle && !run.seen.has(handle)) { run.seen.add(handle); handles.push(handle); }
        }
        if (handles.length) {
          const result = await browser.runtime.sendMessage({type: 'cacheFollowers', owner: run.owner, handles});
          if (!result) throw new Error('Unable to save followers on this page.');
          run.count = result.count;
          if (owner === run.owner) merge(result.records);
          idle = 0;
        } else idle++;
        setProgress(`Saved ${run.seen.size} accounts this run · ${run.count} cached. Scrolling…`);
        if (idle >= 8 || Date.now() - started > 30 * 60 * 1000) break;
        window.scrollBy({top: Math.max(400, window.innerHeight * 0.8), behavior: 'instant'});
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      setProgress(`Stopped · ${run.seen.size} accounts saved this run. ${idle >= 8 ? 'No new accounts loaded for 12 seconds. ' : ''}X may show only part of the list; run again to refresh.`);
    } catch (error) { setProgress(`Stopped: ${error.message} Previously saved accounts are retained.`); }
    finally { if (scan === run) scan = null; start.disabled = false; stop.hidden = true; }
  }
  function render() {
    queued = false;
    updateToolbar();
    for (const tweet of document.querySelectorAll('article[data-testid="tweet"]')) {
      const name = tweet.querySelector('[data-testid="User-Name"]');
      if (!name) continue;
      const handle = [...name.querySelectorAll('a[href]')].map(link => {
        const url = new URL(link.href, location.origin);
        return url.origin === location.origin ? url.pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i)?.[1]?.toLowerCase() : null;
      }).find(Boolean);
      const existing = name.querySelector('.myhomies-badge');
      if (!records.get(handle)?.followsYou) { existing?.remove(); continue; }
      if (existing) continue;
      const badge = document.createElement('span');
      badge.className = 'myhomies-badge';
      badge.textContent = 'Follows you';
      badge.title = 'Confirmed by X relationship data or your locally saved Followers list. Cached information may be out of date.';
      name.append(badge);
    }
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(render); } }
  function merge(values) {
    for (const record of values) records.set(record.handle.toLowerCase(), record);
    schedule();
  }
  browser.runtime.onMessage.addListener(message => {
    if (message.type === 'identity') return Promise.resolve({owner: viewer()});
    if (message.type === 'relationships') merge(message.records);
    if (message.type === 'reset') { records.clear(); loadCache().catch(() => {}); schedule(); }
  });
  new MutationObserver(schedule).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['href']});
  window.addEventListener('popstate', schedule);
  // Also detect SPA route changes that don't immediately mutate the timeline.
  setInterval(schedule, 1000);
  schedule();
})();
