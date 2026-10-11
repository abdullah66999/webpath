/* Мини-игры: спринт-тренажёры на скорость.
   Одна механика (вопрос → 4 варианта → очки за серию), три типа подачи:
   selector (разметка с подсвеченной целью), bug (фрагмент кода), flex (живые картинки раскладок). */
(function (global) {
  'use strict';

  var MD = global.MD;
  var Checks = global.Checks;

  var WRONG_PENALTY = 4;
  var SKIP_PENALTY = 2;
  var BASE_POINTS = 100;
  var SPEED_BUDGET = 8;          // секунд, за которые даётся полный бонус за скорость
  var SPEED_BONUS = 80;
  var FEEDBACK_MS = 1700;

  var FX_HEIGHTS = [46, 34, 24];

  function esc(s) { return MD.escape(s == null ? '' : s); }
  function icon(name) { return '<svg><use href="#i-' + name + '"/></svg>'; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function rnd(n) { return Math.round(n * 10) / 10; }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function multiplier(streak) { return Math.min(5, 1 + Math.floor(streak / 3)); }

  /* ------------------------------------------------------------------ */
  /* Рендер фрагментов                                                    */
  /* ------------------------------------------------------------------ */
  function codePane(question) {
    var code = (question.code || []).join('\n');
    if (!code) return '';
    return '<div class="g-code">' + MD.codeblock(code, question.lang || 'html', '') + '</div>';
  }

  /** Живой предпросмотр разметки: цель подсвечена, служебный атрибут скрыт. */
  function selectorPreview(question) {
    var raw = (question.code || []).join('\n');
    if (!raw) return '';
    var style = '<style>html,body{margin:0;padding:12px;background:#0b0e18;color:#e6e8f2;' +
      'font:14px/1.5 system-ui,sans-serif}' +
      '[data-target]{outline:2px solid #22d3ee;outline-offset:2px;border-radius:4px;' +
      'background:rgba(34,211,238,.14);box-shadow:0 0 0 6px rgba(34,211,238,.08)}' +
      'img{width:70px;height:46px;background:#2a3050;display:inline-block;vertical-align:middle}' +
      'input,button{font:inherit}</style>';
    var srcdoc = Checks.buildDocument({ lang: 'html', fixture: style }, raw);
    return '<div class="g-preview"><div class="g-preview-label">' + icon('eye') +
      ' так это выглядит в браузере</div>' +
      '<iframe class="g-frame" srcdoc="' + esc(srcdoc) + '" sandbox="allow-same-origin" title="Предпросмотр"></iframe></div>';
  }

  function flexPreview(items, triple, scale) {
    // В 4+ элементах колонка не влезает в box базовой высоты, поэтому размеры
    // детей уменьшаются, а gap масштабируется вместе с ними — иначе пропорции
    // target и вариантов разъезжались бы.
    var s = scale * (items > 3 ? 0.72 : 1);
    var kids = '';
    for (var i = 0; i < items; i++) {
      kids += '<span class="fx-i" style="width:' + rnd(46 * s) + 'px;height:' +
        rnd(FX_HEIGHTS[i % 3] * s) + 'px;font-size:' + rnd(13 * s) + 'px">' + (i + 1) + '</span>';
    }
    return '<div class="fx" style="height:' + rnd(170 * scale) + 'px;gap:' + rnd(8 * scale) + 'px;' +
      'display:flex;flex-direction:' + triple[0] + ';justify-content:' + triple[1] +
      ';align-items:' + triple[2] + '">' + kids + '</div>';
  }

  function flexTripleText(triple) {
    return triple[0] + ' · ' + triple[1] + ' · ' + triple[2];
  }

  /**
   * Собирает варианты ответа в перемешанном порядке.
   * Возвращает { order, correct } — order[i] хранит исходный индекс варианта.
   */
  function mixOptions(question) {
    var idx = question.options.map(function (_, i) { return i; });
    var order = shuffle(idx);
    return { order: order, correct: order.indexOf(question.answer) };
  }

  /* Активный спринт: нужен, чтобы роутер мог снять таймеры и слушатели. */
  var active = null;

  function dispose() {
    if (active && active.dispose) active.dispose();
    active = null;
  }

  /* ------------------------------------------------------------------ */
  /* Хаб                                                                 */
  /* ------------------------------------------------------------------ */
  function renderHub(view, ctx, data) {
    if (!data.games.length) {
      view.innerHTML = '<div class="empty glass"><h3>Игры не загружены</h3><p>Не найден content/games.json.</p></div>';
      return;
    }
    var records = data.records || {};
    ctx.crumbs([{ text: 'Программа', href: '#/' }, { text: 'Мини-игры' }]);

    var totalBest = data.games.reduce(function (a, g) {
      return a + ((records[g.id] || {}).bestScore || 0);
    }, 0);

    var html = '<div class="page-head reveal">' +
      '<span class="pill accent">' + icon('rocket') + ' Тренажёры</span>' +
      '<h1>Мини-игры</h1>' +
      '<p class="lead">Короткие спринты на скорость: те же темы, что и в уроках, но в формате «успей ответить».' +
      ' Серия правильных ответов увеличивает множитель очков, ошибка её обнуляет и снимает несколько секунд.</p>' +
      '<div class="hero-actions">' +
        '<a class="btn btn-primary" href="#/game/' + data.games[0].id + '">' + icon('play') + ' Начать спринт</a>' +
      '</div></div>';

    html += '<div class="metrics">' +
      metric(data.games.length, 'тренажёра', true) +
      metric(data.games.reduce(function (a, g) { return a + g.questions.length; }, 0), 'вопросов в банках', false) +
      metric(totalBest, 'очков суммарно', false) +
    '</div>';

    html += '<div class="games">';
    data.games.forEach(function (g) {
      var rec = records[g.id] || { bestScore: 0, bestStreak: 0, plays: 0 };
      html += '<button class="game-card glass reveal" data-go="#/game/' + g.id + '" style="' + ctx.stageVars({ gradient: g.gradient }) + '">' +
        '<div class="game-top">' +
          '<span class="stage-ico">' + icon(g.icon || 'bolt') + '</span>' +
          '<span style="flex:1;min-width:0;text-align:left">' +
            '<h3>' + esc(g.title) + '</h3>' +
            '<p class="tag">' + esc(g.tagline) + '</p>' +
          '</span>' +
        '</div>' +
        '<div class="game-stats">' +
          '<span title="Лучший результат">' + icon('flame') + ' ' + rec.bestScore + '</span>' +
          '<span title="Лучшая серия">' + icon('bolt') + ' ' + rec.bestStreak + '</span>' +
          '<span title="Сыграно спринтов">' + icon('play') + ' ' + rec.plays + '</span>' +
          '<span title="Время спринта">' + icon('clock') + ' ' + g.seconds + ' с</span>' +
        '</div>' +
        '<div class="game-foot">' +
          '<span class="pill">' + g.questions.length + ' вопросов</span>' +
          '<span class="btn btn-sm btn-primary">' + icon('play') + ' Играть</span>' +
        '</div>' +
      '</button>';
    });
    html += '</div>';

    html += '<div class="glass reveal g-rules"><h3>Как считаются очки</h3><ul>' +
      '<li><b>+' + BASE_POINTS + '</b> за правильный ответ, умноженные на множитель серии (до <b>×5</b>).</li>' +
      '<li>Бонус за скорость: до <b>+' + SPEED_BONUS + '</b>, если ответить быстрее чем за ' + SPEED_BUDGET + ' секунд.</li>' +
      '<li>Множитель растёт каждые три правильных ответа подряд.</li>' +
      '<li>Ошибка: серия сбрасывается, <b>−' + WRONG_PENALTY + ' с</b> от таймера.</li>' +
      '<li>Пропуск: серия сбрасывается, <b>−' + SKIP_PENALTY + ' с</b>.</li>' +
      '<li>Клавиши <kbd>1</kbd>–<kbd>4</kbd> — ответ, <kbd>Пробел</kbd> — пропустить, <kbd>Enter</kbd> — дальше.</li>' +
      '</ul></div>';

    view.innerHTML = html;
  }

  function metric(k, l, grad) {
    return '<div class="metric glass reveal"><div class="k' + (grad ? ' grad' : '') + '">' + esc(k) +
      '</div><div class="l">' + esc(l) + '</div></div>';
  }

  /* ------------------------------------------------------------------ */
  /* Спринт                                                              */
  /* ------------------------------------------------------------------ */
  function renderPlay(view, ctx, game) {
    dispose();
    ctx.crumbs([
      { text: 'Программа', href: '#/' },
      { text: 'Мини-игры', href: '#/games' },
      { text: game.title }
    ]);

    view.innerHTML =
      '<div class="g-wrap reveal" style="' + ctx.stageVars({ gradient: game.gradient }) + '">' +
        '<div class="g-head">' +
          '<span class="stage-ico">' + icon(game.icon || 'bolt') + '</span>' +
          '<div class="g-title"><h1>' + esc(game.title) + '</h1><p>' + esc(game.tagline) + '</p></div>' +
          '<button class="btn btn-sm" data-g="quit">' + icon('chev-l') + ' Выйти</button>' +
        '</div>' +
        '<div class="g-hud">' +
          '<div class="g-hud-item"><span class="g-hud-k">Очки</span><span class="g-hud-v" data-hud="score">0</span></div>' +
          '<div class="g-hud-item"><span class="g-hud-k">Серия</span><span class="g-hud-v" data-hud="streak">0</span></div>' +
          '<div class="g-hud-item"><span class="g-hud-k">Множитель</span><span class="g-hud-v" data-hud="mult">×1</span></div>' +
          '<div class="g-hud-item"><span class="g-hud-k">Верно</span><span class="g-hud-v" data-hud="acc">0/0</span></div>' +
          '<div class="g-hud-item g-timer"><span class="g-hud-k">Время</span>' +
            '<span class="g-hud-v" data-hud="time">' + game.seconds + '</span></div>' +
        '</div>' +
        '<div class="g-bar"><span data-hud="bar"></span></div>' +
        '<div class="g-stage" data-g="stage"></div>' +
      '</div>';

    var run = {
      game: game,
      view: view,
      stage: $('[data-g="stage"]', view),
      queue: shuffle(game.questions),
      pos: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      right: 0,
      answered: 0,
      left: game.seconds,
      total: game.seconds,
      current: null,
      phase: 'intro',
      timer: null,
      advance: null,
      finished: false,
      ctx: ctx
    };

    $('[data-g="quit"]', view).addEventListener('click', function () {
      if (run.phase === 'feedback' || run.right > 0) {
        if (!confirm('Прервать спринт? Результат не сохранится.')) return;
      }
      ctx.go('#/games');
    });

    view.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);

    function onClick(e) {
      var opt = e.target.closest('[data-opt]');
      if (opt && run.phase === 'answer' && !opt.disabled) { answer(run, Number(opt.getAttribute('data-opt'))); return; }
      if (e.target.closest('[data-g="skip"]') && run.phase === 'answer') { skip(run); return; }
      if (e.target.closest('[data-g="next"]') && run.phase === 'feedback') { next(run); return; }
      if (e.target.closest('[data-g="start"]')) { begin(run); return; }
      if (e.target.closest('[data-g="resume"]')) { resume(run); return; }
      if (e.target.closest('[data-g="again"]')) { restart(run); return; }
    }

    function onKey(e) {
      // Пока ученик печатает (поиск в шапке, редактор упражнения), клавиши
      // спринта молчат: иначе «1» засчитывает ответ, а Space не попадёт в поле.
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                t.tagName === 'SELECT' || t.isContentEditable)) return;

      if (run.phase === 'answer' && run.current) {
        if (e.key >= '1' && e.key <= '4') {
          var i = Number(e.key) - 1;
          if (i < run.current.options.length) { e.preventDefault(); answer(run, i); }
        } else if (e.code === 'Space') { e.preventDefault(); skip(run); }
      } else if (run.phase === 'feedback') {
        if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); next(run); }
      } else if (run.phase === 'intro' || run.phase === 'over') {
        if (e.key === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          if (run.phase === 'intro') begin(run); else restart(run);
        }
      }
    }

    function onVisibility() {
      if (document.hidden && run.phase === 'answer') pause(run);
      else if (!document.hidden && run.phase === 'paused') resume(run);
    }

    run.dispose = function () {
      clearInterval(run.timer);
      clearTimeout(run.advance);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      view.removeEventListener('click', onClick);
    };
    active = run;

    showIntro(run);
  }

  /* --- экраны -------------------------------------------------------- */
  function showIntro(run) {
    var g = run.game;
    run.phase = 'intro';
    run.stage.innerHTML = '<div class="g-intro">' +
      '<div class="g-intro-ico">' + icon(g.icon || 'bolt') + '</div>' +
      '<h2>' + esc(g.title) + '</h2>' +
      '<p>' + esc(g.tagline) + '</p>' +
      '<div class="g-intro-facts">' +
        '<span>' + icon('clock') + ' ' + g.seconds + ' секунд</span>' +
        '<span>' + icon('layers') + ' ' + g.questions.length + ' вопросов в банке</span>' +
        '<span>' + icon('bolt') + ' множитель до ×5 за серию</span>' +
      '</div>' +
      '<button class="btn btn-primary btn-lg" data-g="start">' + icon('play') + ' Старт</button>' +
      '<p class="g-hint">или нажмите <kbd>Enter</kbd></p>' +
    '</div>';
  }

  function begin(run) {
    run.phase = 'answer';
    run.timer = setInterval(function () { tick(run); }, 100);
    showQuestion(run);
  }

  function tick(run) {
    run.left = Math.max(0, run.left - 0.1);
    updateHud(run);
    if (run.left <= 0) finish(run);
  }

  function updateHud(run) {
    var set = function (k, v) {
      var n = $('[data-hud="' + k + '"]', run.view);
      if (n) n.textContent = v;
    };
    set('score', run.score);
    set('streak', run.streak);
    set('mult', '×' + multiplier(run.streak));
    set('acc', run.right + '/' + run.answered);
    set('time', Math.ceil(run.left));

    var bar = $('[data-hud="bar"]', run.view);
    if (bar) {
      var pct = run.total ? (run.left / run.total) * 100 : 0;
      bar.style.width = pct.toFixed(2) + '%';
      bar.className = pct < 15 ? 'low' : (pct < 35 ? 'mid' : '');
    }
    var timerBox = $('.g-timer', run.view);
    if (timerBox) timerBox.classList.toggle('warn', run.left < 10);
  }

  function showQuestion(run) {
    if (run.pos >= run.queue.length) { finish(run); return; }
    var game = run.game;
    var q = run.queue[run.pos];
    var mix = mixOptions(q);

    run.current = { q: q, options: mix.order, correct: mix.correct, shownAt: Date.now() };
    run.phase = 'answer';

    var optionsHtml = mix.order.map(function (origIdx, i) {
      var opt = q.options[origIdx];
      var inner = game.kind === 'flex'
        ? '<span class="g-opt-fx">' + flexPreview(q.items, opt, 0.68) + '</span>' +
          '<span class="g-opt-text">' + esc(flexTripleText(opt)) + '</span>'
        : '<span class="g-opt-text">' + esc(String(opt)) + '</span>';
      return '<button class="g-opt" data-opt="' + i + '"><kbd>' + (i + 1) + '</kbd>' + inner + '</button>';
    }).join('');

    run.stage.innerHTML = '<div class="g-q">' +
      '<div class="g-q-prompt">' + icon('bulb') + ' ' + esc(q.prompt) + '</div>' +
      (game.kind === 'selector' ? selectorPreview(q) + codePane(q) : codePane(q)) +
      (game.kind === 'flex'
        ? '<div class="g-target"><div class="g-target-label">' + icon('eye') + ' цель</div>' +
          flexPreview(q.items, q.target, 1) + '</div>'
        : '') +
      '<div class="g-opts' + (game.kind === 'flex' ? ' g-opts-fx' : '') + '">' + optionsHtml + '</div>' +
      '<div class="g-actions"><button class="btn btn-sm" data-g="skip">' + icon('chev-r') +
        ' Пропустить <kbd>−' + SKIP_PENALTY + ' с</kbd></button></div>' +
      '<div class="g-explain" data-g="explain"></div>' +
    '</div>';

    updateHud(run);
  }

  function popPoints(run, text, positive) {
    var host = $('.g-hud', run.view);
    if (!host) return;
    var p = document.createElement('span');
    p.className = 'g-pop' + (positive ? '' : ' bad');
    p.textContent = text;
    host.appendChild(p);
    setTimeout(function () { p.remove(); }, 900);
  }

  function answer(run, i) {
    if (run.phase !== 'answer' || !run.current) return;
    var cur = run.current;
    var took = (Date.now() - cur.shownAt) / 1000;
    var right = i === cur.correct;

    run.answered++;
    run.phase = 'feedback';

    var gained = 0;
    if (right) {
      var speed = Math.max(0, Math.round((SPEED_BUDGET - took) / SPEED_BUDGET * SPEED_BONUS));
      gained = BASE_POINTS * multiplier(run.streak) + speed;
      run.score += gained;
      run.streak++;
      run.right++;
      if (run.streak > run.bestStreak) run.bestStreak = run.streak;
    } else {
      run.streak = 0;
      run.left = Math.max(0, run.left - WRONG_PENALTY);
    }

    markOptions(run, i);
    showExplain(run, cur.q, right, false);
    popPoints(run, right ? '+' + gained : '−' + WRONG_PENALTY + ' с', right);
    updateHud(run);

    clearTimeout(run.advance);
    run.advance = setTimeout(function () { next(run); }, FEEDBACK_MS);
  }

  function skip(run) {
    if (run.phase !== 'answer' || !run.current) return;
    run.answered++;
    run.streak = 0;
    run.left = Math.max(0, run.left - SKIP_PENALTY);
    run.phase = 'feedback';
    markOptions(run, -1);
    showExplain(run, run.current.q, false, true);
    popPoints(run, '−' + SKIP_PENALTY + ' с', false);
    updateHud(run);
    clearTimeout(run.advance);
    run.advance = setTimeout(function () { next(run); }, FEEDBACK_MS + 600);
  }

  function markOptions(run, chosen) {
    $$('.g-opt', run.stage).forEach(function (b, i) {
      b.disabled = true;
      if (i === run.current.correct) b.classList.add('right');
      else if (i === chosen) b.classList.add('wrong');
      else b.classList.add('dim');
    });
    var skip = $('[data-g="skip"]', run.stage);
    if (skip) skip.disabled = true;
  }

  function showExplain(run, q, right, skipped) {
    var box = $('[data-g="explain"]', run.stage);
    if (!box) return;
    var head = skipped ? 'Пропущено' : (right ? 'Верно' : 'Не тот ответ');
    var answerText = run.game.kind === 'flex'
      ? flexTripleText(q.options[q.answer])
      : String(q.options[q.answer]);
    box.className = 'g-explain show ' + (skipped ? 'skip' : (right ? 'ok' : 'bad'));
    box.innerHTML = '<div class="g-explain-head">' + icon(skipped ? 'chev-r' : (right ? 'check' : 'x')) +
      ' ' + head + '</div>' +
      (right ? '' : '<div class="g-explain-ans">Правильный ответ: <b>' + esc(answerText) + '</b></div>') +
      '<p>' + esc(q.explain) + '</p>' +
      '<button class="btn btn-sm" data-g="next">Дальше <kbd>Enter</kbd></button>';
  }

  function next(run) {
    if (run.phase !== 'feedback') return;
    clearTimeout(run.advance);
    run.pos++;
    if (run.left <= 0) { finish(run); return; }
    showQuestion(run);
  }

  function pause(run) {
    run.phase = 'paused';
    clearInterval(run.timer);
    run.timer = null;
    clearTimeout(run.advance);
    run.stage.innerHTML = '<div class="g-intro"><div class="g-intro-ico">' + icon('clock') + '</div>' +
      '<h2>Пауза</h2><p>Вкладка скрыта — таймер остановлен.</p>' +
      '<button class="btn btn-primary btn-lg" data-g="resume">' + icon('play') + ' Продолжить</button></div>';
  }

  function resume(run) {
    if (!run.timer) run.timer = setInterval(function () { tick(run); }, 100);
    showQuestion(run);
  }

  function restart(run) {
    clearInterval(run.timer);
    clearTimeout(run.advance);
    run.timer = null;
    run.queue = shuffle(run.game.questions);
    run.pos = 0; run.score = 0; run.streak = 0; run.bestStreak = 0;
    run.right = 0; run.answered = 0; run.left = run.game.seconds;
    run.current = null; run.finished = false;
    updateHud(run);
    begin(run);
  }

  async function finish(run) {
    if (run.finished) return;
    run.finished = true;
    run.phase = 'over';
    clearInterval(run.timer);
    run.timer = null;
    clearTimeout(run.advance);

    var acc = run.answered ? Math.round(run.right / run.answered * 100) : 0;
    var rec = null;
    try {
      rec = await run.ctx.api('/api/progress/game', {
        method: 'POST',
        body: JSON.stringify({ gameId: run.game.id, score: run.score, streak: run.bestStreak })
      });
    } catch (e) {
      run.ctx.toast('Рекорд не сохранился: ' + e.message, 'bad');
    }
    var prev = (rec && rec.records && rec.records[run.game.id]) || null;
    if (rec && rec.records) run.ctx.onRecord(rec.records);
    var isRecord = !!prev && prev.bestScore === run.score && run.score > 0;

    run.stage.innerHTML = '<div class="g-over">' +
      '<div class="g-over-ico' + (acc >= 70 ? ' good' : '') + '">' + icon(acc >= 70 ? 'flame' : 'bolt') + '</div>' +
      '<h2>' + (isRecord ? 'Новый рекорд!' : 'Спринт окончен') + '</h2>' +
      '<div class="g-score">' + run.score + '</div>' +
      '<div class="g-over-stats">' +
        '<span>Верных ответов <b>' + run.right + ' из ' + run.answered + '</b></span>' +
        '<span>Точность <b>' + acc + '%</b></span>' +
        '<span>Лучшая серия <b>' + run.bestStreak + '</b></span>' +
        '<span>Рекорд <b>' + (prev ? prev.bestScore : run.score) + '</b></span>' +
      '</div>' +
      '<div class="g-over-actions">' +
        '<button class="btn btn-primary btn-lg" data-g="again">' + icon('reset') + ' Ещё раз</button>' +
        '<a class="btn btn-lg" href="#/games">' + icon('layers') + ' Все игры</a>' +
      '</div>' +
    '</div>';
    updateHud(run);
  }

  global.Games = {
    renderHub: renderHub, renderPlay: renderPlay, dispose: dispose,
    flexPreview: flexPreview   // тот же рендер использует tools-проверка банка
  };
})(window);
