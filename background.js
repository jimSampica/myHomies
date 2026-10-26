const sessions = new Map();
const MAX_BYTES = 8 * 1024 * 1024;
const caches = new Map();
const validHandle = value => typeof value === 'string' && /^[a-z0-9_]{1,15}$/i.test(value);
const cacheReady = browser.storage.local.get('followerCaches').then(data => {
  for (const [owner, records] of Object.entries(data.followerCaches || {})) {
    if (validHandle(owner) && Array.isArray(records)) caches.set(owner, new Map(records
      .filter(record => validHandle(record.handle) && record.followsYou === true)
      .map(record => [record.handle.toLowerCase(), record])));
  }
});
let saveQueue = Promise.resolve();
const builds = new Map();
let nextBuildId = 0;
function sessionFor(tabId) {
  if (!sessions.has(tabId)) sessions.set(tabId, {records: new Map(), responses: 0, parsed: 0, skipped: 0, errors: 0});
  return sessions.get(tabId);
}
browser.webRequest.onBeforeRequest.addListener(details => {
  if (details.tabId < 0 || details.method !== 'GET') return;
  const session = sessionFor(details.tabId);
  let filter;
  try { filter = browser.webRequest.filterResponseData(details.requestId); }
  catch { session.errors++; return; }
  let chunks = [], size = 0;
  session.responses++;
  filter.ondata = event => {
    filter.write(event.data);
    size += event.data.byteLength;
    if (size <= MAX_BYTES) chunks.push(new Uint8Array(event.data));
    else chunks = [];
  };
  filter.onstop = () => {
    filter.close();
    if (sessions.get(details.tabId) !== session) return;
    if (size > MAX_BYTES) { session.skipped++; return; }
    try {
      const decoder = new TextDecoder();
      let body = '';
      for (const chunk of chunks) body += decoder.decode(chunk, {stream: true});
      body += decoder.decode();
      const records = extractRelationships(JSON.parse(body));
      session.parsed++;
      for (const record of records) session.records.set(record.handle.toLowerCase(), record);
      if (records.length) browser.tabs.sendMessage(details.tabId, {type: 'relationships', records}).catch(() => {});
    } catch { session.errors++; }
    chunks = [];
  };
  filter.onerror = () => { session.errors++; chunks = []; };
}, {urls: ['https://x.com/i/api/*'], types: ['xmlhttprequest']}, ['blocking']);
browser.tabs.onRemoved.addListener(tabId => { sessions.delete(tabId); builds.delete(tabId); });
browser.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') {
    sessions.delete(tabId);
    builds.delete(tabId);
    browser.tabs.sendMessage(tabId, {type: 'reset'}).catch(() => {});
  }
});
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (!['snapshot', 'startFollowerBuild', 'finishFollowerBuild'].includes(message.type)) return;
  await cacheReady;
  const tabId = sender.tab?.id ?? message.tabId;
  if (!Number.isInteger(tabId)) return;
  const session = sessionFor(tabId);
  if (message.type === 'startFollowerBuild') {
    if (!sender.tab || !validHandle(message.owner)) {
      return {error: 'Invalid follower-cache request. Reload X and try again.'};
    }
    // X changes routes without replacing the document. The sender's document URL
    // can lag behind that navigation; query the live tab instead.
    let page;
    try {
      const tab = await browser.tabs.get(tabId);
      page = new URL(tab.url);
    } catch {
      return {error: 'Unable to read the current X tab URL. Check extension access to x.com, then reload X.'};
    }
    const route = page.pathname.toLowerCase().replace(/\/$/, '');
    const owner = message.owner.toLowerCase();
    if (page.origin !== 'https://x.com' || route !== `/${owner}/followers`) {
      return {error: `Open your Followers page (/${owner}/followers). Current path detected: ${page.pathname}`};
    }
    const buildId = ++nextBuildId;
    builds.set(tabId, {owner, buildId});
    session.owner = owner;
    return {buildId};
  }
  if (message.type === 'finishFollowerBuild') {
    const build = builds.get(tabId);
    if (!sender.tab || !build || build.buildId !== message.buildId ||
        build.owner !== message.owner?.toLowerCase() || !Array.isArray(message.handles)) {
      return {error: 'This build is no longer active. Start a new build on your Followers page.'};
    }
    const {owner} = build;
    const cache = new Map();
    for (const handle of message.handles) {
      if (!validHandle(handle)) continue;
      const record = {handle, followsYou: true, observedAt: Date.now()};
      cache.set(handle.toLowerCase(), record);
    }
    // Keep the old cache until the replacement has been persisted successfully.
    const save = saveQueue.catch(() => {}).then(async () => {
      const updated = new Map(caches);
      updated.set(owner, cache);
      await browser.storage.local.set({followerCaches: Object.fromEntries(
        [...updated].map(([key, entries]) => [key, [...entries.values()]]))});
      caches.set(owner, cache);
    });
    saveQueue = save;
    await save;
    if (builds.get(tabId) === build) builds.delete(tabId);
    const records = [...cache.values()];
    for (const [id, state] of sessions) {
      if (state.owner !== owner) continue;
      state.records.clear();
      browser.tabs.sendMessage(id, {type: 'cacheReplaced', owner, records}).catch(() => {});
    }
    return {records, count: cache.size};
  }
  if (validHandle(message.owner)) session.owner = message.owner.toLowerCase();
  const cached = validHandle(message.owner) ? caches.get(message.owner.toLowerCase()) : null;
  const combined = new Map(cached || []);
  for (const [handle, record] of session.records) combined.set(handle, record);
  return {...session, records: [...combined.values()], cached: cached?.size || 0};
});
