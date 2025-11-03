/**
 * Wowhead Classic NPC List Collector - Version 2 with Pagination
 * Traverses the NPC table on Wowhead Classic and collects all vanilla NPC URLs
 * Filters out Season of Discovery NPCs
 * Supports pagination to collect all pages
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class NpcCollector {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.debug = options.debug || false;
        this.screenshotDir = path.join(__dirname, 'screenshots');
        
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
        console.log('🚫 Checking for modals/popups...');
        
        // Try multiple cookie consent selectors
        const cookieSelectors = [
            'button:has-text("I Accept")',
        ];
        
        let cookieAccepted = false;
        for (const selector of cookieSelectors) {
            try {
                const cookieButton = await this.page.locator(selector).first();
                if (await cookieButton.isVisible({ timeout: 1000 })) {
                    await cookieButton.click();
                    console.log(`  ✓ Clicked cookie consent: ${selector}`);
                    await this.page.waitForTimeout(1000);
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
    }

    async extractNpcsFromCurrentPage() {
        const npcData = await this.page.evaluate(() => {
            const result = { npcs: [], error: null, debug: [] };
            
            if (window.listviews && window.listviews.length > 0) {
                for (const lv of window.listviews) {
                    if (lv.template === 'npc') {
                        result.npcs = lv.data;
                        return result;
                    }
                }
            }
            
            const scripts = Array.from(document.querySelectorAll('script'));
            
            for (const script of scripts) {
                const content = script.textContent;
                
                if (content.includes('new Listview')) {
                    let dataMatch = content.match(/"data":\s*(\[[\s\S]*?\])\s*,\s*"extraCols"/);
                    if (!dataMatch) {
                        dataMatch = content.match(/"data":\s*(\[[\s\S]*?\])\s*,\s*extraCols/);
                    }
                    
                    if (dataMatch) {
                        try {
                            result.npcs = eval('(' + dataMatch[1] + ')');
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
        
        return npcData;
    }

    async getPaginationInfo() {
        const paginationInfo = await this.page.evaluate(() => {
            const navElement = document.querySelector('.listview-nav');
            if (!navElement) {
                return { hasMore: false, currentPage: 1, totalPages: 1 };
            }
            
            const navText = navElement.textContent;
            const match = navText.match(/(\d+)\s*-\s*(\d+)\s*of\s*(\d+)/);
            if (match) {
                const start = parseInt(match[1]);
                const end = parseInt(match[2]);
                const total = parseInt(match[3]);
                const pageSize = end - start + 1;
                const currentPage = Math.ceil(end / pageSize);
                const totalPages = Math.ceil(total / pageSize);
                
                return {
                    hasMore: end < total,
                    currentPage,
                    totalPages,
                    start,
                    end,
                    total,
                    navText
                };
            }
            
            return { hasMore: false, currentPage: 1, totalPages: 1 };
        });
        
        return paginationInfo;
    }

    async clickNext() {
        try {
            const nextLink = await this.page.locator('.listview-nav a:has-text("Next")');
            if (await nextLink.isVisible({ timeout: 2000 })) {
                await nextLink.click();
                console.log('  ✓ Clicked "Next" button');
                await this.page.waitForTimeout(3000);
                return true;
            }
        } catch (error) {
            console.log('  ⚠️  No "Next" button found');
        }
        return false;
    }


    async collectNpcsForFilter(minLevel, maxLevel, classification, classificationName) {
        const filterLabel = `${classificationName} Level ${minLevel}${maxLevel ? `-${maxLevel}` : '+'}`;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Collecting: ${filterLabel}`);
        console.log(`${'='.repeat(60)}`);

        // Build the direct Wowhead URL for this filter
        let url = `https://www.wowhead.com/classic/npcs/min-level:${minLevel}`;
        if (maxLevel) url += `/max-level:${maxLevel}`;
        url += `/classification:${classification}`;

        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.dismissModals();
        await this.page.waitForTimeout(2000);

        const allNpcs = [];
        const allNpcIds = new Set();
        let hasMore = true;
        let pageNum = 1;

        while (hasMore) {
            console.log(`\n📄 Processing page ${pageNum}...`);

            await this.page.waitForSelector('.listview-mode-default', { timeout: 10000 }).catch(() => {
                console.log('  ⚠️  Default list view not found');
            });

            await this.page.waitForTimeout(3000);

            const npcData = await this.extractNpcsFromCurrentPage();

            if (npcData.error) {
                console.error('❌ Error:', npcData.error);
                break;
            }

            const pageNpcs = npcData.npcs.filter(npc => {
                if (npc.seasonId === 2) return false;
                if (allNpcIds.has(npc.id)) return false;
                allNpcIds.add(npc.id);
                return true;
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

            console.log(`  ✓ Extracted ${pageNpcs.length} new vanilla NPCs from this page`);
            allNpcs.push(...pageNpcs);
            console.log(`  📊 Total for ${filterLabel}: ${allNpcs.length} NPCs`);

            const pagination = await this.getPaginationInfo();
            console.log(`  📄 Pagination: ${pagination.navText || 'N/A'}`);

            if (pagination.hasMore) {
                console.log(`  ➡️  Moving to page ${pageNum + 1}/${pagination.totalPages}...`);
                hasMore = await this.clickNext();
                pageNum++;
            } else {
                console.log(`  ✓ Reached last page for ${filterLabel}`);
                hasMore = false;
            }
        }

        console.log(`\n✓ ${filterLabel} complete! Collected: ${allNpcs.length} NPCs`);
        return allNpcs;
    }

    async collectNpcUrls(startUrl) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`COMPLETE NPC COLLECTION STRATEGY`);
        console.log(`Target: All 12,214 Classic Era NPCs`);
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
            
            // PHASE 1: Normal NPCs - Level by level (1-1, 2-2, ..., 60-60, 60+)
            console.log(`\n${'#'.repeat(70)}`);
            console.log(`PHASE 1: NORMAL NPCs (Classification 0)`);
            console.log(`${'#'.repeat(70)}`);
            
            for (let level = 1; level <= 60; level++) {
                const npcs = await this.collectNpcsForFilter(level, level, 0, 'Normal');
                for (const npc of npcs) {
                    if (!allNpcIds.has(npc.id)) {
                        allNpcIds.add(npc.id);
                        allNpcs.push(npc);
                    }
                }
                console.log(`📊 Running total: ${allNpcs.length} unique NPCs\n`);
            }
            
            // Normal NPCs level 60+ (no max level)
            const npcs60Plus = await this.collectNpcsForFilter(60, null, 0, 'Normal');
            for (const npc of npcs60Plus) {
                if (!allNpcIds.has(npc.id)) {
                    allNpcIds.add(npc.id);
                    allNpcs.push(npc);
                }
            }
            console.log(`📊 Running total after Normal 60+: ${allNpcs.length} unique NPCs\n`);
            
            // PHASE 2: Elite NPCs - Level by level (1-1, 2-2, ..., 60-60, 60+)
            console.log(`\n${'#'.repeat(70)}`);
            console.log(`PHASE 2: ELITE NPCs (Classification 1)`);
            console.log(`${'#'.repeat(70)}`);
            
            for (let level = 1; level <= 60; level++) {
                const npcs = await this.collectNpcsForFilter(level, level, 1, 'Elite');
                for (const npc of npcs) {
                    if (!allNpcIds.has(npc.id)) {
                        allNpcIds.add(npc.id);
                        allNpcs.push(npc);
                    }
                }
                console.log(`📊 Running total: ${allNpcs.length} unique NPCs\n`);
            }
            
            // Elite NPCs level 60+ (no max level)
            const eliteNpcs60Plus = await this.collectNpcsForFilter(60, null, 1, 'Elite');
            for (const npc of eliteNpcs60Plus) {
                if (!allNpcIds.has(npc.id)) {
                    allNpcIds.add(npc.id);
                    allNpcs.push(npc);
                }
            }
            console.log(`📊 Running total after Elite 60+: ${allNpcs.length} unique NPCs\n`);
            
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
            console.log(`✓ COLLECTION COMPLETE!`);
            console.log(`Total unique NPCs collected: ${allNpcs.length}`);
            console.log(`Target was: 12,214 NPCs`);
            console.log(`${'='.repeat(70)}`);
            
            return allNpcs;
            
        } catch (error) {
            console.error(`Error collecting NPCs:`, error.message);
            await this.takeScreenshot('error_npc_collection');
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
    
    console.log(`Debug mode: ${debugMode ? 'ON' : 'OFF'}`);
    
    const collector = new NpcCollector({ debug: debugMode });
    await collector.initialize();
    
    const npcListUrl = 'https://www.wowhead.com/classic/npcs';
    
    const npcs = await collector.collectNpcUrls(npcListUrl);
    
    await collector.close();
    
    if (npcs.length > 0) {
    const outputFile = path.join(__dirname, 'npcs.txt');
        const urls = npcs.map(npc => 
            `https://www.wowhead.com/classic/npc=${npc.id}/${npc.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`
        );
        
        fs.writeFileSync(outputFile, urls.join('\n'), 'utf-8');
        
        const jsonFile = path.join(__dirname, 'npc_data.json');
        fs.writeFileSync(jsonFile, JSON.stringify(npcs, null, 2), 'utf-8');
        
        console.log(`\n========================================`);
        console.log(`✓ Success!`);
        console.log(`========================================`);
        console.log(`Collected ${npcs.length} NPC URLs`);
        console.log(`URLs saved to: ${outputFile}`);
        console.log(`Detailed data saved to: ${jsonFile}`);
        console.log(`\nYou can now run: npm run scrape-list`);
    } else {
        console.log('\n✗ No NPCs were collected.');
    }
}

main().catch(console.error);
