/**
 * Export SQLite database to Lua format with intelligent merging
 * Updates existing entries or adds new ones without replacing everything
 */

const { ScraperDatabase } = require('./database');
const fs = require('fs');
const path = require('path');

async function main() {
    const args = process.argv.slice(2);
    
    // Parse command line options
    const options = {
        minDropPercent: 0.1,
        minSampleSize: 0,
        excludeQuestItems: false,
        excludeSeasonItems: true,
        outputFile: path.join(__dirname, '..', 'ScrapedDatabase.lua')
    };
    
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--min-drop':
                options.minDropPercent = parseFloat(args[++i]);
                break;
            case '--min-sample':
                options.minSampleSize = parseInt(args[++i]);
                break;
            case '--exclude-quest':
                options.excludeQuestItems = true;
                break;
            case '--include-season':
                options.excludeSeasonItems = false;
                break;
            case '--output':
            case '-o':
                options.outputFile = args[++i];
                break;
            case '--help':
            case '-h':
                printHelp();
                process.exit(0);
        }
    }
    
    console.log('� Exporting database to Lua with smart merging...');
    console.log(`Output: ${options.outputFile}`);
    console.log(`Filters: minDrop=${options.minDropPercent}%, minSample=${options.minSampleSize}`);
    
    const db = new ScraperDatabase();
    await db.initialize();
    
    // Get all NPCs from database
    const dbNpcs = await db.all(`
        SELECT DISTINCT npc_id, name, level_min, level_max, zone, elite
        FROM npcs
        WHERE npc_id IN (SELECT DISTINCT npc_id FROM loot_drops)
        ORDER BY name
    `);
    
    console.log(`\n� Found ${dbNpcs.length} NPCs in database`);
    
    // Parse existing Lua file if it exists
    const existingNpcs = new Map();
    if (fs.existsSync(options.outputFile)) {
        console.log(`📂 Loading existing Lua file...`);
        const existingContent = fs.readFileSync(options.outputFile, 'utf-8');
        
        // Extract each NPC entry with its full content
        // Pattern matches: comment line, NPC name line, everything until closing brace
        // Use \r?\n to handle both Unix and Windows line endings
        const entryPattern = /^    -- ([^\r\n]+)\r?\n    \["([^"]+)"\] = \{\r?\n(?:.*\r?\n)*?    \},\r?\n/gm;
        let match;
        while ((match = entryPattern.exec(existingContent)) !== null) {
            // Extract npcId from the matched entry
            const npcIdMatch = match[0].match(/npcId = (\d+)/);
            if (npcIdMatch) {
                const npcId = parseInt(npcIdMatch[1]);
                const npcName = match[2];
                const fullEntry = match[0];
                existingNpcs.set(npcId, { name: npcName, entry: fullEntry });
            }
        }
        
        console.log(`✓ Found ${existingNpcs.size} existing NPC entries in Lua file`);
    }
    
    // Build map of database NPCs
    const dbNpcMap = new Map();
    for (const npc of dbNpcs) {
        dbNpcMap.set(npc.npc_id, npc);
    }
    
    // Determine which NPCs to update
    const toUpdate = [];
    const toKeep = [];
    const toAdd = [];
    
    for (const [npcId, existingData] of existingNpcs.entries()) {
        if (dbNpcMap.has(npcId)) {
            // NPC exists in both - will update from database
            toUpdate.push(npcId);
        } else {
            // NPC only in Lua file - keep existing entry
            toKeep.push({ npcId, ...existingData });
        }
    }
    
    for (const [npcId, npcData] of dbNpcMap.entries()) {
        if (!existingNpcs.has(npcId)) {
            // NPC only in database - add new entry
            toAdd.push(npcId);
        }
    }
    
    console.log(`\n� Export plan:`);
    console.log(`  Update: ${toUpdate.length} NPCs (in both DB and Lua)`);
    console.log(`  Keep:   ${toKeep.length} NPCs (only in Lua, not in DB)`);
    console.log(`  Add:    ${toAdd.length} NPCs (only in DB, new)`);
    
    // Generate Lua entries for NPCs in database
    const newEntries = [];
    const npcIdsToExport = [...toUpdate, ...toAdd];
    
    for (const npcId of npcIdsToExport) {
        const npc = dbNpcMap.get(npcId);
        
        // Get drops for this NPC
        const drops = await db.all(`
            SELECT 
                item_id, item_name, quality, drop_count,
                sample_size, drop_percent, is_quest_item
            FROM loot_drops
            WHERE npc_id = ?
              AND drop_percent >= ?
              AND (? = 0 OR sample_size >= ?)
              AND (? = 0 OR is_quest_item = 0)
              AND (? = 0 OR season_id IS NULL OR season_id != 2)
            ORDER BY drop_percent DESC
        `, [
            npcId,
            options.minDropPercent,
            options.minSampleSize,
            options.minSampleSize,
            options.excludeQuestItems ? 1 : 0,
            options.excludeSeasonItems ? 1 : 0
        ]);
        
        if (drops.length === 0) continue;
        
        // Generate Lua entry
        let entry = `    -- ${npc.name}\n`;
        entry += `    ["${npc.name}"] = {\n`;
        entry += `        npcId = ${npc.npc_id},\n`;
        entry += `        level = {${npc.level_min}, ${npc.level_max}},\n`;
        entry += `        zone = "${npc.zone || 'Unknown'}",\n`;
        if (npc.elite) {
            entry += `        elite = true,\n`;
        }
        entry += `        loot = {\n`;
        
        drops.forEach((drop, index) => {
            const comma = index < drops.length - 1 ? ',' : '';
            entry += `            {itemId = ${drop.item_id}, dropChance = ${drop.drop_percent.toFixed(1)}}${comma}\n`;
        });
        
        entry += `        },\n`;
        entry += `    },\n`;
        
        newEntries.push(entry);
    }
    
    // Combine: keep existing entries that aren't in DB, add updated/new entries from DB
    const allEntries = [
        ...toKeep.map(item => item.entry),
        ...newEntries
    ];
    
    // Sort entries alphabetically by NPC name
    allEntries.sort((a, b) => {
        const nameA = a.match(/-- (.+?)\n/)?.[1] || '';
        const nameB = b.match(/-- (.+?)\n/)?.[1] || '';
        return nameA.localeCompare(nameB);
    });
    
    // Generate final Lua file
    const header = `-- Auto-generated loot table database from Wowhead Classic
-- Generated: ${new Date().toISOString()}
-- Total enemies: ${allEntries.length}
-- Export filters: minDrop=${options.minDropPercent}%, minSample=${options.minSampleSize}
-- 
-- This file is automatically loaded by Database.lua
-- DO NOT manually edit this file - regenerate with: node exportLua.js

local DB = LootTableExtreme.Database

-- Scraped enemy loot data
DB.ScrapedLoot = {
`;
    
    const footer = `}

-- Merge scraped data into main EnemyLoot table
for enemyName, data in pairs(DB.ScrapedLoot) do
    DB.EnemyLoot[enemyName] = data
end
`;
    
    const output = header + allEntries.join('\n') + footer;
    
    // Write to file
    fs.writeFileSync(options.outputFile, output, 'utf-8');
    
    // Show statistics
    const stats = await db.getStats();
    console.log(`\n✅ Export complete!`);
    console.log(`\n📊 Database statistics:`);
    console.log(`  Total NPCs: ${stats.total_npcs}`);
    console.log(`  Total Drops: ${stats.total_drops}`);
    console.log(`  Unique Items: ${stats.unique_items}`);
    if (stats.avg_sample_size) {
        console.log(`  Avg Sample Size: ${Math.round(stats.avg_sample_size)}`);
    }
    
    console.log(`\n📄 Exported Lua file:`);
    console.log(`  Total Entries: ${allEntries.length}`);
    console.log(`  Updated: ${toUpdate.length}`);
    console.log(`  Preserved: ${toKeep.length}`);
    console.log(`  New: ${toAdd.length}`);
    console.log(`  Output: ${options.outputFile}`);
    
    // Show filtering impact
    const totalDropsInDb = await db.get(`
        SELECT COUNT(*) as count
        FROM loot_drops
        WHERE npc_id IN (${npcIdsToExport.join(',') || 0})
    `);
    
    const exportedDrops = newEntries.reduce((sum, entry) => {
        const matches = entry.match(/itemId =/g);
        return sum + (matches ? matches.length : 0);
    }, 0);
    
    if (totalDropsInDb && totalDropsInDb.count > 0) {
        const filtered = totalDropsInDb.count - exportedDrops;
        const percent = ((filtered / totalDropsInDb.count) * 100).toFixed(1);
        console.log(`\n🔍 Filtering results:`);
        console.log(`  Total drops in DB: ${totalDropsInDb.count}`);
        console.log(`  Exported: ${exportedDrops}`);
        console.log(`  Filtered out: ${filtered} (${percent}%)`);
    }
    
    await db.close();
}

function printHelp() {
    console.log(`
Usage: node exportLua.js [options]

Options:
  --min-drop <percent>     Minimum drop rate to include (default: 0.1)
  --min-sample <count>     Minimum sample size to include (default: 0)
  --exclude-quest          Exclude quest items from export
  --include-season         Include Season of Discovery items (excluded by default)
  --output, -o <file>      Output file path (default: ../ScrapedDatabase.lua)
  --help, -h               Show this help message

Examples:
  # Export with default settings
  node exportLua.js

  # Only include items with at least 10 drops
  node exportLua.js --min-sample 10

  # Only include items with > 1% drop rate and 5+ samples
  node exportLua.js --min-drop 1.0 --min-sample 5

  # Export to custom file
  node exportLua.js --output ./custom_loot.lua

  # Exclude quest items and require reliable data
  node exportLua.js --exclude-quest --min-sample 10
`);
}

main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
