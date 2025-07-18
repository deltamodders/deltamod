// Script by Jockeholm based off of a script by Kneesnap.
// Major help and edited by Samuel Roy

using System;
using System.IO;
using System.Threading.Tasks;
using System.Linq;
using UndertaleModLib.Util;

EnsureDataLoaded();

// Check code directory.
string importFolder = Convert.ToString(Directory.GetParent(Convert.ToString(Directory.GetParent(System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName))) + "\\output\\xDeltaCombiner\\1\\Objects\\CodeEntries");
if (importFolder == null)
    throw new ScriptException("The import folder was not set.");

string[] dirFiles = Directory.GetFiles(importFolder);
if (dirFiles.Length != 0){

// Ask whether they want to link code. If no, will only generate code entry.
// If yes, will try to add code to objects and scripts depending upon its name
bool doParse = true;

SetProgressBar(null, "Files", 0, dirFiles.Length);
StartProgressBarUpdater();

SyncBinding("Strings, Code, CodeLocals, Scripts, GlobalInitScripts, GameObjects, Functions, Variables", true);
await Task.Run(() =>
{
    UndertaleModLib.Compiler.CodeImportGroup importGroup = new(Data);
    foreach (string file in dirFiles)
    {
        IncrementProgress();

        string code = File.ReadAllText(file);
        string codeName = Path.GetFileNameWithoutExtension(file);
        importGroup.QueueReplace(codeName, code);
    }
    SetProgressBar(null, "Performing final import...", dirFiles.Length, dirFiles.Length);
    importGroup.Import();
});
DisableAllSyncBindings();

await StopProgressBarUpdater();
HideProgressBar();
ScriptMessage("All files successfully imported.");
}