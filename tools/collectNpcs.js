/**
 * Wowhead Classic NPC List Collector - Version 3 with TBC Support
 * Traverses the NPC table on Wowhead Classic/TBC and collects all NPC URLs
 * Filters out Season of Discovery NPCs
 * Supports pagination to collect all pages
 * Supports both Vanilla Classic and TBC Classic
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class NpcCollector {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.debug = options.debug || false;
        this.gameVersion = options.gameVersion || 'classic'; // 'classic' or 'tbc'
        this.screenshotDir = path.join(__dirname, 'screenshots');
        this.modalsDismissed = false; // Track if we've already dismissed modals
        
        // Version-specific constants
        this.maxLevel = this.gameVersion === 'tbc' ? 73 : 60;
        this.baseUrl = `https://www.wowhead.com/${this.gameVersion}`;
        
        if (this.debug && !fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir, { recursive: true });
        }
    }

    async initialize() {
        console.log('Initializing browser...');
        this.browser = await chromium.launch({ 
            headless: !this.debug,
            timeout: 60000
        });
        
        this.context = await this.browser.newContext({
            permissions: [],
        });
        
        this.page = await this.context.newPage();
        await this.page.setViewportSize({ width: 1920, height: 1080 });
        this.page.setDefaultTimeout(90000);
        this.page.setDefaultNavigationTimeout(90000);
        
        if (this.debug) {
            this.page.on('console', msg => {
                const text = msg.text();
                if (!text.includes('Attestation check') && 
                    !text.includes('Failed to load resource') &&
                    text.length < 200) {
                    console.log('[Browser]', text);
                }
            });
        }
        
        this.page.on('dialog', async dialog => {
            console.log('Dialog detected:', dialog.message());
            await dialog.dismiss();
        });
    }

    async takeScreenshot(name) {
        if (this.debug) {
            const filename = `${name}_${Date.now()}.png`;
            const filepath = path.join(this.screenshotDir, filename);
            await this.page.screenshot({ path: filepath, fullPage: true });
            console.log(`📸 Screenshot saved: ${filename}`);
        }
    }

    async dismissModals() {
        // Only dismiss modals once per session
        if (this.modalsDismissed) {
            return;
        }
        
        console.log('🚫 Checking for modals/popups...');
        
        // Try multiple cookie consent selectors
        const cookieSelectors = [
            'button:has-text("I Accept")',
        ];
        
        let cookieAccepted = false;
        for (const selector of cookieSelectors) {
            try {
                const cookieButton = await this.page.locator(selector).first();
                if (await cookieButton.isVisible({ timeout: 2000 })) {
                    await cookieButton.click();
                    console.log(`  ✓ Clicked cookie consent: ${selector}`);
                    await this.page.waitForTimeout(500);
                    cookieAccepted = true;
                    break;
                }
            } catch (e) {
                // Try next selector
            }
        }
        
        if (!cookieAccepted) {
            console.log('  ℹ️  No cookie banner found (or already accepted)');
        }
        
        try {
            const closeButtons = await this.page.locator('[class*="close"], [class*="dismiss"], .modal-close').all();
            for (const button of closeButtons) {
                if (await button.isVisible()) {
                    await button.click();
                    await this.page.waitForTimeout(300);
                }
            }
        } catch (e) {
            // No modals
        }
        
        console.log('  ✓ Modal dismissal complete');
        this.modalsDismissed = true; // Mark as dismissed
    }

    async extractNpcsFromCurrentPage() {
        const npcData = await this.page.evaluate(() => {
            const result = { npcs: [], error: null, debug: [] };
            
            // Try the modern g_listviews global first
            if (window.g_listviews && window.g_listviews.npcs && window.g_listviews.npcs.data) {
                result.npcs = window.g_listviews.npcs.data;
                result.debug.push(`Found g_listviews.npcs.data with ${result.npcs.length} NPCs`);
                return result;
            }
            
            result.debug.push('g_listviews.npcs.data not found');
            
            // Fallback to older window.listviews format
            if (window.listviews && window.listviews.length > 0) {
                for (const lv of window.listviews) {
                    if (lv.template === 'npc') {
                        result.npcs = lv.data;
                        result.debug.push(`Found window.listviews with ${result.npcs.length} NPCs`);
                        return result;
                    }
                }
                result.debug.push('window.listviews exists but no npc template found');
            } else {
                result.debug.push('window.listviews not found');
            }
            
            // Final fallback: parse from script tags
            const scripts = Array.from(document.querySelectorAll('script'));
            result.debug.push(`Found ${scripts.length} script tags`);
            
            for (const script of scripts) {
                const content = script.textContent;
                
                if (content.includes('new Listview')) {
                    result.debug.push('Found script with "new Listview"');
                    let dataMatch = content.match(/"data":\s*(\[[\s\S]*?\])\s*,\s*"extraCols"/);
                    if (!dataMatch) {
                        dataMatch = content.match(/"data":\s*(\[[\s\S]*?\])\s*,\s*extraCols/);
                    }
                    
                    if (dataMatch) {
                        try {
                            result.npcs = eval('(' + dataMatch[1] + ')');
                            result.debug.push(`Parsed ${result.npcs.length} NPCs from script tag`);
                            return result;
                        } catch (e) {
                            result.debug.push(`Parse error: ${e.message}`);
                        }
                    }
                    break;
                }
            }
            
            result.error = 'Could not find Listview data';
            return result;
        });
        
        // Log debug info if there's an error
        if (npcData.error && npcData.debug.length > 0) {
            console.log('  Debug info:', npcData.debug.join(' | '));
        }
        
        return npcData;
    }    
    
    async collectNpcsForFilter(minLevel, maxLevel, classification, classificationName) {
        const filterLabel = `${classificationName} Level ${minLevel}${maxLevel ? `-${maxLevel}` : '+'}`;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Collecting: ${filterLabel} (${this.gameVersion.toUpperCase()})`);
        console.log(`${'='.repeat(60)}`);

        // Build the version-specific Wowhead URL for this filter
        let url = `${this.baseUrl}/npcs/min-level:${minLevel}`;
        if (maxLevel) url += `/max-level:${maxLevel}`;
        url += `/classification:${classification}`;

        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(async (error) => {
            console.error(`  ❌ Navigation failed: ${error.message}`);
            return null;
        });
        
        if (!this.page) {
            console.error('  ❌ Page is closed, skipping...');
            return [];
        }
        
        await this.dismissModals();
        
        // Wait for the listview data to be available
        console.log('  ⏳ Waiting for listview data...');
        await this.page.waitForFunction(() => {
            return window.g_listviews && 
                   window.g_listviews.npcs && 
                   window.g_listviews.npcs.data && 
                   window.g_listviews.npcs.data.length > 0;
        }, { timeout: 45000 }).catch(() => {
            console.log('  ⚠️  Timeout waiting for g_listviews, trying alternative methods...');
        });
        
        // Short delay to ensure JavaScript has fully executed
        await this.page.waitForTimeout(1000);
     
        const npcData = await this.extractNpcsFromCurrentPage();

        if (npcData.error) {
            console.error('❌ Error:', npcData.error);
            if (this.debug) {
                await this.takeScreenshot(`error_${classificationName}_${minLevel}`);
            }
            // Return empty array instead of breaking - might be no NPCs at this level/classification
            console.log('  ℹ️  This might be expected if there are no NPCs matching this filter');
            return [];
        }

        if (!npcData.npcs || npcData.npcs.length === 0) {
            console.log('  ℹ️  No NPCs found for this filter (might be expected)');
            return [];
        }

        const allNpcs = npcData.npcs.filter(npc => {
            // Filter out Season of Discovery NPCs
            return npc.seasonId !== 2;
        }).map(npc => ({
            id: npc.id,
            name: npc.name,
            minLevel: npc.minlevel,
            maxLevel: npc.maxlevel,
            classification: npc.classification,
            type: npc.type,
            family: npc.family,
            location: npc.location ? npc.location[0] : null,
            seasonId: npc.seasonId || 0,
            phaseId: npc.phaseId || 0
        }));

        console.log(`  ✓ Extracted ${allNpcs.length} NPCs from ${filterLabel}`);
        console.log(`\n✓ ${filterLabel} complete! Collected: ${allNpcs.length} NPCs`);
        return allNpcs;
    }

    async collectNpcUrls(startUrl) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`COMPLETE NPC COLLECTION STRATEGY - ${this.gameVersion.toUpperCase()}`);
        console.log(`Target: All ${this.gameVersion === 'tbc' ? 'TBC' : 'Classic Era'} NPCs (Levels 1-${this.maxLevel})`);
        console.log(`${'='.repeat(70)}`);
        
        const allNpcs = [];
        const allNpcIds = new Set();
        
        try {
            // Classification codes:
            // 0 = Normal
            // 1 = Elite
            // 2 = Rare Elite
            // 3 = Boss
            // 4 = Rare
            
            // PHASE 1: Normal NPCs - Level by level
            console.log(`\n${'#'.repeat(70)}`);
            console.log(`PHASE 1: NORMAL NPCs (Classification 0)`);
            console.log(`${'#'.repeat(70)}`);
            
            for (let level = 1; level <= this.maxLevel; level++) {
                const npcs = await this.collectNpcsForFilter(level, level, 0, 'Normal');
                for (const npc of npcs) {
                    if (!allNpcIds.has(npc.id)) {
                        allNpcIds.add(npc.id);
                        allNpcs.push(npc);
                    }
                }
                console.log(`📊 Running total: ${allNpcs.length} unique NPCs\n`);
            }
            
            // Normal NPCs level max+ (skull level)
            const npcsMaxPlus = await this.collectNpcsForFilter(this.maxLevel, null, 0, 'Normal');
            for (const npc of npcsMaxPlus) {
                if (!allNpcIds.has(npc.id)) {
                    allNpcIds.add(npc.id);
                    allNpcs.push(npc);
                }
            }
            console.log(`📊 Running total after Normal ${this.maxLevel}+: ${allNpcs.length} unique NPCs\n`);
            
            // PHASE 2: Elite NPCs
            console.log(`\n${'#'.repeat(70)}`);
            console.log(`PHASE 2: ELITE NPCs (Classification 1)`);
            console.log(`${'#'.repeat(70)}`);
            
            for (let level = 1; level <= this.maxLevel; level++) {
                const npcs = await this.collectNpcsForFilter(level, level, 1, 'Elite');
                for (const npc of npcs) {
                    if (!allNpcIds.has(npc.id)) {
                        allNpcIds.add(npc.id);
                        allNpcs.push(npc);
                    }
                }
                console.log(`📊 Running total: ${allNpcs.length} unique NPCs\n`);
            }
            
            // Elite NPCs level max+ (skull level)
            const eliteNpcsMaxPlus = await this.collectNpcsForFilter(this.maxLevel, null, 1, 'Elite');
            for (const npc of eliteNpcsMaxPlus) {
                if (!allNpcIds.has(npc.id)) {
                    allNpcIds.add(npc.id);
                    allNpcs.push(npc);
                }
            }
            console.log(`📊 Running total after Elite ${this.maxLevel}+: ${allNpcs.length} unique NPCs\n`);
            
            // PHASE 3: Rare NPCs (no level filter needed)
            console.log(`\n${'#'.repeat(70)}`);
            console.log(`PHASE 3: RARE NPCs (Classification 4)`);
            console.log(`${'#'.repeat(70)}`);
            
            const rareNpcs = await this.collectNpcsForFilter(1, null, 4, 'Rare');
            for (const npc of rareNpcs) {
                if (!allNpcIds.has(npc.id)) {
                    allNpcIds.add(npc.id);
                    allNpcs.push(npc);
                }
            }
            console.log(`📊 Running total after Rare: ${allNpcs.length} unique NPCs\n`);
            
            // PHASE 4: Rare Elite NPCs (no level filter needed)
            console.log(`\n${'#'.repeat(70)}`);
            console.log(`PHASE 4: RARE ELITE NPCs (Classification 2)`);
            console.log(`${'#'.repeat(70)}`);
            
            const rareEliteNpcs = await this.collectNpcsForFilter(1, null, 2, 'Rare Elite');
            for (const npc of rareEliteNpcs) {
                if (!allNpcIds.has(npc.id)) {
                    allNpcIds.add(npc.id);
                    allNpcs.push(npc);
                }
            }
            console.log(`📊 Running total after Rare Elite: ${allNpcs.length} unique NPCs\n`);
            
            // PHASE 5: Boss NPCs (no level filter needed)
            console.log(`\n${'#'.repeat(70)}`);
            console.log(`PHASE 5: BOSS NPCs (Classification 3)`);
            console.log(`${'#'.repeat(70)}`);
            
            const bossNpcs = await this.collectNpcsForFilter(1, null, 3, 'Boss');
            for (const npc of bossNpcs) {
                if (!allNpcIds.has(npc.id)) {
                    allNpcIds.add(npc.id);
                    allNpcs.push(npc);
                }
            }
            console.log(`📊 Final total after Boss: ${allNpcs.length} unique NPCs\n`);
            
            console.log(`\n${'='.repeat(70)}`);
            console.log(`✓ COLLECTION COMPLETE! (${this.gameVersion.toUpperCase()})`);
            console.log(`Total unique NPCs collected: ${allNpcs.length}`);
            console.log(`${'='.repeat(70)}`);
            
            return allNpcs;
            
        } catch (error) {
            console.error(`Error collecting NPCs:`, error.message);
            await this.takeScreenshot(`error_npc_collection_${this.gameVersion}`);
            return allNpcs;
        }
    }

    async close() {
        if (this.page && !this.page.isClosed()) {
            await this.page.close().catch(() => {});
        }
        if (this.context) {
            await this.context.close().catch(() => {});
        }
        if (this.browser) {
            await this.browser.close().catch(() => {});
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    const debugMode = args.includes('--debug') || args.includes('-d');
    const gameVersion = args.includes('--tbc') ? 'tbc' : 'classic';
    
    console.log(`Game version: ${gameVersion.toUpperCase()}`);
    console.log(`Debug mode: ${debugMode ? 'ON' : 'OFF'}`);
    
    const collector = new NpcCollector({ debug: debugMode, gameVersion });
    await collector.initialize();
    
    const npcListUrl = `https://www.wowhead.com/${gameVersion}/npcs`;
    
    const npcs = await collector.collectNpcUrls(npcListUrl);
    
    await collector.close();
    
    if (npcs.length > 0) {
        const outputFile = path.join(__dirname, `npcs_${gameVersion}.txt`);
        const urls = npcs.map(npc => 
            `https://www.wowhead.com/${gameVersion}/npc=${npc.id}/${npc.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`
        );
        
        fs.writeFileSync(outputFile, urls.join('\n'), 'utf-8');
        
        const jsonFile = path.join(__dirname, `npc_data_${gameVersion}.json`);
        fs.writeFileSync(jsonFile, JSON.stringify(npcs, null, 2), 'utf-8');
        
        console.log(`\n========================================`);
        console.log(`✓ Success!`);
        console.log(`========================================`);
        console.log(`Collected ${npcs.length} NPC URLs`);
        console.log(`URLs saved to: ${outputFile}`);
        console.log(`Detailed data saved to: ${jsonFile}`);
        console.log(`\nYou can now run: npm run scrape-list -- --version ${gameVersion}`);
    } else {
        console.log('\n✗ No NPCs were collected.');
    }
}

main().catch(console.error);
