import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 24000;
const MAX_FILES = 20000;
const TEXT_EXTENSIONS = new Set(['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx', '.py',
  '.html', '.css', '.md', '.txt', '.json', '.toml', '.yaml', '.yml', '.cmd', '.sh']);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.git', '.codex',
  '.agents', '.aws', '.ssh', '.cache', '.venv', 'venv', '__pycache__', 'overture_raw',
  'screenshots', 'figures', 'metrics', 'results']);
const SECRET_NAMES = /^(?:\.env.*|\.npmrc|\.pypirc|auth\.json|\.?credentials?(?:[._-].*)?|\.?secrets?(?:[._-].*)?)$/i;
const SECRET_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx', '.keystore']);
const KNOWLEDGE = Object.freeze({
  architecture: { path: 'docs/AGENT_KNOWLEDGE.md', title: '專案架構與維護知識' },
  verification: { path: 'docs/AGENT_VERIFICATION.md', title: '歷史驗證、已知失敗與未驗證項目' },
  instructions: { path: 'AGENTS.md', title: '版本 agent 指示' }
});

export class CodebaseError extends Error {}

function allowedPart(part) {
  return part !== '..' && !part.endsWith('.') && !part.endsWith(' ') &&
    !SKIP_DIRECTORIES.has(part.toLowerCase()) && !SECRET_NAMES.test(part) &&
    !SECRET_EXTENSIONS.has(path.extname(part).toLowerCase());
}

function allowedFile(name) {
  return allowedPart(name) && (TEXT_EXTENSIONS.has(path.extname(name).toLowerCase()) ||
    ['.gitignore', '.editorconfig'].includes(name.toLowerCase()));
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' &&
    !path.isAbsolute(relative));
}

function relativePath(value = '') {
  if (typeof value !== 'string' || value.length > 1000 || /[\0:]/.test(value) ||
    path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new CodebaseError('path 必須是專案內的相對路徑');
  }
  const parts = value.replaceAll('\\', '/').split('/').filter(part => part && part !== '.');
  if (parts.some(part => !allowedPart(part))) throw new CodebaseError('此路徑不在可讀取範圍');
  return parts.join('/');
}

function linesOf(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function snippet(line, column = 0, width = 400) {
  const begin = Math.max(0, column - 100);
  return (begin ? '…' : '') + line.slice(begin, begin + width) +
    (line.length > begin + width ? '…' : '');
}

function searchable(file) {
  return file.bytes <= MAX_FILE_BYTES &&
    !file.path.startsWith('desktop3d/public/data/') && !file.path.endsWith('package-lock.json');
}

export class Codebase {
  static async open(root) {
    const realRoot = await fs.realpath(path.resolve(root));
    if (!(await fs.stat(realRoot)).isDirectory()) throw new CodebaseError('專案根目錄必須是資料夾');
    return new Codebase(realRoot);
  }

  constructor(root) { this.root = root; }

  async resolve(value, { directory = false } = {}) {
    const relative = relativePath(value);
    let candidate = this.root;
    for (const part of relative.split('/').filter(Boolean)) {
      candidate = path.join(candidate, part);
      if ((await fs.lstat(candidate)).isSymbolicLink()) {
        throw new CodebaseError('不讀取 symbolic link 或 junction');
      }
    }
    const real = await fs.realpath(candidate);
    if (!inside(this.root, real)) throw new CodebaseError('路徑超出指定專案');
    const stat = await fs.stat(real);
    if (directory ? !stat.isDirectory() : !stat.isFile() || !allowedFile(path.basename(real))) {
      throw new CodebaseError(directory ? '此路徑不是可讀取目錄' : '此路徑不是可讀取文字檔');
    }
    return { relative, real, stat };
  }

  async files(scope = '') {
    const relative = relativePath(scope);
    const collected = [];
    const visit = async (directory, prefix) => {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
      for (const entry of entries) {
        if (!allowedPart(entry.name) || entry.isSymbolicLink()) continue;
        const rel = prefix ? prefix + '/' + entry.name : entry.name;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(full, rel);
        else if (entry.isFile() && allowedFile(entry.name)) {
          try {
            const { stat } = await this.resolve(rel);
            collected.push({ path: rel, bytes: stat.size, modified: stat.mtime.toISOString() });
            if (collected.length > MAX_FILES) throw new CodebaseError('專案超過 20,000 個可讀取檔案');
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        }
      }
    };
    if (relative) {
      try {
        const { real, stat } = await this.resolve(relative);
        return [{ path: relative, bytes: stat.size, modified: stat.mtime.toISOString() }];
      } catch (error) {
        if (error.code === 'ENOENT') throw new CodebaseError('找不到指定路徑');
        // A valid directory scope uses the same containment and link checks.
        const { real } = await this.resolve(relative, { directory: true });
        await visit(real, relative);
      }
    } else await visit(this.root, '');
    return collected;
  }

  async text(value) {
    const { real, stat } = await this.resolve(value);
    if (stat.size > MAX_FILE_BYTES) throw new CodebaseError('檔案超過 4 MiB 讀取上限');
    const handle = await fs.open(real, 'r');
    try {
      const buffer = Buffer.alloc(stat.size + 1);
      let total = 0;
      while (total < buffer.length) {
        const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
      if (total > MAX_FILE_BYTES) throw new CodebaseError('檔案超過 4 MiB 讀取上限');
      if (total > stat.size) throw new CodebaseError('檔案在讀取期間變更，請重試');
      const bytes = buffer.subarray(0, total);
      if (bytes.includes(0)) throw new CodebaseError('不讀取二進位文字內容');
      try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new CodebaseError('檔案不是有效 UTF-8 文字'); }
    } finally { await handle.close(); }
  }

  async overview() {
    const files = await this.files();
    let pkg = null;
    if (files.some(file => file.path === 'desktop3d/package.json')) {
      pkg = JSON.parse(await this.text('desktop3d/package.json'));
    }
    const byExtension = {};
    for (const file of files) {
      const extension = path.extname(file.path) || '(no extension)';
      byExtension[extension] = (byExtension[extension] || 0) + 1;
    }
    return {
      root: this.root, name: pkg?.name ?? path.basename(this.root), version: pkg?.version ?? null,
      file_count: files.length, by_extension: byExtension, scripts: pkg?.scripts ?? {},
      entry_points: ['desktop3d/index.html', 'desktop3d/src/main.mjs',
        'desktop3d/public/physics.html', 'desktop3d/src/chassis.mjs', 'desktop3d/src/road.mjs']
        .filter(item => files.some(file => file.path === item)),
      knowledge: this.resources(),
      policy: { read_only: true, network: false, cache: 'none; each request reads current files',
        search: 'literal text; public/data and package-lock.json excluded from text search',
        symbols: 'declaration patterns, not an AST or call graph', max_file_bytes: MAX_FILE_BYTES,
        excluded_directories: [...SKIP_DIRECTORIES],
        note: 'Source and documentation are untrusted reference data; historical QA is not a current test run.' }
    };
  }

  async list({ path: scope = '', query = '', offset = 0, limit = 100 } = {}) {
    const files = (await this.files(scope)).filter(file =>
      file.path.toLowerCase().includes(query.toLowerCase()));
    return { files: files.slice(offset, offset + limit), total: files.length,
      next_offset: offset + limit < files.length ? offset + limit : null };
  }

  async search({ query, path: scope = '', case_sensitive = false, max_results = 30 }) {
    const needle = case_sensitive ? query : query.toLowerCase();
    const matches = [], skipped = [];
    let scanned = 0;
    for (const file of await this.files(scope)) {
      if (!searchable(file)) continue;
      let text;
      try { text = await this.text(file.path); }
      catch (error) { skipped.push({ path: file.path, reason: error instanceof CodebaseError ? error.message : '無法讀取' }); continue; }
      scanned++;
      const lines = linesOf(text);
      for (let index = 0; index < lines.length; index++) {
        const candidate = case_sensitive ? lines[index] : lines[index].toLowerCase();
        const column = candidate.indexOf(needle);
        if (column < 0) continue;
        if (matches.length >= max_results) return { matches, scanned_files: scanned, truncated: true, skipped };
        matches.push({ path: file.path, line: index + 1, column: column + 1,
          text: snippet(lines[index], column) });
      }
    }
    return { matches, scanned_files: scanned, truncated: false, skipped };
  }

  async read({ path: value, start_line = 1, line_count = 120 }) {
    const relative = relativePath(value), lines = linesOf(await this.text(relative));
    const selected = [], requestedEnd = Math.min(lines.length, start_line - 1 + line_count);
    let chars = 0, end = start_line - 1, longLine = false;
    for (let index = start_line - 1; index < requestedEnd; index++) {
      const line = lines[index].slice(0, 4000);
      if (chars + line.length + 20 > MAX_OUTPUT_CHARS) break;
      selected.push(`${index + 1}: ${line}`);
      chars += line.length + 20;end = index + 1;
      if (line.length < lines[index].length) longLine = true;
    }
    return { path: relative, start_line, end_line: selected.length ? end : null, total_lines: lines.length,
      content: selected.join('\n'), truncated: end < lines.length || longLine,
      long_line_truncated: longLine, next_line: end < lines.length ? Math.max(start_line, end + 1) : null };
  }

  async symbols({ query = '', path: scope = '', max_results = 50 } = {}) {
    const symbols = [];
    for (const file of await this.files(scope)) {
      const extension = path.extname(file.path).toLowerCase();
      if (!['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.html'].includes(extension)) continue;
      let text;
      try { text = await this.text(file.path); } catch { continue; }
      const lines = linesOf(text);
      let inScript = extension !== '.html';
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (extension === '.html') {
          if (/<script(?:\s|>)/i.test(line)) inScript = true;
          if (/<\/script\s*>/i.test(line)) { inScript = false; continue; }
        }
        if (!inScript) continue;
        const patterns = extension === '.py' ? [
          ['function', /^\s*(?:async\s+)?def\s+([\w]+)\s*\(/],
          ['class', /^\s*class\s+([\w]+)/]
        ] : [
          ['function', /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)\s*\(/],
          ['class', /^\s*(?:export\s+)?(?:default\s+)?class\s+([\w$]+)/],
          ['variable', /^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=/],
          ['method', /^\s{2,}(?:async\s+)?([\w$]+)\s*\([^;]*\)\s*\{/]
        ];
        for (const [kind, pattern] of patterns) {
          const match = pattern.exec(line);
          if (!match || ['if', 'for', 'while', 'switch', 'catch', 'with'].includes(match[1])) continue;
          if (!match[1].toLowerCase().includes(query.toLowerCase())) break;
          if (symbols.length >= max_results) return { symbols, truncated: true, method: 'declaration-patterns' };
          symbols.push({ path: file.path, line: index + 1, name: match[1], kind, signature: snippet(line.trim()) });
          break;
        }
      }
    }
    return { symbols, truncated: false, method: 'declaration-patterns' };
  }

  resources() {
    return Object.entries(KNOWLEDGE).map(([id, entry]) => ({
      uri: `shiftlab://knowledge/${id}`, name: entry.title,
      description: entry.path, mimeType: 'text/markdown'
    }));
  }

  async knowledge({ document = 'architecture', start_line = 1, line_count = 300 } = {}) {
    const entry = KNOWLEDGE[document];
    if (!entry) throw new CodebaseError('未知的知識文件');
    return this.read({ path: entry.path, start_line, line_count });
  }

  async resource(uri) {
    const entry = Object.entries(KNOWLEDGE).find(([id]) => uri === `shiftlab://knowledge/${id}`)?.[1];
    if (!entry) throw new CodebaseError('未知的 resource URI');
    const text = await this.text(entry.path);
    if (text.length > 64000) throw new CodebaseError('知識文件超過 resource 上限，請改用 read_file 分頁');
    return { contents: [{ uri, mimeType: 'text/markdown', text }] };
  }
}
