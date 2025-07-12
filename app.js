// regex-test
// build the regex from the input + flags, run it on the test string,
// render highlights into a div that sits behind the textarea.

const patternEl = document.getElementById('pattern');
const flagBoxes = document.querySelectorAll('.flags input[type="checkbox"]');
const flagsDisplay = document.getElementById('flags-display');
const testEl = document.getElementById('test-string');
const highlightEl = document.getElementById('highlight');
const matchCountEl = document.getElementById('match-count');
const errorEl = document.getElementById('error');
const groupsEl = document.getElementById('groups');
const explainerEl = document.getElementById('explainer');

function getFlags() {
  let f = '';
  flagBoxes.forEach(cb => { if (cb.checked) f += cb.dataset.flag; });
  return f;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildRegex() {
  const src = patternEl.value;
  if (!src) return null;
  let flags = getFlags();
  // we need 'g' for findAll-style highlighting. add it transparently if missing.
  if (!flags.includes('g')) flags += 'g';
  return new RegExp(src, flags);
}

function findMatches(re, text) {
  const matches = [];
  if (!re) return matches;
  // safety: cap iterations so a runaway pattern can't hang the page
  let i = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    matches.push({ index: m.index, text: m[0], groups: m.slice(1) });
    if (m[0].length === 0) re.lastIndex++; // avoid infinite loop on zero-width
    if (++i > 5000) break;
  }
  return matches;
}

function renderHighlights(text, matches) {
  if (matches.length === 0) {
    highlightEl.innerHTML = escapeHtml(text) + '\n';
    return;
  }
  let out = '';
  let cursor = 0;
  for (const m of matches) {
    out += escapeHtml(text.slice(cursor, m.index));
    out += '<mark class="match">' + escapeHtml(m.text) + '</mark>';
    cursor = m.index + m.text.length;
  }
  out += escapeHtml(text.slice(cursor));
  // trailing newline so the last line gets reserved height
  highlightEl.innerHTML = out + '\n';
}

function renderGroups(matches) {
  if (matches.length === 0) {
    groupsEl.innerHTML = '<div class="empty">no matches yet</div>';
    return;
  }
  const hasGroups = matches.some(m => m.groups.length > 0);
  if (!hasGroups) {
    groupsEl.innerHTML = '<div class="empty">your pattern has no capture groups. wrap part of it in ( ) to capture.</div>';
    return;
  }
  let html = '';
  matches.forEach((m, idx) => {
    html += '<div class="match-block">';
    html += '<div class="head">match ' + (idx + 1) + ': "' + escapeHtml(m.text) + '"</div>';
    if (m.groups.length === 0) {
      html += '<div class="grp">(no groups)</div>';
    } else {
      m.groups.forEach((g, gi) => {
        const val = g === undefined ? '<i>undefined</i>' : '"' + escapeHtml(g) + '"';
        html += '<div class="grp">group ' + (gi + 1) + ': <b>' + val + '</b></div>';
      });
    }
    html += '</div>';
  });
  groupsEl.innerHTML = html;
}

function renderExplainer(pattern) {
  if (!pattern) {
    explainerEl.innerHTML = '<li class="empty-msg">type a pattern to see it broken down here</li>';
    return;
  }
  const tokens = window.RegexExplainer.explain(pattern);
  if (tokens.length === 0) {
    explainerEl.innerHTML = '<li class="empty-msg">nothing to explain</li>';
    return;
  }
  explainerEl.innerHTML = tokens.map(t =>
    '<li><span class="tok">' + escapeHtml(t.tok) + '</span><span class="desc">' + escapeHtml(t.desc) + '</span></li>'
  ).join('');
}

function update() {
  errorEl.textContent = '';
  flagsDisplay.textContent = getFlags();

  let re;
  try {
    re = buildRegex();
  } catch (err) {
    errorEl.textContent = err.message;
    matchCountEl.textContent = '0 matches';
    renderHighlights(testEl.value, []);
    renderGroups([]);
    renderExplainer(patternEl.value);
    return;
  }

  const text = testEl.value;
  const matches = re ? findMatches(re, text) : [];

  matchCountEl.textContent = matches.length === 1
    ? '1 match'
    : matches.length + ' matches';

  renderHighlights(text, matches);
  renderGroups(matches);
  renderExplainer(patternEl.value);
}

// keep the highlight layer scrolled in lockstep with the textarea
testEl.addEventListener('scroll', () => {
  highlightEl.scrollTop = testEl.scrollTop;
  highlightEl.scrollLeft = testEl.scrollLeft;
});

patternEl.addEventListener('input', update);
testEl.addEventListener('input', update);
flagBoxes.forEach(cb => cb.addEventListener('change', update));

// kick it off with a sample pattern so the page isn't dead on load
patternEl.value = '(\\w+)@(\\w+\\.\\w+)';
update();
