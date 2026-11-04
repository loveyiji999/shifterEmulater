import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Codebase } from '../lib/codebase.mjs';

const SERVER = fileURLToPath(new URL('../server.mjs', import.meta.url));

async function fixture(t) {
  const container = await fs.mkdtemp(path.join(os.tmpdir(), 'shiftlab-codebase-mcp-'));
  const root = path.join(container, 'project');
  await fs.mkdir(root);
  const write = async (name, text) => {
    const target = path.join(root, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text);
  };
  await write('src/car.mjs', 'export class Car {\r\n  step(dt) { return dt; }\r\n}\r\nexport function drive() {}\r\nconst speed = 1;\r\n// 臺南車輪\r\n');
  await write('scripts/car.py', 'class Driver:\n    async def shift(self):\n        pass\n');
  await write('public/physics.html', '<script>\nfunction advancePhysics(dt) { return dt; }\n</script>\n');
  await write('desktop3d/package.json', JSON.stringify({ name: 'fixture', version: '1.9.7.1', scripts: { dev: 'vite' } }));
  await write('docs/AGENT_KNOWLEDGE.md', '# 架構\nRapier 是車身權威。\n');
  await write('docs/AGENT_VERIFICATION.md', '# 歷史 QA\n兩項測試失敗；未驗證瀏覽器。\n');
  await write('AGENTS.md', '# 測試專案\n');
  await write('node_modules/hidden.mjs', 'SENSITIVE_MARKER');
  await write('dist/built.js', 'SENSITIVE_MARKER');
  await write('overture_raw/raw.json', 'SENSITIVE_MARKER');
  await write('.env', 'SENSITIVE_MARKER');
  await write('.env.local', 'SENSITIVE_MARKER');
  await write('.envrc', 'SENSITIVE_MARKER');
  await write('.codex/config.toml', 'SENSITIVE_MARKER');
  await write('private.pem', 'SENSITIVE_MARKER');
  await write('credentials.json', 'SENSITIVE_MARKER');
  await write('desktop3d/public/data/map.json', 'LARGE_MAP_MARKER');
  await write('package-lock.json', 'LOCK_MARKER');
  await write('invalid.txt', Buffer.from([0xff, 0xfe]));
  await write('binary.txt', Buffer.from([0, 1, 2]));
  const db = await Codebase.open(root);
  t.after(async () => {
    const resolved = path.resolve(container);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('shiftlab-codebase-mcp-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return { db, root, write, container };
}

test('file inventory, paging, exclusions, and live filesystem updates', async t => {
  const { db, root, write } = await fixture(t);
  const all = await db.files();
  assert.ok(all.some(file => file.path === 'src/car.mjs'));
  assert.ok(!all.some(file => /hidden|built|raw\.json|\.env|private\.pem|credentials|config\.toml/.test(file.path)));
  const first = await db.list({ limit: 2 });
  const second = await db.list({ offset: first.next_offset, limit: 2 });
  assert.equal(first.files.length, 2);
  assert.notDeepEqual(first.files, second.files);
  assert.equal((await db.list({ path: 'src', query: 'CAR' })).total, 1);
  await write('src/new.mjs', 'export function newCode() {}');
  assert.equal((await db.list({ path: 'src' })).total, 2);
  await fs.unlink(path.join(root, 'src/new.mjs'));
  assert.equal((await db.list({ path: 'src' })).total, 1);
});

test('read ranges, CRLF line numbers, UTF-8 validation, and output limits', async t => {
  const { db, write } = await fixture(t);
  const page = await db.read({ path: 'src\\car.mjs', start_line: 4, line_count: 2 });
  assert.equal(page.path, 'src/car.mjs');
  assert.equal(page.content, '4: export function drive() {}\n5: const speed = 1;');
  assert.equal(page.next_line, 6);
  assert.equal((await db.read({ path: 'src/car.mjs', start_line: 99 })).end_line, null);
  await assert.rejects(db.text('binary.txt'), /二進位/);
  await assert.rejects(db.text('invalid.txt'), /UTF-8/);
  await write('long.txt', '長'.repeat(10000));
  const long = await db.read({ path: 'long.txt' });
  assert.ok(long.long_line_truncated);
  assert.ok(long.content.length < 24000);
  await write('big.txt', Buffer.alloc(4 * 1024 * 1024 + 1, 65));
  await assert.rejects(db.text('big.txt'), /4 MiB/);
});

test('literal search respects scope, case, data exclusions, limits, and file edits', async t => {
  const { db, write } = await fixture(t);
  assert.equal((await db.search({ query: '臺南車輪' })).matches[0].line, 6);
  assert.equal((await db.search({ query: 'DRIVE', path: 'src', case_sensitive: true })).matches.length, 0);
  assert.equal((await db.search({ query: 'DRIVE', path: 'src' })).matches[0].line, 4);
  assert.equal((await db.search({ query: 'SENSITIVE_MARKER' })).matches.length, 0);
  assert.equal((await db.search({ query: 'LARGE_MAP_MARKER' })).matches.length, 0);
  assert.equal((await db.search({ query: 'LOCK_MARKER' })).matches.length, 0);
  const limited = await db.search({ query: 'r', path: 'src', max_results: 1 });
  assert.equal(limited.matches.length, 1);
  assert.equal(limited.truncated, true);
  await write('src/car.mjs', 'function replacement() {}\n');
  assert.equal((await db.search({ query: 'replacement', path: 'src' })).matches[0].line, 1);
});

test('symbols locate JS declarations, methods, Python, and inline physics with original lines', async t => {
  const { db } = await fixture(t);
  assert.equal((await db.symbols({ query: 'Car', path: 'src' })).symbols[0].kind, 'class');
  assert.equal((await db.symbols({ query: 'step', path: 'src' })).symbols[0].line, 2);
  assert.equal((await db.symbols({ query: 'drive', path: 'src' })).symbols[0].line, 4);
  assert.equal((await db.symbols({ query: 'shift', path: 'scripts' })).symbols[0].line, 2);
  assert.equal((await db.symbols({ query: 'advancePhysics', path: 'public/physics.html' })).symbols[0].line, 2);
});

test('relative paths, sensitive files, alternate streams, symlinks and junctions stay out of scope', async t => {
  const { db, root, container } = await fixture(t);
  for (const value of ['../outside.txt', '/etc/passwd', 'C:\\Windows\\win.ini',
    '\\\\server\\share\\file.txt', '.env', '.env.local', '.envrc', '.codex/config.toml',
    'credentials.json', 'private.pem', 'src/car.mjs:stream', 'src/../AGENTS.md', '.env. ']) {
    await assert.rejects(db.text(value));
  }
  const external = path.join(container, 'outside');
  await fs.mkdir(external);
  await fs.writeFile(path.join(external, 'private.txt'), 'OUTSIDE_MARKER');
  await fs.symlink(external, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.ok(!(await db.files()).some(file => file.path.startsWith('linked/')));
  await assert.rejects(db.text('linked/private.txt'), /symbolic link|junction/);
  await assert.rejects(db.files('linked'), /symbolic link|junction/);
  assert.equal((await db.search({ query: 'OUTSIDE_MARKER' })).matches.length, 0);
});

test('overview and knowledge resources reflect actual files without running tests', async t => {
  const { db, write } = await fixture(t);
  assert.equal((await db.overview()).version, '1.9.7.1');
  assert.equal(db.resources().length, 3);
  const resource = await db.resource('shiftlab://knowledge/verification');
  assert.match(resource.contents[0].text, /失敗/);
  await write('docs/AGENT_KNOWLEDGE.md', '# 新架構\n重新讀取。\n');
  assert.match((await db.knowledge()).content, /重新讀取/);
  await assert.rejects(db.resource('file:///etc/passwd'), /未知/);
});

async function client(t, root) {
  const child = spawn(process.execPath, [SERVER, '--root', root], {
    cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
  });
  const pending = new Map();
  let nextId = 1, buffer = '', stderr = '';
  child.stderr.setEncoding('utf8');child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const response = JSON.parse(buffer.slice(0, newline));buffer = buffer.slice(newline + 1);
      const waiting = pending.get(response.id);
      if (waiting) { clearTimeout(waiting.timer);pending.delete(response.id);waiting.resolve(response); }
    }
  });
  const send = (payload, id) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id);reject(new Error('MCP response timeout: ' + stderr)); }, 5000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(payload + '\n');
  });
  const request = (method, params = {}) => {
    const id = nextId++;
    return send(JSON.stringify({ jsonrpc: '2.0', id, method, params }), id);
  };
  const notify = (method, params = {}) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  await once(child, 'spawn');
  t.after(async () => {
    for (const waiting of pending.values()) { clearTimeout(waiting.timer);waiting.reject(new Error('Client closed')); }
    const closed = once(child, 'close');
    child.stdin.end();
    const timeout = setTimeout(() => child.kill(), 3000);
    await closed;clearTimeout(timeout);
    assert.equal(stderr, '');
  });
  return { request, notify, raw: line => send(line, null), child };
}

async function initialize(c, version = '2025-11-25') {
  const response = await c.request('initialize', { protocolVersion: version, capabilities: {},
    clientInfo: { name: 'independent-wire-test-client', version: '1.0.0' } });
  c.notify('notifications/initialized');
  return response;
}

test('real stdio MCP handshake, all six tools, resources, and bounded failures', async t => {
  const { root } = await fixture(t);
  const c = await client(t, root);
  assert.equal((await c.request('tools/list')).error.code, -32002);
  const init = await initialize(c);
  assert.equal(init.result.protocolVersion, '2025-11-25');
  assert.equal(init.result.serverInfo.name, 'shift-lab-codebase');
  const tools = (await c.request('tools/list')).result.tools;
  assert.equal(tools.length, 6);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint && !tool.annotations.openWorldHint));
  const calls = {
    get_project_overview: {}, list_files: { path: 'src' }, search_code: { query: 'drive', path: 'src' },
    read_file: { path: 'src/car.mjs', start_line: 4, line_count: 1 },
    find_symbols: { query: 'advancePhysics' }, read_knowledge: { document: 'verification' }
  };
  for (const [name, args] of Object.entries(calls)) {
    const response = await c.request('tools/call', { name, arguments: args });
    assert.equal(response.result.isError, false, name);
    assert.ok(response.result.structuredContent);
    assert.deepEqual(JSON.parse(response.result.content[0].text), response.result.structuredContent);
  }
  assert.equal((await c.request('resources/list')).result.resources.length, 3);
  assert.match((await c.request('resources/read', { uri: 'shiftlab://knowledge/architecture' })).result.contents[0].text, /Rapier/);
  assert.equal((await c.request('resources/templates/list')).result.resourceTemplates.length, 0);
  assert.equal((await c.request('resources/read', { uri: 'file:///etc/passwd' })).error.code, -32002);
  assert.equal((await c.request('tools/call', { name: 'read_file', arguments: { path: '../outside.txt' } })).result.isError, true);
  assert.equal((await c.request('tools/call', { name: 'search_code', arguments: { query: '' } })).error.code, -32602);
  assert.equal((await c.request('tools/call', { name: 'search_code', arguments: { query: 'x', max_results: 999 } })).error.code, -32602);
  assert.equal((await c.request('tools/call', { name: 'read_file', arguments: { path: 'AGENTS.md', command: 'echo hacked' } })).error.code, -32602);
  assert.equal((await c.request('tools/call', { name: '__proto__' })).error.code, -32602);
  assert.equal((await c.raw('{broken-json')).error.code, -32700);
  assert.equal((await c.raw('[]')).error.code, -32600);
  assert.equal((await c.request('unknown/method')).error.code, -32601);
  assert.deepEqual((await c.request('ping')).result, {});
});

test('stdio version negotiation and legacy results omit unsupported structured output', async t => {
  const { root } = await fixture(t);
  const old = await client(t, root);
  assert.equal((await initialize(old, '2024-11-05')).result.protocolVersion, '2024-11-05');
  assert.equal((await old.request('tools/call', { name: 'list_files' })).result.structuredContent, undefined);
  const future = await client(t, root);
  assert.equal((await initialize(future, '2099-01-01')).result.protocolVersion, '2025-11-25');
});

test('stdio rejects an oversized frame and continues with the following valid request', async t => {
  const { root } = await fixture(t);
  const c = await client(t, root);
  await initialize(c);
  assert.equal((await c.raw('x'.repeat(1024 * 1024 + 1))).error.code, -32600);
  assert.deepEqual((await c.request('ping')).result, {});
});

test('actual SHIFT LAB source and knowledge are available over the real MCP wire', async t => {
  const root = fileURLToPath(new URL('../../SHIFT_LAB_V1.9.7.1_Tainan_Road_Level_Hotfix/SHIFT_LAB_V1.9.7.1_Tainan_Road_Level_Hotfix/', import.meta.url));
  const c = await client(t, root);
  await initialize(c);
  const call = async (name, args = {}) => {
    const response = await c.request('tools/call', { name, arguments: args });
    assert.equal(response.result?.isError, false, JSON.stringify(response));
    return response.result.structuredContent;
  };
  const overview = await call('get_project_overview');
  assert.equal(overview.version, '1.9.7.1');
  assert.ok(overview.file_count > 100);
  const found = await call('find_symbols', { query: 'advancePhysics', path: 'desktop3d/public/physics.html' });
  assert.equal(found.symbols[0].name, 'advancePhysics');
  const source = await call('read_file', { path: found.symbols[0].path, start_line: found.symbols[0].line, line_count: 1 });
  assert.match(source.content, /function advancePhysics\(dt\)/);
  const map = await call('search_code', { query: 'DEFAULT_MAP', path: 'desktop3d/src/procedural-map.mjs' });
  assert.ok(map.matches.some(match => match.text.includes('generator:3')));
  const qa = await call('read_knowledge', { document: 'verification' });
  assert.match(qa.content, /npm\.cmd run qa:all/);
  for (const resource of (await c.request('resources/list')).result.resources) {
    const response = await c.request('resources/read', { uri: resource.uri });
    assert.ok(response.result.contents[0].text.length > 100);
  }
});
