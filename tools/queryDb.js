/**
 * Query and analyze the scraper database
 */

const { ScraperDatabase } = require('./database');

async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'stats';
    
    const db = new ScraperDatabase();
    await db.initialize();
    
    switch (command) {
        case 'stats':
            await showStats(db);
            break;
        
        case 'unreliable':
            const minSample = parseInt(args[1]) || 10;
            await showUnreliable(db, minSample);
            break;
        
        case 'npc':
            const npcName = args.slice(1).join(' ');
            if (!npcName) {
                console.log('Usage: node queryDb.js npc <npc_name>');
            } else {
                await showNpcData(db, npcName);
            }
            break;
        
        case 'item':
            const itemId = parseInt(args[1]);
            if (!itemId) {
                console.log('Usage: node queryDb.js item <item_id>');
            } else {
                await showItemDrops(db, itemId);
            }
            break;
        
        case 'top-drops':
            const limit = parseInt(args[1]) || 20;
            await showTopDropRates(db, limit);
            break;
        
        case 'sessions':
            await showSessions(db);
            break;

        case 'mismatches':
            await showMismatches(db);
            break;
        
        default:
            printHelp();
    }
    
    await db.close();
}

async function showStats(db) {
    const stats = await db.getStats();
    
    console.log('\n📊 Database Statistics');
    console.log('═'.repeat(50));
    console.log(`Total NPCs:          ${stats.total_npcs}`);
    console.log(`Total Loot Drops:    ${stats.total_drops}`);
    console.log(`Unique Items:        ${stats.unique_items}`);
    if (stats.avg_drop_count) {
        console.log(`Avg Drop Count:      ${Math.round(stats.avg_drop_count)}`);
    }
    if (stats.avg_sample_size) {
        console.log(`Avg Sample Size:     ${Math.round(stats.avg_sample_size)}`);
    }
    
    // Show quality distribution
    const qualityDist = await db.all(`
        SELECT quality, COUNT(*) as count
        FROM loot_drops
        GROUP BY quality
        ORDER BY quality
    `);
    
    console.log('\nQuality Distribution:');
    const qualityNames = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
    qualityDist.forEach(q => {
        const name = qualityNames[q.quality] || 'Unknown';
        console.log(`  ${name}: ${q.count}`);
    });
    
    // Show zone distribution (top 10)
    const zoneDist = await db.all(`
        SELECT zone, COUNT(*) as count
        FROM npcs
        WHERE zone IS NOT NULL
        GROUP BY zone
        ORDER BY count DESC
        LIMIT 10
    `);
    
    console.log('\nTop 10 Zones by NPC Count:');
    zoneDist.forEach(z => {
        console.log(`  ${z.zone}: ${z.count} NPCs`);
    });
}

async function showUnreliable(db, minSample) {
    console.log(`\n⚠️  Drops with Sample Size < ${minSample}`);
    console.log('═'.repeat(80));
    
    const drops = await db.all(`
        SELECT 
            n.name as npc_name,
            ld.item_name,
            ld.drop_count,
            ld.sample_size,
            ld.drop_percent,
            ld.quality
        FROM loot_drops ld
        JOIN npcs n ON ld.npc_id = n.npc_id
        WHERE ld.sample_size < ? AND ld.sample_size > 0
        ORDER BY ld.sample_size ASC, ld.drop_percent DESC
        LIMIT 50
    `, [minSample]);
    
    if (drops.length === 0) {
        console.log('No unreliable drops found.');
    } else {
        console.log(`Found ${drops.length} drops (showing first 50):\n`);
        drops.forEach(drop => {
            const qualityNames = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
            const quality = qualityNames[drop.quality] || '?';
            console.log(`${drop.npc_name}`);
            console.log(`  └─ ${drop.item_name} [${quality}]`);
            console.log(`     ${drop.drop_count}/${drop.sample_size} samples = ${drop.drop_percent.toFixed(2)}%\n`);
        });
    }
}

async function showNpcData(db, npcName) {
    const npc = await db.get(`
        SELECT * FROM npcs
        WHERE name LIKE ?
        ORDER BY name
        LIMIT 1
    `, [`%${npcName}%`]);
    
    if (!npc) {
        console.log(`NPC not found: ${npcName}`);
        return;
    }
    
    console.log(`\n📋 NPC: ${npc.name}`);
    console.log('═'.repeat(50));
    console.log(`ID:              ${npc.npc_id}`);
    console.log(`Level:           ${npc.level_min}-${npc.level_max}`);
    console.log(`Zone:            ${npc.zone}`);
    if (npc.elite) {
        console.log(`Classification:  Elite`);
    }
    console.log(`Scraped:         ${npc.scraped_at}`);
    
    const drops = await db.all(`
        SELECT item_name, quality, drop_count, sample_size, drop_percent
        FROM loot_drops
        WHERE npc_id = ?
        ORDER BY drop_percent DESC
    `, [npc.npc_id]);
    
    console.log(`\nLoot Table (${drops.length} items):`);
    const qualityNames = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
    drops.forEach((drop, i) => {
        const quality = qualityNames[drop.quality] || '?';
        const sample = drop.sample_size ? ` (${drop.drop_count}/${drop.sample_size})` : '';
        console.log(`  ${i + 1}. ${drop.item_name} [${quality}] - ${drop.drop_percent.toFixed(2)}%${sample}`);
    });
}

async function showItemDrops(db, itemId) {
    const drops = await db.all(`
        SELECT 
            n.name as npc_name,
            n.level_min,
            n.level_max,
            n.zone,
            ld.item_name,
            ld.quality,
            ld.drop_count,
            ld.sample_size,
            ld.drop_percent
        FROM loot_drops ld
        JOIN npcs n ON ld.npc_id = n.npc_id
        WHERE ld.item_id = ?
        ORDER BY ld.drop_percent DESC
    `, [itemId]);
    
    if (drops.length === 0) {
        console.log(`No drops found for item ID: ${itemId}`);
        return;
    }
    
    const item = drops[0];
    const qualityNames = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
    const quality = qualityNames[item.quality] || '?';
    
    console.log(`\n🎁 Item: ${item.item_name} [${quality}]`);
    console.log('═'.repeat(50));
    console.log(`Drops from ${drops.length} NPC(s):\n`);
    
    drops.forEach(drop => {
        const sample = drop.sample_size ? ` (${drop.drop_count}/${drop.sample_size})` : '';
        console.log(`${drop.npc_name} [${drop.level_min}-${drop.level_max}]`);
        console.log(`  ${drop.zone}`);
        console.log(`  Drop Rate: ${drop.drop_percent.toFixed(2)}%${sample}\n`);
    });
}

async function showTopDropRates(db, limit) {
    console.log(`\n🏆 Top ${limit} Drop Rates`);
    console.log('═'.repeat(80));
    
    const drops = await db.all(`
        SELECT 
            n.name as npc_name,
            ld.item_name,
            ld.quality,
            ld.drop_percent,
            ld.drop_count,
            ld.sample_size
        FROM loot_drops ld
        JOIN npcs n ON ld.npc_id = n.npc_id
        WHERE ld.drop_percent > 1 AND ld.quality >= 2
        ORDER BY ld.drop_percent DESC
        LIMIT ?
    `, [limit]);
    
    const qualityNames = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
    drops.forEach((drop, i) => {
        const quality = qualityNames[drop.quality] || '?';
        const sample = drop.sample_size ? ` [${drop.drop_count}/${drop.sample_size}]` : '';
        console.log(`${i + 1}. ${drop.drop_percent.toFixed(2)}% - ${drop.item_name} [${quality}]${sample}`);
        console.log(`   from ${drop.npc_name}\n`);
    });
}

async function showSessions(db) {
    console.log('\n📅 Scraping Sessions');
    console.log('═'.repeat(70));
    
    const sessions = await db.all(`
        SELECT * FROM scrape_sessions
        ORDER BY started_at DESC
        LIMIT 10
    `);
    
    sessions.forEach(session => {
        const duration = session.completed_at ? 
            Math.round((new Date(session.completed_at) - new Date(session.started_at)) / 1000) + 's' :
            'In Progress';
        
        console.log(`Session #${session.id} - ${session.status}`);
        console.log(`  Started:  ${session.started_at}`);
        if (session.completed_at) {
            console.log(`  Completed: ${session.completed_at}`);
        }
        console.log(`  Duration: ${duration}`);
        console.log(`  NPCs:     ${session.npcs_scraped}`);
        console.log(`  Items:    ${session.items_found}`);
        console.log(`  Errors:   ${session.errors}\n`);
    });
}

async function showMismatches(db) {
    console.log('\n🔎 Pickpocket / NPC game_version mismatches');
    console.log('═'.repeat(70));

    // Count NPCs where the npc.game_version = 'classic' but pickpocket_loot exists only for 'tbc'
    const classicOnlyTbcCount = await db.get(`
        SELECT COUNT(DISTINCT n.npc_id) as count
        FROM npcs n
        WHERE n.game_version = 'classic'
          AND EXISTS (SELECT 1 FROM pickpocket_loot p2 WHERE p2.npc_id = n.npc_id AND p2.game_version = 'tbc')
          AND NOT EXISTS (SELECT 1 FROM pickpocket_loot p WHERE p.npc_id = n.npc_id AND p.game_version = 'classic')
    `);

    const tbcOnlyClassicCount = await db.get(`
        SELECT COUNT(DISTINCT n.npc_id) as count
        FROM npcs n
        WHERE n.game_version = 'tbc'
          AND EXISTS (SELECT 1 FROM pickpocket_loot p2 WHERE p2.npc_id = n.npc_id AND p2.game_version = 'classic')
          AND NOT EXISTS (SELECT 1 FROM pickpocket_loot p WHERE p.npc_id = n.npc_id AND p.game_version = 'tbc')
    `);

    const missingForVersion = await db.get(`
        SELECT COUNT(DISTINCT n.npc_id) as count
        FROM npcs n
        WHERE NOT EXISTS (SELECT 1 FROM pickpocket_loot p WHERE p.npc_id = n.npc_id AND p.game_version = n.game_version)
    `);

    console.log(`classic -> has only tbc rows: ${classicOnlyTbcCount.count}`);
    console.log(`tbc -> has only classic rows: ${tbcOnlyClassicCount.count}`);
    console.log(`total NPCs missing pickpocket for their version: ${missingForVersion.count}`);

    // Show a sample list (first 30) of affected NPCs (classic with only tbc)
    const sample = await db.all(`
        SELECT n.npc_id, n.name, n.zone
        FROM npcs n
        WHERE n.game_version = 'classic'
          AND EXISTS (SELECT 1 FROM pickpocket_loot p2 WHERE p2.npc_id = n.npc_id AND p2.game_version = 'tbc')
          AND NOT EXISTS (SELECT 1 FROM pickpocket_loot p WHERE p.npc_id = n.npc_id AND p.game_version = 'classic')
        LIMIT 30
    `);

    if (sample.length === 0) {
        console.log('\nNo sample mismatches found (classic -> tbc).');
    } else {
        console.log('\nSample NPCs (classic rows missing pickpocket, but have tbc pickpocket rows):');
        sample.forEach(s => {
            console.log(`  ${s.npc_id} - ${s.name} (${s.zone || 'Unknown zone'})`);
        });
    }
}

function printHelp() {
    console.log(`
Usage: node queryDb.js <command> [args]

Commands:
  stats                  Show database statistics
  unreliable [min]       Show drops with low sample size (default: 10)
  npc <name>             Show data for specific NPC
  item <id>              Show which NPCs drop this item
  top-drops [limit]      Show top drop rates (default: 20)
  sessions               Show scraping session history

Examples:
  node queryDb.js stats
  node queryDb.js unreliable 5
  node queryDb.js npc "Ragnaros"
  node queryDb.js item 18803
  node queryDb.js top-drops 50
`);
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
