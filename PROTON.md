## Native Linux with staged Proton

The staged backend runs the Windows game through Proton; it does not run Deltamod inside Wine. This backend is experimental.  Real-game compatibility with every Proton build or mod has not been tested, beware!

For a Steam game, choose **Use Steam-managed launch (existing Steam saves)** when importing a **new** Linux profile. This is the first and default choice. It uses Steam's normal prefix and progress; it does not require UMU. UMU remains an optional compatibility mode for isolated profiles and non-Steam launches:

| Mode | Launch owner | Progress | Runtime choice |
| --- | --- | --- | --- |
| **Use Steam-managed launch (existing Steam saves)** | The real Steam game entry, redirected to the staged executable by a managed hook | The game's normal Steam prefix; mods can change existing saves and Cloud data | Steam's selection at launch |
| **Use isolated Proton (UMU, separate saves)** | UMU, outside Steam | A separate persistent prefix; no automatic save migration | The Proton directory confirmed at import |

Both modes copy the game into a clean base and build a disposable modded stage. Neither mode patches the original installation. A prefix is not a security sandbox.

### Steam-managed setup

Use a persistent source checkout with native Steam. Packaged builds and Flatpak Steam are refused for this mode until their helper/runtime visibility is verified. The source Electron runtime must remain installed at its stable path and support Node mode; Deltamod probes it during setup. The generated helper does not need a system Node installation. Temporary profiles under `/tmp`, `/run`, or an AppImage mount are refused. Do not move a live profile to bypass that check; start Deltamod with persistent XDG directories and import a new profile instead.

1. Back up important game progress yourself. Deltamod does not read, copy, migrate, or back up your saves. This mode shares Steam's normal prefix, so the modded game can update normal saves and Steam Cloud data.
2. Fully exit Steam, including its background client. Deltamod never closes Steam or a running game for you.
3. Import the installed Steam game into a new profile and choose **Use Steam-managed launch (existing Steam saves)**. Deltamod verifies the app manifest and source directory. Select the initialized Steam account to manage, then acknowledge shared progress. It does not guess the most-recent account or change other accounts.
4. Setup installs a private, persistent hook under `steam-bridge/<binding-id>/` in Electron's user-data directory and updates only that account/game's `LaunchOptions` in `userdata/<account>/config/localconfig.vdf`. The folder contains private backups, the binding, and the options registry. Treat backups as private Steam configuration, not issue attachments.
5. Reopen Steam yourself and sign into the confirmed account. Select mods and launch from Deltamod, then confirm that Steam is using the displayed account and the game is closed. Deltamod cannot programmatically verify Steam's active login; using another account without this hook can launch vanilla and leave the mod request unclaimed. Do not switch accounts during the launch. Cancel if you cannot confirm the account. Deltamod stages the files, opens the real app ID, and waits for its hook to claim the stage. The hook retains Steam's runtime argv and environment, substitutes only the verified executable argument, and runs with the staged game as the working directory. UMU and its separate prefix are not used.

Without a pending Deltamod request, normal Steam **Play** passes the original command through unchanged, provided the helper is intact and no helper update is incomplete. When invoked with a pending, expired, claimed, or invalid request, the hook fails closed rather than silently launching vanilla. This guarantee requires Steam to actually invoke the configured account's hook; the account confirmation is a human prerequisite, not automatic login detection. The supported redirected command contains a single `proton waitforexitandrun <original-executable>` sequence. Other Proton verbs, unexpected command shapes, and a different app or executable are refused.

#### Existing Launch Options

Automatic setup supports empty options, ordinary quoted game arguments, or leading environment assignments followed by one unquoted `%command%`. For example, `PROTON_LOG=1 %command% --example` retains that assignment and argument. The editor preserves unrelated bytes, comments, ordering, BOM, and line endings. Duplicate keys, unsupported encoding/layout, unsafe links or permissions, concurrent file changes, and an active or uncertain Steam client stop setup.

Wrappers such as `gamemoderun %command%` and complex shell expressions require explicit manual setup. Deltamod offers **Copy hook and continue**: replace the one `%command%` in Steam with the copied `'<hook-path>' %command%` text, keeping wrappers before the hook. Preserve the rest of your command yourself, fully exit Steam again, then choose **Verify with Steam exited**. Deltamod verifies the exact hook and remembers the previous target option for removal; it does not parse or evaluate the surrounding shell expression. Canceling preserves your settings and any created base for review. A failed import does not load the new profile; retained storage is identified in the error.

#### Removal, repair, and recovery

After updating Deltamod, an existing registered helper may need an update too. If Deltamod reports **Steam helper update required**, fully exit Steam and retry launching from Deltamod. It verifies the existing helper and refreshes its two modules without changing Launch Options, reinstalling the game, or accessing saves. All registered profiles must have no retained launch and no active or uncertain game process. Once the helper is current, ordinary launches do not require exiting Steam.

An interrupted helper update retains `helper-update.json` and blocks helper use. With Steam fully exited, retry from the same Deltamod build to resume the verified update. Changed helper bytes, a changed journal, or a different pending build require review; do not delete the journal or temporary files to bypass the warning. Helper updates recheck Steam before promotion but cannot exclusively lock out an independently restarting Steam client.

For a Steam-managed profile, open Options and select **Disconnect** under **Disconnect Steam from Deltamod**. Despite that legacy label, this opens **Manage Steam Launch Options** for this mode; it does not delete or reinstall the game. Fully exit Steam, then choose **Repair setup**, **Remove managed Launch Options**, or **Recover abandoned launch**. Removing the last registered profile restores only the original target option, never an entire old configuration file. If another profile uses the hook, it remains registered for that profile. The removed profile stays disabled until repaired; it never falls back to the legacy in-place patcher. If you edited the managed option yourself, removal refuses to overwrite your changes.

Setup checks Steam and the configuration identity again before atomic promotion, then verifies the result. This is not an exclusive lock against an independently restarting Steam client. An interrupted `transaction.json` or `options.lock` needs manual review with Steam exited. Preserve the private backup and journal; compare the target option with the journal's intended value and the live configuration. Do not replace the whole configuration with an old backup or delete evidence to bypass an uncertainty warning.

Launches use per-game and per-profile session records. The helper waits for its runtime and a quiet process interval, not the first missing chapter executable. Deltamod cleans a stage only after verified completion and an inactive owned session. A missing hook claim after 90 seconds, inaccessible process metadata, a helper failure, or an interrupted launch retains the stage and session. Exit the game and Steam before recovery; another live Deltamod instance or a live/uncertain helper blocks it. `status.json` in the binding directory records the last hook phase; hook errors also go to Steam's inherited stderr. Do not delete active session files or stages manually.

Both Proton modes share the same protected-service checks. An unreadable environment on a verified system service such as KDE's compositor does not alone imply a running game. Owned stage processes, unknown permission failures, and unstable process identity still block unsafe operations; launch errors include the blocking PID and reason when available.

Real DELTARUNE launches, existing-save visibility, chapter transitions, Steam's running indicator, overlay, achievements, and Cloud behavior require separate live acceptance. Disposable fake-Steam fixtures do not prove those features. The tests do not authorize or perform a real account configuration edit or game launch.

### UMU setup

1. Install a compatible Proton build. For Deltamod's managed UMU download, you also need Python 3.10 or newer. You can instead install [UMU](https://github.com/Open-Wine-Components/umu-launcher) through your distribution; [CachyOS documents UMU setup](https://wiki.cachyos.org/configuration/gaming/). Deltamod does not install Proton, Python, or system packages.
2. Import your Windows game installation into a **new profile**. Select **Use isolated Proton (UMU, separate saves)** in the Linux runtime dialog. Use the detected UMU installation, select **Choose executable**, or, if no usable installation is detected, select **Download UMU 1.4.4**. In **Proton selection**, confirm **Use detected Proton**, select **Choose directory** to browse to an installed directory containing `proton`, or select **Cancel** to stop the import.
3. Allow disk space for a clean base, another full game copy during a run, patch payloads, and a persistent prefix. Deltamod checks capacity for copies; UMU's runtime and prefix need additional space.
4. Select mods and launch. Before the first launch, acknowledge that UMU can download its required Steam Linux Runtime and that this profile has separate progress.

The original installation stays unchanged. Each UMU run starts from the imported clean base, applies mods in a disposable stage, and launches that staged executable directly through UMU. The base is a snapshot of what you imported, not proof that Steam files were unmodified beforehand. Existing profiles retain their behavior; they are not converted to Steam-managed mode. Legacy copied Steam profiles do not automatically redirect Steam's original app-ID launch.

Each profile keeps its own `proton/prefix` inside Deltamod's profile storage. Modded progress persists there between runs. Existing Steam saves are **not read, copied, or migrated by Deltamod**. A prefix is not a security sandbox, and games and runtime tools still execute with your account's permissions.

### Steam Proton detection for UMU profiles

During import, Deltamod reads Steam's configured compatibility-tool selection. For a recognized Steam game installation, an explicit game-specific selection takes precedence. Otherwise, Deltamod can offer the configured **Steam global default (not a game-specific selection)**. This default is not proof of the build Steam would automatically recommend for that game. Non-Steam imports can use the global default but do not claim a game-specific setting.

Detection supports native and Flatpak Steam locations, library manifests, custom tool registrations, and official tool identities in supported Steam app-info formats. It matches internal tool identities, not the newest directory or a similar display name. Missing or ambiguous installations, unavailable runners, unreadable metadata, and unsupported or malformed formats produce an explanation and retain **Choose directory**. If an explicit game selection cannot be resolved, Deltamod does not silently substitute the global default.

The confirmed Proton directory is stored as a **fixed path**. Later changes in Steam do not update existing profiles; import a new profile to select a different build through this flow. Detection does not execute Proton, change Steam settings, or reuse Steam's prefix or saves. Manual selection remains available without Steam.

### Managed UMU setup

The download option requires your confirmation. Deltamod fetches the pinned [official UMU 1.4.4 zipapp release](https://github.com/Open-Wine-Components/umu-launcher/releases/tag/1.4.4), checks its SHA-256, and installs only its regular `umu-run` file. It does not run an installer script, request administrator access, or modify system Python. Downloads have a one-minute limit; setup also checks Python and runs a bounded UMU version probe. A passing version probe does not prove that your graphics drivers, Proton build, game, or mods will work.

Managed UMU is stored at `runtimes/umu/1.4.4/umu-run` beneath Deltamod's Electron user-data directory, not inside a game profile. Existing profiles keep their selected executable path; this setup flow does not migrate them. Deltamod does not silently update UMU or replace an existing managed version. System UMU installations are preferred when detected on `PATH`; **Choose executable** remains available.

If setup fails, import stops before creating the game profile. Install missing prerequisites through your distribution or retry using **Choose executable**. A failed download cannot replace an existing working version. If an interrupted setup leaves `runtimes/umu/install.lock`, close all Deltamod instances and review the setup directory before removing the inactive lock. Do not remove a lock while setup is running, delete a managed version referenced by a profile, or bypass a checksum/unsafe-path warning by changing its files. Preserve older working versions while investigating.

### Supported mods and compatibility

The backend applies whole-file `override`/`copy` patches first, then `xdelta`/`g3mpatch` patches grouped and merged per target. Merges pass `--properties`, so conflicting asset properties are combined instead of the highest-priority mod overwriting the others. G3MTool 1.3.2 and older still drop entries from the global script list when two mods each add startup scripts, which breaks mods such as BGM Info. That needs a G3MTool built on the G3MLib list-merge fix. Deltas require the executable Linux G3MTool helper at `tools/g3mtool/G3MTool`. Its actual native patching behavior requires separate verification with your tool version.

Conflicting overrides, missing payloads or targets, unsafe paths or links, failed merges, and unsupported XML stop preparation. CSX scripts, plugins, and baking are not supported. Preparation failures discard only the owned stage, not the original game, clean base, or prefix.

Mod authors can add `proton-compatibility.json` beside `modding.xml`:

```json
{
  "version": 1,
  "gameId": "toby.deltarune",
  "files": {
    "data.win": "<64-character SHA-256 of the required unmodified file>"
  }
}
```

Replace the placeholder with the real hash. Paths are relative to the game root. Declarations must contain at least one source file; game IDs and declared hashes must match the clean base. Checks are enabled by default. A mod without this sidecar requires a separate **Unverified mod compatibility** acknowledgment for each launch. Acknowledging an undeclared mod does not bypass declared hash mismatches. A matching declaration verifies only the files it lists, not the mod's behavior.

### UMU failures and recovery

Runtime logs are bounded and stored at `proton/runtime.log` in the profile. If startup exceeds two minutes, or process ownership is uncertain, Deltamod reports the failure without killing Wine/Steam processes or deleting the possibly active stage. The runtime might still be preparing. Close the owned game/runtime before retrying; automatic recovery requires a quiet process check. Closing Deltamod does not automatically stop a launched game.

Do not delete `session.json`, lock files, or work directories to bypass an active-session warning. An interrupted `recovery.lock` needs manual process/storage review. Preserve the profile and its prefix while investigating. If the clean base changes or metadata is invalid, import into a new profile rather than repairing the old base in place.

### Delete a Deltamod installation

In the installation manager, choose **Delete installation**, then confirm **Delete permanently** in the native dialog. Deletion removes only that installation's Deltamod-owned copy, stages, and settings. It does not delete the original game, Steam's normal Proton prefix, or Steam saves. Other installations keep their paths and indices.

For a Steam-managed installation, close the game and fully exit Steam first. Deltamod unregisters that installation from its managed Launch Options. The shared hook remains if another installation uses it. Removing the last registration restores only the previous target Launch Options; external edits or interrupted settings transactions block removal rather than overwrite your settings. Recover a retained launch through **Manage Steam Launch Options → Recover abandoned launch** before deleting it.

Deleting an older UMU installation also deletes its **separate** prefix and any progress stored there. The confirmation warns about that loss. This is not Steam's normal prefix. Active or uncertain runtime processes block deletion; close the owned runtime and retry. Reset remains blocked while Proton profiles exist.

A small `removed-deltamod_system-<index>.json` record remains in Deltamod's user-data directory. It prevents reuse of a deleted absolute profile path; it contains no game or save data. If filesystem cleanup fails, the installation stays disabled and appears as **Removal incomplete**. Choose Delete again to retry cleanup. An interrupted removal `.lock` requires process/storage review with all Deltamod instances closed; do not delete locks to bypass an active-session warning. Deletion cannot be undone and does not migrate or back up saves.

### Backend tests

With Node.js 24 or newer, run `npm run test:unit`. Test files run serially because Linux process fixtures inspect the same `/proc` namespace; concurrent runtime-probe execs can produce transient permission uncertainty. The suite uses temporary files, fake network responses, fake runtime processes, and a fake delta-tool boundary. Steam-selection fixtures cover game/global precedence, native/Flatpak roots, official/custom identities, malformed metadata, manual fallback, cancellation, and fixed-path persistence. UMU setup tests cover checksum/archive validation, bounded transfers, cancellation, prerequisite failures, and atomic installation. Managed-options tests verify exact non-target bytes, private transactions, interruption/conflicts, account binding, shared hooks, manual adoption, and target-only removal. Steam bridge tests cover one-use requests, literal argv/environment, cancellation, recovery, and retained uncertain sessions. On Linux, generated helpers run disposable fake commands under Node and, when installed, Electron Node mode. Filesystem and `/proc` checks also use synthetic children. The suite does not launch DELTARUNE, execute real UMU/Proton, read existing saves, or download runtimes. `npm test` remains the Electron development launcher.
