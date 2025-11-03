AGENTS (tools)

Purpose
-------
This file documents how an automated or human "agent" (developer, CI job, or assistant) should work on the Node.js tooling inside the `tools/` folder of the LootTableExtreme repository. It supplements the top-level `AGENTS.md` with guidance specific to the Node scripts, data files, and local developer workflows used to scrape, build, and export addon data.

Scope
-----
Files and folders covered by these notes:
- `tools/*.js` — Node.js scripts used for scraping, data processing, inspection, and exporting Lua fragments.
- `tools/package.json` — NPM dependencies and scripts used by the tools.
- `tools/npc_data.json`, `tools/npcs.txt`, and `tools/wowhead_loot.db` — input data used by scripts and examples.
- `tools/screenshots/` — saved HTML pages and screenshots from scraping runs.

Agent contract (inputs / outputs / error modes)
----------------------------------------------
Inputs:
- Local files in `tools/` (JSON, text, HTML snapshots) or small samples provided as stdin/CLI args.
- Network access to target sites (e.g., Wowhead) when running scrapers — optional in offline modes using saved HTML in `tools/screenshots/`.

Outputs:
- Generated files in `tools/` (logs, exported Lua fragments from `exportLua.js`, SQLite backups, or updated JSON files).
- Console logs and non-zero exit codes on failure to make CI detection straightforward.

Error modes:
- Network failures when fetching remote pages — scripts should fail with a clear message and non-zero exit code.
- Input data format changes (e.g., Wowhead markup changed) — scrapers should log the URL and saved snapshot for later debugging.
- Missing dependencies — `npm install` should be run in `tools/` and the script should detect and print a helpful message.

Recommended local setup
-----------------------
Use PowerShell on Windows (the repo has helper scripts in the root but the `tools/` folder can be used standalone):

- Install Node dependencies for `tools/`:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
npm install --prefix .\tools
```

- Run a script (example: export Lua data):

```powershell
node .\tools\exportLua.js
```

Conventions for editing `tools/` scripts
---------------------------------------
- Keep scripts small and focused. Each `tools/*.js` should have a single responsibility (scrape, transform, export, inspect).
- Add helpful CLI flags and `--help` output for non-obvious scripts.
- Prefer async/await and small, well-documented functions.
- When adding dependencies, update `tools/package.json` and include a short justification in the commit message.
- Keep an overview over all the scripts so that we avoid duplication of functionality.

Logging and deterministic outputs
--------------------------------
- Prefer structured logs (JSON lines) for data-processing scripts when possible, and use human-readable logs for interactive runs.
- Save network snapshots (HTML) for any scraping run that encountered parsing issues; place them in `tools/screenshots/` with a timestamped filename.

Data handling and encoding
--------------------------
- Normalize all text to UTF-8 when reading or writing files.
- When processing large inputs, prefer streaming APIs to avoid excessive memory usage.
- Validate input JSON files with a small schema or shape check; fail fast with a clear message when required fields are missing.

Testing and validation
----------------------
- Add small unit-like tests when fixing bugs or adding new transformations; these can be plain Node scripts under `tools/test/` or assertions inside the script run with `--test` flags.
- For changes that affect exports consumed by the addon (Lua fragments), run `node .\tools\exportLua.js` against the sample data and verify output matches expected structure.

CI recommendations
------------------
- Add a CI job (optional) that runs `npm ci --prefix tools` and executes a smoke run, such as `node tools/exportLua.js --sample`, to catch regressions in parsing or runtime errors.
- Cache `~/.npm` between runs where available for speed.

Security and side-effects
-------------------------
- Scrapers should be careful with rate limits and respectful of target site robots.txt. Add (and enforce) a conservative rate limiter for network requests.
- Avoid storing credentials in the repo. If scripts require API keys, read them from environment variables and document the required variable names in this file.

Small improvements agents may add
--------------------------------
- Add `tools/README.md` describing each script and its inputs/outputs (short) — if missing, create it and list commands.
- Add minimal tests under `tools/test/` that run core transformations on a small sample and assert expected results.
- Add a `--dry-run` flag to destructive scripts.

Quick verification checklist (tools)
-----------------------------------
- Run `npm install --prefix tools` and then run `node tools/exportLua.js` to ensure the script starts and produces output or helpful errors.
- If a scraper is updated, re-run with a saved HTML from `tools/screenshots/` to validate parsing changes locally.

Done
----
This file is intended to be a living document. Update it when new tooling or conventions are added.