(async () => {
  const status = document.getElementById('status');
  try {
    const [tab] = await browser.tabs.query({active: true, currentWindow: true});
    const identity = await browser.tabs.sendMessage(tab.id, {type: 'identity'}).catch(() => ({}));
    const result = await browser.runtime.sendMessage({type: 'snapshot', tabId: tab.id, owner: identity.owner});
    status.textContent = result.records.length ? 'Relationship data detected.' : result.parsed ?
      'Responses read, but no explicit follower relationships found yet.' :
      'No X responses read in this tab yet. Open x.com and refresh.';
    const stats = {'Responses observed': result.responses, 'JSON responses read': result.parsed,
      'Accounts with explicit status': result.records.length,
      'Confirmed followers': result.records.filter(record => record.followsYou).length,
      'Saved followers for this account': result.cached,
      'Oversized responses skipped': result.skipped, 'Read / parse errors': result.errors};
    for (const [label, value] of Object.entries(stats)) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value;
      document.getElementById('stats').append(dt, dd);
    }
  } catch { status.textContent = 'Unable to read this tab. Reload the extension and X.'; }
})();
