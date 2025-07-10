# Deltamod XML standard
This file includes information on how a Deltamod modpack should be structured.

## Basic rules of the format.
There should be 3 files (1 optional) dedicated to mod metadata and patching data.
- `_deltamodInfo.json` is a file dedicated to storing the mod's name, UID (see UID section), authors, version and mod type (full game or demo). (See _deltamodInfo.json section)
- `modding.xml` is the most important file in the modpack. It consists of <patch> tags, which have three fields: `patch`, `to` and `type`. (See modding.xml section)
- `_icon.png` is an optional icon the modder can include in their modpack. It must be a 1:1 image. It isn't included in this example folder.

## `_deltamodInfo.json`

```json
{
    "metadata": {
        "name": "example",
        "uniqueId": "example0101",
        "version": "1.0.0",
        "description": "Lorem ipsum",
        "author": ["Mod Developer 1", "Mod Developer 2"],
        "demoMod": true
    },
    "dependencies": {
        "required": [ "UID HERE" ],
        "recommended": [ "UID HERE" ]
    }
}
```
This is an example on how a `_deltamodInfo.json` should be structured. Deltamod checks the file is valid before loading the mod. Missing or corrupted fields will be replaced by a placeholder.

## `modding.xml`

```xml
<patch type="xdelta" patch="./example.xdelta" to="./chapter3_windows/data.win" />
<patch type="override" patch="./example.win" to="./chapter4_windows/data.win" />
```
This is an example on how a `modding.xml` should be correctly structured. There are currently 2 types of patch: xdelta (which inputs the file through GM3P in order to patch the requested file) and override (which simply replaces the file.)<br /><br />
Every patch tag has three necessary fields: `patch`, `to` and `type`. If there are any missing/invalid fields, the program will delete the mod from its database and notify the user that the modpack is corrupted.
