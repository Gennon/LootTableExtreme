AGENTS.md

Purpose
-------
This file documents how an automated or human "agent" (developer, CI job, or assistant) should work on the LootTableExtreme repository (a World of Warcraft addon written in Lua with helper tools in Node.js). It describes development conventions, workflows, commands (PowerShell), and a short engineering "contract" for common tasks.

Repository overview
-------------------
Root files of interest:
- `Core.lua`, `LootFrame.lua`, `ModeManager.lua`, etc. — addon Lua source files.
- `LootTableExtreme.toc` — addon metadata; controls what files the game loads.
- `UI.xml` — UI layout used by the addon.
- `install.ps1` / `install.bat` — helper install scripts.
- `tools/` — Node.js scripts for scraping, exporting, and maintaining databases.

When to edit
------------
- Fixing a bug or adding an addon feature: change `.lua` and `.xml` files in the repo root.
- Updating tooling or data processing: edit files in `tools/` (Node.js).
- Data updates / scrapers: place exports into `tools/` inputs (e.g. `npc_data.json`) and run the Node.js scripts.

Agent contract (inputs / outputs / error modes)
----------------------------------------------
- Inputs:
  - Lua source files in repo root, `UI.xml`, and files under `tools/` (scripts, data JSONs).
  - External data (scraper results, wowhead databases) placed under `tools/` or provided via CLI to the scripts.
- Outputs:
  - Modified Lua / XML files, generated Lua fragments, database files under `tools/` (e.g. `wowhead_loot.db.bak`) or exported files created by the export scripts.
  - Packaged addon (zipped) for release (optional manual step).
- Error modes:
  - Malformed input JSON or missing fields in scrapers -> scripts should fail with clear message.
  - Lua runtime issues in-game -> debugging must happen in-game with `print`/`DEFAULT_CHAT_FRAME:AddMessage` or by using an in-game Lua console.

PowerShell / local development commands
--------------------------------------
Use PowerShell on Windows (the repository contains `install.ps1` that helps set up hooks; run it in a PowerShell session as needed):

```powershell
# Run the PowerShell install script (bypass policy for the current process if necessary)
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\install.ps1

# Install Node dependencies used by tools
npm install --prefix .\tools

# Run a tool (example: export Lua data)
node .\tools\exportLua.js
```

If you prefer the batch script on Windows you can run:

```powershell
.\install.bat
```

Development workflow for agents
-------------------------------
- Create a short-lived feature branch per change (e.g. `fix-tooltip-escape` or `data/update-npc-123`).
- Make small, focused commits with descriptive messages based on conventional commit style.
- If the change affects tooling/data, run the Node scripts under `tools/` locally and ensure they produce expected output.
- When ready, open a PR describing intent, steps to reproduce, and any in-game verification steps.

Lua coding conventions and tips
------------------------------
- Avoid polluting the global namespace. Use `local` for functions and variables.
- Prefer explicit `nil` checks rather than relying on falsy behavior for numeric 0 or empty strings when relevant.
- Keep UI changes in `UI.xml`. Use Lua only for behavior and logic.
- Follow WoW addon best practices:
  - Declare saved variables in the `TOC` / initialisation code.
  - Use frame-driven patterns for event handling.
  - Minimize per-frame work; use events and timers.
- Use descriptive names for exported constants and tables.

Node/tooling guidelines
-----------------------
- The `tools/` scripts are small utilities and scrapers. Keep changes backwards-compatible to avoid breaking existing data flows.
- If adding dependencies, prefer lightweight, well-maintained packages and pin versions in `tools/package.json`.
- Write informative logs to stdout/stderr and fail fast on invalid inputs.
- Reuse existing utility scripts from the `tools/` folder where possible.

Edge cases to watch for
-----------------------
- Missing or changed Wowhead HTML structure breaking scrapers.
- Non-UTF-8 data when reading files — normalize encoding to UTF-8.
- Large data sets causing memory pressure in Node scripts — stream where possible.
- Name collisions in databases — ensure deduplication logic is clear.

Quick verification checklist (smoke tests)
-----------------------------------------
- For Lua changes: copy the repository (or the changed files) to your local World of Warcraft AddOns folder using `install.ps1` and start the game to confirm the addon loads without Lua errors.
- For tooling changes: run the modified script in `tools/` and inspect output files or console logs.

Packaging and release notes
---------------------------
### Automated Release Workflow (GitHub Actions)

The repository uses GitHub Actions to automate the release process. The workflow is defined in `.github/workflows/release.yml`.

**Versioning Scheme:**
- Format: `Major.Minor.Patch.Build_Vanilla`
- `Major.Minor.Patch` is maintained in `LootTableExtreme.toc` (## Version: field)
- `Build` is auto-incremented based on the total commit count
- Example: `LootTableExtreme_0.1.2.145_Vanilla.zip`

**Creating a Release:**

1. Navigate to your repository on GitHub
2. Go to "Actions" tab
3. Select "Create Release" workflow
4. Click "Run workflow"
5. Choose version increment type:
   - `major` - Breaking changes (e.g., 0.1.0 → 1.0.0)
   - `minor` - New features (e.g., 0.1.0 → 0.2.0)
   - `patch` - Bug fixes (e.g., 0.1.0 → 0.1.1)
6. Click "Run workflow"

The workflow will:
- Extract the current version from `LootTableExtreme.toc`
- Increment the version according to your selection
- Calculate the build number (total commits)
- Update the TOC file with the new version
- Create a zip file with naming: `LootTableExtreme_Major.Minor.Patch.Build_Vanilla.zip`
- Commit the version bump to the repository
- Create a GitHub release with the zip file attached
- Generate release notes with installation instructions

**Manual Release (if needed):**
- Create a zip with the addon files (Lua, XML, TOC) preserving the folder name `LootTableExtreme` at the root of the zip.
- Update `README.md` with notable changes when releasing a user-facing version.

PR and commit guidance
----------------------
- Small PRs are easier to review. Include:
  - Description of change.
  - Files changed.
  - Any in-game reproduction steps.
  - If data was updated, include the command used to generate it and the exact input file.

Contact points and follow-ups
-----------------------------
- If a change requires in-game debugging or access to a test account, document the steps in the PR and request a reviewer who can run the addon in-game.
- If a Node script relies on external APIs (e.g., WoWHead), add retry logic and note rate limits in the script README.

Small improvements agents may add
--------------------------------
- Add a `tools/README.md` describing each script and its inputs/outputs.
- Add a CI check to run `node .\tools\exportLua.js` on a small sample dataset to detect breakages.
- Add a simple Lua linter or define a small `.luacheckrc` if you want to enforce style.

Done
----
This file is intended to be a living document. Update it when new tooling or conventions are added.
