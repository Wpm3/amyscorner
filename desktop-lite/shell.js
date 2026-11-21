// Desktop shell helpers injected into index.html for the lite Windows build.
(function () {
  // 1) Never reload: Neutralino's server has no SPA fallback, so reloading on
  //    /reader/<id> would show an error page. Send reloads to the library.
  function goHome() {
    if (location.pathname !== '/') location.replace('/');
  }
  addEventListener(
    'keydown',
    function (e) {
      var k = e.key;
      var ctrl = e.ctrlKey || e.metaKey;
      if (k === 'F5' || k === 'BrowserRefresh' || (ctrl && (k === 'r' || k === 'R'))) {
        e.preventDefault();
        goHome();
        return;
      }
      // 2) F11 toggles real window full screen.
      if (k === 'F11') {
        e.preventDefault();
        toggleFullScreen();
      }
    },
    true,
  );

  // 3) Hide the browser right-click menu (Back / Refresh / Print / Inspect),
  //    but keep it in text fields so copy and paste still work.
  addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
  });

  var native = false;
  function toggleFullScreen() {
    if (native && window.Neutralino) {
      Neutralino.window
        .isFullScreen()
        .then(function (on) {
          return on ? Neutralino.window.exitFullScreen() : Neutralino.window.setFullScreen();
        })
        .catch(fallback);
    } else fallback();
  }
  function fallback() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  }

  if (window.Neutralino && typeof window.NL_PORT !== 'undefined') {
    try {
      Neutralino.init();
      native = true;
    } catch (e) {
      native = false;
    }
  }
  window.__UNFOLD_DESKTOP__ = { toggleFullScreen: toggleFullScreen };
})();
