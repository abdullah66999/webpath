/* Проверка HTML/CSS/JS упражнений в браузере.
   Код ученика исполняется в изолированном iframe с srcdoc (same-origin),
   после чего прогоняются декларации из поля checks. */
(function (global) {
  'use strict';

  var TIMEOUT = 4000;

  function buildDocument(ex, code) {
    var lang = (ex.lang || '').toLowerCase();
    var fixture = ex.fixture || '';
    var markup = ex.markup || '';

    if (lang === 'css') {
      // fixture идёт первым: это нейтральный каркас, он не должен перебивать стили ученика
      return '<!doctype html><html><head><meta charset="utf-8">' + fixture +
             '<style>' + code + '</style></head><body>' + markup + '</body></html>';
    }
    if (lang === 'js' || lang === 'javascript') {
      return '<!doctype html><html><head><meta charset="utf-8">' + fixture +
             '</head><body>' + markup + '<script>' + code + '<\/script></body></html>';
    }
    // html: код ученика и есть документ
    return code.indexOf('<!doctype') === 0 || code.indexOf('<!DOCTYPE') === 0
      ? code
      : '<!doctype html><html><head><meta charset="utf-8">' + fixture + '</head><body>' +
        code + '</body></html>';
  }

  function toRgb(value) {
    var m = String(value).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return String(value).trim().toLowerCase();
    var hex = m[1];
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(hex, 16);
    return 'rgb(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')';
  }

  function normText(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function camel(prop) {
    return String(prop).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
  }

  // Толщину рамки и outline Chromium квантует до целых аппаратных пикселей,
  // поэтому при devicePixelRatio != 1 (масштаб Windows 125%, зум браузера)
  // computed-значение 1px приезжает как 0.8px. Остальные длины не квантуются.
  var SNAP_WIDTH = /^(border(Top|Right|Bottom|Left)?Width|outlineWidth)$/;

  function snapWidth(ctx, prop, value) {
    var name = camel(prop);
    var probe = ctx.doc.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;border-style:solid;outline-style:solid';
    probe.style[name] = value;
    ctx.doc.body.appendChild(probe);
    var got = ctx.win.getComputedStyle(probe)[name];
    probe.remove();
    return got;
  }

  /**
   * Проверка kind:"js" понимает три формы: выражение (`a === b`), несколько
   * инструкций, заканчивающихся выражением, и тело функции с `return`.
   * Прямой eval возвращает значение последней инструкции, а на верхнеуровневый
   * `return` бросает SyntaxError — тогда исполняем как тело функции.
   */
  function evalJs(win, code) {
    var src = String(code);
    try {
      return win.eval(src);
    } catch (e) {
      if (!(e instanceof win.SyntaxError || e instanceof SyntaxError)) throw e;
      return win.eval('(function(){' + src + '})()');
    }
  }

  var INSTRUMENT = '<script>(function(){' +
    'var send=function(m){parent.postMessage({__wp:m},"*")};' +
    'window.onerror=function(m,s,l){parent.postMessage({__wperr:m+" (строка "+l+")"},"*")};' +
    'window.addEventListener("unhandledrejection",function(e){' +
    'parent.postMessage({__wperr:"необработанная ошибка: "+(e.reason&&e.reason.message||e.reason)},"*")});' +
    'var real=window.console;' +
    'window.console=new Proxy(real,{get:function(t,k){' +
    'if(k==="log"||k==="info"||k==="debug"||k==="warn"||k==="error"){' +
    'return function(){try{send(Array.prototype.map.call(arguments,function(a){' +
    'return typeof a==="object"&&a!==null?JSON.stringify(a):String(a)}).join(" "))}catch(e){}' +
    'return t[k].apply(t,arguments)}}' +
    'var v=t[k];return typeof v==="function"?v.bind(t):v}});' +
    '})();<\/script>';

  function instrument(html) {
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, function (m) { return m + INSTRUMENT; });
    if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, function (m) { return m + '<head>' + INSTRUMENT + '</head>'; });
    return INSTRUMENT + html;
  }

  function mount(ex, code) {
    return new Promise(function (resolve) {
      var frame = document.createElement('iframe');
      // allow-same-origin нужен, чтобы проверить DOM и computed-стили ученического кода.
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-modals allow-forms allow-popups');
      frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;height:600px;border:0;visibility:hidden';
      var logs = [];
      var runtimeError = null;
      var done = false;

      function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        var doc = null, win = null;
        try { doc = frame.contentDocument; win = frame.contentWindow; } catch (e) { /* недоступно */ }
        resolve({ frame: frame, doc: doc, win: win, logs: logs, error: runtimeError });
      }

      var timer = setTimeout(function () {
        runtimeError = runtimeError || 'код выполнялся дольше ' + (TIMEOUT / 1000) + ' с';
        finish();
      }, TIMEOUT);

      frame.addEventListener('load', function () { setTimeout(finish, 80); });
      frame.srcdoc = instrument(buildDocument(ex, code));

      function onMessage(ev) {
        if (ev.source !== frame.contentWindow) return;
        var d = ev.data;
        if (!d || typeof d !== 'object') return;
        if (d.__wp !== undefined) logs.push(d.__wp);
        if (d.__wperr !== undefined && runtimeError === null) runtimeError = d.__wperr;
      }
      window.addEventListener('message', onMessage);
      frame.__cleanup = function () { window.removeEventListener('message', onMessage); };
      document.body.appendChild(frame);
    });
  }

  function runCheck(check, ctx) {
    var doc = ctx.doc, label = check.label;

    try {
      if (check.kind === 'dom') {
        var nodes = doc.querySelectorAll(check.selector);
        label = label || ('есть ' + check.selector);
        if (typeof check.count === 'number') {
          return res(label, nodes.length === check.count,
            'элементов: ' + check.count, 'найдено: ' + nodes.length);
        }
        if (typeof check.min === 'number') {
          return res(label, nodes.length >= check.min,
            'минимум ' + check.min, 'найдено: ' + nodes.length);
        }
        return res(label, nodes.length > 0, 'нужен хотя бы один элемент', nodes.length ? 'есть' : 'не найдено');
      }

      if (check.kind === 'text' || check.kind === 'contains') {
        var el = doc.querySelector(check.selector);
        label = label || (check.selector + ' содержит «' + check.contains + '»');
        if (!el) return res(label, false, 'текст «' + check.contains + '»', 'элемент ' + check.selector + ' не найден');
        var got = normText(el.textContent);
        var want = normText(check.contains);
        var ok = check.exact ? got === want : got.toLowerCase().indexOf(want.toLowerCase()) !== -1;
        return res(label, ok, 'текст «' + want + '»', 'текст «' + (got.slice(0, 90) || 'пусто') + '»');
      }

      if (check.kind === 'attr') {
        var a = doc.querySelector(check.selector);
        label = label || (check.selector + '[' + check.name + '=' + check.equals + ']');
        if (!a) return res(label, false, check.equals, 'элемент не найден');
        var v = a.getAttribute(check.name);
        return res(label, v === check.equals, check.name + '="' + check.equals + '"',
          check.name + '="' + (v == null ? 'нет атрибута' : v) + '"');
      }

      if (check.kind === 'css') {
        var s = doc.querySelector(check.selector);
        label = label || (check.selector + ' → ' + check.prop + ': ' + check.equals);
        if (!s) return res(label, false, check.prop + ': ' + check.equals, 'элемент ' + check.selector + ' не найден');
        var computed = ctx.win.getComputedStyle(s)[check.prop] ||
                       ctx.win.getComputedStyle(s).getPropertyValue(check.prop);
        var wantV = /^#|^rgb/i.test(String(check.equals)) ? toRgb(check.equals) : String(check.equals).trim().toLowerCase();
        if (SNAP_WIDTH.test(camel(check.prop))) wantV = String(snapWidth(ctx, check.prop, wantV)).trim().toLowerCase();
        var gotV = toRgb(computed);
        return res(label, gotV === wantV, check.prop + ': ' + wantV, check.prop + ': ' + gotV);
      }

      if (check.kind === 'js') {
        label = label || 'условие: ' + check.code;
        var value;
        try {
          value = evalJs(ctx.win, check.code);
        } catch (e) {
          return res(label, false, 'истина', 'ошибка: ' + e.message);
        }
        return res(label, !!value, 'истина', value === false ? 'ложь' : String(value));
      }
    } catch (e) {
      return res(label || check.kind, false, '', 'сбой проверки: ' + e.message);
    }
    return res('неизвестная проверка ' + check.kind, false, '', '');
  }

  function res(label, passed, expected, got) {
    return { label: label, passed: !!passed, expected: expected, got: got };
  }

  /** Запускает код в изолированном iframe и возвращает результат проверок. */
  async function verify(ex, code) {
    var ctx = await mount(ex, code);
    var results = [];
    var error = ctx.error;

    if (!ctx.doc) {
      error = error || 'не удалось получить доступ к документу предпросмотра';
    } else {
      (ex.checks || []).forEach(function (c) { results.push(runCheck(c, ctx)); });
    }

    var stdout = ctx.logs.join('\n');
    if (ctx.frame.__cleanup) ctx.frame.__cleanup();
    ctx.frame.remove();

    return {
      ok: !error && results.length > 0 && results.every(function (r) { return r.passed; }),
      results: results,
      stdout: stdout,
      error: error || null
    };
  }

  /** Только предпросмотр: вернуть srcdoc-документ для видимого iframe. */
  function previewDocument(ex, code) {
    return buildDocument(ex, code);
  }

  global.Checks = { verify: verify, previewDocument: previewDocument, buildDocument: buildDocument };
})(window);
