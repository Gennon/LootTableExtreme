/**
 * Wowhead Classic NPC List Collector
 * Traverses the NPC table on Wowhead Classic and collects all vanilla NPC URLs
 * Filters out Season of Discovery NPCs
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
            'button:has-text("Accept")',
            'button:has-text("accept")',
            'button:has-text("I Accept")',
            'button:has-text("I agree")',
            'button:has-text("Agree")',
            'button:has-text("OK")',
            '[class*="cookie"] button',
            '[class*="consent"] button',
            '[id*="cookie"] button',
            '[id*="consent"] button',
            '.qc-cmp2-summary-buttons button:first-child', // Common cookie banner
            '#qc-cmp2-ui button[mode="primary"]'
        ];
        
        let cookieAccepted = false;
        for (const selector of cookieSelectors) {
            try {
                const cookieButton = await this.page.locator(selector).first();
                if (await cookieButton.isVisible({ timeout: 1000 })) {
                    await cookieButton.click();
                    console.log(`  ✓ Clicked cookie consent (${selector})`);
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
            // Close any other modals
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

    async collectNpcUrls(startUrl) {
        console.log(`\n============================================================`);
        console.log(`Collecting NPCs from: ${startUrl}`);
        console.log(`============================================================`);
        
        try {
            console.log('📡 Navigating to NPC list page...');
            await this.page.goto(startUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 90000 
            });
            
            await this.dismissModals();
            await this.takeScreenshot('01_npc_list_loaded');
            
            console.log('⏳ Waiting for table to load...');
            
            // Wait for the Listview to be visible
            await this.page.waitForSelector('.listview-mode-default', { timeout: 10000 }).catch(() => {
                console.log('  ⚠️  Default list view not found, trying alternative selectors...');
            });
            
            // Wait longer for JavaScript to execute
            await this.page.waitForTimeout(5000);
            
            console.log('📜 Extracting NPC data from Listview...');
            
            // Save page HTML for debugging
            if (this.debug) {
                const html = await this.page.content();
                const htmlFile = path.join(this.screenshotDir, `npc_page_${Date.now()}.html`);
                fs.writeFileSync(htmlFile, html, 'utf-8');
                console.log(`📄 Saved page HTML: ${htmlFile}`);
            }
            
            // First, let's check if there's a table visible
            const hasTable = await this.page.evaluate(() => {
                const listview = document.querySelector('.listview-mode-default');
                const table = document.querySelector('table.listview-mode-default');
                return {
                    hasListview: !!listview,
                    hasTable: !!table,
                    tableRows: table ? table.querySelectorAll('tr').length : 0
                };
            });
            
            console.log('Page structure:', hasTable);
            
            if (!hasTable.hasTable) {
                console.log('❌ No table found on page. The NPC list may use AJAX loading.');
                console.log('   Waiting for table to render...');
                await this.page.waitForSelector('table.listview-mode-default tr', { timeout: 15000 });
                await this.page.waitForTimeout(2000);
            }
            
            // Extract NPC data from the Listview JavaScript data
            const npcData = await this.page.evaluate(() => {
                const result = { npcs: [], error: null, debug: [] };
                
                // Try to access Listview instances directly from window
                if (window.listviews && window.listviews.length > 0) {
                    result.debug.push(`Found ${window.listviews.length} Listview instances`);
                    for (const lv of window.listviews) {
                        if (lv.template === 'npc') {
                            result.debug.push(`Found NPC Listview with ${lv.data.length} items`);
                            result.npcs = lv.data;
                            return result;
                        }
                    }
                }
                
                // Fallback: Try to find in script tags
                const scripts = Array.from(document.querySelectorAll('script'));
                let listviewData = null;
                
                result.debug.push(`Checking ${scripts.length} script tags...`);
                
                for (const script of scripts) {
                    const content = script.textContent;
                    
                    // Pattern: Look for Listview with npc template
                    if (content.includes('new Listview')) {
                        result.debug.push('Found Listview script');
                        result.debug.push(`Script length: ${content.length} chars`);
                        result.debug.push(`Contains "data:": ${content.includes('data:')}`);
                        result.debug.push(`Contains '"data":': ${content.includes('"data"')}`);
                        result.debug.push(`Contains "extraCols": ${content.includes('extraCols')}`);
                        
                        // Show the beginning of the Listview initialization
                        const listviewStart = content.indexOf('new Listview');
                        if (listviewStart > -1) {
                            result.debug.push(`First 300 chars of Listview: ${content.substring(listviewStart, listviewStart + 300)}`);
                        }
                        
                        // Extract the data array - it's JSON format with quotes: "data":[...]
                        // Pattern: "data":[...massive array...],"extraCols":
                        let dataMatch = content.match(/"data":\s*(\[[\s\S]*?\])\s*,\s*"extraCols"/);
                        if (!dataMatch) {
                            // Try without quotes on extraCols (just in case)
                            dataMatch = content.match(/"data":\s*(\[[\s\S]*?\])\s*,\s*extraCols/);
                        }
                        
                        if (dataMatch) {
                            try {
                                result.debug.push(`Found data array: ${dataMatch[1].length} chars`);
                                listviewData = eval('(' + dataMatch[1] + ')');
                                result.debug.push(`Extracted ${listviewData.length} NPCs`);
                                result.npcs = listviewData;
                                return result;
                            } catch (e) {
                                result.debug.push(`Parse error: ${e.message}`);
                                result.debug.push(`First 200 chars: ${dataMatch[1].substring(0, 200)}`);
                            }
                        } else {
                            result.debug.push('Could not match regex pattern');
                        }
                        break;  // Only check the first Listview script
                    }
                }
                
                result.error = 'Could not find Listview data';
                return result;
            });
            
            // Log debug info from browser context
            console.log('Browser debug info:');
            for (const msg of npcData.debug) {
                console.log('  -', msg);
            }
            
            if (npcData.error) {
                console.error('❌ Error:', npcData.error);
                return [];
            }
            
            // Filter and process the NPC data
            const filteredNpcs = npcData.npcs.filter(npc => {
                // Filter out Season of Discovery NPCs (seasonId: 2)
                if (npc.seasonId === 2) {
                    return false;
                }
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
            
            console.log(`✓ Found ${filteredNpcs.length} vanilla NPCs (SoD NPCs excluded)`);
            
            await this.takeScreenshot('02_after_extraction');
            
            return filteredNpcs;
            
        } catch (error) {
            console.error(`Error collecting NPCs:`, error.message);
            await this.takeScreenshot('error_npc_collection');
            return [];
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
    
    // Wowhead Classic NPC list URL
    const npcListUrl = 'https://www.wowhead.com/classic/npcs';
    
    const npcs = await collector.collectNpcUrls(npcListUrl);
    
    await collector.close();
    
    if (npcs.length > 0) {
        // Generate enemies.txt with URLs
        const outputFile = path.join(__dirname, 'enemies.txt');
        const urls = npcs.map(npc => 
            `https://www.wowhead.com/classic/npc=${npc.id}/${npc.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`
        );
        
        fs.writeFileSync(outputFile, urls.join('\n'), 'utf-8');
        
        // Also save detailed NPC data as JSON for reference
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
