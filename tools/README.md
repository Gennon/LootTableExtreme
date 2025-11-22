# LootTableExtreme Database Tools

This folder contains tools for building and maintaining the LootTableExtreme database.

## Wowhead Scraper

The scraper extracts enemy loot data from Wowhead Classic and generates Lua database entries.

### Setup

1. Install Node.js (if not already installed)
2. Install dependencies:
```bash
cd tools
npm install
```

### Usage

#### Scrape a single enemy:
```bash
npm run scrape -- --url https://www.wowhead.com/classic/npc=3260/bristleback-water-seeker
```

Or use the test script:
```bash
npm test
```

#### Scrape multiple enemies from a list:
1. Edit `npcs.txt` and add Wowhead URLs (one per line)
2. Run:
```bash
npm run scrape-list
```

#### Direct command:
```bash
node scraper.js --url <wowhead-url>
node scraper.js --list npcs.txt
```

### Output

The scraper generates a file called `scraped_database.lua` containing formatted enemy entries ready to copy into your `Database.lua` file.

### Example Output:

```lua
-- Bristleback Water Seeker
["Bristleback Water Seeker"] = {
    npcId = 3260,
    level = {9, 10},
    zone = "Durotar",
    loot = {
        {itemId = 2589, name = "Linen Cloth", quality = DB.Quality.COMMON, dropChance = 42.5, isQuestItem = false},
        {itemId = 769, name = "Chunk of Boar Meat", quality = DB.Quality.COMMON, dropChance = 38.2, isQuestItem = false},
        -- ... more items
    },
},
```

### Notes

- The scraper waits 2 seconds between requests to be respectful to Wowhead's servers
- Some data may need manual verification
- Quest item detection is best-effort based on CSS classes and item names
- Drop percentages come directly from Wowhead's displayed data

### Troubleshooting

**Browser won't launch:**
- Run: `npx playwright install chromium`

**No loot data found:**
- Wowhead's HTML structure may have changed
- Try visiting the URL manually to verify loot table exists
- Check console output for specific errors

**Timeout errors:**
- Increase timeout values in scraper.js
- Check your internet connection

## Vendor Faction Updater

A tool to fetch and update faction/reaction data for vendors from Wowhead.

### Usage

Update faction data for all vendors:
```bash
node updateVendorFactions.js
```

For TBC vendors:
```bash
node updateVendorFactions.js --version tbc
```

### What it does

- Fetches `g_npcs[npc_id].react` data from Wowhead
- `react` is an array `[alliance_reaction, horde_reaction]`
  - `1` = friendly/accessible
  - `-1` = hostile
  - `null` = cannot access
- Updates the database with faction information:
  - `faction`: "Alliance", "Horde", or "Neutral"
  - `reactionAlliance`: 1, -1, or null
  - `reactionHorde`: 1, -1, or null

### After updating

Re-export the vendor database to include faction data:
```bash
node exportLua.js --version classic
```

This will add faction indicators to tooltips:
- `(A)` in blue for Alliance-only vendors
- `(H)` in red for Horde-only vendors
- No indicator for Neutral vendors

