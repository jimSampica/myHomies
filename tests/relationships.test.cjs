const {test} = require('node:test');
const assert = require('node:assert/strict');
const {extractRelationships} = require('../relationships.js');
const user = (handle, legacy) => ({__typename: 'User', rest_id: '123', legacy: {screen_name: handle, ...legacy}});
test('finds nested explicit true and false, ignores opposite and missing relationships', () => {
  assert.deepEqual(extractRelationships({timeline: [user('Alice', {followed_by: true}),
    user('Bob', {followed_by: false}), user('Carol', {following: true}), user('Dan', {})]}).sort((a,b) => a.handle.localeCompare(b.handle)),
  [{handle: 'Alice', followsYou: true}, {handle: 'Bob', followsYou: false}]);
});
test('supports core handles and perspective fields, rejects loose truthiness and unrelated objects', () => {
  assert.deepEqual(extractRelationships([
    {__typename: 'User', core: {screen_name: 'Alice'}, relationship_perspectives: {followed_by: true}},
    user('Bob', {followed_by: 'true'}), {screen_name: 'Fake', followed_by: true},
    user('invalid-handle', {followed_by: true})]), [{handle: 'Alice', followsYou: true}]);
});
test('handles nulls and deduplicates case-insensitive handles', () => {
  assert.deepEqual(extractRelationships([null, user('Alice', {followed_by: true}), user('ALICE', {followed_by: true})]).length, 1);
});
