(function (root) {
  function extractRelationships(payload) {
    const records = new Map(), stack = [payload];
    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== 'object') continue;
      const handle = value.core?.screen_name ?? value.legacy?.screen_name ?? value.screen_name;
      if (typeof handle === 'string' && /^[a-z0-9_]{1,15}$/i.test(handle) &&
          (value.__typename === 'User' || typeof (value.rest_id ?? value.id_str) === 'string')) {
        const flag = [value.relationship_perspectives?.followed_by, value.perspectives?.followed_by,
          value.legacy?.followed_by, value.followed_by].find(flag => typeof flag === 'boolean');
        if (typeof flag === 'boolean') records.set(handle.toLowerCase(), {handle, followsYou: flag});
      }
      for (const child of Object.values(value)) if (child && typeof child === 'object') stack.push(child);
    }
    return [...records.values()];
  }
  root.extractRelationships = extractRelationships;
  if (typeof module !== 'undefined') module.exports = {extractRelationships};
})(globalThis);
