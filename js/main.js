/* ===========================================================
 *  main.js —— 启动引导与主循环
 * =========================================================== */
(function () {
  'use strict';
  const SW = window.SW;

  function boot() {
    const canvas = document.getElementById('galaxy');
    const game = new SW.Game(canvas);
    const ui = new SW.UIManager(game);
    SW._ui = ui;
    SW._gameInstance = game;

    /* 画布尺寸（含 DPR） */
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth, h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      game.renderer.dpr = dpr;
      game.renderer.canvas = canvas;
      game.camera.canvas = canvas;
    }
    window.addEventListener('resize', resize);
    resize();

    /* 启动 */
    game.newGame({});
    ui.bindKeys();
    ui.refresh();

    /* 主循环 */
    let last = performance.now();
    let uiAcc = 0;
    function frame(now) {
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.25) dt = 0.25;      // 防止切后台后一次性推进过多
      game.update(dt);
      uiAcc += dt;
      if (uiAcc >= 0.22) { uiAcc = 0; ui.refresh(); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    /* 调试接口 */
    window.SWGame = game;
    console.log('%c[星际战争] 银河已启动', 'color:#5ce1e6;font-weight:bold');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
