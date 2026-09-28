// Reads a box's chapter text (title, subtitle, learn HTML, quiz) out of its
// js/chapters/*.js without running any of it. Chapters import three.js and the
// box's kit, so importing them in Node would fail (and would run box code).
// Instead a tiny literal parser reads just the plain-data properties of each
// chapter's `export default { … }`: strings, template strings, numbers, arrays and
// objects. A `${NAME}` inside a template is filled in when NAME is a plain constant
// in the same file or one it imports; otherwise that paragraph is left out.
// Anything it can't read is skipped. It never throws.
import fs from 'node:fs';
import path from 'node:path';

const HOLE = '\u0000'; // marks an interpolation we could not resolve
const WANT = ['id', 'short', 'title', 'subtitle', 'learn', 'quiz'];
class Unsupported extends Error {}

// ---------------------------------------------------------------- literal parser
function parser(src, resolve) {
  let i = 0;
  const fail = (why) => { throw new Unsupported(why); };
  const ws = () => {
    for (;;) {
      const c = src[i];
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r') i++;
      else if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; }
      else if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; }
      else return;
    }
  };
  const escape = () => {
    const c = src[i++];
    switch (c) {
      case 'n': return '\n'; case 't': return '\t'; case 'r': return '\r'; case 'b': return '\b'; case 'f': return '\f'; case 'v': return '\v'; case '0': return '\0';
      case '\n': return '';
      case '\r': if (src[i] === '\n') i++; return '';
      case 'x': { const h = src.slice(i, i + 2); i += 2; return String.fromCharCode(parseInt(h, 16)); }
      case 'u': {
        if (src[i] === '{') { const e = src.indexOf('}', i); const h = src.slice(i + 1, e); i = e + 1; return String.fromCodePoint(parseInt(h, 16)); }
        const h = src.slice(i, i + 4); i += 4; return String.fromCharCode(parseInt(h, 16));
      }
      default: return c;
    }
  };
  const str = (q) => {
    i++;
    let out = '';
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\n') fail('newline in string');
      if (src[i] === '\\') { i++; out += escape(); } else out += src[i++];
    }
    if (src[i] !== q) fail('unterminated string');
    i++;
    return out;
  };
  // Skips a ${ … } expression we can't evaluate, respecting nested strings and braces.
  const skipExpr = () => {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '\'' || c === '"') { str(c); continue; }
      if (c === '`') { tpl(); continue; }
      if (c === '{') depth++;
      if (c === '}') { if (!depth) return; depth--; }
      i++;
    }
    fail('unterminated ${');
  };
  const IDENT = /[A-Za-z_$][\w$]*/y;
  const ident = () => { IDENT.lastIndex = i; const m = IDENT.exec(src); if (!m) return null; i += m[0].length; return m[0]; };
  // NAME, NAME.a.b or NAME['a'] → [NAME, 'a', 'b']
  const chain = () => {
    const first = ident();
    if (!first) return null;
    const parts = [first];
    for (;;) {
      const save = i;
      ws();
      if (src[i] === '.' && src[i + 1] !== '.') { i++; ws(); const p = ident(); if (!p) { i = save; break; } parts.push(p); }
      else if (src[i] === '[') { i++; ws(); if (src[i] !== '\'' && src[i] !== '"') { i = save; break; } const p = str(src[i]); ws(); if (src[i] !== ']') { i = save; break; } i++; parts.push(p); }
      else { i = save; break; }
    }
    return parts;
  };
  const tpl = () => {
    i++;
    let out = '';
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { i++; out += escape(); continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        i += 2; ws();
        const start = i;
        const parts = chain();
        ws();
        let v;
        if (parts && src[i] === '}') v = resolve(parts);
        else { i = start; skipExpr(); }
        if (src[i] !== '}') fail('bad ${');
        i++;
        out += typeof v === 'string' || typeof v === 'number' ? String(v) : HOLE;
        continue;
      }
      out += src[i++];
    }
    if (src[i] !== '`') fail('unterminated template');
    i++;
    return out;
  };
  const num = () => {
    const m = /-?(?:0[xX][\da-fA-F_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)/y;
    m.lastIndex = i;
    const r = m.exec(src);
    if (!r) fail('bad number');
    i += r[0].length;
    return Number(r[0].replace(/_/g, ''));
  };
  const primary = () => {
    ws();
    const c = src[i];
    if (c === '\'' || c === '"') return str(c);
    if (c === '`') return tpl();
    if (c === '[') {
      i++;
      const arr = [];
      for (;;) {
        ws();
        if (src[i] === ']') { i++; return arr; }
        arr.push(value());
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === ']') { i++; return arr; }
        fail('bad array');
      }
    }
    if (c === '{') {
      i++;
      const obj = {};
      for (;;) {
        ws();
        if (src[i] === '}') { i++; return obj; }
        let k;
        if (src[i] === '\'' || src[i] === '"') k = str(src[i]);
        else if (/[\d]/.test(src[i])) k = String(num());
        else { k = ident(); if (!k) fail('bad key'); }
        ws();
        if (src[i] !== ':') fail('not a plain property');
        i++;
        obj[k] = value();
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === '}') { i++; return obj; }
        fail('bad object');
      }
    }
    if (c === '-' || c === '.' || /\d/.test(c || '')) return num();
    const parts = chain();
    if (!parts) fail('unsupported expression');
    if (parts.length === 1 && parts[0] === 'true') return true;
    if (parts.length === 1 && parts[0] === 'false') return false;
    if (parts.length === 1 && parts[0] === 'null') return null;
    ws();
    if (src[i] === '(' || src[i] === '=' ) fail('call or function');
    const v = resolve(parts);
    if (v === undefined) fail(`unresolved ${parts.join('.')}`);
    return v;
  };
  // A primary, optionally joined with + (string concatenation / sums).
  const value = () => {
    let v = primary();
    for (;;) {
      ws();
      if (src[i] === '+' && src[i + 1] !== '+' && src[i + 1] !== '=') { i++; v = v + primary(); continue; }
      return v;
    }
  };
  return { at(pos) { i = pos; return value(); } };
}

// ---------------------------------------------------------------- constants
const fileCache = new Map();
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };

// A resolver for identifiers in `file`: its own top-level consts, then its named imports.
function resolverFor(file, depth = 0) {
  const src = read(file) ?? '';
  const imports = new Map();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    for (const part of m[1].split(',')) {
      const [name, as] = part.trim().split(/\s+as\s+/);
      if (name) imports.set((as || name).trim(), { file: path.resolve(path.dirname(file), m[2]), name: name.trim() });
    }
  }
  const memo = new Map();
  const own = (name, exported) => {
    const re = new RegExp(`(?:^|\\n)\\s*${exported ? 'export\\s+' : '(?:export\\s+)?'}const\\s+${name.replace(/\$/g, '\\$')}\\s*=\\s*`, 'g');
    const m = re.exec(src);
    if (!m) return undefined;
    try { return parser(src, resolve).at(m.index + m[0].length); } catch { return undefined; }
  };
  function base(name) {
    if (memo.has(name)) return memo.get(name);
    memo.set(name, undefined); // cycle guard
    let v = own(name, false);
    if (v === undefined && imports.has(name) && depth < 3) {
      const imp = imports.get(name);
      v = constantOf(imp.file, imp.name, depth + 1);
    }
    memo.set(name, v);
    return v;
  }
  function resolve(parts) {
    let v = base(parts[0]);
    for (const p of parts.slice(1)) v = v != null && typeof v === 'object' && Object.hasOwn(v, p) ? v[p] : undefined;
    return v;
  }
  return { resolve, exported: (name) => own(name, true) };
}

function constantOf(file, name, depth) {
  const key = `${file}#${name}`;
  if (!fileCache.has(key)) {
    let v;
    try { v = resolverFor(file, depth).exported(name); } catch { v = undefined; }
    fileCache.set(key, v);
  }
  return fileCache.get(key);
}

// ---------------------------------------------------------------- chapters
// The plain-data properties at the top level of `export default { … }`.
export function chapterFromSource(src, file) {
  const d = /export\s+default\s*\{/.exec(src);
  if (!d) return null;
  const after = src.slice(d.index + d[0].length);
  const indent = after.match(/\n([ \t]+)[A-Za-z_$'"]/)?.[1];
  if (!indent) return null;
  const { resolve } = resolverFor(file);
  const P = parser(src, resolve);
  const out = {};
  for (const key of WANT) {
    const m = new RegExp(`\\n${indent}${key}\\s*:\\s*`).exec(after);
    if (!m) continue;
    try { out[key] = P.at(d.index + d[0].length + m.index + m[0].length); } catch { /* not plain data: skip it */ }
  }
  return out;
}

const TEMPLATE = /Replace this chapter|Explain the idea in two or three short paragraphs|A question about the idea\?/;
const text = (s) => (typeof s === 'string' ? s.trim() : '');

function cleanQuiz(quiz) {
  if (!Array.isArray(quiz)) return [];
  return quiz.filter((x) => x && typeof x.q === 'string' && Array.isArray(x.options) && x.options.every((o) => typeof o === 'string')
    && Number.isInteger(x.answer) && x.options[x.answer] != null && !x.q.includes(HOLE) && !TEMPLATE.test(x.q))
    .map((x) => ({ q: plain(x.q), options: x.options.map(plain), answer: x.answer, why: typeof x.why === 'string' && !x.why.includes(HOLE) ? plain(x.why) : '' }));
}

// Chapter order comes from js/chapters/index.js (CHAPTERS = [a, b, …]); files it doesn't name come last.
function orderedFiles(dir) {
  let files;
  try { files = fs.readdirSync(dir).filter((f) => /\.m?js$/.test(f) && f !== 'index.js').sort(); } catch { return []; }
  const idx = read(path.join(dir, 'index.js')) || '';
  const byName = new Map([...idx.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]\.\/([^'"]+)['"]/g)].map((m) => [m[1], m[2]]));
  const list = idx.match(/CHAPTERS\s*=\s*\[([^\]]*)\]/)?.[1];
  const order = list ? list.split(',').map((s) => byName.get(s.trim())).filter(Boolean) : [];
  return [...order.filter((f) => files.includes(f)), ...files.filter((f) => !order.includes(f))];
}

const cache = new Map();
// [{ id, short, title, subtitle, learn (sanitised HTML), quiz: [{ q, options, answer, why }] }]
export function extractChapters(boxDir) {
  if (!boxDir) return [];
  const dir = path.join(boxDir, 'js', 'chapters');
  try {
    const files = orderedFiles(dir);
    const sig = files.map((f) => { try { const s = fs.statSync(path.join(dir, f)); return `${f}:${s.mtimeMs}:${s.size}`; } catch { return f; } }).join('|');
    const hit = cache.get(dir);
    if (hit && hit.sig === sig) return hit.v;
    fileCache.clear();
    const v = [];
    for (const f of files) {
      try {
        const file = path.join(dir, f);
        const c = chapterFromSource(read(file) || '', file);
        if (!c) continue;
        const learn = typeof c.learn === 'string' ? sanitize(c.learn) : '';
        if (TEMPLATE.test(`${c.subtitle} ${c.learn}`) || !(text(c.title) || learn)) continue;
        v.push({ id: text(c.id) || f.replace(/\.m?js$/, ''), short: plain(text(c.short)), title: plain(text(c.title) || text(c.short)), subtitle: plain(text(c.subtitle)), learn, quiz: cleanQuiz(c.quiz) });
      } catch { /* skip this chapter */ }
    }
    cache.set(dir, { sig, v });
    return v;
  } catch { return []; }
}

// ---------------------------------------------------------------- HTML
const ALLOWED = new Set(['p', 'b', 'strong', 'i', 'em', 'a', 'ul', 'ol', 'li', 'br', 'sub', 'sup', 'code', 'small', 'abbr', 'q', 'kbd', 'mark', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
const VOID = new Set(['br']);

// Keeps a small set of inline and block tags and safe links; drops "Try it" tips (they
// talk about the 3D controls) and any paragraph with a value we couldn't fill in.
export function sanitize(html) {
  let s = String(html);
  s = s.replace(/<(script|style|template|svg|canvas)\b[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<(p|li|div)\b[^>]*class="[^"]*\btip\b[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, '');
  for (const t of ['li', 'p']) s = s.replace(new RegExp(`<${t}\\b[^>]*>(?:(?!<\\/?${t}\\b)[\\s\\S])*?${HOLE}[\\s\\S]*?<\\/${t}>`, 'gi'), '');
  s = s.replace(new RegExp(HOLE, 'g'), '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?([a-zA-Z][\w-]*)([^>]*)>/g, (m, tag, attrs) => {
    const t = tag.toLowerCase();
    if (/^h[1-6]$/.test(t)) return m.startsWith('</') ? '</h4>' : '<h4>';
    if (!ALLOWED.has(t)) return '';
    if (m.startsWith('</')) return VOID.has(t) ? '' : `</${t}>`;
    if (t === 'a') {
      const href = attrs.match(/\bhref\s*=\s*"([^"]*)"/i)?.[1] || attrs.match(/\bhref\s*=\s*'([^']*)'/i)?.[1] || '';
      if (/^(https?:\/\/|\/(?!\/)|#)/i.test(href) && !/[<>"]/.test(href)) {
        const ext = /^https?:/i.test(href);
        return `<a href="${href.replace(/&(?!amp;|#?\w+;)/g, '&amp;')}"${ext ? ' rel="noopener"' : ''}>`;
      }
      return '<a>';
    }
    if (t === 'abbr') { const title = attrs.match(/\btitle\s*=\s*"([^"<>]*)"/i)?.[1]; return title ? `<abbr title="${title}">` : '<abbr>'; }
    return `<${t}>`;
  });
  // Links without a usable href become plain text.
  s = s.replace(/<a>([\s\S]*?)<\/a>/g, '$1');
  s = s.replace(/<p>\s*<\/p>/g, '');
  return s.replace(/\n\s+/g, '\n').trim();
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', times: '×', divide: '÷', minus: '−', deg: '°', middot: '·', rarr: '→', larr: '←', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
// HTML → plain text (for quiz items, JSON-LD and llms.txt).
export function plain(html) {
  return String(html ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|li|h\d)>/gi, '$& ').replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m))
    .replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
}
