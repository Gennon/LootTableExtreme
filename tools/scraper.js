/**
 * Wowhead Classic Loot Table Scraper
 * Extracts enemy loot data from Wowhead Classic and generates Lua database format
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { fetchItemNames } = require('./fetchItemNames');

// Quality mapping from Wowhead to our database
const QUALITY_MAP = {
    'q0': 'DB.Quality.POOR',
    'q1': 'DB.Quality.COMMON',
    'q2': 'DB.Quality.UNCOMMON',
    'q3': 'DB.Quality.RARE',
    'q4': 'DB.Quality.EPIC',
    'q5': 'DB.Quality.LEGENDARY',
};

class WowheadScraper {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.debug = options.debug || false;
        this.screenshotDir = path.join(__dirname, 'screenshots');
        
        // Create screenshots directory if in debug mode
        if (this.debug && !fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir, { recursive: true });
        }
    }

    async initialize() {
        console.log('Initializing browser...');
        this.browser = await chromium.launch({ 
            headless: !this.debug, // Show browser in debug mode
            timeout: 60000
        });
        
        this.context = await this.browser.newContext({
            // Block notifications
            permissions: [],
        });
        
        this.page = await this.context.newPage();
        
        // Set a reasonable viewport
        await this.page.setViewportSize({ width: 1920, height: 1080 });
        
        // Increase default timeout
        this.page.setDefaultTimeout(90000);
        this.page.setDefaultNavigationTimeout(90000);
        
        // Log console messages in debug mode (but filter out noise)
        if (this.debug) {
            this.page.on('console', msg => {
                const text = msg.text();
                // Filter out spammy ad-related errors
                if (!text.includes('Attestation check') && 
                    !text.includes('Failed to load resource') &&
                    !text.includes('console.groupEnd') &&
                    text.length < 200) {
                    console.log('[Browser Console]', msg.type(), text);
                }
            });
        }
        
        // Handle dialogs (alerts, confirms, etc.)
        this.page.on('dialog', async dialog => {
            console.log(`⚠️  Dialog detected: ${dialog.message()}`);
            await dialog.dismiss();
        });
    }
    
    async dismissModals() {
        console.log('🚫 Checking for modals/popups to dismiss...');
        
        try {
            // Wait a moment for any modals to appear
            await this.page.waitForTimeout(2000);
            
            // Common cookie consent selectors
            const cookieSelectors = [
                'button:has-text("Accept")',
                'button:has-text("Accept All")',
                'button:has-text("I Accept")',
                'button:has-text("Agree")',
                'button:has-text("I Agree")',
                'button:has-text("OK")',
                '.cookie-accept',
                '.accept-cookies',
                '#onetrust-accept-btn-handler',
                '.qc-cmp2-summary-buttons button:first-child',
                '[data-testid="cookie-accept"]',
            ];
            
            for (const selector of cookieSelectors) {
                try {
                    const button = await this.page.$(selector);
                    if (button) {
                        await button.click();
                        console.log(`  ✓ Clicked cookie consent: ${selector}`);
                        await this.page.waitForTimeout(1000);
                        break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
            
            // Handle notification permission requests
            await this.page.evaluate(() => {
                // Override notification permission
                if (window.Notification) {
                    window.Notification.requestPermission = () => Promise.resolve('denied');
                }
            });
            
            // Close any modal overlays
            const modalCloseSelectors = [
                '.modal-close',
                '.close-modal',
                'button[aria-label="Close"]',
                'button.close',
                '.overlay-close',
                '[data-dismiss="modal"]',
            ];
            
            for (const selector of modalCloseSelectors) {
                try {
                    const buttons = await this.page.$$(selector);
                    for (const button of buttons) {
                        const isVisible = await button.isVisible();
                        if (isVisible) {
                            await button.click();
                            console.log(`  ✓ Closed modal: ${selector}`);
                            await this.page.waitForTimeout(500);
                        }
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
            
            // Press Escape key to close any remaining modals
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(500);
            
            console.log('  ✓ Modal dismissal complete');
            
        } catch (error) {
            console.log('  ⚠️  Modal dismissal had some issues (continuing anyway)');
        }
    }
    
    async takeScreenshot(name) {
        if (!this.debug) return;
        
        const timestamp = Date.now();
        const filename = `${name}_${timestamp}.png`;
        const filepath = path.join(this.screenshotDir, filename);
        
        await this.page.screenshot({ 
            path: filepath,
            fullPage: true 
        });
        
        console.log(`📸 Screenshot saved: ${filepath}`);
    }
    
    async debugDumpHTML(name) {
        if (!this.debug) return;
        
        const timestamp = Date.now();
        const filename = `${name}_${timestamp}.html`;
        const filepath = path.join(this.screenshotDir, filename);
        
        const html = await this.page.content();
        fs.writeFileSync(filepath, html, 'utf-8');
        
        console.log(`📄 HTML saved: ${filepath}`);
    }

    async scrapeEnemyData(url) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Scraping: ${url}`);
        console.log(`${'='.repeat(60)}`);
        
        try {
            // Navigate to the page
            console.log('📡 Navigating to page...');
            await this.page.goto(url, { 
                waitUntil: 'domcontentloaded', // Changed from 'networkidle' which can timeout with ads
                timeout: 90000 
            });
            
            // Wait for page to load
            await this.page.waitForLoadState('load', { timeout: 30000 }).catch(() => {
                console.log('⚠️  Page load state timeout, continuing anyway...');
            });

            // Dismiss any modals/popups
            await this.dismissModals();
            
            // Wait for the page to load completely
            console.log('⏳ Waiting for page to stabilize...');
            await this.page.waitForTimeout(500);
            
            // Take initial screenshot
            await this.takeScreenshot('01_page_loaded');

            // Extract enemy name from the page title or h1
            const enemyName = await this.page.evaluate(() => {
                const h1 = document.querySelector('h1.heading-size-1');
                return h1 ? h1.textContent.trim() : null;
            });

            console.log(`✓ Enemy Name: ${enemyName}`);

            // Extract NPC ID from URL
            const npcIdMatch = url.match(/npc=(\d+)/);
            const npcId = npcIdMatch ? parseInt(npcIdMatch[1]) : null;

            // Extract level information
            const levelInfo = await this.page.evaluate(() => {
                // Look for level in multiple places
                // Strategy 1: Check the quick facts infobox
                const infobox = document.querySelector('.infobox');
                if (infobox) {
                    const text = infobox.textContent;
                    // Look for "Level: X - Y" or "Level: X"
                    const match = text.match(/Level[:\s]+(\d+)(?:\s*-\s*(\d+))?/i);
                    if (match) {
                        const min = parseInt(match[1]);
                        const max = match[2] ? parseInt(match[2]) : min;
                        return [min, max];
                    }
                }
                
                // Strategy 2: Look in the heading
                const heading = document.querySelector('h1');
                if (heading) {
                    const nextText = heading.nextElementSibling?.textContent || '';
                    const match = nextText.match(/Level[:\s]+(\d+)(?:\s*-\s*(\d+))?/i);
                    if (match) {
                        const min = parseInt(match[1]);
                        const max = match[2] ? parseInt(match[2]) : min;
                        return [min, max];
                    }
                }
                
                // Strategy 3: Look anywhere on the page for level info
                const pageText = document.body.textContent;
                const match = pageText.match(/Level[:\s]+(\d+)(?:\s*-\s*(\d+))?/i);
                if (match) {
                    const min = parseInt(match[1]);
                    const max = match[2] ? parseInt(match[2]) : min;
                    return [min, max];
                }
                
                return [1, 1];
            });

            console.log(`✓ Level: ${levelInfo[0]}-${levelInfo[1]}`);

            // Extract location/zone
            const zone = await this.page.evaluate(() => {
                // Look for zone links
                const locationLinks = document.querySelectorAll('a[href*="/classic/zone="]');
                if (locationLinks.length > 0) {
                    return locationLinks[0].textContent.trim();
                }
                
                // Fallback: Look in the description
                const description = document.querySelector('meta[name="description"]');
                if (description) {
                    const content = description.getAttribute('content');
                    const match = content.match(/found in ([^.]+)/);
                    if (match) {
                        return match[1].trim();
                    }
                }
                
                return 'Unknown';
            });

            console.log(`✓ Zone: ${zone}`);

            // Check if elite
            const isElite = await this.page.evaluate(() => {
                const classification = document.querySelector('.infobox-classification');
                return classification && classification.textContent.includes('Elite');
            });

            // Wait for loot table to load and click the tab
            console.log('⏳ Waiting for loot table...');
            
            // Wait for the drops tab to be available
            await this.page.waitForTimeout(500);
            
            // Try to click the "Drops" tab if it exists
            const dropsTabClicked = await this.page.evaluate(() => {
                const tabs = document.querySelectorAll('.tab, a[href="#drops"], a[data-tab="drops"], a[href="#tab-drops"]');
                for (const tab of tabs) {
                    if (tab.textContent.includes('Drops') || tab.textContent.includes('Loot')) {
                        tab.click();
                        return true;
                    }
                }
                return false;
            });
            
            if (dropsTabClicked) {
                console.log('✓ Clicked Drops tab');
                await this.page.waitForTimeout(500); // Wait for content to load
            }
            
            // Scroll through the page to trigger lazy-loaded content
            console.log('📜 Loading table content...');
            await this.page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight / 2);
            });
            await this.page.waitForTimeout(500);
            
            await this.takeScreenshot('02_before_loot_extraction');

            // Debug: Check what's in the drops tab
            if (this.debug) {
                console.log('\n🔍 Debugging #tab-drops content...');
                const dropsTabInfo = await this.page.evaluate(() => {
                    const dropsTab = document.querySelector('#tab-drops');
                    if (!dropsTab) {
                        return { found: false, message: '#tab-drops element not found' };
                    }
                    
                    // Check for Wowhead's data objects
                    const hasListviewData = typeof window.listviewitems !== 'undefined';
                    const hasWHData = typeof window.$WH !== 'undefined';
                    
                    return {
                        found: true,
                        display: window.getComputedStyle(dropsTab).display,
                        visible: dropsTab.offsetParent !== null,
                        tableCount: dropsTab.querySelectorAll('table').length,
                        rowCount: dropsTab.querySelectorAll('tr').length,
                        itemLinkCount: dropsTab.querySelectorAll('a[href*="/item="]').length,
                        hasListviewData,
                        hasWHData,
                        listviewKeys: hasListviewData ? Object.keys(window.listviewitems).slice(0, 5) : [],
                    };
                });
                console.log('Drops tab info:', JSON.stringify(dropsTabInfo, null, 2));
            }

            // Extract loot data - Try to use Wowhead's data API first
            const lootData = await this.page.evaluate(() => {
                const lootItems = [];
                
                // Strategy 1: Parse Listview initialization from page source
                // Wowhead embeds data in: new Listview({...data:[{...}]})
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const scriptText = script.textContent;
                    if (scriptText.includes('new Listview') && scriptText.includes("id: 'drops'")) {
                        console.log('Found Listview initialization script');
                        
                        // Extract the data array from the Listview call
                        try {
                            const dataMatch = scriptText.match(/data:\s*(\[[\s\S]*?\])\s*(?:,\s*computeDataFunc|}\))/);
                            if (dataMatch) {
                                const dataStr = dataMatch[1];
                                const data = eval('(' + dataStr + ')'); // Parse the JS array
                                
                                console.log(`Parsed ${data.length} items from Listview data`);
                                
                                data.forEach((item, index) => {
                                    try {
                                        const itemId = parseInt(item.id);
                                        const itemName = item.name || '';
                                        const quality = `q${item.quality || 1}`;
                                        
                                        // Calculate drop chance from count/outof
                                        let dropChance = 0;
                                        if (item.count && item.outof) {
                                            dropChance = (item.count / item.outof) * 100;
                                        } else if (item.percent) {
                                            dropChance = parseFloat(item.percent);
                                        }
                                        
                                        // Skip items with very low drop rates
                                        if (dropChance < 0.1) {
                                            console.log(`  ⊗ Skipping low drop: ${itemName} (ID: ${itemId}, Drop: ${dropChance.toFixed(4)}%)`);
                                            return;
                                        }
                                        
                                        // Skip Season of Discovery items (seasonId: 2)
                                        if (item.seasonId === 2) {
                                            console.log(`  ⊗ Skipping SoD item: ${itemName} (ID: ${itemId})`);
                                            return;
                                        }
                                        
                                        const isQuestItem = item.classs === 12;
                                        
                                        if (itemName) {
                                            console.log(`  ✓ Item ${index}: ${itemName} (ID: ${itemId}, Drop: ${dropChance.toFixed(2)}%)`);
                                            lootItems.push({
                                                itemId,
                                                name: itemName,
                                                quality,
                                                dropChance,
                                                isQuestItem
                                            });
                                        }
                                    } catch (e) {
                                        console.error(`Error parsing item ${index}:`, e.message);
                                    }
                                });
                                
                                return lootItems;
                            }
                        } catch (e) {
                            console.error('Error parsing Listview data:', e.message);
                        }
                    }
                }
                
                // Strategy 2: Use Wowhead's g_listviews data if available
                if (typeof window.g_listviews !== 'undefined' && window.g_listviews.length > 0) {
                    console.log(`Using Wowhead g_listviews data (${window.g_listviews.length} listviews)`);
                    
                    // Find the drops listview
                    for (const listview of window.g_listviews) {
                        if (listview.id === 'drops' || listview.template === 'item') {
                            console.log(`Found drops listview with ${listview.data.length} items`);
                            
                            listview.data.forEach((item, index) => {
                                try {
                                    const itemId = parseInt(item.id);
                                    const itemName = item.name || '';
                                    const quality = `q${item.quality || 1}`;
                                    
                                    // Calculate drop chance from count/outof
                                    let dropChance = 0;
                                    if (item.count && item.outof) {
                                        dropChance = (item.count / item.outof) * 100;
                                    } else if (item.percent) {
                                        dropChance = parseFloat(item.percent);
                                    }
                                    
                                    // Skip items with very low drop rates
                                    if (dropChance < 0.1) {
                                        return;
                                    }
                                    
                                    const isQuestItem = item.classs === 12;
                                    
                                    if (itemName) {
                                        console.log(`  ✓ Item ${index}: ${itemName} (ID: ${itemId}, Quality: ${quality}, Drop: ${dropChance.toFixed(2)}%)`);
                                        lootItems.push({
                                            itemId,
                                            name: itemName,
                                            quality,
                                            dropChance,
                                            isQuestItem
                                        });
                                    }
                                } catch (e) {
                                    console.error(`Error parsing listview item ${index}:`, e.message);
                                }
                            });
                            
                            return lootItems;
                        }
                    }
                }
                
                // Strategy 2: Use listviewitems if available
                if (typeof window.listviewitems !== 'undefined' && window.listviewitems.length > 0) {
                    console.log(`Using Wowhead listviewitems data (${window.listviewitems.length} items)`);
                    
                    window.listviewitems.forEach((item, index) => {
                        try {
                            const itemId = parseInt(item.id);
                            const itemName = item.name || '';
                            const quality = `q${item.quality || 1}`;
                            
                            // Calculate drop chance from count/outof
                            let dropChance = 0;
                            if (item.count && item.outof) {
                                dropChance = (item.count / item.outof) * 100;
                            } else if (item.percent) {
                                dropChance = parseFloat(item.percent);
                            }
                            
                            // Skip items with very low drop rates
                            if (dropChance < 0.1) {
                                return;
                            }
                            
                            const isQuestItem = item.classs === 12 || (item.flags && (item.flags & 0x1000));
                            
                            if (itemName) {
                                console.log(`  ✓ Item ${index}: ${itemName} (ID: ${itemId}, Quality: ${quality}, Drop: ${dropChance.toFixed(2)}%)`);
                                lootItems.push({
                                    itemId,
                                    name: itemName,
                                    quality,
                                    dropChance,
                                    isQuestItem
                                });
                            }
                        } catch (e) {
                            console.error(`Error parsing listview item ${index}:`, e.message);
                        }
                    });
                    
                    return lootItems;
                }
                
                // Strategy 3: Parse the table manually
                console.log('Fallback: Parsing table manually');
                const dropsTab = document.querySelector('#tab-drops');
                
                if (!dropsTab) {
                    console.log('ERROR: #tab-drops not found');
                    return [];
                }
                
                console.log('Found #tab-drops element');
                
                // Find all tables in the drops tab
                const tables = dropsTab.querySelectorAll('table');
                console.log(`Found ${tables.length} tables in #tab-drops`);
                
                // Process each table
                tables.forEach((table, tableIndex) => {
                    console.log(`Processing table ${tableIndex}...`);
                    
                    // Get all rows from the table body (skip header row)
                    const rows = table.querySelectorAll('tbody tr, tr');
                    console.log(`  Table ${tableIndex} has ${rows.length} rows`);
                    
                    rows.forEach((row, rowIndex) => {
                        try {
                            // Skip header rows
                            if (row.querySelector('th')) {
                                return;
                            }
                            
                            // Find item link in this row
                            const itemLink = row.querySelector('a[href*="/item="]');
                            if (!itemLink) {
                                return;
                            }

                            // Extract item ID from the href
                            const itemIdMatch = itemLink.href.match(/item[=/](\d+)/);
                            if (!itemIdMatch) {
                                console.log(`  Row ${rowIndex}: No valid item ID in ${itemLink.href}`);
                                return;
                            }
                            const itemId = parseInt(itemIdMatch[1]);

                            // Extract item name - Wowhead stores it in data attributes or we need to get it from the link
                            let itemName = itemLink.textContent.trim();
                            
                            // If textContent is empty, try data attributes
                            if (!itemName) {
                                itemName = itemLink.getAttribute('data-wh-rename-link') || 
                                          itemLink.getAttribute('title') ||
                                          itemLink.getAttribute('data-item-name') ||
                                          '';
                            }
                            
                            // If still empty, try to find text in nested elements
                            if (!itemName) {
                                const textNode = itemLink.querySelector('.q, .q0, .q1, .q2, .q3, .q4, .q5');
                                if (textNode) {
                                    itemName = textNode.textContent.trim();
                                }
                            }
                            
                            // Last resort: check if there's any text in the cell
                            if (!itemName) {
                                const cell = itemLink.closest('td');
                                if (cell) {
                                    // Get all text from the cell, excluding the icon
                                    const cellText = cell.textContent.trim();
                                    // Remove any leading/trailing whitespace and extract the name
                                    itemName = cellText.replace(/^\s+|\s+$/g, '');
                                }
                            }
                            
                            if (!itemName) {
                                console.log(`  Row ${rowIndex}: Empty item name for ID ${itemId}`);
                                return;
                            }

                            // Extract quality from the link's class (q0, q1, q2, q3, q4, q5)
                            let quality = 'q1'; // default to common
                            const classList = Array.from(itemLink.classList);
                            const qualityClass = classList.find(cls => /^q[0-5]$/.test(cls));
                            if (qualityClass) {
                                quality = qualityClass;
                            }

                            // Extract drop chance from the row text
                            // Wowhead typically shows percentages in the format "XX.X%" or "XX%"
                            let dropChance = 0;
                            const allCells = row.querySelectorAll('td');
                            
                            // The percentage is typically in one of the last cells
                            // Look through cells from right to left
                            for (let i = allCells.length - 1; i >= 0; i--) {
                                const cell = allCells[i];
                                const cellText = cell.textContent.trim();
                                
                                // Check for exact percentage match
                                const percentMatch = cellText.match(/^(\d+(?:\.\d+)?)\s*%$/);
                                if (percentMatch) {
                                    dropChance = parseFloat(percentMatch[1]);
                                    break;
                                }
                                
                                // Also check for percentages within other text
                                const anyPercentMatch = cellText.match(/(\d+(?:\.\d+)?)\s*%/);
                                if (anyPercentMatch && dropChance === 0) {
                                    dropChance = parseFloat(anyPercentMatch[1]);
                                }
                            }
                            
                            // If still no percentage, look in data attributes
                            if (dropChance === 0) {
                                const firstCell = row.querySelector('td');
                                if (firstCell) {
                                    // Check for data-percent or similar attributes
                                    const dataPercent = firstCell.getAttribute('data-percent') || 
                                                       firstCell.getAttribute('data-drop-rate') ||
                                                       row.getAttribute('data-percent');
                                    if (dataPercent) {
                                        dropChance = parseFloat(dataPercent);
                                    }
                                }
                            }

                            // Check if this is a quest item
                            // Quest items usually have specific styling or icons
                            const isQuestItem = itemLink.classList.contains('quest') ||
                                              itemLink.classList.contains('q-start') ||
                                              row.querySelector('.icon-quest') !== null ||
                                              row.querySelector('[data-quality="quest"]') !== null;

                            console.log(`  ✓ Row ${rowIndex}: ${itemName} (ID: ${itemId}, Quality: ${quality}, Drop: ${dropChance}%)`);

                            lootItems.push({
                                itemId,
                                name: itemName,
                                quality,
                                dropChance,
                                isQuestItem
                            });
                        } catch (e) {
                            console.error(`  Error parsing row ${rowIndex}:`, e.message);
                        }
                    });
                });

                return lootItems;
            });

            console.log(`\n✓ Found ${lootData.length} loot items`);
            
            if (this.debug && lootData.length > 0) {
                console.log('\nExtracted items:');
                lootData.forEach((item, i) => {
                    console.log(`  ${i + 1}. ${item.name} (ID: ${item.itemId}) - ${item.dropChance}% [${item.quality}]`);
                });
            }
            
            await this.takeScreenshot('03_after_loot_extraction');

            return {
                enemyName,
                npcId,
                level: levelInfo,
                zone,
                elite: isElite,
                loot: lootData
            };

        } catch (error) {
            console.error(`Error scraping ${url}:`, error.message);
            return null;
        }
    }

    generateLuaCode(enemyData) {
        if (!enemyData || !enemyData.enemyName) {
            return null;
        }

        const lines = [];
        lines.push(`    -- ${enemyData.enemyName}`);
        lines.push(`    ["${enemyData.enemyName}"] = {`);
        
        if (enemyData.npcId) {
            lines.push(`        npcId = ${enemyData.npcId},`);
        }
        
        lines.push(`        level = {${enemyData.level[0]}, ${enemyData.level[1]}},`);
        lines.push(`        zone = "${enemyData.zone}",`);
        
        if (enemyData.elite) {
            lines.push(`        elite = true,`);
        }
        
        lines.push(`        loot = {`);

        // Sort loot by drop chance (highest first)
        const sortedLoot = enemyData.loot.sort((a, b) => b.dropChance - a.dropChance);

        sortedLoot.forEach((item, index) => {
            const comma = index < sortedLoot.length - 1 ? ',' : '';
            // Only store itemId and dropChance - WoW API will provide name, quality, etc.
            lines.push(`            {itemId = ${item.itemId}, dropChance = ${item.dropChance.toFixed(1)}}${comma}`);
        });

        lines.push(`        },`);
        lines.push(`    },`);

        return lines.join('\n');
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

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    let urls = [];
    let debugMode = args.includes('--debug') || args.includes('-d');
    
    // Parse command line arguments
    if (args.includes('--url')) {
        const urlIndex = args.indexOf('--url');
        urls.push(args[urlIndex + 1]);
    } else if (args.includes('--list')) {
        const listIndex = args.indexOf('--list');
        const listFile = args[listIndex + 1];
        if (fs.existsSync(listFile)) {
            const content = fs.readFileSync(listFile, 'utf-8');
            urls = content.split('\n').filter(line => line.trim().startsWith('http'));
        } else {
            console.error(`File not found: ${listFile}`);
            process.exit(1);
        }
    } else {
        // Default test URL
        urls.push('https://www.wowhead.com/classic/npc=3260/bristleback-water-seeker');
    }

    if (urls.length === 0) {
        console.error('No URLs to process. Use --url <url> or --list <file>');
        console.error('Add --debug flag for detailed debugging information');
        process.exit(1);
    }

    console.log(`Debug mode: ${debugMode ? 'ON' : 'OFF'}`);
    if (debugMode) {
        console.log('📸 Screenshots will be saved to: tools/screenshots/');
        console.log('🌐 Browser will be visible');
    }

    const scraper = new WowheadScraper({ debug: debugMode });
    await scraper.initialize();

    const allLuaCode = [];
    const outputFile = path.join(__dirname, '..', 'ScrapedDatabase.lua');

    // Check for existing progress and load already-scraped NPCs
    const alreadyScraped = new Set();
    let existingEntries = [];
    
    if (fs.existsSync(outputFile)) {
        console.log(`\n📂 Found existing ${path.basename(outputFile)}`);
        try {
            const existingContent = fs.readFileSync(outputFile, 'utf-8');
            
            // Parse NPC IDs from existing file
            const npcIdMatches = existingContent.matchAll(/npcId\s*=\s*(\d+)/g);
            for (const match of npcIdMatches) {
                alreadyScraped.add(parseInt(match[1]));
            }
            
            // Extract each enemy entry to preserve them
            const entryMatches = existingContent.matchAll(/    -- (.+?)\n    \[.+?\] = \{[\s\S]*?    \},\n/g);
            for (const match of entryMatches) {
                existingEntries.push(match[0]);
            }
            
            console.log(`✓ Loaded ${alreadyScraped.size} already-scraped NPCs`);
            console.log(`✓ Resume: Will skip ${alreadyScraped.size} and process remaining NPCs`);
        } catch (error) {
            console.log(`⚠️  Could not parse existing file: ${error.message}`);
            console.log(`   Starting fresh...`);
        }
    }

    // Filter out already-scraped URLs
    const originalCount = urls.length;
    urls = urls.filter(url => {
        const npcIdMatch = url.match(/npc[=/](\d+)/);
        if (npcIdMatch) {
            const npcId = parseInt(npcIdMatch[1]);
            return !alreadyScraped.has(npcId);
        }
        return true; // Keep URLs we can't parse
    });

    if (urls.length < originalCount) {
        console.log(`\n🔄 Resume mode: Skipping ${originalCount - urls.length} already-scraped NPCs`);
    }

    console.log(`\n========================================`);
    console.log(`Processing ${urls.length} URL(s)...`);
    if (alreadyScraped.size > 0) {
        console.log(`(${alreadyScraped.size} already completed)`);
    }
    console.log(`========================================`);

    let successCount = 0;
    let failureCount = 0;
    const startTime = Date.now();

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const progress = `[${i + 1}/${urls.length}]`;
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const rate = i > 0 ? elapsed / i : 0;
        const remaining = i > 0 ? Math.floor(rate * (urls.length - i)) : 0;
        
        console.log(`\n${progress} Progress: ${successCount} success, ${failureCount} failed | Elapsed: ${elapsed}s | ETA: ~${remaining}s`);
        
        try {
            const enemyData = await scraper.scrapeEnemyData(url);
            
            if (enemyData && enemyData.loot) {
                // Check if we need to fetch item names
                const missingNames = enemyData.loot.filter(item => !item.name || item.name.match(/^\d+-\d+$/));
                
                if (missingNames.length > 0) {
                    console.log(`\n📡 Fetching names for ${missingNames.length} items...`);
                    const itemIds = missingNames.map(item => item.itemId);
                    const itemData = await fetchItemNames(itemIds, enemyData.npcId);
                    
                    // Update items with fetched names and drop rates
                    enemyData.loot.forEach(item => {
                        if (itemData[item.itemId]) {
                            item.name = itemData[item.itemId].name;
                            item.quality = `q${itemData[item.itemId].quality}`;
                            // Use fetched drop rate if current one is 0
                            if (item.dropChance === 0 && itemData[item.itemId].dropChance > 0) {
                                item.dropChance = itemData[item.itemId].dropChance;
                            }
                        }
                    });
                    
                    // Remove items that still don't have names
                    enemyData.loot = enemyData.loot.filter(item => item.name && !item.name.match(/^\d+-\d+$/));
                    console.log(`✓ Successfully enriched data. Total items: ${enemyData.loot.length}`);
                }
                
                const luaCode = scraper.generateLuaCode(enemyData);
                if (luaCode) {
                    allLuaCode.push(luaCode);
                    successCount++;
                    console.log(`✓ ${progress} Successfully processed: ${enemyData.enemyName}`);
                }
            } else {
                failureCount++;
                console.log(`✗ ${progress} No data extracted from ${url}`);
            }
        } catch (error) {
            failureCount++;
            console.error(`✗ ${progress} Error processing ${url}:`, error.message);
            // Continue with next URL even if one fails
        }
        
        // Small delay to be polite (reduced from 2s to 500ms since we already have waits in scrapeEnemyData)
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Save progress every 10 NPCs
        if ((i + 1) % 10 === 0 && allLuaCode.length > 0) {
            const tempOutput = generateLuaOutput(allLuaCode);
            fs.writeFileSync(outputFile, tempOutput, 'utf-8');
            console.log(`💾 Progress saved (${successCount} enemies)`);
        }
    }

    await scraper.close();

    // Helper function to generate Lua output
    function generateLuaOutput(luaCodeArray) {
        const header = `-- Auto-generated loot table database from Wowhead Classic
-- Generated: ${new Date().toISOString()}
-- Total enemies: ${existingEntries.length + luaCodeArray.length}
-- 
-- This file is automatically loaded by Database.lua
-- DO NOT manually edit this file - it will be overwritten by the scraper

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
        // Combine existing entries with new ones
        const allEntries = [...existingEntries, ...luaCodeArray];
        return header + allEntries.join('\n\n') + footer;
    }

    // Write final output as a complete Lua module
    if (allLuaCode.length > 0 || existingEntries.length > 0) {
        const output = generateLuaOutput(allLuaCode);
        
        fs.writeFileSync(outputFile, output, 'utf-8');
        
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        const avgTime = urls.length > 0 ? totalTime / urls.length : 0;
        const totalNpcs = existingEntries.length + allLuaCode.length;
        
        console.log(`\n========================================`);
        console.log(`✓ Scraping Complete!`);
        console.log(`========================================`);
        if (urls.length > 0) {
            console.log(`Session stats:`);
            console.log(`  Processed: ${urls.length} URLs`);
            console.log(`  Success: ${successCount}`);
            console.log(`  Failed: ${failureCount}`);
            console.log(`  Time: ${totalTime}s (avg ${avgTime.toFixed(1)}s per NPC)`);
        }
        console.log(`\nTotal database:`);
        console.log(`  Total NPCs: ${totalNpcs} (${existingEntries.length} existing + ${allLuaCode.length} new)`);
        console.log(`  Output: ${outputFile}`);
        console.log(`\n✓ The file is ready to be loaded by WoW!`);
    } else {
        console.log('\n✗ No new data was scraped.');
        if (alreadyScraped.size > 0) {
            console.log(`(Existing database has ${alreadyScraped.size} NPCs)`);
        }
    }
}

// Run the scraper
main().catch(console.error);
