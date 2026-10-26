const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function element(names = [], color = '') {
  const classes = new Set(names), values = new Map(color ? [['color', color]] : []);
  return {
    classList: { [Symbol.iterator]: () => classes.values(), contains: n => classes.has(n), add: n => classes.add(n), remove: n => classes.delete(n)},
    style: {getPropertyValue: n => values.get(n) || '', getPropertyPriority: () => '', setProperty: (n,v) => values.set(n,v), removeProperty: n => values.delete(n)},
    querySelectorAll: () => [], classes
  };
}
function harness(document = {styleSheets: [], querySelectorAll: () => []}) {
  const context = vm.createContext({document, getComputedStyle: el => ({color: el.computedColor}), Date});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../name-color.js'), 'utf8'), context);
  return context.myHomiesNameColor;
}
test('reuses native color utility, removes conflicting color and restores original styles', () => {
  const api = harness(), link = element(['layout', 'muted'], 'gray');
  const theme = {nativeClass: 'primary', color: 'teal', classes: new Map([['primary', 'teal'], ['muted', 'gray']])};
  api.apply(link, theme);
  assert.deepEqual([...link.classes], ['layout', 'primary']);
  assert.equal(link.style.getPropertyValue('color'), '');
  api.apply(link, theme);
  api.clearExcept(new Set());
  assert.deepEqual([...link.classes], ['layout', 'muted']);
  assert.equal(link.style.getPropertyValue('color'), 'gray');
});
test('uses native inline theme color when no X utility exists and restores afterward', () => {
  const api = harness(), link = element(['layout']);
  api.apply(link, {color: 'rgb(0, 186, 124)', classes: new Map()});
  assert.equal(link.style.getPropertyValue('color'), 'rgb(0, 186, 124)');
  api.clearExcept(new Set());
  assert.equal(link.style.getPropertyValue('color'), '');
});
test('learns primary class from X mention and keeps it when mention scrolls away', () => {
  const mention = element(['native-primary']);
  mention.computedColor = 'rgb(0, 186, 124)'; mention.textContent = '@Someone';
  mention.closest = selector => selector === 'article' ? {querySelector: () => ({computedColor: 'white'})} : null;
  const style = ['color']; style.color = mention.computedColor;
  let mentions = [mention];
  const api = harness({styleSheets: [{cssRules: [{selectorText: '.native-primary', style}]}], querySelectorAll: () => mentions});
  assert.equal(api.refresh().nativeClass, 'native-primary');
  mentions = [];
  assert.equal(api.refresh().color, mention.computedColor);
});
