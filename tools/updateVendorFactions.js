/**
 * Update vendor faction/reaction data from Wowhead
 * Fetches g_npcs[npc_id].react data to determine Alliance/Horde accessibility
 */

const { chromium } = require('playwright');
const { ScraperDatabase } = require('./database');

class VendorFactionUpdater {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.debug = options.debug || false;
        this.database = options.database || null;
        this.gameVersion = options.gameVersion || 'classic';
    }

    async initialize() {
        console.log('Initializing browser...');
        this.browser = await chromium.launch({ 
            headless: !this.debug,
            timeout: 60000
        });
        
        this.context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            locale: 'en-US',
            timezoneId: 'America/New_York',
        });
        
        this.page = await this.context.newPage();
        this.page.setDefaultTimeout(30000);
        this.page.setDefaultNavigationTimeout(30000);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    /**
     * Fetch faction/reaction data for a vendor
     */
    async fetchVendorFaction(npcId, npcName) {
        const urlPrefix = this.gameVersion === 'tbc' ? 'https://www.wowhead.com/tbc' : 'https://www.wowhead.com/classic';
        const url = `${urlPrefix}/npc=${npcId}`;

        try {
            console.log(`  Fetching: ${npcName} (${npcId})...`);
            
            await this.page.goto(url, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });

            // Wait a moment for JavaScript to execute
            await this.page.waitForTimeout(1000);

            // Extract reaction data from g_npcs
            const reactionData = await this.page.evaluate((id) => {
                try {
                    const result = {
                        react: null,
                        faction: null,
                        factionId: null,
                        hasData: false
                    };
                    
                    // Get reaction from g_npcs
                    if (typeof window.g_npcs !== 'undefined' && window.g_npcs && window.g_npcs[id]) {
                        const npc = window.g_npcs[id];
                        result.react = npc.react || null;
                        result.hasData = !!result.react;
                    }
                    
                    // Get faction from infobox HTML
                    const infobox = document.querySelector('.infobox');
                    if (infobox) {
                        // Look for the Faction link in the DOM
                        const factionLinks = infobox.querySelectorAll('a[href*="/faction="]');
                        for (const link of factionLinks) {
                            const href = link.getAttribute('href');
                            const factionMatch = href.match(/faction=(\d+)/);
                            if (factionMatch) {
                                result.factionId = parseInt(factionMatch[1]);
                                result.faction = link.textContent.trim();
                                break;
                            }
                        }
                    }
                    
                    return result;
                } catch (e) {
                    return { error: e.message };
                }
            }, npcId);

            if (reactionData.error) {
                console.log(`    ⚠️  Error: ${reactionData.error}`);
                return null;
            }

            if (!reactionData.hasData) {
                console.log(`    ⚠️  No g_npcs data found`);
                return null;
            }

            // react is an array [alliance, horde]
            // 1 = friendly, -1 = hostile, null/undefined = cannot access
            const react = reactionData.react || [null, null];
            const allianceReaction = react[0];
            const hordeReaction = react[1];

            // Use the faction name from the page (e.g., "Stormwind", "Undercity", "Booty Bay")
            // If not found, fall back to simple Alliance/Horde/Neutral
            let faction = reactionData.faction || 'Neutral';
            
            // If we didn't get a specific faction, use generic Alliance/Horde/Neutral
            if (!reactionData.faction) {
                if (allianceReaction === 1 && (hordeReaction === -1 || hordeReaction === null)) {
                    faction = 'Alliance';
                } else if (hordeReaction === 1 && (allianceReaction === -1 || allianceReaction === null)) {
                    faction = 'Horde';
                } else if (allianceReaction === 1 && hordeReaction === 1) {
                    faction = 'Neutral';
                }
            }

            console.log(`    ✓ Faction: ${faction} (A:${allianceReaction}, H:${hordeReaction})${reactionData.factionId ? ` [ID: ${reactionData.factionId}]` : ''}`);

            return {
                faction: faction,
                factionId: reactionData.factionId,
                reactionAlliance: allianceReaction !== null ? allianceReaction.toString() : null,
                reactionHorde: hordeReaction !== null ? hordeReaction.toString() : null
            };

        } catch (error) {
            console.log(`    ✗ Error: ${error.message}`);
            return null;
        }
    }

    /**
     * Update all vendors with faction data
     */
    async updateAllVendors() {
        console.log(`\n🛒 Fetching faction data for vendors (${this.gameVersion})...\n`);

        // Get all unique vendors from database
        const vendors = await this.database.all(`
            SELECT DISTINCT n.npc_id, n.name
            FROM npcs n
            INNER JOIN vendor_items v ON n.npc_id = v.npc_id AND n.game_version = v.game_version
            WHERE n.game_version = ?
            ORDER BY n.npc_id
        `, [this.gameVersion]);

        console.log(`Found ${vendors.length} vendors to update\n`);

        let updated = 0;
        let failed = 0;
        let skipped = 0;

        for (let i = 0; i < vendors.length; i++) {
            const vendor = vendors[i];
            console.log(`[${i + 1}/${vendors.length}] ${vendor.name}`);

            const factionData = await this.fetchVendorFaction(vendor.npc_id, vendor.name);

            if (factionData) {
                // Update database
                await this.database.run(`
                    UPDATE npcs
                    SET faction = ?,
                        faction_id = ?,
                        reaction_alliance = ?,
                        reaction_horde = ?
                    WHERE npc_id = ? AND game_version = ?
                `, [
                    factionData.faction,
                    factionData.factionId,
                    factionData.reactionAlliance,
                    factionData.reactionHorde,
                    vendor.npc_id,
                    this.gameVersion
                ]);
                updated++;
            } else {
                failed++;
            }

            // Add a small delay to avoid overwhelming Wowhead
            if (i < vendors.length - 1) {
                await this.page.waitForTimeout(500);
            }
        }

        console.log(`\n✅ Update complete!`);
        console.log(`  Updated: ${updated}`);
        console.log(`  Failed: ${failed}`);
        console.log(`  Skipped: ${skipped}`);
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    const options = {
        debug: false,
        gameVersion: 'classic'
    };

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--debug':
                options.debug = true;
                break;
            case '--version':
            case '-v':
                const version = args[++i];
                if (['classic', 'tbc'].includes(version)) {
                    options.gameVersion = version;
                } else {
                    console.error(`Invalid version: ${version}. Use 'classic' or 'tbc'`);
                    process.exit(1);
                }
                break;
            case '--help':
            case '-h':
                console.log(`
Update vendor faction/reaction data from Wowhead

Usage: node updateVendorFactions.js [options]

Options:
  --version, -v <version>    Game version: 'classic' or 'tbc' (default: classic)
  --debug                    Show browser window and debug output
  --help, -h                 Show this help message
`);
                process.exit(0);
        }
    }

    const db = new ScraperDatabase();
    await db.initialize();

    const updater = new VendorFactionUpdater({
        database: db,
        debug: options.debug,
        gameVersion: options.gameVersion
    });

    try {
        await updater.initialize();
        await updater.updateAllVendors();
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await updater.close();
        await db.close();
    }
}

main().catch(console.error);
