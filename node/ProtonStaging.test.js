const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Staging = require('./ProtonStaging');

function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deltamod-stage-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const source = path.join(dir, 'source');
    const root = path.join(dir, 'profile', 'proton');
    fs.mkdirSync(source);
    fs.mkdirSync(path.dirname(root));
    fs.writeFileSync(path.join(source, 'DELTARUNE.exe'), 'exe');
    fs.writeFileSync(path.join(source, 'data.win'), 'vanilla');
    const settings = { gameId: 'toby.deltarune', exeName: 'DELTARUNE.exe', umu: process.execPath, proton: dir };
    return { dir, root, source, settings };
}

test('Steam descriptor requires explicit shared-progress consent and retains source/base isolation', async t => {
    const f = fixture(t);
    const settings = { gameId: 'toby.deltarune', exeName: 'DELTARUNE.exe', backend: 'steam', sharedProgressAcknowledged: true,
        steam: { root: f.dir, source: f.source, binding: path.join(f.dir, 'bridge'), account: '12345', appid: '123' } };
    Staging.importBase(f.root, f.source, settings);
    assert.equal(Staging.readDescriptor(f.root).version, 2);
    const stage = await Staging.prepareStage(f.root, []);
    assert.equal(fs.readFileSync(path.join(stage.game, 'data.win'), 'utf8'), 'vanilla');
    Staging.discardStage(f.root, stage.id);
    assert.equal(fs.readFileSync(path.join(f.source, 'data.win'), 'utf8'), 'vanilla');
    const descriptor = Staging.readDescriptor(f.root);
    descriptor.sharedProgressAcknowledged = false;
    fs.writeFileSync(path.join(f.root, 'backend.json'), JSON.stringify(descriptor));
    assert.throws(() => Staging.readDescriptor(f.root), /Invalid Steam/);
});

const hash = text => crypto.createHash('sha256').update(text).digest('hex');

function mod(f, id, patches, declared = true) {
    const folder = path.join(f.dir, id);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'payload'), id);
    if (declared) fs.writeFileSync(path.join(folder, 'proton-compatibility.json'), JSON.stringify({
        version: 1, gameId: 'toby.deltarune', files: { 'data.win': hash('vanilla') }
    }));
    return { id, name: id, folder, patches };
}

test('import refuses hardlinked game files without modifying the source', t => {
    const f = fixture(t);
    fs.linkSync(path.join(f.source, 'data.win'), path.join(f.dir, 'alias'));
    assert.throws(() => Staging.importBase(f.root, f.source, f.settings), /link/i);
    assert.equal(fs.readFileSync(path.join(f.source, 'data.win'), 'utf8'), 'vanilla');
    assert.equal(fs.existsSync(f.root), false);
});

test('fresh stage applies overrides and additions, preserving the source and base', async t => {
    const f = fixture(t);
    Staging.importBase(f.root, f.source, f.settings);
    const a = mod(f, 'a', [{ type: 'override', patch: './payload', to: './data.win' },
        { type: 'copy', patch: 'payload', to: 'assets/new.dat' }]);
    const stage = await Staging.prepareStage(f.root, [a]);
    assert.equal(fs.readFileSync(path.join(stage.game, 'data.win'), 'utf8'), 'a');
    assert.equal(fs.readFileSync(path.join(stage.game, 'assets/new.dat'), 'utf8'), 'a');
    assert.equal(fs.readFileSync(path.join(f.source, 'data.win'), 'utf8'), 'vanilla');
    assert.equal(fs.readFileSync(path.join(f.root, 'base/data.win'), 'utf8'), 'vanilla');
    Staging.discardStage(f.root, stage.id);
    const clean = await Staging.prepareStage(f.root, []);
    assert.equal(fs.readFileSync(path.join(clean.game, 'data.win'), 'utf8'), 'vanilla');
    assert.equal(fs.existsSync(path.join(clean.game, 'assets/new.dat')), false);
});

test('missing payloads fail rather than creating empty files', async t => {
    const f = fixture(t);
    Staging.importBase(f.root, f.source, f.settings);
    const a = mod(f, 'a', [{ type: 'override', patch: 'missing', to: 'data.win' }]);
    await assert.rejects(Staging.prepareStage(f.root, [a]), /missing/i);
    assert.equal(fs.existsSync(path.join(a.folder, 'missing')), false);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'work')), []);
});

test('conflicts name both mods and stop before any writes', async t => {
    const f = fixture(t);
    Staging.importBase(f.root, f.source, f.settings);
    const a = mod(f, 'a', [{ type: 'copy', patch: 'payload', to: 'data.win' }]);
    const b = mod(f, 'b', [{ type: 'override', patch: 'payload', to: './data.win' }]);
    await assert.rejects(Staging.prepareStage(f.root, [a, b]), /a.*b.*data.win/);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'work')), []);
});

test('unverified mods require an explicit per-mod acknowledgment; declared mismatches stop', async t => {
    const f = fixture(t);
    Staging.importBase(f.root, f.source, f.settings);
    const a = mod(f, 'a', [], false);
    await assert.rejects(Staging.prepareStage(f.root, [a]), /unverified/i);
    const seen = [];
    await Staging.prepareStage(f.root, [a], { confirmUnverified: async m => {
        seen.push(m.id);
        return true;
    } });
    assert.deepEqual(seen, ['a']);
    fs.writeFileSync(path.join(a.folder, 'proton-compatibility.json'), JSON.stringify({
        version: 1, gameId: f.settings.gameId, files: { 'data.win': hash('wrong version') }
    }));
    await assert.rejects(Staging.prepareStage(f.root, [a], { confirmUnverified: async () => true }), /hash.*data.win/i);
});

test('path normalization rejects Windows and POSIX escapes and ambiguous names', t => {
    for (const name of ['../escape', 'a/../../escape', '/tmp/x', 'C:\\x', '\\\\host\\share', 'a\\..\\x', 'x:stream', 'a//b', 'a/./b', 'NUL', 'a.']) {
        assert.throws(() => Staging.normalizePath(name), /path/i, name);
    }
    assert.equal(Staging.normalizePath('./chapter1\\data.win'), 'chapter1/data.win');
});

test('scripts, unknown patch types and case-colliding destinations are refused', async t => {
    const f = fixture(t);
    Staging.importBase(f.root, f.source, f.settings);
    for (const type of ['csx', 'plugin', 'unknown']) {
        const a = mod(f, type, [{ type, patch: 'payload', to: 'data.win' }]);
        await assert.rejects(Staging.prepareStage(f.root, [a]), /unsupported/i);
    }
    const a = mod(f, 'case', [{ type: 'copy', patch: 'payload', to: 'DATA.win' }]);
    await assert.rejects(Staging.prepareStage(f.root, [a]), /case/i);
});

test('delta groups run after overrides and failed merge rolls back only the stage', async t => {
    const f = fixture(t);
    Staging.importBase(f.root, f.source, f.settings);
    const a = mod(f, 'a', [{ type: 'xdelta', patch: 'payload', to: 'data.win' }]);
    const b = mod(f, 'b', [{ type: 'g3mpatch', patch: 'payload', to: 'data.win' },
        { type: 'copy', patch: 'payload', to: 'assets/new.dat' }]);
    let calls = 0;
    await assert.rejects(Staging.prepareStage(f.root, [a, b]), /helper/i);
    await assert.rejects(Staging.prepareStage(f.root, [a, b], { applyDelta: async ({ game, target, payloads }) => {
        calls++;
        assert.equal(target, 'data.win');
        assert.equal(payloads.length, 2);
        assert.deepEqual(payloads.map(file => path.basename(file)), ['0.xdelta', '1.g3mpatch']);
        assert.deepEqual(payloads.map(file => fs.readFileSync(file, 'utf8')), ['a', 'b']);
        assert.equal(fs.readFileSync(path.join(game, 'assets/new.dat'), 'utf8'), 'b');
        fs.writeFileSync(path.join(game, 'data.win'), 'partial');
        throw new Error('fixture merge failed');
    } }), /merge failed/);
    assert.equal(calls, 1);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'work')), []);
    assert.equal(hash(fs.readFileSync(path.join(f.root, 'base/data.win'))), hash('vanilla'));
    assert.equal(hash(fs.readFileSync(path.join(f.source, 'data.win'))), hash('vanilla'));
});

test('changed clean base and malformed compatibility declarations are rejected', async t => {
    const f = fixture(t);
    Staging.importBase(f.root, f.source, f.settings);
    const a = mod(f, 'a', []);
    fs.writeFileSync(path.join(a.folder, 'proton-compatibility.json'), '{}');
    await assert.rejects(Staging.prepareStage(f.root, [a]), /compatibility/i);
    fs.writeFileSync(path.join(f.root, 'base/data.win'), 'changed');
    await assert.rejects(Staging.prepareStage(f.root, []), /base.*changed/i);
});

test('source or payload changes while approval is pending roll back preparation', async t => {
    for (const changed of ['base', 'payload']) {
        const f = fixture(t);
        Staging.importBase(f.root, f.source, f.settings);
        const a = mod(f, 'a', [{ type: 'override', patch: 'payload', to: 'data.win' }], false);
        await assert.rejects(Staging.prepareStage(f.root, [a], { confirmUnverified: async () => {
            fs.writeFileSync(changed === 'base' ? path.join(f.root, 'base/data.win') : path.join(a.folder, 'payload'), 'changed');
            return true;
        } }), /changed while copying/i);
        assert.deepEqual(fs.readdirSync(path.join(f.root, 'work')), []);
        assert.equal(fs.readFileSync(path.join(f.source, 'data.win'), 'utf8'), 'vanilla');
    }
});

test('mod links cannot redirect reads or stage writes outside the owned tree', async t => {
    const f = fixture(t);
    Staging.importBase(f.root, f.source, f.settings);
    const a = mod(f, 'linked', [{ type: 'copy', patch: 'payload', to: 'data.win' }]);
    fs.linkSync(path.join(a.folder, 'payload'), path.join(f.dir, 'payload-alias'));
    await assert.rejects(Staging.prepareStage(f.root, [a]), /link/i);
    fs.unlinkSync(path.join(f.dir, 'payload-alias'));
    fs.symlinkSync(f.source, path.join(a.folder, 'redirect'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(Staging.prepareStage(f.root, [a]), /link/i);
    assert.equal(fs.readFileSync(path.join(f.source, 'data.win'), 'utf8'), 'vanilla');
});

test('copy import rejects linked directories and existing storage rather than overwriting it', t => {
    const f = fixture(t);
    fs.symlinkSync(f.dir, path.join(f.source, 'redirect'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => Staging.importBase(f.root, f.source, f.settings), /link/i);
    fs.unlinkSync(path.join(f.source, 'redirect'));
    Staging.importBase(f.root, f.source, f.settings);
    fs.writeFileSync(path.join(f.root, 'prefix/progress.fixture'), 'progress');
    assert.throws(() => Staging.importBase(f.root, f.source, f.settings), /exist/i);
    assert.equal(fs.readFileSync(path.join(f.root, 'prefix/progress.fixture'), 'utf8'), 'progress');
});

test('real mod loader respects selected order and variants and refuses missing identities', t => {
    const f = fixture(t);
    const database = path.join(f.dir, 'database');
    fs.mkdirSync(database);
    const folder = path.join(database, 'example');
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, '__deltaID.json'), JSON.stringify({ uniqueId: 'example-id' }));
    fs.writeFileSync(path.join(folder, '__variant'), 'alt.xml');
    fs.writeFileSync(path.join(folder, 'alt.xml'), '<patch to="data.win" type="copy" patch="./payload" />');
    fs.writeFileSync(path.join(folder, 'payload'), 'payload');
    fs.writeFileSync(path.join(database, 'downloaded-mod.zip'), 'stray archive');
    fs.mkdirSync(path.join(database, 'not-a-mod'));
    const loaded = Staging.loadMods(database, ['example-id']);
    assert.equal(loaded[0].id, 'example-id');
    assert.deepEqual(loaded[0].patches, [{ to: 'data.win', type: 'copy', patch: './payload' }]);
    assert.throws(() => Staging.loadMods(database, ['missing']), /missing/i);
    assert.throws(() => Staging.loadMods(database, ['example-id', 'example-id']), /selected/i);
    fs.writeFileSync(path.join(folder, '__variant'), '../escape.xml');
    assert.throws(() => Staging.loadMods(database, ['example-id']), /path/i);
});

test('XML parser never silently skips unsupported or malformed patch declarations', () => {
    for (const xml of ['<patch type="copy" patch="payload" />', '<patch type="copy" type="csx" patch="p" to="f"/>',
        '<!DOCTYPE mods><patch type="copy" patch="p" to="f"/>', '<patch type="copy" patch="p" to="a&amp;b"/>',
        '<patch type="copy" patch="p" to="f"></patch>']) {
        assert.throws(() => Staging.parsePatches(xml), /XML/i);
    }
    assert.deepEqual(Staging.parsePatches('<!-- comment -->\n<patches><patch type="copy" patch="p" to="f"/></patches>'),
        [{ type: 'copy', patch: 'p', to: 'f' }]);
});

test('wrong-game compatibility and escaping stage cleanup identities are refused', async t => {
    const f = fixture(t);
    Staging.importBase(f.root, f.source, f.settings);
    const a = mod(f, 'a', []);
    fs.writeFileSync(path.join(a.folder, 'proton-compatibility.json'), JSON.stringify({
        version: 1, gameId: 'other-game', files: { 'data.win': hash('vanilla') }
    }));
    await assert.rejects(Staging.prepareStage(f.root, [a]), /wrong game/i);
    assert.throws(() => Staging.discardStage(f.root, '../source'), /identity/i);
    assert.equal(fs.readFileSync(path.join(f.source, 'data.win'), 'utf8'), 'vanilla');
});

test('insufficient storage rolls back import without altering the original', t => {
    const f = fixture(t);
    const statfs = fs.statfsSync;
    fs.statfsSync = () => ({ bavail: 0, bsize: 4096 });
    try {
        assert.throws(() => Staging.importBase(f.root, f.source, f.settings), /disk space/i);
    } finally {
        fs.statfsSync = statfs;
    }
    assert.equal(fs.existsSync(f.root), false);
    assert.equal(fs.readFileSync(path.join(f.source, 'data.win'), 'utf8'), 'vanilla');
});

test('metadata reads are bounded and malformed descriptors never fall through to legacy launch', t => {
    const f = fixture(t);
    Staging.importBase(f.root, f.source, f.settings);
    const metadata = path.join(f.dir, 'oversized.json');
    fs.writeFileSync(metadata, '');
    fs.truncateSync(metadata, 8 * 1024 * 1024 + 1);
    assert.throws(() => Staging.readFile(metadata, 'utf8'), /too large/i);
    const descriptor = Staging.readDescriptor(f.root);
    descriptor.runtimeAcknowledged = 'false';
    Staging.writeJSON(path.join(f.root, 'backend.json'), descriptor);
    assert.throws(() => Staging.readDescriptor(f.root), /descriptor/i);
});
