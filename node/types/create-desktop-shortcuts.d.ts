/**
 * OPTIONAL: console.error is called by default if verbose: true.
 *
 * Your own custom logging function called with helpful warning/error
 * messages from the internal validators. Only used if verbose: true.
 */
type CUSTOMLOGGER = (message: string, error?: object) => void;

type WINDOWS = {
    /**
     * The target the shortcut points to.
     */
    filePath: string,
    /**
     * Path where shortcut will be placed. Defaults to user's desktop.
     */
    outputPath?: string,
    /**
     * Name of the shortcut file.
     */
    name?: string,
    /**
     * Metadata file "comment" property. Description of what the shortcut would
     * open.
     */
    comment?: string,
    /**
     * Image shown on the shortcut icon. You can also pass in an index if file
     * contains multiple icons, like `'C:\\file.exe,0'`
     */
    icon?: string,
    /**
     * Additional arguments passed in to the end of your target `filePath`.
     */
    arguments?: string,
    /**
     * How the window should be displayed by default. Valid inputs: 'normal', 'maximized', 'minimized'. Defaults to 'normal'.
     */
    windowMode?: string,
    /**
     * A global hotkey to associate to opening this shortcut, like 'CTRL+ALT+F'.
     */
    hotkey?: string,
    /**
     * The working directory for the shortcut when it launches, must be a valid path to a folder.
     */
    workingDirectory?: string,
    /**
     * This is an advanced option specifically and only for projects packaged with `pkg`.
     * [See documentation](https://github.com/nwutils/create-desktop-shortcuts#windows-settings).
     */
    VBScriptPath?: string,
};

type LINUX = {
  /**
   * The target the shortcut points to.
   */
  filePath: string;
  /**
   * Path where shortcut will be placed. Defaults to user's desktop.
   */
  outputPath?: string;
  /**
   * Name of the shortcut file.
   */
  name?: string;
  /**
   * Metadata file "comment" property. Description of what the shortcut would open.
   */
  comment?: string;
  /**
   * Image shown on the shortcut icon. Preferably a 256x256 PNG.
   */
  icon?: string;
  /**
   * Type of shortcut. Valid inputs: 'Link', 'Directory', 'Application'.
   */
  type?: string;
  /**
   * If true, will run in a terminal.
   */
  terminal?: boolean;
  /**
   * If true, will apply a `chmod +x` (755) to the shortcut after creation to
   * allow execution permission.
   */
  chmod?: boolean;
  /**
   * Additional arguments passed in to the end of your target `filePath`.
   */
  arguments?: string;
};

type OSX = {
  /**
   * The target the shortcut points to.
   */
  filePath: string;
  /**
   * Path where shortcut will be placed. Defaults to user's desktop.
   */
  outputPath?: string;
  /**
   * Name of the shortcut file.
   */
  name?: string;
  /**
   * If true, will replace any existing file in the `outputPath` with matching `name`.
   * [See documentation](https://github.com/nwutils/create-desktop-shortcuts#osx-settings).
   */
  overwrite?: boolean;
};

type OPTIONS = {
    /**
     * Only create a shortcut for the current OS even if other OS's are passed in.
     */
    onlyCurrentOS?: boolean,
    /**
     * Logs out helpful warnings/errors using `customLogger` or console.error.
     */
    verbose?: boolean,
    /**
     * Called (if verbose: true) with helpful warning/error messages from internal validators.
     */
    customLogger?: CUSTOMLOGGER,
    /**
     * Windows shortcut settings.
     */
    windows?: WINDOWS,
    /**
     * Linux shortcut settings.
     */
    linux?: {},
    /**
     * OSX shortcut settings.
     */
    osx?: {},
};

declare module "create-desktop-shortcuts" {
    /**
     * Creates OS based shortcuts for files, folders, urls, and applications.
     *
     * @example
     * createDesktopShortcut({
     *   windows: { filePath: 'C:\\path\\to\\executable.exe' },
     *   linux:   { filePath: '/home/path/to/executable' },
     *   osx:     { filePath: '/home/path/to/executable' }
     * });
     *
     * @param  {OPTIONS} options  Options object for each OS, and global options
     * @return {boolean}          True = success, false = failed to create the icon or set its permissions (Linux).
     */
    function createDesktopShortcut(options: OPTIONS): boolean;
    export = createDesktopShortcut;
}
