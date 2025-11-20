/**
 * Wowhead Classic Loot Table Scraper
 * Extracts enemy loot data from Wowhead Classic and stores in SQLite database
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { ScraperDatabase } = require('./database');

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
        this.database = options.database || null;
        
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
            // Set user agent to avoid headless detection
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            // Set viewport
            viewport: { width: 1920, height: 1080 },
            // Additional settings to avoid bot detection
            locale: 'en-US',
            timezoneId: 'America/New_York',
            extraHTTPHeaders: {
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        
        this.page = await this.context.newPage();
        
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
    
    /**
     * Detect game version from URL
     * @param {string} url - Wowhead URL
     * @returns {string} 'classic' or 'tbc'
     */
    detectGameVersion(url) {
        if (url.includes('/tbc/')) {
            return 'tbc';
        }
        return 'classic';
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
        
        // Detect game version from URL
        const gameVersion = this.detectGameVersion(url);
        console.log(`🎮 Game Version: ${gameVersion.toUpperCase()}`);
        
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
            
            // Wait for the h1 heading to appear (main NPC title)
            try {
                await this.page.waitForSelector('h1.heading-size-1', { timeout: 10000 });
            } catch (e) {
                console.log('⚠️  H1 heading not found, continuing anyway...');
            }
            
            // Additional wait for JavaScript to execute
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

            // Extract creature type strictly from Wowhead's structured page object
            const creatureInfo = await this.page.evaluate((npcId) => {
                const info = { type: null, source: null };
                try {
                    // Prefer structured g_npcs data when available
                    if (typeof window.g_npcs !== 'undefined' && window.g_npcs && window.g_npcs[npcId]) {
                        const entry = window.g_npcs[npcId];
                        if (entry && entry.type) {
                            info.type = entry.type;
                            info.source = 'g_npcs';
                            return info;
                        }
                        // Some pages might store type under 'creatureType' or 'race'
                        if (entry && entry.creatureType) {
                            info.type = entry.creatureType;
                            info.source = 'g_npcs.creatureType';
                            return info;
                        }
                        if (entry && entry.race) {
                            info.type = entry.race;
                            info.source = 'g_npcs.race';
                            return info;
                        }
                    }

                    // If g_npcs isn't present or doesn't have the type, leave type null
                } catch (e) {
                    // ignore errors
                }

                return info;
            }, npcId);

            console.log(`✓ Type: ${creatureInfo.type || 'Unknown'}${creatureInfo.source ? ` (source: ${creatureInfo.source})` : ''}`);

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
                                        
                                        // Include all items (do not skip low drop rates); keep everything in DB for post-filtering
                                        
                                        // Skip Season of Discovery items (seasonId: 2)
                                        if (item.seasonId === 2) {
                                            console.log(`  ⊗ Skipping SoD item: ${itemName} (ID: ${itemId})`);
                                            return;
                                        }
                                        
                                        const isQuestItem = item.classs === 12;
                                        
                                        if (itemName) {
                                            console.log(`  ✓ Item ${index}: ${itemName} (ID: ${itemId}, Drop: ${dropChance.toFixed(2)}%, Sample: ${item.count || '?'}/${item.outof || '?'})`);
                                            lootItems.push({
                                                itemId,
                                                name: itemName,
                                                quality,
                                                dropChance,
                                                isQuestItem,
                                                // Store ALL available data
                                                dropCount: item.count || null,
                                                sampleSize: item.outof || null,
                                                classId: item.classs || null,
                                                subclassId: item.subclass || null,
                                                stackSize: item.stack || null,
                                                seasonId: item.seasonId || null
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
                                    
                                    // Include all items (do not skip low drop rates)
                                    
                                    const isQuestItem = item.classs === 12;
                                    
                                    if (itemName) {
                                        console.log(`  ✓ Item ${index}: ${itemName} (ID: ${itemId}, Quality: ${quality}, Drop: ${dropChance.toFixed(2)}%, Sample: ${item.count || '?'}/${item.outof || '?'})`);
                                        lootItems.push({
                                            itemId,
                                            name: itemName,
                                            quality,
                                            dropChance,
                                            isQuestItem,
                                            // Store ALL available data
                                            dropCount: item.count || null,
                                            sampleSize: item.outof || null,
                                            classId: item.classs || null,
                                            subclassId: item.subclass || null,
                                            stackSize: item.stack || null,
                                            seasonId: item.seasonId || null
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
                            
                            // Include all items (do not skip low drop rates)
                            
                            const isQuestItem = item.classs === 12 || (item.flags && (item.flags & 0x1000));
                            
                            if (itemName) {
                                console.log(`  ✓ Item ${index}: ${itemName} (ID: ${itemId}, Quality: ${quality}, Drop: ${dropChance.toFixed(2)}%, Sample: ${item.count || '?'}/${item.outof || '?'})`);
                                lootItems.push({
                                    itemId,
                                    name: itemName,
                                    quality,
                                    dropChance,
                                    isQuestItem,
                                    // Store ALL available data
                                    dropCount: item.count || null,
                                    sampleSize: item.outof || null,
                                    classId: item.classs || null,
                                    subclassId: item.subclass || null,
                                    stackSize: item.stack || null,
                                    seasonId: item.seasonId || null
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

                            // If still no percentage, look in data attributes (count/outof)
                            if (dropChance === 0) {
                                const firstCell = row.querySelector('td');
                                if (firstCell) {
                                    const countAttr = firstCell.getAttribute('data-count');
                                    const outofAttr = firstCell.getAttribute('data-outof');
                                    if (countAttr && outofAttr) {
                                        const count = parseInt(countAttr) || 0;
                                        const outof = parseInt(outofAttr) || 0;
                                        if (outof > 0) {
                                            dropChance = (count / outof) * 100;
                                        }
                                    }
                                }
                            }

                            // Check if this is a quest item
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

            // Extract vendor (sold) items
            console.log('\n🛒 Scraping vendor items...');
            const vendorData = await this.extractVendorItems();
            console.log(`✓ Found ${vendorData.length} vendor items`);

            // Extract pickpocket loot
            console.log('\n🥷 Scraping pickpocket loot...');
            const pickpocketData = await this.extractPickpocketLoot();
            console.log(`✓ Found ${pickpocketData.length} pickpocket items`);

            return {
                enemyName,
                npcId,
                level: levelInfo,
                zone,
                elite: isElite,
                type: creatureInfo.type,
                family: creatureInfo.family,
                loot: lootData,
                vendor: vendorData,
                pickpocket: pickpocketData
            };

        } catch (error) {
            console.error(`Error scraping ${url}:`, error.message);
            return null;
        }
    }

    /**
     * Extract vendor (sold) items from the Sells tab
     */
    async extractVendorItems() {
        try {
            const vendorItems = await this.page.evaluate(() => {
                const items = [];
                
                // Look for Listview data for 'sells' tab
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const scriptText = script.textContent;
                    if (scriptText.includes('new Listview') && scriptText.includes("id: 'sells'")) {
                        try {
                            const dataMatch = scriptText.match(/data:\s*(\[[\s\S]*?\])\s*(?:,\s*computeDataFunc|}\))/);
                            if (dataMatch) {
                                const dataStr = dataMatch[1];
                                const data = eval('(' + dataStr + ')');
                                
                                data.forEach((item) => {
                                    try {
                                        const itemId = parseInt(item.id);
                                        const itemName = item.name || '';
                                        const quality = `q${item.quality || 1}`;
                                        
                                        // Parse cost (usually in copper)
                                        let costAmount = 0;
                                        let costCurrency = 'copper';
                                        
                                        if (item.cost && Array.isArray(item.cost) && item.cost.length > 0) {
                                            // Cost is typically [amount, currencyType]
                                            costAmount = parseInt(item.cost[0]) || 0;
                                            // Currency types: 0=money, others are item currencies
                                            costCurrency = item.cost.length > 1 && item.cost[1] !== 0 ? 
                                                `item_${item.cost[1]}` : 'copper';
                                        }
                                        
                                        // Parse stack size
                                        let stackSize = null;
                                        if (item.stack && Array.isArray(item.stack)) {
                                            stackSize = JSON.stringify(item.stack);
                                        } else if (item.stack) {
                                            stackSize = String(item.stack);
                                        }
                                        
                                        if (itemName) {
                                            items.push({
                                                itemId,
                                                name: itemName,
                                                quality,
                                                costAmount,
                                                costCurrency,
                                                stock: item.stock || null,
                                                isLimited: item.stock && item.stock > 0,
                                                requiredLevel: item.reqlevel || null,
                                                requiredFaction: item.side || null,
                                                requiredReputation: item.standing || null,
                                                classId: item.classs || null,
                                                subclassId: item.subclass || null,
                                                stackSize
                                            });
                                        }
                                    } catch (e) {
                                        console.error(`Error parsing vendor item:`, e.message);
                                    }
                                });
                                
                                return items;
                            }
                        } catch (e) {
                            console.error('Error extracting vendor data:', e.message);
                        }
                    }
                }
                
                return items;
            });
            
            return vendorItems || [];
        } catch (error) {
            console.error('Error extracting vendor items:', error.message);
            return [];
        }
    }

    /**
     * Extract pickpocket loot from the Pick Pocketing tab
     */
    async extractPickpocketLoot() {
        try {
            const pickpocketItems = await this.page.evaluate(() => {
                const items = [];
                
                // Prefer newer g_listviews.pickpocketing data when available (more reliable counts)
                try {
                    if (window.g_listviews && window.g_listviews.pickpocketing && Array.isArray(window.g_listviews.pickpocketing.data)) {
                        const data = window.g_listviews.pickpocketing.data;
                        console.log(`✓ Found g_listviews.pickpocketing with ${data.length} entries`);

                        const pickpocketOnly = data.filter(item => {
                            // Some entries may have source array; keep items that include 21 (pickpocket)
                            return item.source && Array.isArray(item.source) && item.source.includes(21);
                        });

                        console.log(`Filtered pickpocket items (source=21): ${pickpocketOnly.length}`);

                        pickpocketOnly.forEach((item) => {
                            try {
                                const itemId = parseInt(item.id);
                                const itemName = item.name || '';
                                const quality = `q${item.quality || 1}`;

                                // Determine drop counts and sample sizes. Wowhead sometimes stores per-season data
                                // in item.itemSeasonPhaseData, or top-level count/outof, or _count/outof, or percent.
                                let dropCount = null;
                                let sampleSize = null;
                                let dropChance = null;

                                // If itemSeasonPhaseData exists, try to extract the most general (season 0, phase 0)
                                if (item.itemSeasonPhaseData) {
                                    try {
                                        // Prefer Classic season/phase/mode: '0' -> '0' -> '0' when available
                                        const s0 = item.itemSeasonPhaseData['0'];
                                        if (s0 && s0['0'] && s0['0']['0'] && typeof s0['0']['0'].count === 'number' && typeof s0['0']['0'].outof === 'number') {
                                            dropCount = s0['0']['0'].count;
                                            sampleSize = s0['0']['0'].outof;
                                        } else {
                                            // Fallback: scan any available season/phase/mode for the first valid entry
                                            const seasons = Object.keys(item.itemSeasonPhaseData);
                                            for (const s of seasons) {
                                                const phases = Object.keys(item.itemSeasonPhaseData[s] || {});
                                                for (const p of phases) {
                                                    const modes = Object.keys(item.itemSeasonPhaseData[s][p] || {});
                                                    for (const m of modes) {
                                                        const entry = item.itemSeasonPhaseData[s][p][m];
                                                        if (entry && typeof entry.count === 'number' && typeof entry.outof === 'number') {
                                                            dropCount = entry.count;
                                                            sampleSize = entry.outof;
                                                            break;
                                                        }
                                                    }
                                                    if (dropCount && sampleSize) break;
                                                }
                                                if (dropCount && sampleSize) break;
                                            }
                                        }
                                    } catch (e) {
                                        // ignore and continue to other fallbacks
                                    }
                                }

                                // Prefer explicit _count and outof if present (after season data)
                                if ((!dropCount || !sampleSize) && typeof item._count === 'number' && typeof item.outof === 'number') {
                                    dropCount = item._count;
                                    sampleSize = item.outof;
                                }

                                // Top-level count/outof
                                if ((!dropCount || !sampleSize) && typeof item.count === 'number' && typeof item.outof === 'number') {
                                    dropCount = item.count;
                                    sampleSize = item.outof;
                                }

                                // If we have counts, compute percent
                                if (typeof dropCount === 'number' && typeof sampleSize === 'number' && sampleSize > 0) {
                                    dropChance = (dropCount / sampleSize) * 100;
                                } else if (item.percent) {
                                    dropChance = parseFloat(item.percent) || null;
                                }

                                // _count fallback (some pages expose _count only)
                                if (!dropCount && typeof item._count === 'number') {
                                    dropCount = item._count;
                                }

                                if (itemName) {
                                    items.push({
                                        itemId,
                                        name: itemName,
                                        quality,
                                        dropChance: dropChance !== null ? dropChance : null,
                                        dropCount: dropCount || null,
                                        sampleSize: sampleSize || null,
                                        classId: item.classs || null,
                                        subclassId: item.subclass || null,
                                        stackSize: item.stack || null
                                    });
                                }
                            } catch (e) {
                                console.error(`Error parsing pickpocket item:`, e.message);
                            }
                        });

                        return items;
                    }
                } catch (e) {
                    console.error('Error reading g_listviews.pickpocketing:', e && e.message ? e.message : e);
                }

                // Fallback: look for older Listview data embedded in scripts
                const scripts = document.querySelectorAll('script');

                for (const script of scripts) {
                    const scriptText = script.textContent;
                    // Look specifically for the pickpocketing Listview
                    if (scriptText.includes('new Listview') && scriptText.includes(`id: 'pickpocketing'`)) {
                        console.log(`✓ Found pickpocketing Listview`);
                        try {
                            const dataMatch = scriptText.match(/data:\s*(\[[\s\S]*?\])\s*(?:,\s*computeDataFunc|}\))/);
                            if (dataMatch) {
                                const dataStr = dataMatch[1];
                                const data = eval('(' + dataStr + ')');

                                console.log(`Total items in pickpocketing Listview: ${data.length}`);

                                // Filter for actual pickpocket items (source includes 21 = pickpocket)
                                const pickpocketOnly = data.filter(item => 
                                    item.source && Array.isArray(item.source) && item.source.includes(21)
                                );

                                console.log(`Filtered pickpocket items (source=21): ${pickpocketOnly.length}`);

                                pickpocketOnly.forEach((item) => {
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

                                        if (itemName) {
                                            items.push({
                                                itemId,
                                                name: itemName,
                                                quality,
                                                dropChance,
                                                dropCount: item.count || null,
                                                sampleSize: item.outof || null,
                                                classId: item.classs || null,
                                                subclassId: item.subclass || null,
                                                stackSize: item.stack || null
                                            });
                                        }
                                    } catch (e) {
                                        console.error(`Error parsing pickpocket item:`, e.message);
                                    }
                                });

                                return items;
                            }
                        } catch (e) {
                            console.error('Error extracting pickpocket data:', e.message);
                        }
                    }
                }
                
                return items;
            });
            
            return pickpocketItems || [];
        } catch (error) {
            console.error('Error extracting pickpocket items:', error.message);
            return [];
        }
    }

    /**
     * Save scraped enemy data to database
     */
    async saveToDatabase(enemyData, url) {
        if (!this.database || !enemyData) {
            return;
        }

        try {
            // Detect game version from URL
            const gameVersion = this.detectGameVersion(url);
            
            // Normalize type: g_npcs sometimes returns numeric codes. Try to map them to labels.
            let typeId = null;
            let typeLabel = null;

            // Default in-memory mapping for common Wowhead numeric type codes
            const DEFAULT_TYPE_MAP = {
                1: 'Beast',
                2: 'Dragonkin',
                3: 'Demon',
                4: 'Elemental',
                5: 'Giant',
                6: 'Undead',
                7: 'Humanoid',
                8: 'Critter',
                9: 'Mechanical',
                10: 'Not specified'
            };

            if (enemyData.type !== null && enemyData.type !== undefined) {
                if (typeof enemyData.type === 'number' || /^\d+$/.test(String(enemyData.type))) {
                    typeId = parseInt(enemyData.type);
                    // Check DB first for an override label
                    try {
                        const dbLabel = await this.database.getNpcTypeLabel(typeId);
                        if (dbLabel) {
                            typeLabel = dbLabel;
                        } else if (DEFAULT_TYPE_MAP[typeId]) {
                            typeLabel = DEFAULT_TYPE_MAP[typeId];
                        } else {
                            typeLabel = String(typeId);
                        }
                    } catch (e) {
                        // If DB helper not present or fails, fall back to defaults
                        typeLabel = DEFAULT_TYPE_MAP[typeId] || String(typeId);
                    }
                } else {
                    typeLabel = String(enemyData.type);
                }
            }

            // Save NPC data
            await this.database.upsertNpc({
                npcId: enemyData.npcId,
                gameVersion: gameVersion,
                name: enemyData.enemyName,
                levelMin: enemyData.level[0],
                levelMax: enemyData.level[1],
                zone: enemyData.zone,
                elite: enemyData.elite,
                url: url,
                type: typeLabel || enemyData.type,
                family: enemyData.family,
                typeId: typeId
            });

            // Save all loot drops
            for (const item of enemyData.loot) {
                const qualityNum = parseInt(item.quality.replace('q', ''));
                // Upsert canonical item metadata first (best-effort)
                try {
                    await this.database.upsertItem({
                        itemId: item.itemId,
                        name: item.name || null,
                        quality: qualityNum || null,
                        itemLevel: item.itemLevel || null,
                        requiredLevel: item.requiredLevel || null,
                        classId: item.classId || null,
                        subclassId: item.subclassId || null,
                        icon: item.icon || null,
                        isQuestItem: item.isQuestItem ? 1 : 0,
                        bindType: item.bindType || null,
                        uniqueEquipped: item.uniqueEquipped ? 1 : 0,
                        maxStack: item.maxStack || null
                    });
                } catch (e) {
                    console.warn('Could not upsert item metadata for', item.itemId, e.message);
                }

                await this.database.upsertLootDrop({
                    npcId: enemyData.npcId,
                    gameVersion: gameVersion,
                    itemId: item.itemId,
                    itemName: item.name,
                    quality: qualityNum,
                    dropCount: item.dropCount,
                    sampleSize: item.sampleSize,
                    dropPercent: item.dropChance,
                    isQuestItem: item.isQuestItem,
                    classId: item.classId,
                    subclassId: item.subclassId,
                    stackSize: item.stackSize,
                    seasonId: item.seasonId
                });
            }

            // Save vendor items
            for (const item of enemyData.vendor || []) {
                const qualityNum = parseInt(item.quality.replace('q', ''));
                // Upsert canonical item metadata first
                try {
                    await this.database.upsertItem({
                        itemId: item.itemId,
                        name: item.name || null,
                        quality: qualityNum || null,
                        itemLevel: item.itemLevel || null,
                        requiredLevel: item.requiredLevel || null,
                        classId: item.classId || null,
                        subclassId: item.subclassId || null,
                        icon: item.icon || null,
                        isQuestItem: 0,
                        bindType: item.bindType || null,
                        uniqueEquipped: item.uniqueEquipped ? 1 : 0,
                        maxStack: item.maxStack || null
                    });
                } catch (e) {
                    console.warn('Could not upsert vendor item metadata for', item.itemId, e.message);
                }

                await this.database.upsertVendorItem({
                    npcId: enemyData.npcId,
                    gameVersion: gameVersion,
                    itemId: item.itemId,
                    itemName: item.name,
                    quality: qualityNum,
                    costAmount: item.costAmount,
                    costCurrency: item.costCurrency,
                    stock: item.stock,
                    isLimited: item.isLimited,
                    requiredLevel: item.requiredLevel,
                    requiredFaction: item.requiredFaction,
                    requiredReputation: item.requiredReputation,
                    classId: item.classId,
                    subclassId: item.subclassId,
                    stackSize: item.stackSize
                });
            }

            // Save pickpocket loot
            for (const item of enemyData.pickpocket || []) {
                const qualityNum = parseInt(item.quality.replace('q', ''));
                // Upsert canonical item metadata first
                try {
                    await this.database.upsertItem({
                        itemId: item.itemId,
                        name: item.name || null,
                        quality: qualityNum || null,
                        itemLevel: item.itemLevel || null,
                        requiredLevel: item.requiredLevel || null,
                        classId: item.classId || null,
                        subclassId: item.subclassId || null,
                        icon: item.icon || null,
                        isQuestItem: 0,
                        bindType: item.bindType || null,
                        uniqueEquipped: item.uniqueEquipped ? 1 : 0,
                        maxStack: item.maxStack || null
                    });
                } catch (e) {
                    console.warn('Could not upsert pickpocket item metadata for', item.itemId, e.message);
                }

                await this.database.upsertPickpocketLoot({
                    npcId: enemyData.npcId,
                    gameVersion: gameVersion,
                    itemId: item.itemId,
                    itemName: item.name,
                    quality: qualityNum,
                    dropCount: item.dropCount,
                    sampleSize: item.sampleSize,
                    dropPercent: item.dropChance,
                    classId: item.classId,
                    subclassId: item.subclassId,
                    stackSize: item.stackSize
                });
            }

            console.log(`💾 Saved to database: ${enemyData.enemyName} with ${enemyData.loot.length} loot, ${enemyData.vendor?.length || 0} vendor, ${enemyData.pickpocket?.length || 0} pickpocket items`);
        } catch (error) {
            console.error(`Error saving to database:`, error.message);
        }
    }

    // Note: Lua generation/exports were removed from the scraper.
    // Exporting to Lua is now handled by tools/exportLua.js which reads the
    // SQLite database and emits the desired filtered Lua files.

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
    let forceMode = args.includes('--force') || args.includes('-f');
    let refreshPickpocket = args.includes('--refresh-pickpocket');
    let dryRun = args.includes('--dry-run');
    
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

    // Initialize database
    console.log('\n📦 Initializing database...');
    const database = new ScraperDatabase();
    await database.initialize();
    
    const sessionId = await database.startSession();
    console.log(`✓ Started scraping session #${sessionId}`);

    const scraper = new WowheadScraper({ debug: debugMode, database: database });
    await scraper.initialize();

    // The scraper only populates the SQLite database now. Use tools/exportLua.js
    // to generate Lua exports from the DB: `node exportLua.js`

    // Check database for already-scraped NPCs
    console.log(`\n📂 Checking database for existing NPCs...`);
    const existingNpcs = await database.all('SELECT npc_id, game_version FROM npcs');
    // Create a Set with "npcId:gameVersion" format for checking
    const alreadyScraped = new Set(existingNpcs.map(row => `${row.npc_id}:${row.game_version}`));

    if (alreadyScraped.size > 0) {
        console.log(`✓ Found ${alreadyScraped.size} NPC entries already in database (including version variants)`);
        if (forceMode) {
            console.log('⚠️  Force mode enabled: will reprocess all provided URLs regardless of existing data');
        } else if (refreshPickpocket) {
            console.log('ℹ️  Refresh-pickpocket enabled: will reprocess NPCs that are missing pickpocket entries');
        } else {
            console.log(`✓ Resume: Will skip these and process only new NPCs`);
        }
    }

    // If refreshPickpocket is requested, get NPCs that already have pickpocket data
    let pickpocketNpcs = new Set();
    if (refreshPickpocket && !forceMode) {
        try {
            const rows = await database.all('SELECT DISTINCT npc_id, game_version FROM pickpocket_loot');
            rows.forEach(r => pickpocketNpcs.add(`${r.npc_id}:${r.game_version}`));
            console.log(`✓ Found ${pickpocketNpcs.size} NPC entries with pickpocket data in DB`);
        } catch (e) {
            console.warn('Could not query pickpocket_loot table:', e.message);
        }
    }

    // Filter URLs depending on mode
    const originalCount = urls.length;
    if (!forceMode) {
        if (refreshPickpocket) {
            // Only process NPCs that have pickpocket entries (we want to refresh those)
            urls = urls.filter(url => {
                const npcIdMatch = url.match(/npc[=/](\d+)/);
                if (npcIdMatch) {
                    const npcId = parseInt(npcIdMatch[1]);
                    const gameVersion = url.includes('/tbc/') ? 'tbc' : 'classic';
                    return pickpocketNpcs.has(`${npcId}:${gameVersion}`);
                }
                return false; // if we can't parse the NPC id, skip it in refresh mode
            });
        } else {
            // Default resume behavior: skip NPCs already in npcs table for this game version
            urls = urls.filter(url => {
                const npcIdMatch = url.match(/npc[=/](\d+)/);
                if (npcIdMatch) {
                    const npcId = parseInt(npcIdMatch[1]);
                    const gameVersion = url.includes('/tbc/') ? 'tbc' : 'classic';
                    return !alreadyScraped.has(`${npcId}:${gameVersion}`);
                }
                return true; // Keep URLs we can't parse
            });
        }
    }

    if (urls.length < originalCount) {
        console.log(`\n🔄 Resume mode: Skipping ${originalCount - urls.length} already-scraped NPCs`);
        console.log(`   Processing ${urls.length} NPCs`);
    }

    // Dry-run support: print a sample of URLs that would be processed and exit
    if (dryRun) {
        console.log('\n🧪 Dry run: the following URLs would be processed:');
        const sample = urls.slice(0, 20);
        sample.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
        if (urls.length > sample.length) console.log(`  ... and ${urls.length - sample.length} more`);
        console.log(`\nTotal: ${urls.length} URL(s)`);
        await scraper.close();
        await database.completeSession(sessionId, { npcsScraped: 0, itemsFound: 0, errors: 0 });
        await database.close();
        process.exit(0);
    }

    console.log(`\n========================================`);
    console.log(`Processing ${urls.length} URL(s)...`);
    if (alreadyScraped.size > 0) {
        console.log(`(${alreadyScraped.size} already in database)`);
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
                
                // Save to database (counts as a successful scrape)
                await scraper.saveToDatabase(enemyData, url);
                successCount++;
                console.log(`✓ ${progress} Successfully processed and saved: ${enemyData.enemyName}`);
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
        
        // Progress is automatically saved to database after each NPC
        if ((i + 1) % 10 === 0) {
            console.log(`💾 Progress: ${successCount} NPCs saved to database`);
        }
    }

    await scraper.close();

    // Note: Lua file generation is now handled by exportLua.js
    // The scraper only populates the database
    // To generate the Lua file, run: node exportLua.js

    // Note: Lua output generation was removed from the scraper. Use
    // tools/exportLua.js to create filtered Lua files from the database.

    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    const avgTime = urls.length > 0 ? totalTime / urls.length : 0;

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
    
    // Complete database session
    await database.completeSession(sessionId, {
        npcsScraped: successCount,
        itemsFound: successCount,
        errors: failureCount
    });
    
    // Show database statistics
    const stats = await database.getStats();
    console.log(`\n📊 Database Statistics:`);
    console.log(`  Total NPCs: ${stats.total_npcs}`);
    console.log(`  Total Drops: ${stats.total_drops}`);
    console.log(`  Unique Items: ${stats.unique_items}`);
    if (stats.avg_sample_size) {
        console.log(`  Avg Sample Size: ${Math.round(stats.avg_sample_size)}`);
    }
    
    console.log(`\n💡 Tip: Use tools/exportLua.js to generate filtered Lua files from the database`);
    console.log(`   Example: node exportLua.js --min-sample 10`);
    
    await database.close();
}
// Export the scraper when required as a module, and only run main when executed directly
module.exports = { WowheadScraper };

if (require.main === module) {
    main().catch(console.error);
}
