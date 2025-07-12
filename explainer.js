// regex explainer
// walks a pattern character by character and produces a list of
// { tok, desc } rows. covers the common stuff: literals, escapes,
// classes, character sets, quantifiers, anchors, groups, alternation.
// not a full ECMA spec parser. enough for everyday patterns.

(function () {
  const SHORTHAND = {
    '\\d': 'any digit (0 to 9)',
    '\\D': 'any character that is not a digit',
    '\\w': 'any word character (letters, digits, underscore)',
    '\\W': 'any character that is not a word character',
    '\\s': 'any whitespace (space, tab, newline)',
    '\\S': 'any character that is not whitespace',
    '\\b': 'a word boundary',
    '\\B': 'not a word boundary',
    '\\n': 'a newline',
    '\\t': 'a tab',
    '\\r': 'a carriage return',
    '\\0': 'a null character',
    '\\.': 'a literal dot',
    '\\\\': 'a literal backslash',
    '\\/': 'a literal forward slash',
  };

  function describeClassRange(content) {
    // describe the inside of a [...] class in plain English
    if (!content) return 'an empty character class';
    let neg = false;
    let body = content;
    if (body.startsWith('^')) { neg = true; body = body.slice(1); }
    const parts = [];
    let i = 0;
    while (i < body.length) {
      const c = body[i];
      if (c === '\\' && i + 1 < body.length) {
        const esc = body.slice(i, i + 2);
        parts.push(SHORTHAND[esc] || ('a literal ' + body[i + 1]));
        i += 2;
        continue;
      }
      if (i + 2 < body.length && body[i + 1] === '-' && body[i + 2] !== ']') {
        parts.push(c + ' to ' + body[i + 2]);
        i += 3;
        continue;
      }
      parts.push(c);
      i++;
    }
    const joined = parts.length === 1 ? parts[0] : parts.join(', ');
    return (neg ? 'any character NOT matching: ' : 'any one of: ') + joined;
  }

  function quantifierDesc(q) {
    if (q === '*') return 'zero or more of the previous';
    if (q === '+') return 'one or more of the previous';
    if (q === '?') return 'zero or one of the previous (optional)';
    const m = q.match(/^\{(\d+)(?:,(\d*))?\}$/);
    if (m) {
      const a = m[1];
      if (m[2] === undefined) return 'exactly ' + a + ' of the previous';
      if (m[2] === '') return a + ' or more of the previous';
      return 'between ' + a + ' and ' + m[2] + ' of the previous';
    }
    return q;
  }

  function explain(pattern) {
    const tokens = [];
    if (!pattern) return tokens;

    let i = 0;
    let groupNum = 0;

    while (i < pattern.length) {
      const c = pattern[i];

      // anchors
      if (c === '^') {
        tokens.push({ tok: '^', desc: 'start of line (or string)' });
        i++; continue;
      }
      if (c === '$') {
        tokens.push({ tok: '$', desc: 'end of line (or string)' });
        i++; continue;
      }

      // alternation
      if (c === '|') {
        tokens.push({ tok: '|', desc: 'OR. match what is on the left or the right' });
        i++; continue;
      }

      // any char
      if (c === '.') {
        tokens.push({ tok: '.', desc: 'any character (except newline by default)' });
        i++;
        i = consumeQuantifier(pattern, i, tokens);
        continue;
      }

      // escape
      if (c === '\\' && i + 1 < pattern.length) {
        const esc = pattern.slice(i, i + 2);
        if (SHORTHAND[esc]) {
          tokens.push({ tok: esc, desc: SHORTHAND[esc] });
        } else if (/^\\\d$/.test(esc)) {
          tokens.push({ tok: esc, desc: 'backreference to group ' + esc[1] });
        } else {
          tokens.push({ tok: esc, desc: 'a literal ' + pattern[i + 1] });
        }
        i += 2;
        i = consumeQuantifier(pattern, i, tokens);
        continue;
      }

      // character class
      if (c === '[') {
        const end = findClassEnd(pattern, i);
        if (end === -1) {
          tokens.push({ tok: '[', desc: 'unclosed character class' });
          i++; continue;
        }
        const inside = pattern.slice(i + 1, end);
        tokens.push({ tok: pattern.slice(i, end + 1), desc: describeClassRange(inside) });
        i = end + 1;
        i = consumeQuantifier(pattern, i, tokens);
        continue;
      }

      // group
      if (c === '(') {
        let label;
        let advance = 1;
        if (pattern.slice(i, i + 3) === '(?:') {
          label = 'start of a non-capturing group';
          advance = 3;
        } else if (pattern.slice(i, i + 3) === '(?=') {
          label = 'start of a positive lookahead (must be followed by)';
          advance = 3;
        } else if (pattern.slice(i, i + 3) === '(?!') {
          label = 'start of a negative lookahead (must NOT be followed by)';
          advance = 3;
        } else if (pattern.slice(i, i + 4) === '(?<=') {
          label = 'start of a positive lookbehind (must be preceded by)';
          advance = 4;
        } else if (pattern.slice(i, i + 4) === '(?<!') {
          label = 'start of a negative lookbehind (must NOT be preceded by)';
          advance = 4;
        } else {
          groupNum++;
          label = 'start of capture group ' + groupNum;
        }
        tokens.push({ tok: pattern.slice(i, i + advance), desc: label });
        i += advance;
        continue;
      }
      if (c === ')') {
        tokens.push({ tok: ')', desc: 'end of group' });
        i++;
        i = consumeQuantifier(pattern, i, tokens);
        continue;
      }

      // standalone quantifier (rare without preceding atom, but handle it)
      if (c === '*' || c === '+' || c === '?') {
        tokens.push({ tok: c, desc: quantifierDesc(c) });
        i++; continue;
      }
      if (c === '{') {
        const close = pattern.indexOf('}', i);
        if (close !== -1) {
          const q = pattern.slice(i, close + 1);
          tokens.push({ tok: q, desc: quantifierDesc(q) });
          i = close + 1;
          continue;
        }
      }

      // plain literal. coalesce runs of literals to keep the list short.
      let literal = c;
      let j = i + 1;
      while (j < pattern.length && isLiteralChar(pattern[j]) && !isQuantifierStart(pattern, j)) {
        literal += pattern[j];
        j++;
      }
      // if next char is a quantifier, the LAST literal char is what gets quantified.
      // pull that last char back out so the quantifier attaches to it cleanly.
      if (literal.length > 1 && j < pattern.length && isQuantifierStart(pattern, j)) {
        const lead = literal.slice(0, -1);
        const tail = literal.slice(-1);
        tokens.push({ tok: lead, desc: 'the literal text "' + lead + '"' });
        tokens.push({ tok: tail, desc: 'the literal character "' + tail + '"' });
        i = j;
        i = consumeQuantifier(pattern, i, tokens);
        continue;
      }
      if (literal.length === 1) {
        tokens.push({ tok: literal, desc: 'the literal character "' + literal + '"' });
      } else {
        tokens.push({ tok: literal, desc: 'the literal text "' + literal + '"' });
      }
      i = j;
    }

    return tokens;
  }

  function isLiteralChar(ch) {
    return !'.^$|()[]{}\\*+?'.includes(ch);
  }

  function isQuantifierStart(pat, idx) {
    const ch = pat[idx];
    return ch === '*' || ch === '+' || ch === '?' || ch === '{';
  }

  function consumeQuantifier(pat, i, tokens) {
    if (i >= pat.length) return i;
    const ch = pat[i];
    if (ch === '*' || ch === '+' || ch === '?') {
      // check for lazy modifier
      let q = ch;
      let next = i + 1;
      if (pat[next] === '?') { q += '?'; next++; }
      tokens.push({ tok: q, desc: quantifierDesc(ch) + (q.endsWith('?') && q.length > 1 ? ' (lazy, match as little as possible)' : '') });
      return next;
    }
    if (ch === '{') {
      const close = pat.indexOf('}', i);
      if (close !== -1) {
        const q = pat.slice(i, close + 1);
        tokens.push({ tok: q, desc: quantifierDesc(q) });
        return close + 1;
      }
    }
    return i;
  }

  function findClassEnd(pat, start) {
    // class ends at the first unescaped ]. account for ] right after [ or [^.
    let i = start + 1;
    if (pat[i] === '^') i++;
    if (pat[i] === ']') i++; // ] as first char is literal
    while (i < pat.length) {
      if (pat[i] === '\\') { i += 2; continue; }
      if (pat[i] === ']') return i;
      i++;
    }
    return -1;
  }

  window.RegexExplainer = { explain };
})();
