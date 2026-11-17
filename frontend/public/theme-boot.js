/**
 * 首屏主题引导 —— 在样式表加载前把主题落到 <html> 上，避免整页白闪。
 *
 * 为什么需要它：主题 CSS 是渲染阻塞资源，但 <html> 的内联背景要等它才生效。
 * 若先按浅色渲染再切成深色/朋克，用户会看到一次整窗闪动。
 *
 * 与运行时（src/composables/useTheme.ts）保持一致的三件事：
 *  1. 偏好读取顺序：优先读分命名空间的 WeKnora_${userId}_theme，
 *     再回落旧的 WeKnora_theme。上游旧引导脚本只读旧 key，而迁移逻辑
 *     （preferenceStorage.ts）会把旧 key 删除，导致深色用户重载必然白闪。
 *  2. 主题模式取值：light | dark | system | punk（punk 为定制皮肤）。
 *  3. 皮肤属性名：data-theme-skin，须与 config/themePresets.ts 的
 *     THEME_SKIN_ATTR 保持一致。
 *
 * 上游升级时本文件无需改动；只有 themePresets.ts 的属性名/取值变化时才需同步。
 */
(function () {
  'use strict';

  var SKIN_ATTR = 'data-theme-skin';
  var LEGACY_KEY = 'WeKnora_theme';

  /** 与 config/themePresets.ts 的 THEME_PRESETS 保持一致 */
  var PRESET_NATIVE_BG = { punk: '#0b0b0e' };

  function readUserId() {
    try {
      var raw = localStorage.getItem('weknora_user');
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.id ? String(parsed.id) : null;
    } catch (_) {
      return null;
    }
  }

  function readThemeMode() {
    try {
      var uid = readUserId();
      if (uid) {
        var scoped = localStorage.getItem('WeKnora_' + uid + '_theme');
        if (scoped) return scoped;
      }
      // 未登录时运行时读的是 anon 命名空间（preferenceStorage.readUserId 返回 "anon"），
      // 这里必须保持同样的读取顺序，否则引导判定与运行时判定会打架，
      // 运行时会在首屏之后把引导设置的主题覆盖掉。
      var anon = localStorage.getItem('WeKnora_anon_theme');
      if (anon) return anon;
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) return legacy;
    } catch (_) {
      /* 隐私模式 / 存储不可用 */
    }
    return 'light';
  }

  function systemPrefersDark() {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) {
      return false;
    }
  }

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /**
   * 解析并应用主题。可重复调用，幂等。
   */
  function applyThemeBoot() {
    var mode = readThemeMode();
    var surface;
    var skin = 'default';

    if (mode === 'punk') {
      surface = 'dark';
      skin = 'punk';
    } else if (mode === 'system') {
      surface = systemPrefersDark() ? 'dark' : 'light';
    } else if (mode === 'dark' || mode === 'light') {
      surface = mode;
    } else {
      surface = 'light';
    }

    var bg = skin === 'punk'
      ? (PRESET_NATIVE_BG.punk || '#0b0b0e')
      : (surface === 'dark' ? '#181818' : '#eeeeee');

    var root = document.documentElement;
    root.setAttribute('theme-mode', surface);
    root.setAttribute(SKIN_ATTR, skin);
    root.style.background = bg;
    root.style.minHeight = '100%';
    root.style.colorScheme = surface === 'dark' ? 'dark' : 'light';

    if (document.body) {
      document.body.style.background = bg;
      document.body.style.minHeight = '100%';
    }

    var appEl = document.getElementById('app');
    if (appEl) {
      appEl.style.background = bg;
      appEl.style.minHeight = '100%';
    }

    // 原生窗口（Wails）底色与系统深浅色同步，减少 Ctrl+R 整窗闪动
    try {
      var w = window.runtime;
      if (w) {
        if (surface === 'dark') {
          if (w.WindowSetDarkTheme) w.WindowSetDarkTheme();
        } else {
          if (w.WindowSetLightTheme) w.WindowSetLightTheme();
        }
        var rgb = hexToRgb(bg);
        if (rgb && w.WindowSetBackgroundColour) {
          w.WindowSetBackgroundColour(rgb.r, rgb.g, rgb.b, 255);
        }
      }
    } catch (_) {
      /* 非桌面壳或未注入 runtime */
    }
  }

  // 立即应用一次（此时 <body> 已存在），并在 DOM 就绪后再补一次覆盖 #app
  applyThemeBoot();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyThemeBoot);
  } else {
    applyThemeBoot();
  }

  // 供其它早期脚本复用
  window.__wkThemeBoot = applyThemeBoot;
})();
