/* global window, document, navigator, performance, PerformanceObserver, requestAnimationFrame */
// EZD-017 Step 4 (vault/plans/EZD-017.md H1, H2, section 3 H-row): loaded with context.addInitScript({ path })
// so it runs before any page script. Counts React commits through the devtools hook React DOM calls, records
// long tasks, service worker script URLs and, between the pan marks only, animation frame times.
(function installPerfHooks() {
  var perf = {
    commits: 0,
    renderers: 0,
    longTasks: [],
    swUrls: [],
    rafTimes: [],
    panStart: null,
    panEnd: null,
    // EZD-359: pan-start is also a user-timing mark, the anchor for the pan's trace.
    mark: function mark(name) {
      if (name === 'pan-start') {
        perf.panStart = performance.mark('ezd-pan-start').startTime;
        rafRunning = true;
        requestAnimationFrame(onFrame);
      } else if (name === 'pan-end') {
        perf.panEnd = performance.now();
        rafRunning = false;
      }
    },
  };
  var rafRunning = false;
  function onFrame(t) {
    if (!rafRunning) return;
    perf.rafTimes.push(t);
    requestAnimationFrame(onFrame);
  }
  window.__EZD_PERF__ = perf;

  // EZD-1976: with traceCommits on, each commit records which components rendered first (a component whose parent
  // did not render: the one whose own state or store changed), so a test that counts commits can say who committed.
  // Off by default: the walk costs time the pan and load measurements must not pay.
  perf.traceCommits = false;
  perf.commitLog = [];
  var COMPOSITE = { 0: true, 1: true, 11: true, 14: true, 15: true };
  function hostName(fiber) {
    for (var f = fiber; f; f = f.child) {
      if (f.tag === 5 && f.stateNode && f.stateNode.getAttribute) {
        var el = f.stateNode;
        return (
          el.getAttribute('data-testid') ||
          el.getAttribute('data-shell-region') ||
          el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
        );
      }
    }
    return '';
  }
  function fiberName(fiber) {
    var t = fiber.type;
    var name = '';
    if (typeof t === 'function') name = t.displayName || t.name;
    else if (t && typeof t === 'object')
      name = t.displayName || (t.render && t.render.name) || (t.type && t.type.name);
    return (name || '?') + '<' + hostName(fiber) + '>';
  }
  function changedHooks(next, prev) {
    var out = [];
    var a = next.memoizedState;
    var b = prev.memoizedState;
    for (var i = 0; a && b && typeof a === 'object' && 'next' in a; i++, a = a.next, b = b.next) {
      if (a.queue && a.memoizedState !== b.memoizedState) out.push(i);
    }
    return out;
  }
  function walk(next, prev, parentRendered, path, out) {
    var rendered = COMPOSITE[next.tag] === true && (next.flags & 1) === 1;
    var here = COMPOSITE[next.tag] === true ? path.concat(fiberName(next)) : path;
    if (rendered && !parentRendered) {
      out.push({ who: here.slice(-4).join(' > '), hooks: changedHooks(next, prev) });
    }
    if (next.child === prev.child) return;
    var inside = COMPOSITE[next.tag] === true ? rendered : parentRendered;
    for (var c = next.child; c; c = c.sibling) {
      if (c.alternate) walk(c, c.alternate, inside, here, out);
      else if (COMPOSITE[c.tag] === true && !inside) out.push({ who: here.concat(fiberName(c)).slice(-4).join(' > '), mounted: true });
    }
  }
  function traceCommit(root) {
    try {
      var out = [];
      if (root.current.alternate) walk(root.current, root.current.alternate, false, [], out);
      perf.commitLog.push({ t: Math.round(performance.now()), n: perf.commits, first: out });
      if (perf.commitLog.length > 200) perf.commitLog.shift();
    } catch (e) {
      perf.commitLog.push({ t: Math.round(performance.now()), n: perf.commits, error: String(e) });
    }
  }

  // H1: React DOM production calls inject at start-up and onCommitFiberRoot once per commit.
  var n = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject: function inject(r) {
      var id = ++n;
      this.renderers.set(id, r);
      perf.renderers++;
      return id;
    },
    onCommitFiberRoot: function onCommitFiberRoot(_id, root) {
      perf.commits++;
      if (perf.traceCommits) traceCommit(root);
    },
    onCommitFiberUnmount: function onCommitFiberUnmount() {},
    onPostCommitFiberRoot: function onPostCommitFiberRoot() {},
    onScheduleFiberRoot: function onScheduleFiberRoot() {},
    setStrictMode: function setStrictMode() {},
    checkDCE: function checkDCE() {},
  };

  // H2: main-thread tasks over 50 ms (Long Tasks API), including those before this script ran.
  new PerformanceObserver(function onLongTasks(list) {
    list.getEntries().forEach(function (e) {
      perf.longTasks.push({ startTime: e.startTime, duration: e.duration });
    });
  }).observe({ type: 'longtask', buffered: true });

  // H2: URLs passed to navigator.serviceWorker.register (S2: never counted as page JavaScript).
  var container = navigator.serviceWorker && Object.getPrototypeOf(navigator.serviceWorker);
  if (container && typeof container.register === 'function') {
    var original = container.register;
    container.register = function register(url) {
      perf.swUrls.push(new URL(url, document.location.href).href);
      return original.apply(this, arguments);
    };
  }
})();
