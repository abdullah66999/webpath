/* Рендер Markdown и подсветка синтаксиса — без внешних библиотек. */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------------------ */
  /* Подсветка синтаксиса                                                */
  /* ------------------------------------------------------------------ */
  var RULES = {
    python: [
      ['com', '#[^\\n]*'],
      ['str', '[rubf]{0,2}(?:"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|f?"(?:\\\\.|[^"\\\\])*")'],
      ['op',  '@[\\w.]+'],
      ['kw',  '\\b(?:def|class|return|if|elif|else|for|while|in|not|and|or|is|import|from|as|pass|break|continue|try|except|finally|raise|with|lambda|yield|global|nonlocal|assert|del|async|await|match|case|None|True|False|self)\\b'],
      ['cls', '\\b(?:int|str|float|bool|list|dict|set|tuple|bytes|type|object|Exception|ValueError|TypeError|KeyError|IndexError|ZeroDivisionError|FileNotFoundError)\\b'],
      ['num', '\\b\\d[\\d_]*\\.?\\d*(?:[eE][+-]?\\d+)?\\b'],
      ['fn',  '\\b[A-Za-z_]\\w*(?=\\s*\\()'],
      ['cls', '\\b[A-Z][A-Za-z0-9_]*\\b']
    ],
    js: [
      ['com', '//[^\\n]*|/\\*[\\s\\S]*?\\*/'],
      ['str', '`(?:\\\\.|[^`\\\\])*`|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\''],
      ['kw',  '\\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|default|break|continue|new|class|extends|super|this|typeof|instanceof|in|of|try|catch|finally|throw|async|await|import|export|from|delete|void|yield|static|get|set|null|undefined|true|false)\\b'],
      ['cls', '\\b(?:Array|Object|String|Number|Boolean|Promise|Map|Set|JSON|Math|Date|Error|console|document|window|fetch|HTMLElement|Event)\\b'],
      ['num', '\\b\\d+\\.?\\d*(?:[eE][+-]?\\d+)?\\b'],
      ['fn',  '\\b[A-Za-z_$][\\w$]*(?=\\s*\\()'],
      ['prp', '(?<=\\.)\\b[A-Za-z_$][\\w$]*\\b']
    ],
    html: [
      ['com', '<!--[\\s\\S]*?-->'],
      ['kw',  '<!DOCTYPE[^>]*>'],
      ['tag', '</?[a-zA-Z][\\w:-]*|/?>'],
      ['str', '"[^"]*"|\'[^\']*\''],
      ['att', '\\b[a-zA-Z_:][\\w:.-]*(?=\\s*=)']
    ],
    css: [
      ['com', '/\\*[\\s\\S]*?\\*/'],
      ['str', '"[^"]*"|\'[^\']*\''],
      ['kw',  '@[\\w-]+'],
      ['var', '--[\\w-]+'],
      ['sel', '[^{};/]+(?=\\s*\\{)'],
      ['prp', '\\b[a-z-]+(?=\\s*:)'],
      ['num', '[-+]?\\b\\d*\\.?\\d+(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr|ch|ex|pt|cm|mm|in|turn)?\\b'],
      ['cls', '#[0-9a-fA-F]{3,8}\\b']
    ],
    json: [
      ['prp', '"(?:\\\\.|[^"\\\\])*"(?=\\s*:)'],
      ['str', '"(?:\\\\.|[^"\\\\])*"'],
      ['kw',  '\\b(?:true|false|null)\\b'],
      ['num', '-?\\b\\d+\\.?\\d*(?:[eE][+-]?\\d+)?\\b']
    ],
    bash: [
      ['com', '#[^\\n]*'],
      ['str', '"(?:\\\\.|[^"\\\\])*"|\'[^\']*\''],
      ['kw',  '\\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|return|export|source|sudo|cd|echo|exit)\\b'],
      ['att', '(?:^|\\s)--?[\\w-]+'],
      ['fn',  '\\b(?:git|python|python3|pip|pip3|npm|npx|node|docker|curl|ls|mkdir|rm|cp|mv|cat|grep|chmod|systemctl|flask|uvicorn|gunicorn|pytest)\\b'],
      ['var', '\\$\\{?\\w+\\}?']
    ],
    sql: [
      ['com', '--[^\\n]*|/\\*[\\s\\S]*?\\*/'],
      ['str', "'(?:''|[^'])*'"],
      ['kw',  '\\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AS|AND|OR|NOT|NULL|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|DEFAULT|CHECK|BEGIN|COMMIT|ROLLBACK|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CASCADE|AUTOINCREMENT|INTEGER|TEXT|REAL|BLOB|VARCHAR|BOOLEAN|DATETIME)\\b'],
      ['num', '\\b\\d+\\.?\\d*\\b'],
      ['fn',  '\\b[A-Za-z_]\\w*(?=\\s*\\()']
    ]
  };
  RULES.javascript = RULES.js;
  RULES.py = RULES.python;
  RULES.shell = RULES.bash;
  RULES.sh = RULES.bash;
  RULES.yaml = RULES.bash;
  RULES.text = [];
  RULES[''] = [];

  function buildRegex(rules) {
    // Группы ОБЯЗАНЫ быть захватывающими: по номеру заполненной группы мы
    // определяем, какое именно правило сматчило. Внутри правил все группы
    // уже незахватывающие, так что на правило приходится ровно одна.
    var parts = rules.map(function (r) { return '(' + r[1] + ')'; });
    return new RegExp(parts.join('|'), 'gm');
  }

  var COMPILED = {};

  /** Возвращает HTML с подсветкой. Содержимое экранируется по токенам. */
  function highlight(code, lang) {
    var key = (lang || '').toLowerCase();
    var rules = RULES[key];
    if (!rules || !rules.length) return escapeHtml(code);
    var re = COMPILED[key];
    if (!re) { re = COMPILED[key] = buildRegex(rules); }
    re.lastIndex = 0;

    var out = '', last = 0, m;
    // Guard: патологический regex не должен вешать страницу.
    var budget = 20000;
    while ((m = re.exec(code)) !== null && budget-- > 0) {
      if (m.index > last) out += escapeHtml(code.slice(last, m.index));
      var cls = '';
      for (var i = 0; i < rules.length; i++) {
        if (m[i + 1] !== undefined) { cls = rules[i][0]; break; }
      }
      out += '<span class="tok-' + cls + '">' + escapeHtml(m[0]) + '</span>';
      last = m.index + m[0].length;
      if (m[0] === '') re.lastIndex++;
    }
    if (last < code.length) out += escapeHtml(code.slice(last));
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Markdown                                                            */
  /* ------------------------------------------------------------------ */
  function inline(text) {
    var s = escapeHtml(text);
    // инлайн-код защищаем от последующих замен
    var stash = [];
    s = s.replace(/`([^`]+)`/g, function (_, c) {
      stash.push(c);
      return '\u0000' + (stash.length - 1) + '\u0000';
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) {
      return '<code>' + stash[+i] + '</code>';
    });
    return s;
  }

  /**
   * Подмножество Markdown -> HTML.
   * Поддерживает: ##/###, списки, fenced-код, цитаты, ссылки, hr, инлайн-форматирование.
   */
  function render(src) {
    var lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
    var html = [], i = 0;

    function splitRow(row) {
      return row.trim().replace(/^\|/, '').replace(/\|$/, '')
        .split('|').map(function (c) { return inline(c.trim()); });
    }

    function tableBlock() {
      var head = splitRow(lines[i]);
      i += 2; // заголовок и разделитель
      var rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      var out = ['<div class="table-wrap"><table><thead><tr>'];
      head.forEach(function (c) { out.push('<th>' + c + '</th>'); });
      out.push('</tr></thead><tbody>');
      rows.forEach(function (r) {
        out.push('<tr>');
        r.forEach(function (c) { out.push('<td>' + c + '</td>'); });
        out.push('</tr>');
      });
      out.push('</tbody></table></div>');
      return out.join('');
    }

    function listBlock(ordered) {
      var re = ordered ? /^\s*(\d+)\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      var tag = ordered ? 'ol' : 'ul';
      var out = ['<' + tag + '>'];
      while (i < lines.length) {
        var m = lines[i].match(re);
        if (!m) break;
        out.push('<li>' + inline(ordered ? m[2] : m[1]) + '</li>');
        i++;
      }
      out.push('</' + tag + '>');
      return out.join('');
    }

    while (i < lines.length) {
      var line = lines[i];

      if (/^\s*$/.test(line)) { i++; continue; }

      var fence = line.match(/^\s*```([\w+-]*)\s*$/);
      if (fence) {
        var lang = fence[1] || 'text';
        var buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // закрывающая линия
        html.push(codeblock(buf.join('\n'), lang, ''));
        continue;
      }

      var h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        var level = Math.min(4, Math.max(2, h[1].length));
        html.push('<h' + level + '>' + inline(h[2]) + '</h' + level + '>');
        i++;
        continue;
      }

      if (/^\s*(---|___|\*\*\*)\s*$/.test(line)) { html.push('<hr>'); i++; continue; }

      if (/^\s*>\s?/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        html.push('<blockquote>' + render(quote.join('\n')) + '</blockquote>');
        continue;
      }

      if (/^\s*[-*]\s+/.test(line)) { html.push(listBlock(false)); continue; }
      if (/^\s*\d+\.\s+/.test(line)) { html.push(listBlock(true)); continue; }

      // таблица: строка с | и следом разделитель из дефисов
      if (/^\s*\|/.test(line) && i + 1 < lines.length &&
          /^\s*\|?[\s:|-]*-[\s:|-]*$/.test(lines[i + 1]) && /\|/.test(lines[i + 1])) {
        html.push(tableBlock());
        continue;
      }

      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
             !/^\s*```/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) &&
             !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) &&
             !/^\s*\|/.test(lines[i]) &&
             !/^\s*>/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      if (para.length) html.push('<p>' + inline(para.join(' ')) + '</p>');
    }

    return html.join('\n');
  }

  function codeblock(code, lang, title) {
    return '<div class="codeblock glass">' +
      '<div class="codeblock-head">' +
        '<span class="lang">' + escapeHtml(lang) + '</span>' +
        (title ? '<span class="title">' + escapeHtml(title) + '</span>' : '') +
        '<span class="acts"><button class="icon-btn" data-copy type="button" title="Скопировать код">' +
        '<svg><use href="#i-copy"/></svg></button></span>' +
      '</div>' +
      '<pre class="code"><code>' + highlight(code, lang) + '</code></pre>' +
      '<textarea class="copy-src" hidden>' + escapeHtml(code) + '</textarea>' +
    '</div>';
  }

  /** Текст урока без разметки — для поиска. */
  function plain(src) {
    return String(src || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^#{1,6}\s+/gm, ' ')
      .replace(/[*_`>\[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  global.MD = { render: render, highlight: highlight, escape: escapeHtml, plain: plain, codeblock: codeblock };
})(window);
