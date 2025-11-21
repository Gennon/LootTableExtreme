/**
 * Export SQLite database to Lua format with intelligent merging
 * Updates existing entries or adds new ones without replacing everything
 */

const { ScraperDatabase } = require('./database');
const fs = require('fs');
const path = require('path');

// Sanitize NPC/vendor/pickpocket names for Lua output.
// Removes angle-bracket markers like "<SOME TEXT>", replaces double-quotes
// with single-quotes, escapes backslashes, and trims extra whitespace.
function sanitizeNpcName(name) {
    if (!name) return '';
    let s = name.toString();
    // Remove any tokens like <...>
    s = s.replace(/<[^>]*>/g, '');
    // Replace double quotes with single quotes and escape backslashes
    s = s.replace(/"/g, "'").replace(/\\/g, "\\\\");
    // Collapse multiple spaces and trim
    s = s.replace(/\s+/g, ' ').trim();
    return s;
}

async function main() {
    const args = process.argv.slice(2);
    console.log('DEBUG: raw args ->', args);
    
    // Parse command line options
    const options = {
        minDropPercent: 0.1,
        minSampleSize: 0,
        // Relative tolerance around the largest sample size for this NPC.
        // Items with sample_size < max_sample * (1 - sampleTolerance) will be excluded.
        // e.g. 0.10 = 10% tolerance
        sampleTolerance: 0.1,
        excludeQuestItems: false,
        excludeSeasonItems: true,
        pruneLegacy: false,
        gameVersion: 'classic', // 'classic', 'tbc', or 'all'
        outputDir: path.join(__dirname, '..'),
        lootFile: 'LootDatabase.lua',
        vendorFile: 'VendorDatabase.lua',
        pickpocketFile: 'PickpocketDatabase.lua'
    };
    
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--min-drop':
                options.minDropPercent = parseFloat(args[++i]);
                break;
            case '--min-sample':
                options.minSampleSize = parseInt(args[++i], 10);
                break;
            case '--sample-tolerance':
                options.sampleTolerance = parseFloat(args[++i]);
                break;
            case '--exclude-quest':
                options.excludeQuestItems = true;
                break;
            case '--include-season':
                options.excludeSeasonItems = false;
                break;
            case '--prune-legacy':
                options.pruneLegacy = true;
                break;
            case '--version':
            case '-v':
                const version = args[++i];
                if (['classic', 'tbc', 'all'].includes(version)) {
                    options.gameVersion = version;
                } else {
                    console.error(`Invalid version: ${version}. Use 'classic', 'tbc', or 'all'`);
                    process.exit(1);
                }
                break;
            case '--output-dir':
            case '-d':
                options.outputDir = args[++i];
                break;
            case '--help':
            case '-h':
                printHelp();
                process.exit(0);
        }
    }
    
    console.log('📤 Exporting database to Lua files...');
    console.log(`Game Version: ${options.gameVersion}`);
    console.log(`Output directory: ${options.outputDir}`);
    // Coerce/validate numeric options to avoid NaN or string values
    if (!Number.isFinite(options.minDropPercent)) options.minDropPercent = 0.1;
    if (!Number.isFinite(options.minSampleSize)) options.minSampleSize = 0;
    if (!Number.isFinite(options.sampleTolerance)) options.sampleTolerance = 0.1;

    console.log('DEBUG: parsed options ->', options);
    console.log(`Filters: minDrop=${options.minDropPercent}%, minSample=${options.minSampleSize}`);
    console.log(`         sampleTolerance=${options.sampleTolerance * 100}%`);
    console.log(`         pruneLegacy=${options.pruneLegacy}`);
    console.log(`         gameVersion=${options.gameVersion}`);
    
    // Update filenames to include version suffix if not 'all'
    if (options.gameVersion !== 'all') {
        const suffix = options.gameVersion === 'tbc' ? '_TBC' : '_Vanilla';
        options.lootFile = options.lootFile.replace('.lua', `${suffix}.lua`);
        options.vendorFile = options.vendorFile.replace('.lua', `${suffix}.lua`);
        options.pickpocketFile = options.pickpocketFile.replace('.lua', `${suffix}.lua`);
    }
    
    const db = new ScraperDatabase();
    await db.initialize();
    
    // Export all three datasets
    await exportLootData(db, options);
    await exportVendorData(db, options);
    await exportPickpocketData(db, options);
    
    await db.close();
}

async function exportLootData(db, options) {
    console.log('\n💀 Exporting loot data...');
    const outputFile = path.join(options.outputDir, options.lootFile);
    
    // Get all NPCs from database with optional game version filtering
    let dbNpcs;
    if (options.gameVersion === 'all') {
        dbNpcs = await db.all(`
            SELECT DISTINCT npc_id, name, level_min, level_max, zone, elite, game_version
            FROM npcs
            WHERE npc_id IN (SELECT DISTINCT npc_id FROM loot_drops)
            ORDER BY name
        `);
    } else {
        dbNpcs = await db.all(`
            SELECT DISTINCT npc_id, name, level_min, level_max, zone, elite, game_version
            FROM npcs
            WHERE game_version = ?
              AND npc_id IN (SELECT DISTINCT npc_id FROM loot_drops WHERE game_version = ?)
            ORDER BY name
        `, [options.gameVersion, options.gameVersion]);
    }
    
    console.log(`\n� Found ${dbNpcs.length} NPCs in database`);
    
    // Parse existing Lua file if it exists
    const existingNpcs = new Map();
    if (fs.existsSync(outputFile)) {
        console.log(`📂 Loading existing Lua file...`);
        const existingContent = fs.readFileSync(outputFile, 'utf-8');
        
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
        
        // Get drops for this NPC (filtered by game version if not 'all')
        let drops;
        if (options.gameVersion === 'all') {
            drops = await db.all(`
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
        } else {
            drops = await db.all(`
                SELECT 
                    item_id, item_name, quality, drop_count,
                    sample_size, drop_percent, is_quest_item
                FROM loot_drops
                WHERE npc_id = ?
                  AND game_version = ?
                  AND drop_percent >= ?
                  AND (? = 0 OR sample_size >= ?)
                  AND (? = 0 OR is_quest_item = 0)
                  AND (? = 0 OR season_id IS NULL OR season_id != 2)
                ORDER BY drop_percent DESC
            `, [
                npcId,
                options.gameVersion,
                options.minDropPercent,
                options.minSampleSize,
                options.minSampleSize,
                options.excludeQuestItems ? 1 : 0,
                options.excludeSeasonItems ? 1 : 0
            ]);
        }
        
        if (drops.length === 0) continue;

        // Apply relative sample-size filtering: exclude items with a much smaller
        // sample size than the most-sampled item for this NPC. This avoids
        // keeping rare-looking drops based on very small sample counts.
        if (options.sampleTolerance > 0) {
            const sampleSizes = drops.map(d => d.sample_size || 0);
            const maxSample = Math.max(...sampleSizes);
            if (maxSample > 0) {
                const threshold = Math.max(options.minSampleSize, Math.ceil(maxSample * (1 - options.sampleTolerance)));
                const before = drops.length;
                // keep drops that have sample_size >= threshold
                const filtered = drops.filter(d => (d.sample_size || 0) >= threshold);
                // If filtering would remove all drops (edge case), keep original drops
                if (filtered.length > 0) {
                    drops.length = 0;
                    Array.prototype.push.apply(drops, filtered);
                }
                const removed = before - drops.length;
                if (removed > 0) {
                    console.log(`  ⚠️  Removed ${removed} low-sample item(s) for NPC ${npc.name} (threshold=${threshold}, max=${maxSample})`);
                }
            }
        }
        
    // Sanitize NPC name for safe Lua output
    const sanitizedName = sanitizeNpcName(npc.name || '');

    // Generate Lua entry
    let entry = `    -- ${sanitizedName}\n`;
    entry += `    ["${sanitizedName}"] = {\n`;
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
    // If pruneLegacy is set, do not preserve Lua-only entries (they cannot be
    // re-validated against the DB filters). This makes --min-sample and other
    // filters apply to the whole output when requested.
    const allEntries = options.pruneLegacy ?
        [...newEntries] :
        [...toKeep.map(item => item.entry), ...newEntries];
    
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
DB.LootDatabase = {
`;
    
    const footer = `}

-- Merge scraped data into main NpcLoot table
if DB and DB.NpcLoot and DB.LootDatabase then
    for npcName, data in pairs(DB.LootDatabase) do
        DB.NpcLoot[npcName] = data
    end
else
    print("ERROR: LootTableExtreme.Database not initialized before loading LootDatabase")
end
`;
    
    const output = header + allEntries.join('\n') + footer;
    
    // Write to file
    fs.writeFileSync(outputFile, output, 'utf-8');
    
    console.log(`✅ Loot data exported!`);
    console.log(`  Total Entries: ${allEntries.length}`);
    console.log(`  Updated: ${toUpdate.length}`);
    console.log(`  Preserved: ${toKeep.length}`);
    console.log(`  New: ${toAdd.length}`);
    console.log(`  Output: ${outputFile}`);
    
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
}

async function exportVendorData(db, options) {
    console.log('\n🛒 Exporting vendor data...');
    const outputFile = path.join(options.outputDir, options.vendorFile);
    
    // Get all NPCs that sell items (with optional game version filtering)
    let vendors;
    if (options.gameVersion === 'all') {
        vendors = await db.all(`
            SELECT DISTINCT n.npc_id, n.name, n.level_min, n.level_max, n.zone, n.game_version
            FROM npcs n
            INNER JOIN vendor_items v ON n.npc_id = v.npc_id AND n.game_version = v.game_version
            ORDER BY n.name
        `);
    } else {
        vendors = await db.all(`
            SELECT DISTINCT n.npc_id, n.name, n.level_min, n.level_max, n.zone, n.game_version
            FROM npcs n
            INNER JOIN vendor_items v ON n.npc_id = v.npc_id AND n.game_version = v.game_version
            WHERE n.game_version = ?
            ORDER BY n.name
        `, [options.gameVersion]);
    }
    
    console.log(`� Found ${vendors.length} vendors in database`);
    
    if (vendors.length === 0) {
        console.log('⚠️  No vendor data to export');
        return;
    }
    
    // Generate Lua content
    const header = `-- Auto-generated vendor database from Wowhead Classic
-- Generated: ${new Date().toISOString()}
-- Total vendors: ${vendors.length}
-- 
-- This file is automatically loaded by Database.lua

local DB = LootTableExtreme.Database

-- Vendor (sold) items
DB.VendorItems = {
`;
    
    const entries = [];
    for (const vendor of vendors) {
        let items;
        if (options.gameVersion === 'all') {
            items = await db.all(`
                SELECT item_id, item_name, quality, cost_amount, cost_currency, 
                       stock, required_level, required_faction
                FROM vendor_items
                WHERE npc_id = ?
                ORDER BY cost_amount ASC
            `, [vendor.npc_id]);
        } else {
            items = await db.all(`
                SELECT item_id, item_name, quality, cost_amount, cost_currency, 
                       stock, required_level, required_faction
                FROM vendor_items
                WHERE npc_id = ? AND game_version = ?
                ORDER BY cost_amount ASC
            `, [vendor.npc_id, options.gameVersion]);
        }
        
        if (items.length === 0) continue;
        
    const sanitizedVendorName = sanitizeNpcName(vendor.name || '');
    let entry = `    -- ${sanitizedVendorName}\n`;
    entry += `    ["${sanitizedVendorName}"] = {\n`;
        entry += `        npcId = ${vendor.npc_id},\n`;
        entry += `        level = {${vendor.level_min}, ${vendor.level_max}},\n`;
        entry += `        zone = "${vendor.zone || 'Unknown'}",\n`;
        entry += `        items = {\n`;
        
        items.forEach((item, index) => {
            const comma = index < items.length - 1 ? ',' : '';
            entry += `            {itemId = ${item.item_id}, cost = ${item.cost_amount}}${comma}\n`;
        });
        
        entry += `        }\n`;
        entry += `    },\n`;
        entries.push(entry);
    }
    
    const footer = `}\n`;
    const output = header + entries.join('\n') + footer;
    
    fs.writeFileSync(outputFile, output, 'utf-8');
    
    console.log(`✅ Vendor data exported!`);
    console.log(`  Total Vendors: ${vendors.length}`);
    console.log(`  Output: ${outputFile}`);
}

async function exportPickpocketData(db, options) {
    console.log('\n🥷 Exporting pickpocket data...');
    const outputFile = path.join(options.outputDir, options.pickpocketFile);
    
    // Get all NPCs with pickpocket loot (with optional game version filtering)
    let npcs;
    if (options.gameVersion === 'all') {
        npcs = await db.all(`
            SELECT DISTINCT n.npc_id, n.name, n.level_min, n.level_max, n.zone, n.game_version
            FROM npcs n
            INNER JOIN pickpocket_loot p ON n.npc_id = p.npc_id AND n.game_version = p.game_version
            ORDER BY n.name
        `);
    } else {
        npcs = await db.all(`
            SELECT DISTINCT n.npc_id, n.name, n.level_min, n.level_max, n.zone, n.game_version
            FROM npcs n
            INNER JOIN pickpocket_loot p ON n.npc_id = p.npc_id AND n.game_version = p.game_version
            WHERE n.game_version = ?
            ORDER BY n.name
        `, [options.gameVersion]);
    }
    
    console.log(`� Found ${npcs.length} NPCs with pickpocket loot`);
    
    if (npcs.length === 0) {
        console.log('⚠️  No pickpocket data to export');
        return;
    }
    
    // Generate Lua content
    const header = `-- Auto-generated pickpocket database from Wowhead Classic
-- Generated: ${new Date().toISOString()}
-- Total NPCs: ${npcs.length}
-- 
-- This file is automatically loaded by Database.lua

local DB = LootTableExtreme.Database

-- Pickpocket loot table
DB.PickpocketLoot = {
`;
    
    const entries = [];
    for (const npc of npcs) {
        let items;
        if (options.gameVersion === 'all') {
            items = await db.all(`
                SELECT item_id, item_name, quality, drop_percent, drop_count, sample_size
                FROM pickpocket_loot
                WHERE npc_id = ?
                    AND drop_percent >= ?
                    AND (? = 0 OR sample_size >= ?)
                ORDER BY drop_percent DESC
            `, [npc.npc_id, options.minDropPercent, options.minSampleSize, options.minSampleSize]);
        } else {
            items = await db.all(`
                SELECT item_id, item_name, quality, drop_percent, drop_count, sample_size
                FROM pickpocket_loot
                WHERE npc_id = ? AND game_version = ?
                    AND drop_percent >= ?
                    AND (? = 0 OR sample_size >= ?)
                ORDER BY drop_percent DESC
            `, [npc.npc_id, options.gameVersion, options.minDropPercent, options.minSampleSize, options.minSampleSize]);
        }
        
        if (items.length === 0) continue;

        // apply relative sample-size filter for pickpocket as well
        if (options.sampleTolerance > 0) {
            const sampleSizes = items.map(d => d.sample_size || 0);
            const maxSample = Math.max(...sampleSizes);
            if (maxSample > 0) {
                const threshold = Math.max(options.minSampleSize, Math.ceil(maxSample * (1 - options.sampleTolerance)));
                const before = items.length;
                const filtered = items.filter(d => (d.sample_size || 0) >= threshold);
                if (filtered.length > 0) {
                    items.length = 0;
                    Array.prototype.push.apply(items, filtered);
                }
                const removed = before - items.length;
                if (removed > 0) {
                    console.log(`  ⚠️  Removed ${removed} low-sample pickpocket item(s) for NPC ${npc.name} (threshold=${threshold}, max=${maxSample})`);
                }
            }
        }
        
    const sanitizedName = sanitizeNpcName(npc.name || '');
    let entry = `    -- ${sanitizedName}\n`;
    entry += `    ["${sanitizedName}"] = {\n`;
        entry += `        npcId = ${npc.npc_id},\n`;
        entry += `        level = {${npc.level_min}, ${npc.level_max}},\n`;
        entry += `        zone = "${npc.zone || 'Unknown'}",\n`;
        entry += `        loot = {\n`;
        
        items.forEach((item, index) => {
            const comma = index < items.length - 1 ? ',' : '';
            entry += `            {itemId = ${item.item_id}, dropChance = ${item.drop_percent.toFixed(1)}}${comma}\n`;
        });
        
        entry += `        }\n`;
        entry += `    },\n`;
        entries.push(entry);
    }
    
    const footer = `}\n`;
    const output = header + entries.join('\n') + footer;
    
    fs.writeFileSync(outputFile, output, 'utf-8');
    
    console.log(`✅ Pickpocket data exported!`);
    console.log(`  Total NPCs: ${npcs.length}`);
    console.log(`  Output: ${outputFile}`);
}

function printHelp() {
    console.log(`
Usage: node exportLua.js [options]

Exports data to three separate Lua files:
  - ScrapedDatabase.lua    (loot drops from kills)
  - VendorDatabase.lua     (items sold by NPCs)
  - PickpocketDatabase.lua (rogue pickpocket loot)

Options:
  --version, -v <version>  Game version to export: 'classic', 'tbc', or 'all' (default: classic)
  --min-drop <percent>     Minimum drop rate to include (default: 0.1)
  --min-sample <count>     Minimum sample size to include (default: 0)
  --exclude-quest          Exclude quest items from loot export
  --include-season         Include Season of Discovery items (excluded by default)
  --output-dir, -d <dir>   Output directory (default: ../)
  --help, -h               Show this help message

Examples:
  # Export Classic data (default)
  node exportLua.js

  # Export TBC data
  node exportLua.js --version tbc

  # Export both Classic and TBC data (combined)
  node exportLua.js --version all

  # Only include items with at least 10 drops
  node exportLua.js --min-sample 10

  # Export TBC with > 1% drop rate and 5+ samples
  node exportLua.js --version tbc --min-drop 1.0 --min-sample 5

  # Export to custom directory
  node exportLua.js --output-dir ./output
`);
}

main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
