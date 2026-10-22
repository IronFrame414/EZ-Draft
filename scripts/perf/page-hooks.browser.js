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
    mark: function mark(name) {
      if (name === 'pan-start') {
        perf.panStart = performance.now();
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
    onCommitFiberRoot: function onCommitFiberRoot() {
      perf.commits++;
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
