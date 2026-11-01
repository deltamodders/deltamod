# Contributing Guidelines

Thank you for contributing to Deltamod! Below are some best practices to keep the repo tidy.

## 1. Branching and Pull Requests

- Do not commit directly to the `develop` branch unless it is a commit of minor entity.
- All work must be done on a separate branch.
- Once your work is complete, open a pull request.
- Provide a clear description of the changes in your PR.
- Wait for at least 1 fellow dev to approve of your PR before merging.
- Any PR that requires changing Deltamod's modding standard (modpack conventions) requires approval from Ghino first.

## 2. Branch / Commit namings

In naming branches or commits, use the following prefixes:

| Prefix | Description |
|---|---|
| `feat` | A new feature or functionality |
| `bugfix` | A bug fix |
| `fix` | A minor correction or issue resolution |
| `refactor` | Code restructuring without changing functionality |
| `docs` | Changes to documentation |
| `standard` | Changes made to comply with new modpack conventions (to use this, you must reference a commit in the modpack conventions repo referencing a certain standard change.) |

Commit messages should:
- Always start with one of the approved prefixes.
- Be concise and descriptive.

Commits with more things can have more prefix + description combinations divided by `/`, like: `feat: added this / bugfix: fixed that`

Branch names should be formatted using a prefix + a noun or short phrase describing changes, for example:

```
feat/change-framework
bugfix/remove-spamton
```

Remove branches from GitHub when they've been merged.

## 3. General Guidelines

- Try to keep changes focused.
- Follow the existing code style and project conventions.
- Test your changes before opening a PR.
- Keep documentation up to date when introducing new features or changing existing behavior.

Thank you for helping improve the project!
