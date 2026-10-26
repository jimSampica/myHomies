// Learn the active theme from X's own mention links rather than fixing a color.
(() => {
  const originals = new Map();
  let classCache, classCacheTime = 0, lastTheme = null;
  function colorClasses() {
    if (classCache && Date.now() - classCacheTime < 5000) return classCache;
    const classes = new Map();
    function visit(rules) {
      for (const rule of rules) {
        if (rule.selectorText && rule.style?.color) {
          const match = rule.selectorText.match(/^\.([a-zA-Z_][\w-]*)$/);
          // Only reuse color-only utilities; never copy layout or typography.
          if (match && [...rule.style].every(key => key === 'color')) classes.set(match[1], rule.style.color);
        }
        try { if (rule.cssRules) visit(rule.cssRules); } catch { /* inaccessible stylesheet */ }
      }
    }
    for (const sheet of document.styleSheets) {
      try { visit(sheet.cssRules); } catch { /* cross-origin stylesheets */ }
    }
    classCache = classes; classCacheTime = Date.now();
    return classes;
  }
  function nativeColor() {
    const classes = colorClasses();
    for (const link of document.querySelectorAll('article[data-testid="tweet"] a[href]')) {
      if (link.closest('[data-testid="User-Name"]') || !link.textContent.trim().startsWith('@')) continue;
      for (const element of [link, ...link.querySelectorAll('span')]) {
        const color = getComputedStyle(element).color;
        const nameColor = getComputedStyle(link.closest('article').querySelector('[data-testid="User-Name"]') || link).color;
        if (!color || color === nameColor || color === 'rgba(0, 0, 0, 0)') continue;
        const nativeClass = [...element.classList].find(name => classes.get(name) === color);
        // X sometimes supplies its theme color inline instead of as a utility class.
        lastTheme = {color, nativeClass, classes};
        return lastTheme;
      }
    }
    return lastTheme;
  }
  function restore(element) {
    const original = originals.get(element);
    if (!original) return;
    for (const name of original.added) element.classList.remove(name);
    for (const name of original.removed) element.classList.add(name);
    if (original.color) element.style.setProperty('color', original.color, original.priority);
    else element.style.removeProperty('color');
    originals.delete(element);
  }
  globalThis.myHomiesNameColor = {
    refresh: nativeColor,
    apply(link, theme) {
      if (!theme) return;
      for (const element of [link, ...link.querySelectorAll('span, div')]) {
        restore(element);
        const original = {color: element.style.getPropertyValue('color'), priority: element.style.getPropertyPriority('color'), added: [], removed: []};
        for (const name of [...element.classList]) {
          if (theme.classes.has(name) && name !== theme.nativeClass) {
            element.classList.remove(name); original.removed.push(name);
          }
        }
        if (theme.nativeClass) {
          element.style.removeProperty('color');
          if (!element.classList.contains(theme.nativeClass)) {
            element.classList.add(theme.nativeClass); original.added.push(theme.nativeClass);
          }
        } else element.style.setProperty('color', theme.color);
        originals.set(element, original);
      }
    },
    clearExcept(active) {
      for (const element of originals.keys()) if (!active.has(element)) restore(element);
    }
  };
})();
