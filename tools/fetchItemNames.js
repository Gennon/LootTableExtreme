/**
 * Fetch item names and drop data from Wowhead Classic API
 * Takes a list of item IDs and NPC ID to get drop rates
 */

async function fetchItemNames(itemIds, npcId = null) {
    const items = {};
    
    console.log(`\n🔍 Fetching item details for ${itemIds.length} items...`);
    
    for (const itemId of itemIds) {
        try {
            // Use Wowhead's tooltip API which returns JSON data
            const url = `https://nether.wowhead.com/classic/tooltip/item/${itemId}?dataEnv=1&locale=0`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data && data.name) {
                items[itemId] = {
                    name: data.name,
                    quality: data.quality || 1,
                    dropChance: 0,
                };
                
                // Try to extract drop rate from dropped by data if NPC ID is provided
                if (npcId && data.droppedBy) {
                    const npcDrop = data.droppedBy.find(drop => drop.id === npcId);
                    if (npcDrop && npcDrop.outof) {
                        // outof represents 1 in X drops, convert to percentage
                        items[itemId].dropChance = parseFloat((100 / npcDrop.outof).toFixed(2));
                    } else if (npcDrop && npcDrop.percent) {
                        items[itemId].dropChance = parseFloat(npcDrop.percent);
                    }
                }
                
                const dropInfo = items[itemId].dropChance > 0 ? ` (${items[itemId].dropChance}%)` : '';
                console.log(`  ✓ ${itemId}: ${data.name} [q${data.quality}]${dropInfo}`);
            } else {
                console.log(`  ✗ ${itemId}: No data returned`);
            }
            
            // Be respectful to the API - wait between requests
            await new Promise(resolve => setTimeout(resolve, 150));
        } catch (error) {
            console.log(`  ✗ ${itemId}: Error - ${error.message}`);
        }
    }
    
    console.log(`✓ Fetched ${Object.keys(items).length} item details`);
    return items;
}

module.exports = { fetchItemNames };
