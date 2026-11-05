const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    editLaunchOptions, composeOptions, safeFile, decode, durablePath, steamClosed,
    installLaunchOptions, removeLaunchOptions, prepareManualLaunchOptions, adoptManualLaunchOptions
} = require('./ProtonSteamOptions');

const steamExited = { isSteamClosed: () => true };

test('managed editor replaces only the confirmed game option and preserves unrelated bytes', () => {
    const original = '\uFEFF"UserLocalConfigStore"\r\n{\r\n // preserve\r\n "Software" { "Valve" { "Steam" { "apps" {\r\n "123" { "LaunchOptions" "-old" "other" "\\\\x" }\r\n "456" { "LaunchOptions" "untouched" }\r\n } } } }\r\n}\r\n';
    const result = editLaunchOptions(original, '123', 'bridge %command%');
    assert.equal(result.text, original.replace('"-old"', '"bridge %command%"'));
    assert.equal(result.previous, '-old');
});

const config = value => '"UserLocalConfigStore" { "Software" { "Valve" { "Steam" { "apps" { "123" { ' +
    (value === undefined ? '' : '"LaunchOptions" "' + value + '"') + ' } "456" { "x" "keep" } } } } } }';

function fixture(t, value = '-old') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'steam-options-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const steamRoot = path.join(dir, 'Steam');
    const folder = path.join(steamRoot, 'userdata', '12345', 'config');
    fs.mkdirSync(folder, { recursive: true });
    const filename = path.join(folder, 'localconfig.vdf');
    fs.writeFileSync(filename, config(value), { mode: 0o600 });
    return { dir, filename, options: { directory: path.join(dir, 'integration'), steamRoot, account: '12345',
        appid: '123', hook: path.join(dir, "hook ' with space"), profile: path.join(dir, 'profile') } };
}

test('editor inserts missing objects, round-trips quotes/Unicode and removes only its key', () => {
    const original = '"UserLocalConfigStore" { // retained\n "other" "é"\n}';
    const changed = editLaunchOptions(original, '123', '"quoted" C:\\game é').text;
    assert.equal(editLaunchOptions(changed, '123', undefined).previous, '"quoted" C:\\game é');
    const removed = editLaunchOptions(changed, '123', undefined).text;
    assert.ok(removed.includes('"other" "é"'));
    assert.equal(editLaunchOptions(removed, '123', undefined).previous, undefined);
});

test('malformed, duplicate, ambiguous, oversized and unsupported VDF fails closed', () => {
    for (const text of ['"UserLocalConfigStore" {', '"UserLocalConfigStore" {} "extra" {}',
        '"UserLocalConfigStore" { "x" "1" "X" "2" }', config('-old').replace('"-old"', '{}'),
        '"UserLocalConfigStore" { "Software" "bad" }', config('bad\\q'), 'x'.repeat(8 * 1024 * 1024 + 1)]) {
        assert.throws(() => editLaunchOptions(text, '123', 'hook'));
    }
    assert.throws(() => decode(Buffer.from([0xff, 0xfe])));
    assert.throws(() => decode(Buffer.from('x\0y')));
});

test('safe options preserve arguments and assignments, reject shell evaluation and wrappers', () => {
    assert.equal(composeOptions('', '/hook'), '/hook %command%');
    assert.equal(composeOptions('', '/a hook'), "'/a hook' %command%");
    assert.equal(composeOptions('', 'relative/hook'), "'relative/hook' %command%");
    assert.equal(composeOptions('--a "two words"', '/hook'), '/hook %command% --a "two words"');
    assert.equal(composeOptions('FOO="two words" %command% --arg', '/hook'), 'FOO="two words" /hook %command% --arg');
    for (const value of ['mangohud %command%', '$(touch x)', '%command% ; evil', '"%command%"',
        '%command% %command%', '--a "unfinished', 'FOO=1 %command% | cat', '%command% >x']) assert.throws(() => composeOptions(value, '/hook'));
});

test('managed install is idempotent, shared by profiles and removal preserves newer unrelated settings', t => {
    const f = fixture(t);
    const initial = fs.readFileSync(f.filename, 'utf8');
    const first = installLaunchOptions(f.options, steamExited);
    const installed = fs.readFileSync(f.filename, 'utf8');
    assert.equal(editLaunchOptions(installed, '123', undefined).previous, first.managed);
    installLaunchOptions(f.options, steamExited);
    assert.equal(fs.readdirSync(f.options.directory).filter(x => x.startsWith('backup-')).length, 1);
    const other = { ...f.options, profile: path.join(f.dir, 'profile2') };
    installLaunchOptions(other, steamExited);
    assert.equal(removeLaunchOptions(f.options, steamExited), false);
    fs.writeFileSync(f.filename, installed.replace('"keep"', '"new setting"'));
    assert.equal(removeLaunchOptions(other, steamExited), true);
    assert.equal(fs.readFileSync(f.filename, 'utf8'), initial.replace('"keep"', '"new setting"'));
    assert.equal(removeLaunchOptions(other, steamExited), false);
});

test('absent options stay absent after removal', t => {
    const f = fixture(t);
    fs.writeFileSync(f.filename, config(undefined));
    installLaunchOptions(f.options, steamExited);
    removeLaunchOptions(f.options, steamExited);
    assert.equal(editLaunchOptions(fs.readFileSync(f.filename, 'utf8'), '123', undefined).previous, undefined);
});

test('user edits, running/uncertain Steam and incomplete transactions refuse writes', t => {
    const f = fixture(t);
    const before = fs.readFileSync(f.filename);
    assert.throws(() => installLaunchOptions(f.options, { isSteamClosed: () => false }), /Fully exit/);
    assert.deepEqual(fs.readFileSync(f.filename), before);
    installLaunchOptions(f.options, steamExited);
    fs.writeFileSync(f.filename, config('user edit'));
    assert.throws(() => installLaunchOptions(f.options, steamExited), /edited outside/);
    assert.throws(() => removeLaunchOptions(f.options, steamExited), /edited outside/);
    assert.equal(fs.readFileSync(f.filename, 'utf8'), config('user edit'));
    fs.writeFileSync(path.join(f.options.directory, 'transaction.json'), '{}');
    assert.throws(() => installLaunchOptions(f.options, steamExited), /interrupted/);
});

test('concurrent settings change or Steam restart retains journal and does not promote', t => {
    for (const change of ['settings', 'restart', 'promotion']) {
        const f = fixture(t);
        const initial = fs.readFileSync(f.filename, 'utf8');
        let closed = true;
        const effects = {
            isSteamClosed: () => closed,
            beforePromote: () => {
                if (change === 'settings') fs.writeFileSync(f.filename, config('changed'));
                if (change === 'restart') closed = false;
            },
            promote: (from, to) => {
                if (change === 'promotion') throw new Error('permission denied fixture');
                fs.renameSync(from, to);
            }
        };
        assert.throws(() => installLaunchOptions(f.options, effects));
        assert.equal(fs.readFileSync(f.filename, 'utf8'), change === 'settings' ? config('changed') : initial);
        assert.ok(fs.existsSync(path.join(f.options.directory, 'transaction.json')));
        assert.equal(fs.readdirSync(path.dirname(f.filename)).filter(x => x.endsWith('.tmp')).length, 0);
    }
});

test('unverified promotion and reentrant setup fail closed', t => {
    const f = fixture(t);
    assert.throws(() => installLaunchOptions(f.options, { isSteamClosed: () => true, promote: () => {} }), /verification/);
    const g = fixture(t);
    const reentrant = {
        isSteamClosed: () => true,
        beforePromote: () => assert.throws(() => installLaunchOptions(g.options, steamExited), /EEXIST/)
    };
    installLaunchOptions(g.options, reentrant);
});

test('hard links, symlinks, writable files and ephemeral storage are rejected', t => {
    const f = fixture(t);
    fs.linkSync(f.filename, path.join(path.dirname(f.filename), 'hardlink'));
    assert.throws(() => safeFile(f.filename), /Unsafe/);
    if (process.platform === 'linux') {
        fs.unlinkSync(path.join(path.dirname(f.filename), 'hardlink'));
        fs.chmodSync(f.filename, 0o666);
        assert.throws(() => safeFile(f.filename), /Unsafe/);
        fs.chmodSync(f.filename, 0o600);
        const link = path.join(path.dirname(f.filename), 'link');
        fs.symlinkSync(f.filename, link);
        assert.throws(() => safeFile(link));
        assert.throws(() => durablePath('/tmp/deltamod'), /persistent/);
        assert.throws(() => durablePath('/home/a/.mount_abc/bin'), /persistent/);
    }
});

test('explicit manual adoption preserves complex wrappers and restores only the original target value', t => {
    const f = fixture(t, 'gamemoderun %command%');
    assert.throws(() => installLaunchOptions(f.options, steamExited), /manual/);
    const hook = prepareManualLaunchOptions(f.options, steamExited);
    assert.equal(fs.readFileSync(f.filename, 'utf8'), config('gamemoderun %command%'));
    assert.throws(() => adoptManualLaunchOptions(f.options, steamExited), /exact manual hook/);
    const edited = editLaunchOptions(config('gamemoderun %command%'), '123', 'gamemoderun ' + hook).text;
    fs.writeFileSync(f.filename, edited);
    assert.equal(adoptManualLaunchOptions(f.options, steamExited).manual, true);
    installLaunchOptions(f.options, steamExited);
    fs.writeFileSync(f.filename, edited.replace('"keep"', '"new"'));
    removeLaunchOptions(f.options, steamExited);
    assert.equal(fs.readFileSync(f.filename, 'utf8'), config('gamemoderun %command%').replace('"keep"', '"new"'));
});

const ownHook = '/home/user/.config/deltamod/steam-bridge/id/launch';

test('Launch Options that already run this hook are taken over, quoted or bare, and removal drops only the hook', t => {
    for (const word of [ownHook, "'" + ownHook + "'"]) {
        for (const wrapper of ['', 'gamemoderun ']) {
            const saved = wrapper + word + ' %command%';
            const f = fixture(t, saved);
            const options = { ...f.options, hook: ownHook };
            prepareManualLaunchOptions(options, steamExited);
            const state = installLaunchOptions(options, steamExited);
            assert.equal(state.managed, saved);
            assert.equal(state.previous, wrapper + '%command%');
            assert.equal(fs.readFileSync(f.filename, 'utf8'), config(saved));
            assert.equal(fs.existsSync(path.join(options.directory, 'manual.json')), false);
            assert.equal(removeLaunchOptions(options, steamExited), true);
            assert.equal(fs.readFileSync(f.filename, 'utf8'), config(wrapper + '%command%'));
        }
    }
    for (const value of [ownHook + ' ' + ownHook + ' %command%', ownHook + ' %command% %command%', '/other' + ownHook + ' %command%']) {
        const f = fixture(t, value);
        assert.throws(() => installLaunchOptions({ ...f.options, hook: ownHook }, steamExited));
        assert.equal(fs.readFileSync(f.filename, 'utf8'), config(value));
    }
});

test('manual setup hands out a bare hook, verifies it as Steam saves it and never records the hook as the original', t => {
    const f = fixture(t, 'gamemoderun %command%');
    const options = { ...f.options, hook: ownHook };
    const command = prepareManualLaunchOptions(options, steamExited);
    assert.equal(command, ownHook + ' %command%');
    fs.writeFileSync(f.filename, config('gamemoderun ' + command));
    assert.equal(adoptManualLaunchOptions(options, steamExited).previous, 'gamemoderun %command%');

    const g = fixture(t, ownHook + ' %command%');
    const stuck = { ...g.options, hook: ownHook };
    prepareManualLaunchOptions(stuck, steamExited);
    const file = path.join(stuck.directory, 'manual.json');
    const prepared = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(prepared.previous, '%command%');
    // A preparation from before this fix recorded the hook itself as the original options.
    fs.writeFileSync(file, JSON.stringify({ ...prepared, previous: ownHook + ' %command%' }));
    assert.equal(prepareManualLaunchOptions(stuck, steamExited), command);
    const adopted = adoptManualLaunchOptions(stuck, steamExited);
    assert.equal(adopted.previous, '%command%');
    assert.equal(adopted.managed, ownHook + ' %command%');
});

test('Linux permission failures retain the original configuration and transaction evidence', { skip: process.platform !== 'linux' || process.getuid?.() === 0 }, t => {
    const f = fixture(t);
    const before = fs.readFileSync(f.filename);
    const parent = path.dirname(f.filename);
    fs.chmodSync(parent, 0o500);
    try {
        assert.throws(() => installLaunchOptions(f.options, steamExited), /EACCES/);
        assert.deepEqual(fs.readFileSync(f.filename), before);
        assert.ok(fs.existsSync(path.join(f.options.directory, 'transaction.json')));
    } finally {
        fs.chmodSync(parent, 0o700);
    }
});

test('production Steam-exited scan rejects Steam processes and uncertain reads, ignoring other users', () => {
    const proc = { readdirSync: () => ['123'], statSync: () => ({ uid: 1000 }), readFileSync: () => 'steamwebhelper\n' };
    assert.equal(steamClosed(proc, { platform: 'linux', uid: 1000 }), false);
    proc.readFileSync = () => 'bash\n';
    assert.equal(steamClosed(proc, { platform: 'linux', uid: 1000 }), true);
    proc.readFileSync = () => { const error = new Error('denied'); error.code = 'EACCES'; throw error; };
    assert.throws(() => steamClosed(proc, { platform: 'linux', uid: 1000 }), /Cannot confirm/);
    proc.statSync = () => ({ uid: 1001 });
    assert.equal(steamClosed(proc, { platform: 'linux', uid: 1000 }), true);
});
