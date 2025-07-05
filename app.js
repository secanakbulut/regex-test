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
    matches.push({ index: m.index, text: m[0] });
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
    return;
  }

  const text = testEl.value;
  const matches = re ? findMatches(re, text) : [];

  matchCountEl.textContent = matches.length === 1
    ? '1 match'
    : matches.length + ' matches';

  renderHighlights(text, matches);
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
patternEl.value = '\\b\\w+@\\w+\\.\\w+\\b';
update();
