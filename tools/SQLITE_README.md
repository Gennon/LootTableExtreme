# LootTableExtreme Scraper Tools

Comprehensive toolkit for scraping WoW Classic loot data from Wowhead and managing it in SQLite.

## 🎯 Overview

This toolkit provides a complete workflow for collecting, storing, analyzing, and exporting WoW Classic loot data:

1. **Scrape** → Collect data from Wowhead into SQLite
2. **Analyze** → Query and validate data quality
3. **Export** → Generate filtered Lua files for the addon

**Key Innovation**: All data stored in SQLite with **sample sizes** (e.g., "45 drops out of 1000 kills"), allowing you to filter unreliable data!

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Test with single NPC
npm test

# 3. View database stats
npm run db-stats

# 4. Export to Lua (with sample filter)
npm run export-filtered
```

## 📦 Installation

```bash
cd tools
npm install
```

Installs:
- `playwright` - Browser automation for scraping
- `cheerio` - HTML parsing
- `sqlite3` - Database storage

## 🔄 Complete Workflow

### Step 1: Collect NPC URLs

```bash
# Scrape Wowhead's NPC list to get all Classic NPCs
npm run collect-npcs

# Output: npcs.txt (thousands of NPC URLs)
```

### Step 2: Scrape Loot Data

```bash
# Test with single NPC
npm test

# Scrape all NPCs from npcs.txt
npm run scrape-list

# Debug mode (visible browser, screenshots)
npm run test-debug
```

**What Gets Stored:**
- **NPC Data**: Name, ID, level, zone, elite status
- **Loot Drops**: 
  - Item ID, name, quality
  - **Drop count** (e.g., 45 actual drops)
  - **Sample size** (e.g., from 1000 kills) ← NEW!
  - Drop percentage (calculated)
  - Item class, subclass
  - Quest item flag, season ID

### Step 3: Analyze Data

```bash
# Database statistics
npm run db-stats

# Find unreliable drops (< 10 samples)
node queryDb.js unreliable 10

# Look up specific NPC
node queryDb.js npc "Ragnaros"

# Which NPCs drop an item?
node queryDb.js item 18803

# Top drop rates
node queryDb.js top-drops 50

# Scraping history
node queryDb.js sessions
```

### Step 4: Export to Lua

```bash
# Default: All data
npm run export

# Reliable data only (10+ samples)
npm run export-filtered

# Custom filters
node exportLua.js --min-drop 1.0 --min-sample 5

# Exclude quest items, require reliable data
node exportLua.js --exclude-quest --min-sample 20

# Custom output
node exportLua.js -o ./HighQualityLoot.lua --min-sample 50
```

## 📊 Database Schema

### NPCs Table
Stores complete NPC information:
```
npc_id (PK), name, level_min, level_max, zone
elite, classification, health, mana, armor
type, family, faction
url, scraped_at
```

### Loot Drops Table
The heart of the system - stores **all available data**:
```
npc_id, item_id (composite key)
item_name, quality
drop_count         ← How many times it dropped
sample_size        ← Out of how many kills
drop_percent       ← Calculated percentage
is_quest_item, class_id, subclass_id
stack_size, season_id
scraped_at
```

### Example Data
```
Ragnaros drops Sulfuras:
  drop_count: 23
  sample_size: 1547
  drop_percent: 1.49%
  
This means: 23 drops out of 1547 Ragnaros kills = reliable data!
```

## 🔍 Query Commands

```bash
# Show all statistics
node queryDb.js stats

# Find drops with < 10 samples (unreliable)
node queryDb.js unreliable 10

# Search for NPC
node queryDb.js npc "Defias"

# Find where item drops
node queryDb.js item 19019

# Top 50 drop rates
node queryDb.js top-drops 50

# View scraping sessions
node queryDb.js sessions
```

## 📤 Export Options

```bash
node exportLua.js [options]

Options:
  --min-drop <percent>     Minimum drop rate (default: 0.1%)
  --min-sample <count>     Minimum sample size (default: 0)
  --exclude-quest          Exclude quest items
  --include-season         Include Season of Discovery items
  -o, --output <file>      Output file path
  -h, --help               Show help
```

### Export Examples

```bash
# High confidence only
node exportLua.js --min-sample 20 --min-drop 0.5

# No quest items, reliable data
node exportLua.js --exclude-quest --min-sample 15

# Complete dataset
node exportLua.js --min-sample 0 --min-drop 0.0

# Custom file
node exportLua.js -o ./CustomLoot.lua --min-sample 10
```

## 💡 Pro Tips

### 1. Start Small
Test with a few NPCs before running full scrape:
```bash
node scraper.js --url https://www.wowhead.com/classic/npc=11502/ragnaros
```

### 2. Check Data Quality First
Before exporting, see which data is unreliable:
```bash
node queryDb.js unreliable 5
# Shows items with < 5 samples
```

### 3. Export Multiple Versions
Create different Lua files for different purposes:
```bash
# Minimal (high confidence)
node exportLua.js --min-sample 50 -o Minimal.lua

# Medium (balanced)
node exportLua.js --min-sample 10 -o Standard.lua

# Complete (all data)
node exportLua.js --min-sample 0 -o Complete.lua
```

### 4. Resume Scraping
The scraper automatically resumes:
- Checks existing Lua file
- Skips already-scraped NPCs
- Appends new data
- Progress saved every 10 NPCs

### 5. Database Persists Forever
Scrape once, export many times with different filters!

## 🎮 Real-World Examples

### "I want only reliable raid boss loot"
```bash
node exportLua.js --min-sample 100 --min-drop 1.0 -o RaidLoot.lua
```

### "Show me which items have bad data"
```bash
node queryDb.js unreliable 5
# Lists items with < 5 drops
```

### "What drops from Onyxia?"
```bash
node queryDb.js npc Onyxia
# Shows all drops with sample sizes
```

### "Where does Thunderfury drop?"
```bash
node queryDb.js item 19019
# Shows all NPCs that drop it
```

## 🏗️ Architecture

```
┌─────────────┐
│  Wowhead    │
└──────┬──────┘
       │ scrape
       ↓
┌─────────────┐
│  scraper.js │  ←── Collects all data
└──────┬──────┘
       │ save
       ↓
┌─────────────┐
│  SQLite DB  │  ←── Stores everything
│             │      (with sample sizes!)
└──┬───┬───┬──┘
   │   │   │
   │   │   └─→ exportLua.js  → ScrapedDatabase.lua
   │   │
   │   └────→ queryDb.js     → Analysis
   │
   └────────→ database.js    → Schema & queries
```

## 📋 File Structure

```
tools/
├── scraper.js          - Main scraper
├── database.js         - SQLite schema & helpers
├── exportLua.js        - Lua export with filters
├── queryDb.js          - Database query tool
├── collectNpcs.js      - Collect NPC URLs
├── fetchItemNames.js   - Fetch item details
├── package.json        - Dependencies & scripts
├── npcs.txt            - List of NPC URLs
└── wowhead_loot.db     - SQLite database (created on first run)
```

## 🐛 Troubleshooting

**"sqlite3 not installed"**
```bash
npm install sqlite3
```

**Scraper timing out**
- Use `--debug` flag to see browser
- Check internet connection
- Wowhead might be slow

**No sample size data**
- Some items don't have sample data on Wowhead
- Check with: `node queryDb.js unreliable 1`
- These will show `null` for sample_size

**Database locked**
- Close any other programs accessing the .db file
- On Windows, check Task Manager

## 🎯 Recommended Workflow

1. **Initial Scrape** (one time):
   ```bash
   npm run collect-npcs
   npm run scrape-list
   # Wait several hours...
   ```

2. **Check Quality**:
   ```bash
   npm run db-stats
   node queryDb.js unreliable 10
   ```

3. **Export for Testing**:
   ```bash
   node exportLua.js --min-sample 5 -o Test.lua
   ```

4. **Test in-game**, then export final:
   ```bash
   node exportLua.js --min-sample 10 -o ../ScrapedDatabase.lua
   ```

5. **Re-export anytime** with different filters without re-scraping!

## 📈 Statistics Example

```
📊 Database Statistics
═══════════════════════════════════════
Total NPCs:          2,521
Total Loot Drops:    45,832
Unique Items:        8,641
Avg Drop Count:      127
Avg Sample Size:     3,842

Quality Distribution:
  Poor: 1,234
  Common: 15,678
  Uncommon: 18,456
  Rare: 8,234
  Epic: 2,145
  Legendary: 85
```

## 🚀 Advanced Usage

### Export Only Raid Boss Loot
```bash
# Query database for raid bosses, export separately
node queryDb.js npc "Ragnaros" > ragnaros.txt
# Then filter in SQL query...
```

### Create Multiple Addon Versions
```bash
# Casual players (high drop rates only)
node exportLua.js --min-drop 5.0 -o Casual.lua

# Completionists (all drops)
node exportLua.js --min-drop 0.01 -o Complete.lua

# Raiders (epic+ only, reliable data)
node exportLua.js --min-sample 20 -o Raids.lua
```

## 📚 Additional Resources

- SQLite Browser: https://sqlitebrowser.org/
- Query the database directly with any SQLite tool
- Wowhead Classic: https://www.wowhead.com/classic

## ⚡ Performance

- Scraping: ~3-5 seconds per NPC
- Database queries: < 100ms
- Lua export: ~5 seconds for 2,500 NPCs
- Database size: ~50-100 MB for full Classic data

---

**Questions?** Check the code comments or open an issue!
