/* «Путь веб-разработчика» — одностраничное приложение.
   Роутинг по hash, состояние в памяти, прогресс на сервере, черновики кода в localStorage. */
(function () {
  'use strict';

  var DRAFT_PREFIX = 'webpath.draft.';
  var CHECKS_PREFIX = 'webpath.checks.';

  /* ------------------------------------------------------------------ */
  /* Утилиты                                                             */
  /* ------------------------------------------------------------------ */
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function esc(s) { return MD.escape(s == null ? '' : s); }
  function icon(name) { return '<svg><use href="#i-' + name + '"/></svg>'; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function toast(msg, kind) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = 'toast'; }, 2600);
  }

  function ring(pct, size, stroke) {
    size = size || 20; stroke = stroke || 2.6;
    var r = (size - stroke) / 2;
    var c = 2 * Math.PI * r;
    var k = size / 2;
    return '<svg class="nav-ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
      '<circle class="ring-bg" cx="' + k + '" cy="' + k + '" r="' + r + '" fill="none" stroke-width="' + stroke + '"></circle>' +
      '<circle class="ring-fg" cx="' + k + '" cy="' + k + '" r="' + r + '" fill="none" stroke-width="' + stroke + '"' +
      ' stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + (c * (1 - pct)).toFixed(2) + '"' +
      ' transform="rotate(-90 ' + k + ' ' + k + ')"></circle></svg>';
  }

  function stageVars(stage) {
    var g = stage.gradient || ['#6366f1', '#22d3ee'];
    return '--stage-a:' + g[0] + ';--stage-b:' + g[1];
  }

  async function api(path, opts) {
    var res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
    var data = null;
    try { data = await res.json(); } catch (e) { /* пустой ответ */ }
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data;
  }

  /* ------------------------------------------------------------------ */
  /* Состояние                                                           */
  /* ------------------------------------------------------------------ */
  var S = {
    boot: null,
    resources: null,
    games: null,
    flat: [],          // все уроки плоским списком в порядке программы
    byId: {},          // id урока -> мета
    stageById: {},
    lesson: null,      // открытый урок
    filter: { group: null, lang: null, free: null, q: '' }
  };

  function progressOf(lessonId) {
    var p = S.boot.progress;
    return {
      lesson: !!p.lessons[lessonId],
      exercises: p.exercises[lessonId] || {}
    };
  }

  function stageStats(stage) {
    var ids = [];
    stage.modules.forEach(function (m) { m.lessons.forEach(function (l) { ids.push(l.id); }); });
    var done = ids.filter(function (id) { return progressOf(id).lesson; }).length;
    return { total: ids.length, done: done, pct: ids.length ? done / ids.length : 0 };
  }

  function firstUnfinished() {
    for (var i = 0; i < S.flat.length; i++) {
      if (S.flat[i].available !== false && !progressOf(S.flat[i].id).lesson) return S.flat[i].id;
    }
    return S.flat.length ? S.flat[0].id : null;
  }

  function neighbors(lessonId) {
    var i = S.flat.findIndex(function (l) { return l.id === lessonId; });
    return {
      prev: i > 0 ? S.flat[i - 1] : null,
      next: i >= 0 && i < S.flat.length - 1 ? S.flat[i + 1] : null,
      index: i
    };
  }

  function flatIndex() {
    S.flat = []; S.byId = {}; S.stageById = {};
    S.boot.stages.forEach(function (stage) {
      S.stageById[stage.id] = stage;
      stage.modules.forEach(function (m) {
        m.lessons.forEach(function (l) {
          var item = Object.assign({}, l, { stageId: stage.id, moduleId: m.id, moduleTitle: m.title });
          S.flat.push(item);
          S.byId[l.id] = item;
        });
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Каркас: сайдбар, крошки, поиск                                      */
  /* ------------------------------------------------------------------ */
  function renderSidebar() {
    var nav = $('#sideNav');
    var html = '<div class="side-label">Программа</div>';

    html += navButton('#/', 'Дашборд', 'compass', routeIs('home'));
    html += navButton('#/resources', 'Библиотека ресурсов', 'book', routeIs('resources'));
    html += navButton('#/games', 'Мини-игры', 'rocket', routeIs('games'));

    html += '<div class="side-label">Этапы</div>';
    S.boot.stages.forEach(function (stage, n) {
      var st = stageStats(stage);
      var active = routeIs('stage') && currentStageId() === stage.id ||
                   routeIs('lesson') && S.lesson && S.lesson.stage === stage.id;
      html += '<button class="nav-item' + (active ? ' active' : '') + '" data-go="#/stage/' + stage.id +
        '" style="' + stageVars(stage) + '">' +
        '<span class="nav-num">' + (n + 1) + '</span>' +
        '<span class="nav-name" title="' + esc(stage.title) + '">' + esc(stage.title) + '</span>' +
        ring(st.pct) + '</button>';
    });

    nav.innerHTML = html;

    var total = S.flat.length, done = S.boot.stats.lessonsDone;
    $('#footProgress').textContent = total ? (done + ' из ' + total + ' уроков') : '—';
  }

  function navButton(href, label, iconName, active) {
    return '<button class="nav-item' + (active ? ' active' : '') + '" data-go="' + href + '">' +
      '<span class="nav-num">' + icon(iconName) + '</span>' +
      '<span class="nav-name">' + esc(label) + '</span></button>';
  }

  function routeIs(kind) { return S.route && S.route.kind === kind; }
  function currentStageId() { return S.route && S.route.id; }

  function renderCrumbs(parts) {
    $('#crumbs').innerHTML = parts.map(function (p, i) {
      var last = i === parts.length - 1;
      var sep = i ? '<span class="sep">/</span>' : '';
      return sep + (p.href && !last
        ? '<a href="' + p.href + '" style="color:inherit;text-decoration:none">' + esc(p.text) + '</a>'
        : '<b>' + esc(p.text) + '</b>');
    }).join('');
  }

  /* --- поиск --- */
  function initSearch() {
    var input = $('#searchInput'), hits = $('#searchHits'), sel = -1, results = [];

    function close() { hits.hidden = true; sel = -1; }

    function search(q) {
      q = q.trim().toLowerCase();
      if (q.length < 2) { close(); return; }
      results = S.flat.filter(function (l) {
        return l.available !== false && (
          l.title.toLowerCase().indexOf(q) !== -1 ||
          (l.subtitle || '').toLowerCase().indexOf(q) !== -1 ||
          (l.moduleTitle || '').toLowerCase().indexOf(q) !== -1 ||
          (S.stageById[l.stageId] || {}).title.toLowerCase().indexOf(q) !== -1
        );
      }).slice(0, 12);

      if (!results.length) {
        hits.innerHTML = '<div class="search-empty">Ничего не нашлось по «' + esc(q) + '»</div>';
      } else {
        hits.innerHTML = results.map(function (l, i) {
          return '<button class="search-hit' + (i === sel ? ' sel' : '') + '" data-go="#/lesson/' + l.id + '">' +
            esc(l.title) + '<small>' + esc((S.stageById[l.stageId] || {}).title || '') + '</small></button>';
        }).join('');
      }
      hits.hidden = false;
    }

    input.addEventListener('input', function () { search(input.value); });
    input.addEventListener('focus', function () { if (input.value) search(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); input.blur(); return; }
      if (!results.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
        $$('.search-hit', hits).forEach(function (b, i) { b.classList.toggle('sel', i === sel); });
      } else if (e.key === 'Enter' && sel >= 0) {
        location.hash = '#/lesson/' + results[sel].id;
        close(); input.blur();
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search')) close();
    });
    hits.addEventListener('click', close);
  }

  /* ------------------------------------------------------------------ */
  /* Роутер                                                              */
  /* ------------------------------------------------------------------ */
  function parseRoute() {
    var h = (location.hash || '#/').replace(/^#/, '');
    var parts = h.split('/').filter(Boolean);
    if (!parts.length) return { kind: 'home' };
    if (parts[0] === 'stage' && parts[1]) return { kind: 'stage', id: parts[1] };
    if (parts[0] === 'lesson' && parts[1]) return { kind: 'lesson', id: parts[1] };
    if (parts[0] === 'resources') return { kind: 'resources', id: parts[1] || null };
    if (parts[0] === 'games') return { kind: 'games' };
    if (parts[0] === 'game' && parts[1]) return { kind: 'game', id: parts[1] };
    return { kind: 'home' };
  }

  async function route() {
    S.route = parseRoute();
    var view = $('#view');
    Games.dispose();
    view.innerHTML = '<div class="loading"><div class="spinner"></div><span>Загружаем…</span></div>';
    closeSidebar();

    try {
      if (S.route.kind === 'lesson') {
        S.lesson = await api('/api/lesson/' + encodeURIComponent(S.route.id));
        renderLesson(view, S.lesson);
      } else if (S.route.kind === 'stage') {
        S.lesson = null;
        renderStage(view, S.route.id);
      } else if (S.route.kind === 'resources') {
        S.lesson = null;
        if (!S.resources) S.resources = await api('/api/resources');
        renderResources(view, S.resources);
      } else if (S.route.kind === 'games' || S.route.kind === 'game') {
        S.lesson = null;
        if (!S.games) S.games = await api('/api/games');
        if (S.route.kind === 'games') {
          Games.renderHub(view, gameCtx(), S.games);
        } else {
          var game = S.games.games.filter(function (g) { return g.id === S.route.id; })[0];
          if (!game) throw new Error('игра «' + S.route.id + '» не найдена');
          Games.renderPlay(view, gameCtx(), game);
        }
      } else {
        S.lesson = null;
        renderHome(view);
      }
    } catch (e) {
      view.innerHTML = '<div class="empty glass"><h3>Не удалось открыть</h3><p>' + esc(e.message) + '</p>' +
        '<p style="margin-top:18px"><a class="btn btn-primary" href="#/">На дашборд</a></p></div>';
      renderCrumbs([{ text: 'Ошибка' }]);
    }
    renderSidebar();
    window.scrollTo({ top: 0 });
  }

  /** То, что нужно играм из общего кода приложения. */
  function gameCtx() {
    return {
      api: api,
      toast: toast,
      crumbs: renderCrumbs,
      stageVars: stageVars,
      go: function (href) { if (location.hash === href) route(); else location.hash = href; },
      onRecord: function (records) { if (S.games) S.games.records = records; }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Дашборд                                                             */
  /* ------------------------------------------------------------------ */
  function renderHome(view) {
    var st = S.boot.stats;
    var pct = st.lessonsTotal ? st.lessonsDone / st.lessonsTotal : 0;
    var target = firstUnfinished();
    var targetLesson = target ? S.byId[target] : null;
    var continueLabel = st.lessonsDone ? 'Продолжить обучение' : 'Начать обучение';
    var continueSub = targetLesson ? targetLesson.title : '';

    renderCrumbs([{ text: 'Дашборд' }]);

    var html = '';
    html += '<section class="hero glass reveal">' +
      '<div class="hero-inner">' +
        '<span class="pill accent">' + icon('flame') + ' ' + st.lessonsTotal + ' уроков · ' +
          Math.round(st.minutesTotal / 60) + ' ч материала</span>' +
        '<h1>' + esc(S.boot.title) + '</h1>' +
        '<p class="lead">' + esc(S.boot.tagline) + '. Теория, живые примеры с запуском кода и ' +
          'упражнения с автоматической проверкой — прямо в браузере, без интернета.</p>' +
        '<div class="hero-actions">' +
          (target ? '<a class="btn btn-primary" href="#/lesson/' + target + '">' + icon('play') + ' ' + continueLabel + '</a>' : '') +
          '<a class="btn" href="#/games">' + icon('rocket') + ' Мини-игры</a>' +
          '<a class="btn" href="#/resources">' + icon('book') + ' Библиотека ресурсов</a>' +
        '</div>' +
        (targetLesson ? '<p style="margin:14px 0 0;font-size:13px;color:var(--text-mute)">Дальше по программе: <b style="color:var(--text-dim)">' +
          esc(continueSub) + '</b></p>' : '') +
      '</div></section>';

    html += '<div class="metrics">' +
      metric(Math.round(pct * 100) + '%', 'пройдено', true) +
      metric(st.lessonsDone + ' / ' + st.lessonsAvailable, 'уроков закрыто', false) +
      metric(st.exercisesDone, 'решено упражнений', false) +
      metric(S.boot.stages.length, 'этапов программы', false) +
    '</div>';

    html += '<div class="glass reveal" style="padding:20px 22px;margin-bottom:8px">' +
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:12px">' +
        '<div style="flex:1">' +
          '<div style="font-size:13px;color:var(--text-dim);margin-bottom:7px">Общий прогресс программы</div>' +
          '<div class="bar"><span style="width:' + (pct * 100).toFixed(1) + '%"></span></div>' +
        '</div>' +
      '</div></div>';

    html += '<div class="section-head"><h2>Этапы пути</h2><span>от разметки до деплоя</span></div>';
    html += '<div class="stages">';
    S.boot.stages.forEach(function (stage, n) {
      var s = stageStats(stage);
      var mins = stage.modules.reduce(function (a, m) {
        return a + m.lessons.reduce(function (b, l) { return b + (l.duration || 0); }, 0);
      }, 0);
      html += '<button class="stage-card glass reveal" data-go="#/stage/' + stage.id + '" style="' + stageVars(stage) + '">' +
        '<div class="stage-top">' +
          '<span class="stage-ico">' + icon(stage.icon || 'code') + '</span>' +
          '<span style="flex:1;min-width:0">' +
            '<div class="stage-no">ЭТАП ' + (n + 1) + '</div>' +
            '<h3>' + esc(stage.title) + '</h3>' +
            '<p class="tag">' + esc(stage.tagline) + '</p>' +
          '</span>' +
        '</div>' +
        '<div class="stage-meta">' +
          '<span>' + s.done + '/' + s.total + '</span>' +
          '<span class="bar"><span style="width:' + (s.pct * 100).toFixed(1) + '%"></span></span>' +
          '<span>' + Math.round(mins / 60) + ' ч</span>' +
        '</div>' +
      '</button>';
    });
    html += '</div>';

    view.innerHTML = html;
  }

  function metric(k, l, grad) {
    return '<div class="metric glass reveal"><div class="k' + (grad ? ' grad' : '') + '">' + esc(k) +
      '</div><div class="l">' + esc(l) + '</div></div>';
  }

  /* ------------------------------------------------------------------ */
  /* Страница этапа                                                      */
  /* ------------------------------------------------------------------ */
  function renderStage(view, stageId) {
    var stage = S.stageById[stageId];
    if (!stage) { view.innerHTML = '<div class="empty glass"><h3>Этап не найден</h3></div>'; return; }
    var s = stageStats(stage);
    renderCrumbs([{ text: 'Программа', href: '#/' }, { text: stage.title }]);

    var html = '<div class="page-head reveal" style="' + stageVars(stage) + '">' +
      '<span class="pill accent">' + icon(stage.icon || 'code') + ' Этап ' + stage.order + '</span>' +
      '<h1>' + esc(stage.title) + '</h1>' +
      '<p>' + esc(stage.tagline) + '</p>' +
      '<div style="display:flex;align-items:center;gap:14px;max-width:420px">' +
        '<div class="bar" style="flex:1"><span style="width:' + (s.pct * 100).toFixed(1) + '%"></span></div>' +
        '<span style="font-size:13px;color:var(--text-mute)">' + s.done + ' из ' + s.total + '</span>' +
      '</div>' +
    '</div>';

    stage.modules.forEach(function (m, mi) {
      var mDone = m.lessons.filter(function (l) { return progressOf(l.id).lesson; }).length;
      html += '<div class="module glass reveal" style="' + stageVars(stage) + '">' +
        '<div class="module-head">' +
          '<span class="nav-num" style="width:24px;height:24px;border-radius:8px">' + (mi + 1) + '</span>' +
          '<h3>' + esc(m.title) + '</h3>' +
          '<span class="count">' + mDone + '/' + m.lessons.length + '</span>' +
        '</div>';
      m.lessons.forEach(function (l) {
        var p = progressOf(l.id);
        var off = l.available === false;
        html += '<button class="lesson-row" data-go="' + (off ? '' : '#/lesson/' + l.id) + '"' + (off ? ' disabled' : '') + '>' +
          '<span class="tick' + (p.lesson ? ' done' : '') + '">' + icon('check') + '</span>' +
          '<span class="lesson-main">' +
            '<span class="lesson-title">' + esc(l.title || l.id) + '</span>' +
            (l.subtitle ? '<span class="lesson-sub">' + esc(l.subtitle) + '</span>' : '') +
          '</span>' +
          '<span class="lesson-badges">' +
            (off ? '<span class="pill todo">в работе</span>'
                 : '<span class="pill">' + icon('clock') + ' ' + (l.duration || 10) + ' мин</span>' +
                   '<span class="pill' + (l.autoChecked ? ' ok' : '') + '">' + l.exercises + ' упр.</span>') +
          '</span>' +
        '</button>';
      });
      html += '</div>';
    });

    var nextStage = S.boot.stages.find(function (x) { return x.order === stage.order + 1; });
    html += '<div class="lesson-nav"><span></span>' +
      (nextStage
        ? '<button class="lesson-nav-btn next" data-go="#/stage/' + nextStage.id + '" style="' + stageVars(nextStage) + '">' +
          '<span class="dir">Следующий этап</span><span class="nm">' + esc(nextStage.title) + ' →</span></button>'
        : '<span></span>') + '</div>';

    view.innerHTML = html;
  }

  /* ------------------------------------------------------------------ */
  /* Урок                                                                */
  /* ------------------------------------------------------------------ */
  function renderLesson(view, L) {
    var stage = S.stageById[L.stage] || { title: 'Этап', gradient: ['#6366f1', '#22d3ee'], icon: 'code', order: 0 };
    var nb = neighbors(L.id);
    var p = progressOf(L.id);
    renderCrumbs([
      { text: 'Программа', href: '#/' },
      { text: stage.title, href: '#/stage/' + stage.id },
      { text: L.title }
    ]);

    var diff = { beginner: 'начальный', intermediate: 'средний', advanced: 'продвинутый' }[L.difficulty] || L.difficulty;

    var html = '<article style="' + stageVars(stage) + '">';
    html += '<header class="lesson-head reveal">' +
      '<span class="pill accent">' + icon(stage.icon || 'code') + ' ' + esc(stage.title) + '</span>' +
      '<h1>' + esc(L.title) + '</h1>' +
      (L.subtitle ? '<p class="sub">' + esc(L.subtitle) + '</p>' : '') +
      '<div class="lesson-meta">' +
        '<span class="pill">' + icon('clock') + ' ' + (L.duration || 10) + ' мин</span>' +
        '<span class="pill">' + esc(diff) + '</span>' +
        '<span class="pill">' + (L.exercises || []).length + ' упражнений</span>' +
        '<span class="pill' + (p.lesson ? ' ok' : '') + '" id="lessonState">' +
          (p.lesson ? icon('check') + ' пройден' : 'не пройден') + '</span>' +
      '</div>' +
    '</header>';

    if ((L.objectives || []).length) {
      html += '<div class="objectives glass reveal"><h4>После этого урока вы сможете</h4><ul>' +
        L.objectives.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ul></div>';
    }

    html += '<div class="prose reveal" id="prose">' + MD.render(L.body || '') + '</div>';

    // примеры с запуском
    if ((L.examples || []).length) {
      html += '<div class="exercises-head"><h2>Разобранные примеры</h2></div>';
      L.examples.forEach(function (ex, i) {
        html += exampleBlock(ex, i, L.id);
      });
    }

    if ((L.keypoints || []).length) {
      html += '<div class="keypoints glass reveal"><h4>Коротко о главном</h4><ul>' +
        L.keypoints.map(function (k) { return '<li>' + esc(k) + '</li>'; }).join('') + '</ul></div>';
    }

    if ((L.exercises || []).length) {
      html += '<div class="exercises-head"><h2>Практика</h2>' +
        '<span class="count" id="exCounter">' + solvedCount(L) + ' из ' + L.exercises.length + '</span></div>';
      L.exercises.forEach(function (ex, i) { html += exerciseBlock(ex, i, L); });
    }

    if ((L.linkedResources || []).length) {
      html += '<div class="related reveal"><h4>Материалы по теме</h4><div class="res-chips">' +
        L.linkedResources.map(function (r) {
          return '<a class="res-chip" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' +
            '<span class="dot"></span>' + esc(r.name) + '</a>';
        }).join('') + '</div></div>';
    }

    html += '<div class="lesson-nav">' +
      (nb.prev
        ? '<button class="lesson-nav-btn" data-go="#/lesson/' + nb.prev.id + '"><span class="dir">← Назад</span>' +
          '<span class="nm">' + esc(nb.prev.title) + '</span></button>'
        : '<button class="lesson-nav-btn" data-go="#/stage/' + stage.id + '" disabled><span class="dir">Начало</span><span class="nm">это первый урок</span></button>') +
      '<button class="btn ' + (p.lesson ? '' : 'btn-primary') + '" id="completeBtn" style="align-self:center;justify-self:end">' +
        icon('check') + (p.lesson ? ' Пройден' : ' Отметить пройденным') + '</button>' +
      '</div>';

    if (nb.next) {
      html += '<div style="display:flex;justify-content:flex-end;margin-top:13px">' +
        '<button class="lesson-nav-btn next" data-go="#/lesson/' + nb.next.id + '" style="max-width:340px">' +
        '<span class="dir">Дальше →</span><span class="nm">' + esc(nb.next.title) + '</span></button></div>';
    }

    html += '</article>';
    view.innerHTML = html;

    bindLesson(L);
  }

  function solvedCount(L) {
    var p = progressOf(L.id).exercises;
    return (L.exercises || []).filter(function (e) { return p[e.id] && p[e.id].solved; }).length;
  }

  /* --- примеры --- */
  function exampleBlock(ex, i, lessonId) {
    var lang = ex.lang || 'text';
    var runnable = /^(html|css|js|javascript)$/i.test(lang);
    var eid = 'ex-demo-' + i;
    return '<div class="codeblock glass reveal" data-demo>' +
      '<div class="codeblock-head">' +
        '<span class="lang">' + esc(lang) + '</span>' +
        (ex.title ? '<span class="title">' + esc(ex.title) + '</span>' : '') +
        '<span class="acts">' +
          (runnable ? '<button class="icon-btn" data-act="preview" title="Показать результат"><svg><use href="#i-eye"/></svg></button>' : '') +
          (/^(python|py)$/i.test(lang) ? '<button class="icon-btn" data-act="run" title="Запустить"><svg><use href="#i-play"/></svg></button>' : '') +
          '<button class="icon-btn" data-copy title="Скопировать"><svg><use href="#i-copy"/></svg></button>' +
        '</span>' +
      '</div>' +
      '<pre class="code"><code>' + MD.highlight(ex.code || '', lang) + '</code></pre>' +
      '<textarea class="copy-src" hidden>' + esc(ex.code || '') + '</textarea>' +
      '<div data-slot></div>' +
    '</div>';
  }

  /* --- упражнения --- */
  function exerciseBlock(ex, i, L) {
    var solved = !!(progressOf(L.id).exercises[ex.id] || {}).solved;
    var typeLabel = { quiz: 'тест', code: 'код', task: 'задание' }[ex.type] || ex.type;

    var head = '<div class="ex-head">' +
      '<span class="ex-badge' + (solved ? ' done' : '') + '" data-badge>' + (solved ? icon('check') : (i + 1)) + '</span>' +
      '<p class="ex-prompt">' + esc(ex.prompt || '') + '</p>' +
      '<span class="pill ex-type">' + esc(typeLabel) + (ex.lang ? ' · ' + esc(ex.lang) : '') + '</span>' +
    '</div>';

    var inner = '';
    if (ex.type === 'quiz') inner = quizBody(ex);
    else if (ex.type === 'code') inner = codeBody(ex, L.id);
    else if (ex.type === 'task') inner = taskBody(ex, L.id);

    var foot = '<div class="ex-actions">' +
      (ex.type === 'task' ? '<button class="btn btn-primary btn-sm" data-act="finish-task">' + icon('check') + ' Всё сделано</button>' : '') +
      ((ex.hints || []).length ? '<button class="btn btn-ghost btn-sm" data-act="hint">' + icon('bulb') + ' Подсказка</button>' : '') +
      '<span class="ex-status' + (solved ? ' solved' : '') + '" data-status>' +
        (solved ? icon('check') + ' решено' : '') + '</span>' +
    '</div>';

    var solutionBlock = ex.solution
      ? '<details class="solution"><summary>Показать эталонное решение</summary>' +
        MD.codeblock(ex.solution, ex.lang || 'text', 'эталон') + '</details>'
      : '';

    return '<section class="exercise glass reveal" data-ex="' + esc(ex.id) + '" data-type="' + esc(ex.type) +
      '" id="ex-' + esc(ex.id) + '">' + head + inner +
      '<div data-hint-slot></div>' + foot + solutionBlock + '</section>';
  }

  function quizBody(ex) {
    var keys = ['A', 'B', 'C', 'D', 'E', 'F'];
    return '<div class="quiz-opts">' +
      ex.options.map(function (o, i) {
        return '<button class="quiz-opt" data-act="pick" data-i="' + i + '" type="button">' +
          '<span class="quiz-key">' + keys[i] + '</span><span>' + esc(o) + '</span></button>';
      }).join('') + '</div><div data-explain></div>';
  }

  function codeBody(ex, lessonId) {
    var lang = ex.lang || 'text';
    var key = DRAFT_PREFIX + lessonId + '.' + ex.id;
    var saved = null;
    try { saved = localStorage.getItem(key); } catch (e) { /* приватный режим */ }
    var value = saved != null ? saved : (ex.starter || '');
    var isWeb = /^(html|css|js|javascript)$/i.test(lang);
    var isPy = /^(python|py)$/i.test(lang);

    var h = '<div class="editor" data-editor data-lang="' + esc(lang) + '">' +
      '<div class="editor-bar"><span class="lang">' + esc(lang) + '</span>' +
        '<span data-lines></span>' +
        '<span class="acts">' +
          '<button class="icon-btn" data-act="reset" title="Сбросить к заготовке"><svg><use href="#i-reset"/></svg></button>' +
          (isWeb ? '<button class="icon-btn" data-act="preview" title="Обновить предпросмотр"><svg><use href="#i-eye"/></svg></button>' : '') +
          (isPy ? '<button class="icon-btn" data-act="run" title="Запустить без проверки"><svg><use href="#i-play"/></svg></button>' : '') +
        '</span>' +
      '</div>' +
      '<div class="editor-area">' +
        '<div class="gutter" data-gutter></div>' +
        '<pre class="hl" data-hl aria-hidden="true"></pre>' +
        '<textarea spellcheck="false" data-code autocapitalize="off" autocomplete="off" autocorrect="off">' +
          esc(value) + '</textarea>' +
      '</div>' +
      (isWeb ? '<div class="preview-wrap"><iframe data-preview title="Предпросмотр" sandbox="allow-scripts allow-same-origin allow-modals allow-forms"></iframe></div>' : '') +
    '</div>' +
    '<div data-out-slot></div>' +
    '<div class="ex-actions" style="margin-top:13px">' +
      '<button class="btn btn-primary btn-sm" data-act="check">' + icon('play') + ' Проверить</button>' +
    '</div>';
    return h;
  }

  function taskBody(ex, lessonId) {
    var key = CHECKS_PREFIX + lessonId + '.' + ex.id;
    var marks = {};
    try { marks = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { marks = {}; }
    return '<div class="checklist">' +
      (ex.checklist || []).map(function (c, i) {
        return '<button class="check-item' + (marks[i] ? ' on' : '') + '" data-act="toggle" data-i="' + i + '" type="button">' +
          '<span class="check-box">' + icon('check') + '</span><span>' + esc(c) + '</span></button>';
      }).join('') + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Поведение урока                                                     */
  /* ------------------------------------------------------------------ */
  function bindLesson(L) {
    var root = $('#view');

    // редакторы
    $$('[data-editor]', root).forEach(function (ed) {
      var ta = $('[data-code]', ed);
      var hl = $('[data-hl]', ed);
      var gutter = $('[data-gutter]', ed);
      var lang = ed.getAttribute('data-lang');

      function sync() {
        var v = ta.value;
        hl.innerHTML = MD.highlight(v, lang) + '\n';
        var n = v.split('\n').length;
        gutter.innerHTML = Array.from({ length: n }, function (_, i) { return i + 1; }).join('\n');
        $('[data-lines]', ed).textContent = n + ' строк';
        var h = Math.max(132, ta.scrollHeight + 2);
        ta.style.height = h + 'px';
        hl.style.height = h + 'px';
        gutter.style.height = h + 'px';
        hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft;
        gutter.scrollTop = ta.scrollTop;
      }

      ta.addEventListener('input', function () {
        sync();
        var owner = ed.closest('[data-ex]');
        if (owner) {
          try {
            localStorage.setItem(DRAFT_PREFIX + L.id + '.' + owner.getAttribute('data-ex'), ta.value);
          } catch (e) { /* приватный режим — черновик просто не сохранится */ }
        }
      });
      ta.addEventListener('scroll', function () {
        hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop;
      });
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') {
          e.preventDefault();
          var s = ta.selectionStart, en = ta.selectionEnd;
          ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(en);
          ta.selectionStart = ta.selectionEnd = s + 4;
          ta.dispatchEvent(new Event('input'));
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          var owner = ed.closest('[data-ex]');
          var btn = owner && $('[data-act="check"]', owner);
          if (btn) btn.click();
        }
      });
      sync();
      ed.__sync = sync;
      ed.__ta = ta;

      // автопредпросмотр для html/css/js
      if ($('[data-preview]', ed)) {
        var t = null;
        var live = function () {
          clearTimeout(t);
          t = setTimeout(function () { updatePreview(ed, L); }, 380);
        };
        ta.addEventListener('input', live);
        setTimeout(function () { updatePreview(ed, L); }, 60);
      }
    });

    // кнопка «пройден»
    $('#completeBtn').addEventListener('click', function () {
      toggleLessonComplete(L);
    });
  }

  function exOf(node) {
    var sec = node.closest('[data-ex]');
    if (!sec || !S.lesson) return { id: 'demo' };
    return (S.lesson.exercises || []).find(function (e) { return e.id === sec.getAttribute('data-ex'); }) || { id: 'demo' };
  }

  function updatePreview(ed, L) {
    var frame = $('[data-preview]', ed);
    var ex = exOf(ed);
    if (!frame) return;
    frame.srcdoc = Checks.previewDocument(ex, $('[data-code]', ed).value);
  }

  async function onLessonClick(e) {
    var copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      e.preventDefault();
      var box = copyBtn.closest('.codeblock, .solution');
      var src = box && $('.copy-src', box);
      var text = src ? src.value : ($('pre.code', box) || {}).textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.classList.add('on');
        setTimeout(function () { copyBtn.classList.remove('on'); }, 1400);
        toast('Код скопирован', 'ok');
      } catch (err) { toast('Не удалось скопировать', 'bad'); }
      return;
    }

    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var section = btn.closest('[data-ex]');
    var demo = btn.closest('[data-demo]');
    var L = S.lesson;

    if (act === 'preview' && demo) {
      e.preventDefault();
      var slot = $('[data-slot]', demo);
      if (slot.firstChild) { slot.innerHTML = ''; btn.classList.remove('on'); return; }
      var lang = ($('.lang', demo) || {}).textContent || 'html';
      var code = ($('.copy-src', demo) || {}).value || '';
      slot.innerHTML = '<div class="preview-wrap"><iframe title="Предпросмотр" sandbox="allow-scripts allow-same-origin allow-modals allow-forms"></iframe></div>';
      $('iframe', slot).srcdoc = Checks.previewDocument({ lang: lang }, code);
      btn.classList.add('on');
      return;
    }

    if (act === 'run' && demo) {
      e.preventDefault();
      var outSlot = $('[data-slot]', demo);
      outSlot.innerHTML = '<div class="output"><div class="output-head">Запуск…</div><div class="output-body"><div class="spinner"></div></div></div>';
      var code2 = ($('.copy-src', demo) || {}).value || '';
      showRun(await api('/api/run', { method: 'POST', body: JSON.stringify({ code: code2 }) }), outSlot);
      return;
    }

    if (!section) return;
    var ex = exOf(btn);

    if (act === 'pick') { runQuiz(section, ex, L, +btn.getAttribute('data-i')); return; }

    if (act === 'reset') {
      e.preventDefault();
      var ed = $('[data-editor]', section);
      ed.__ta.value = ex.starter || '';
      ed.__sync();
      ed.__ta.dispatchEvent(new Event('input'));
      toast('Код сброшен к заготовке');
      return;
    }

    if (act === 'preview') { e.preventDefault(); updatePreview($('[data-editor]', section), L); return; }

    if (act === 'run') {
      e.preventDefault();
      var slot2 = $('[data-out-slot]', section);
      slot2.innerHTML = '<div class="output"><div class="output-head">Запуск…</div><div class="output-body"><div class="spinner"></div></div></div>';
      var code3 = $('[data-code]', section).value;
      showRun(await api('/api/run', { method: 'POST', body: JSON.stringify({ code: code3 }) }), slot2);
      return;
    }

    if (act === 'check') { e.preventDefault(); await checkExercise(section, ex, L, btn); return; }

    if (act === 'hint') {
      e.preventDefault();
      var hs = $('[data-hint-slot]', section);
      var shown = hs.children.length;
      if (shown >= (ex.hints || []).length) { toast('Подсказки закончились'); return; }
      hs.appendChild(el('<div class="hint">' + icon('bulb') + ' ' + esc(ex.hints[shown]) + '</div>'));
      return;
    }

    if (act === 'toggle') {
      e.preventDefault();
      var item = btn;
      item.classList.toggle('on');
      var key = CHECKS_PREFIX + L.id + '.' + ex.id;
      var marks = {};
      try { marks = JSON.parse(localStorage.getItem(key) || '{}'); } catch (err) { marks = {}; }
      var idx = item.getAttribute('data-i');
      marks[idx] = item.classList.contains('on');
      try { localStorage.setItem(key, JSON.stringify(marks)); } catch (err) { /* ignore */ }
      return;
    }

    if (act === 'finish-task') {
      e.preventDefault();
      var all = $$('.check-item', section);
      if (all.length && !all.every(function (c) { return c.classList.contains('on'); })) {
        toast('Отметьте все пункты чек-листа', 'bad');
        return;
      }
      await markExerciseSolved(L, ex);
      return;
    }
  }

  function showRun(res, slot) {
    if (res.error) {
      slot.innerHTML = '<div class="output err"><div class="output-head">' + icon('x') + ' Ошибка</div>' +
        '<div class="output-body">' + esc(res.error) +
        (res.stdout ? '\n\n' + esc(res.stdout) : '') + '</div></div>';
      return;
    }
    slot.innerHTML = '<div class="output"><div class="output-head">' + icon('terminal') + ' Вывод</div>' +
      '<div class="output-body">' + (res.stdout ? esc(res.stdout) : '<span style="color:var(--text-mute)">(пусто — код ничего не напечатал)</span>') +
      '</div></div>';
  }

  function runQuiz(section, ex, L, picked) {
    if (section.dataset.done === '1') return;
    var opts = $$('.quiz-opt', section);
    var right = picked === ex.answer;
    opts.forEach(function (b, i) {
      b.disabled = true;
      if (i === ex.answer) b.classList.add('right');
      else if (i === picked) b.classList.add('wrong');
    });
    section.dataset.done = '1';

    var slot = $('[data-explain]', section);
    slot.innerHTML = '<div class="explain">' + (right ? '<b style="color:var(--ok)">Верно.</b> ' : '<b style="color:var(--bad)">Не тот ответ.</b> ') +
      esc(ex.explain || '') + (right ? '' : '<div style="margin-top:9px"><button class="btn btn-ghost btn-sm" data-act="retry-quiz">Попробовать снова</button></div>') +
      '</div>';

    if (right) markExerciseSolved(L, ex);
  }

  async function checkExercise(section, ex, L, btn) {
    var code = $('[data-code]', section).value;
    var slot = $('[data-out-slot]', section);
    btn.disabled = true;
    slot.innerHTML = '<div class="output"><div class="output-head">Проверяем…</div><div class="output-body"><div class="spinner"></div></div></div>';

    var res;
    try {
      if (/^(python|py)$/i.test(ex.lang || '')) {
        res = await api('/api/check', { method: 'POST', body: JSON.stringify({ code: code, tests: ex.tests || [] }) });
      } else {
        res = await Checks.verify(ex, code);
      }
    } catch (e) {
      slot.innerHTML = '<div class="output err"><div class="output-head">Сбой</div><div class="output-body">' + esc(e.message) + '</div></div>';
      btn.disabled = false;
      return;
    }
    btn.disabled = false;

    var html = '';
    if (res.error) {
      html += '<div class="output err"><div class="output-head">' + icon('x') + ' Ошибка выполнения</div>' +
        '<div class="output-body">' + esc(res.error) + '</div></div>';
    }
    if (res.stdout) {
      html += '<div class="output"><div class="output-head">' + icon('terminal') + ' Вывод программы</div>' +
        '<div class="output-body">' + esc(res.stdout) + '</div></div>';
    }
    if ((res.results || []).length) {
      html += '<div class="test-list">' + res.results.map(function (r) {
        return '<div class="test-row ' + (r.passed ? 'pass' : 'fail') + '">' +
          '<span class="test-ico">' + icon(r.passed ? 'check' : 'x') + '</span>' +
          '<span class="test-body"><span class="test-label">' + esc(r.label) + '</span>' +
          '<span class="test-detail">' + esc(r.expected) + (r.passed ? '' : ' → ' + esc(r.got)) + '</span></span></div>';
      }).join('') + '</div>';
    }
    if (!html) html = '<div class="output err"><div class="output-body">Нечего проверять</div></div>';
    slot.innerHTML = html;

    if (res.ok) {
      toast('Упражнение зачтено', 'ok');
      await markExerciseSolved(L, ex);
    } else {
      toast('Пока не проходит — смотрите детали', 'bad');
    }
  }

  async function markExerciseSolved(L, ex) {
    try {
      await api('/api/progress/exercise', {
        method: 'POST',
        body: JSON.stringify({ lessonId: L.id, exerciseId: ex.id, solved: true })
      });
    } catch (e) { toast('Прогресс не сохранился: ' + e.message, 'bad'); return; }

    S.boot.progress.exercises[L.id] = S.boot.progress.exercises[L.id] || {};
    S.boot.progress.exercises[L.id][ex.id] = { solved: true, attempts: 1 };
    S.boot.stats.exercisesDone++;

    var section = $('[data-ex="' + ex.id + '"]');
    if (section) {
      var badge = $('[data-badge]', section);
      badge.classList.add('done');
      badge.innerHTML = icon('check');
      var status = $('[data-status]', section);
      status.className = 'ex-status solved';
      status.innerHTML = icon('check') + ' решено';
    }
    var counter = $('#exCounter');
    if (counter) counter.textContent = solvedCount(L) + ' из ' + L.exercises.length;

    // все упражнения закрыты — урок пройден
    if (solvedCount(L) === L.exercises.length && !progressOf(L.id).lesson) {
      await setLessonComplete(L, true, true);
    }
    renderSidebar();
  }

  function toggleLessonComplete(L) {
    setLessonComplete(L, !progressOf(L.id).lesson, false);
  }

  async function setLessonComplete(L, done, silent) {
    try {
      await api('/api/progress/lesson', { method: 'POST', body: JSON.stringify({ lessonId: L.id, completed: done }) });
    } catch (e) { toast('Не удалось сохранить прогресс', 'bad'); return; }

    S.boot.progress.lessons[L.id] = done;
    S.boot.stats.lessonsDone += done ? 1 : -1;
    var pill = $('#lessonState');
    if (pill) {
      pill.className = 'pill' + (done ? ' ok' : '');
      pill.innerHTML = done ? icon('check') + ' пройден' : 'не пройден';
    }
    var btn = $('#completeBtn');
    if (btn) {
      btn.className = 'btn ' + (done ? '' : 'btn-primary');
      btn.innerHTML = icon('check') + (done ? ' Пройден' : ' Отметить пройденным');
    }
    if (!silent) toast(done ? 'Урок отмечен пройденным' : 'Отметка снята', done ? 'ok' : '');
    renderSidebar();
    if (S.route.kind === 'home') renderHome($('#view'));
  }

  /* ------------------------------------------------------------------ */
  /* Библиотека ресурсов                                                 */
  /* ------------------------------------------------------------------ */
  function renderResources(view, data) {
    renderCrumbs([{ text: 'Программа', href: '#/' }, { text: 'Библиотека ресурсов' }]);
    var f = S.filter;

    function filterBtn(on, attrs, label) {
      return '<button class="filter' + (on ? ' on' : '') + '" aria-pressed="' + (on ? 'true' : 'false') +
        '" ' + attrs + '>' + label + '</button>';
    }

    var groups = data.groups.map(function (g) {
      return filterBtn(f.group === g.id, 'data-filter="group" data-v="' + g.id + '"', esc(g.title));
    }).join('');

    var langs = uniq(data.items.map(function (i) { return i.lang; })).map(function (l) {
      return filterBtn(f.lang === l, 'data-filter="lang" data-v="' + esc(l) + '"', esc(l));
    }).join('');

    var freeBtns = Object.keys(data.freeLabels).map(function (k) {
      return filterBtn(f.free === k, 'data-filter="free" data-v="' + k + '"', esc(data.freeLabels[k]));
    }).join('');

    var items = data.items.filter(function (i) {
      if (f.group && i.group !== f.group) return false;
      if (f.lang && i.lang !== f.lang) return false;
      if (f.free && i.free !== f.free) return false;
      if (f.q) {
        var hay = (i.name + ' ' + i.note + ' ' + i.url).toLowerCase();
        if (hay.indexOf(f.q.toLowerCase()) === -1) return false;
      }
      return true;
    });

    var html = '<div class="page-head reveal">' +
      '<span class="pill accent">' + icon('book') + ' ' + data.items.length + ' источников</span>' +
      '<h1>Библиотека бесплатных ресурсов</h1>' +
      '<p>Проверено ' + esc(data.updated || '') + '. Здесь официальные курсы и документация: Гарвард, Google, MDN, ' +
        'python.org, Flask, Django, SQL, Git и платформы для практики. Статус бесплатности указан честно — ' +
        'в том числе когда его урезали.</p></div>';

    html += '<div class="filters">' +
      filterBtn(!f.group && !f.lang && !f.free, 'data-filter="all"', 'Все') +
      groups + '<span class="filter-sep"></span>' + langs +
      '<span class="filter-sep"></span>' + freeBtns + '</div>';

    html += '<input id="resQ" placeholder="Фильтр по названию…" value="' + esc(f.q) + '" autocomplete="off"' +
      ' style="display:block;width:100%;max-width:420px;padding:9px 15px;margin-bottom:20px;' +
      'border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text);' +
      'font:inherit;font-size:13px;outline:none">';

    if (!items.length) {
      html += '<div class="empty glass"><h3>Под фильтры ничего не подошло</h3><p>Попробуйте снять часть условий.</p></div>';
    } else {
      html += '<div class="res-grid">';
      items.forEach(function (i) {
        var g = data.groups.find(function (x) { return x.id === i.group; }) || {};
        var freeCls = { free: 'ok', freemium: '', trial: '', paid: 'todo' }[i.free] || '';
        var tracks = (i.track || []).map(function (t) {
          var st = S.stageById[t];
          return st ? '<span class="pill" title="Этап программы">' + esc(st.title) + '</span>' : '';
        }).join('');
        html += '<div class="res-card glass reveal" style="' + stageVars(firstStageOf(i) || { gradient: ['#6366f1', '#22d3ee'] }) + '">' +
          '<div class="res-top"><span class="stage-ico" style="width:34px;height:34px;border-radius:11px">' +
            icon(g.icon || 'book') + '</span>' +
            '<div style="flex:1;min-width:0"><h3>' + esc(i.name) + '</h3></div></div>' +
          '<p class="res-note">' + esc(i.note) + '</p>' +
          '<div class="res-tags">' +
            '<span class="pill ' + freeCls + '">' + esc((data.freeLabels || {})[i.free] || i.free) + '</span>' +
            '<span class="pill">' + esc(i.lang) + '</span>' +
            '<span class="pill">' + esc(i.format) + '</span>' +
            tracks +
          '</div>' +
          '<a class="res-link" href="' + esc(i.url) + '" target="_blank" rel="noopener noreferrer">' +
            '<span class="res-url">' + esc(shortUrl(i.url)) + '</span>' + icon('external') + '</a>' +
        '</div>';
      });
      html += '</div>';
    }

    view.innerHTML = html;

    $$('[data-filter]', view).forEach(function (b) {
      b.addEventListener('click', function () {
        var kind = b.getAttribute('data-filter'), v = b.getAttribute('data-v');
        if (kind === 'all') { S.filter = { group: null, lang: null, free: null, q: S.filter.q }; }
        else S.filter[kind] = S.filter[kind] === v ? null : v;
        renderResources(view, data);
      });
    });

    var q = $('#resQ', view);
    var t = null;
    q.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        S.filter.q = q.value;
        renderResources(view, data);
        var n = $('#resQ'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
      }, 260);
    });
  }

  function firstStageOf(item) {
    return (item.track || []).map(function (t) { return S.stageById[t]; }).filter(Boolean)[0];
  }
  function shortUrl(u) {
    return u.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

  /* ------------------------------------------------------------------ */
  /* Сайдбар на мобильных, общий клик-делегатор                          */
  /* ------------------------------------------------------------------ */
  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#scrim').classList.remove('show');
  }

  function initChrome() {
    $('#view').addEventListener('click', onLessonClick);

    $('#burger').addEventListener('click', function () {
      $('#sidebar').classList.toggle('open');
      $('#scrim').classList.toggle('show');
    });
    $('#scrim').addEventListener('click', closeSidebar);

    document.addEventListener('click', function (e) {
      var go = e.target.closest('[data-go]');
      if (!go || go.disabled) return;
      var href = go.getAttribute('data-go');
      if (!href) return;
      e.preventDefault();
      if (location.hash === href) route(); else location.hash = href;
    });

    // делегирование «попробовать снова» в quiz
    document.addEventListener('click', function (e) {
      if (!e.target.closest('[data-act="retry-quiz"]')) return;
      var section = e.target.closest('[data-ex]');
      delete section.dataset.done;
      $$('.quiz-opt', section).forEach(function (b) {
        b.disabled = false; b.className = 'quiz-opt';
      });
      $('[data-explain]', section).innerHTML = '';
    });

    $('#resetBtn').addEventListener('click', async function () {
      if (!confirm('Сбросить прогресс: отметки об уроках, упражнениях и рекорды мини-игр?')) return;
      try {
        await api('/api/progress/reset', { method: 'POST', body: '{}' });
      } catch (err) {
        toast('Сервер не ответил: ' + err.message, 'bad');
        return;
      }
      Object.keys(localStorage).filter(function (k) {
        return k.indexOf(DRAFT_PREFIX) === 0 || k.indexOf(CHECKS_PREFIX) === 0;
      }).forEach(function (k) { localStorage.removeItem(k); });
      S.boot = await api('/api/bootstrap');
      S.games = null;
      flatIndex();
      toast('Прогресс сброшен', 'ok');
      route();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Старт                                                               */
  /* ------------------------------------------------------------------ */
  async function boot() {
    try {
      S.boot = await api('/api/bootstrap');
    } catch (e) {
      $('#view').innerHTML = '<div class="empty glass"><h3>Сервер не отвечает</h3><p>' + esc(e.message) + '</p></div>';
      return;
    }
    flatIndex();
    initChrome();
    initSearch();
    window.addEventListener('hashchange', route);
    route();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
