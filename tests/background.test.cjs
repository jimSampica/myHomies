const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {extractRelationships} = require('../relationships.js');
function harness(stored = {}, currentUrl) {
  const listeners = {}, writes = [], messages = [];
  let senderUrl;
  let filter;
  const browser = {
    storage: {local: {get: async () => stored, set: async data => {Object.assign(stored, data);}}},
    webRequest: {onBeforeRequest: {addListener: fn => listeners.request = fn},
      filterResponseData: () => (filter = {write: data => writes.push(data), close() {this.closed = true;}})},
    tabs: {get: async () => ({url: currentUrl || senderUrl}), sendMessage: async (tab, message) => {messages.push({tab, message});},
      onRemoved: {addListener: fn => listeners.remove = fn}, onUpdated: {addListener: fn => listeners.update = fn}},
    runtime: {onMessage: {addListener: fn => listeners.message = fn}}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8'), {browser, URL, TextDecoder, Uint8Array, extractRelationships});
  return {listeners, writes, messages, begin(tabId = 1) {listeners.request({tabId, method: 'GET', requestId: 'r'}); return filter;},
    snapshot(tabId = 1, owner) {return listeners.message({type: 'snapshot', tabId, owner}, {});},
    async save(owner, handles, route = `/${owner}/followers`) {
      senderUrl = `https://x.com${route}`;
      const sender = {tab: {id: 1}, url: senderUrl};
      const result = await listeners.message({type: 'startFollowerBuild', owner}, sender);
      if (result.error) return result;
      return listeners.message({type: 'finishFollowerBuild', owner, handles, buildId: result.buildId}, sender);
    },
    async start(owner = 'Me') {
      senderUrl = `https://x.com/${owner}/followers`;
      return listeners.message({type: 'startFollowerBuild', owner}, {tab: {id: 1}, url: senderUrl});
    },
    finish(buildId, handles, owner = 'Me') {
      return listeners.message({type: 'finishFollowerBuild', owner, handles, buildId}, {tab: {id: 1}, url: senderUrl});
    }};
}
test('forwards original chunks, decodes split UTF-8 and isolates tabs', async () => {
  const h = harness(), filter = h.begin();
  const body = Buffer.from(JSON.stringify({text: '🙂', user: {__typename: 'User', core: {screen_name: 'Alice'}, followed_by: true}}));
  const chunks = [body.subarray(0, 11), body.subarray(11)];
  for (const chunk of chunks) filter.ondata({data: chunk});
  assert.equal(Buffer.concat(h.writes).equals(body), true);
  filter.onstop();
  assert.equal(filter.closed, true);
  assert.equal((await h.snapshot()).records[0].followsYou, true);
  assert.equal((await h.snapshot(2)).records.length, 0);
  h.listeners.update(1, {status: 'loading'});
  assert.equal((await h.snapshot()).records.length, 0);
});
test('invalid JSON still passes through and reports an error', async () => {
  const h = harness(), filter = h.begin();
  filter.ondata({data: Buffer.from('not json')}); filter.onstop();
  assert.equal(Buffer.concat(h.writes).toString(), 'not json');
  assert.equal((await h.snapshot()).errors, 1);
});
test('ignores stale in-flight responses after a reload', async () => {
  const h = harness(), filter = h.begin();
  h.listeners.update(1, {status: 'loading'});
  filter.ondata({data: Buffer.from('{}')}); filter.onstop();
  assert.equal((await h.snapshot()).parsed, 0);
});
test('caps inspection without truncating the delivered response', async () => {
  const h = harness(), filter = h.begin(), bytes = new Uint8Array(8 * 1024 * 1024 + 1);
  filter.ondata({data: bytes}); filter.onstop();
  assert.equal(h.writes[0].byteLength, bytes.byteLength);
  assert.equal((await h.snapshot()).skipped, 1);
});
test('follower cache survives reload and background restart, remains account scoped', async () => {
  const stored = {}, h = harness(stored);
  await h.save('Me', ['Alice', 'Bob']);
  await h.save('me', ['ALICE', 'Carol', 'invalid-handle']);
  h.listeners.update(1, {status: 'loading'});
  assert.equal((await h.snapshot(1, 'ME')).cached, 2);
  assert.equal((await h.snapshot(2, 'someoneElse')).records.length, 0);
  const restarted = harness(stored);
  assert.equal((await restarted.snapshot(2, 'me')).records.length, 2);
});
test('only accepts cache batches from the matching followers route', async () => {
  const h = harness();
  assert.match((await h.save('Me', ['Alice'], '/Other/followers')).error, /Followers page/);
  assert.match((await h.save('Me', ['Alice'], '/Me/following')).error, /Followers page/);
  assert.equal((await h.snapshot(1, 'me')).cached, 0);
});
test('uses current tab URL after X SPA navigation instead of stale sender URL', async () => {
  const h = harness({}, 'https://x.com/JamesSampica/followers');
  const result = await h.save('JamesSampica', ['Alice'], '/home');
  assert.equal(result.count, 1);
});
test('rejects save after navigating away even if sender URL still says followers', async () => {
  const h = harness({}, 'https://x.com/home');
  const result = await h.save('JamesSampica', ['Alice']);
  assert.match(result.error, /Followers page/);
  assert.equal((await h.snapshot(1, 'JamesSampica')).cached, 0);
});
test('fresh explicit false overrides old follower cache for the tab', async () => {
  const h = harness();
  await h.save('Me', ['Alice']);
  const filter = h.begin();
  filter.ondata({data: Buffer.from(JSON.stringify({__typename: 'User', core: {screen_name: 'Alice'}, followed_by: false}))});
  filter.onstop();
  assert.equal((await h.snapshot(1, 'me')).records[0].followsYou, false);
});
test('keeps old cache while building, replaces it on stop and updates open account tabs', async () => {
  const stored = {}, h = harness(stored);
  await h.save('Me', ['OldFollower', 'Alice']);
  await h.save('Other', ['OtherFollower']);
  await h.snapshot(2, 'Me');
  const {buildId} = await h.start();
  assert.equal((await h.snapshot(1, 'Me')).cached, 2);
  await h.finish(buildId, ['Alice']);
  const state = await h.snapshot(1, 'Me');
  assert.equal(state.records.length, 1);
  assert.equal(state.records[0].handle, 'Alice');
  assert.equal((await h.snapshot(3, 'Other')).cached, 1);
  assert.equal(stored.followerCaches.me.length, 1);
  assert.equal(h.messages.some(({tab, message}) => tab === 2 && message.type === 'cacheReplaced'), true);
});
test('finishing an empty run clears the old cache', async () => {
  const h = harness();
  await h.save('Me', ['OldFollower']);
  const {buildId} = await h.start();
  await h.finish(buildId, []);
  assert.equal((await h.snapshot(1, 'Me')).cached, 0);
});
test('closing or reloading during an unfinished build preserves previous cache', async () => {
  const h = harness();
  await h.save('Me', ['OldFollower']);
  const {buildId} = await h.start();
  h.listeners.update(1, {status: 'loading'});
  assert.match((await h.finish(buildId, ['NewFollower'])).error, /no longer active/);
  assert.equal((await h.snapshot(1, 'Me')).records[0].handle, 'OldFollower');
});
