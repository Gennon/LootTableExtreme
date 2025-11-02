/**
 * Database Schema and Helper for Wowhead Scraper
 * Stores all scraped data in SQLite for flexible querying and export
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class ScraperDatabase {
    constructor(dbPath = null) {
        this.dbPath = dbPath || path.join(__dirname, 'wowhead_loot.db');
        this.db = null;
    }

    /**
     * Initialize database and create tables
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                console.log(`📦 Database initialized: ${this.dbPath}`);
                this.createTables()
                    .then(() => resolve())
                    .catch(reject);
            });
        });
    }

    /**
     * Create database schema
     */
    async createTables() {
        const schema = `
            -- NPCs/Enemies table
            CREATE TABLE IF NOT EXISTS npcs (
                npc_id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                level_min INTEGER,
                level_max INTEGER,
                zone TEXT,
                elite INTEGER DEFAULT 0,
                classification TEXT,
                health INTEGER,
                mana INTEGER,
                armor INTEGER,
                type TEXT,
                family TEXT,
                faction TEXT,
                reaction_alliance TEXT,
                reaction_horde TEXT,
                scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                url TEXT
            );

            -- Loot drops table
            CREATE TABLE IF NOT EXISTS loot_drops (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                npc_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                item_name TEXT,
                quality INTEGER,
                drop_count INTEGER,
                sample_size INTEGER,
                drop_percent REAL,
                is_quest_item INTEGER DEFAULT 0,
                class_id INTEGER,
                subclass_id INTEGER,
                stack_size TEXT,
                season_id INTEGER,
                scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (npc_id) REFERENCES npcs(npc_id),
                UNIQUE(npc_id, item_id)
            );

            -- Items table (for reference)
            CREATE TABLE IF NOT EXISTS items (
                item_id INTEGER PRIMARY KEY,
                name TEXT,
                quality INTEGER,
                item_level INTEGER,
                required_level INTEGER,
                class_id INTEGER,
                subclass_id INTEGER,
                icon TEXT,
                is_quest_item INTEGER DEFAULT 0,
                bind_type TEXT,
                unique_equipped INTEGER DEFAULT 0,
                max_stack INTEGER,
                scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Scraping session metadata
            CREATE TABLE IF NOT EXISTS scrape_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                npcs_scraped INTEGER DEFAULT 0,
                items_found INTEGER DEFAULT 0,
                errors INTEGER DEFAULT 0,
                status TEXT DEFAULT 'in_progress'
            );

            -- Create indexes for better query performance
            CREATE INDEX IF NOT EXISTS idx_loot_npc ON loot_drops(npc_id);
            CREATE INDEX IF NOT EXISTS idx_loot_item ON loot_drops(item_id);
            CREATE INDEX IF NOT EXISTS idx_loot_quality ON loot_drops(quality);
            CREATE INDEX IF NOT EXISTS idx_loot_percent ON loot_drops(drop_percent);
            CREATE INDEX IF NOT EXISTS idx_npc_name ON npcs(name);
            CREATE INDEX IF NOT EXISTS idx_npc_zone ON npcs(zone);
        `;

        return this.runMultiple(schema);
    }

    /**
     * Run multiple SQL statements
     */
    async runMultiple(sql) {
        return new Promise((resolve, reject) => {
            this.db.exec(sql, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Run a single SQL statement
     */
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    /**
     * Get a single row
     */
    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Get all rows
     */
    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Start a new scraping session
     */
    async startSession() {
        const result = await this.run(
            'INSERT INTO scrape_sessions (started_at) VALUES (CURRENT_TIMESTAMP)'
        );
        return result.lastID;
    }

    /**
     * Complete a scraping session
     */
    async completeSession(sessionId, stats) {
        return this.run(
            `UPDATE scrape_sessions 
             SET completed_at = CURRENT_TIMESTAMP,
                 npcs_scraped = ?,
                 items_found = ?,
                 errors = ?,
                 status = 'completed'
             WHERE id = ?`,
            [stats.npcsScraped, stats.itemsFound, stats.errors, sessionId]
        );
    }

    /**
     * Insert or update NPC data
     */
    async upsertNpc(npcData) {
        const sql = `
            INSERT INTO npcs (
                npc_id, name, level_min, level_max, zone, elite,
                classification, health, mana, armor, type, family,
                faction, reaction_alliance, reaction_horde, url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(npc_id) DO UPDATE SET
                name = excluded.name,
                level_min = excluded.level_min,
                level_max = excluded.level_max,
                zone = excluded.zone,
                elite = excluded.elite,
                classification = excluded.classification,
                health = excluded.health,
                mana = excluded.mana,
                armor = excluded.armor,
                type = excluded.type,
                family = excluded.family,
                faction = excluded.faction,
                reaction_alliance = excluded.reaction_alliance,
                reaction_horde = excluded.reaction_horde,
                url = excluded.url,
                scraped_at = CURRENT_TIMESTAMP
        `;

        return this.run(sql, [
            npcData.npcId,
            npcData.name,
            npcData.levelMin,
            npcData.levelMax,
            npcData.zone,
            npcData.elite ? 1 : 0,
            npcData.classification,
            npcData.health,
            npcData.mana,
            npcData.armor,
            npcData.type,
            npcData.family,
            npcData.faction,
            npcData.reactionAlliance,
            npcData.reactionHorde,
            npcData.url
        ]);
    }

    /**
     * Insert or update loot drop data
     */
    async upsertLootDrop(lootData) {
        const sql = `
            INSERT INTO loot_drops (
                npc_id, item_id, item_name, quality, drop_count,
                sample_size, drop_percent, is_quest_item, class_id,
                subclass_id, stack_size, season_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(npc_id, item_id) DO UPDATE SET
                item_name = excluded.item_name,
                quality = excluded.quality,
                drop_count = excluded.drop_count,
                sample_size = excluded.sample_size,
                drop_percent = excluded.drop_percent,
                is_quest_item = excluded.is_quest_item,
                class_id = excluded.class_id,
                subclass_id = excluded.subclass_id,
                stack_size = excluded.stack_size,
                season_id = excluded.season_id,
                scraped_at = CURRENT_TIMESTAMP
        `;

        return this.run(sql, [
            lootData.npcId,
            lootData.itemId,
            lootData.itemName,
            lootData.quality,
            lootData.dropCount,
            lootData.sampleSize,
            lootData.dropPercent,
            lootData.isQuestItem ? 1 : 0,
            lootData.classId,
            lootData.subclassId,
            lootData.stackSize,
            lootData.seasonId
        ]);
    }

    /**
     * Insert or update item data
     */
    async upsertItem(itemData) {
        const sql = `
            INSERT INTO items (
                item_id, name, quality, item_level, required_level,
                class_id, subclass_id, icon, is_quest_item,
                bind_type, unique_equipped, max_stack
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(item_id) DO UPDATE SET
                name = excluded.name,
                quality = excluded.quality,
                item_level = excluded.item_level,
                required_level = excluded.required_level,
                class_id = excluded.class_id,
                subclass_id = excluded.subclass_id,
                icon = excluded.icon,
                is_quest_item = excluded.is_quest_item,
                bind_type = excluded.bind_type,
                unique_equipped = excluded.unique_equipped,
                max_stack = excluded.max_stack,
                scraped_at = CURRENT_TIMESTAMP
        `;

        return this.run(sql, [
            itemData.itemId,
            itemData.name,
            itemData.quality,
            itemData.itemLevel,
            itemData.requiredLevel,
            itemData.classId,
            itemData.subclassId,
            itemData.icon,
            itemData.isQuestItem ? 1 : 0,
            itemData.bindType,
            itemData.uniqueEquipped ? 1 : 0,
            itemData.maxStack
        ]);
    }

    /**
     * Get statistics about the database
     */
    async getStats() {
        const stats = await this.get(`
            SELECT 
                (SELECT COUNT(*) FROM npcs) as total_npcs,
                (SELECT COUNT(*) FROM loot_drops) as total_drops,
                (SELECT COUNT(DISTINCT item_id) FROM loot_drops) as unique_items,
                (SELECT COUNT(*) FROM items) as items_info,
                (SELECT AVG(drop_count) FROM loot_drops WHERE drop_count > 0) as avg_drop_count,
                (SELECT AVG(sample_size) FROM loot_drops WHERE sample_size > 0) as avg_sample_size
        `);

        return stats;
    }

    /**
     * Get NPCs with unreliable data (low sample size)
     */
    async getUnreliableDrops(minSampleSize = 10) {
        return this.all(`
            SELECT 
                n.name as npc_name,
                ld.item_name,
                ld.drop_count,
                ld.sample_size,
                ld.drop_percent
            FROM loot_drops ld
            JOIN npcs n ON ld.npc_id = n.npc_id
            WHERE ld.sample_size < ? AND ld.sample_size > 0
            ORDER BY ld.sample_size ASC
            LIMIT 100
        `, [minSampleSize]);
    }

    /**
     * Export to Lua format with configurable filters
     */
    async exportToLua(options = {}) {
        const {
            minDropPercent = 0.1,
            minSampleSize = 0,
            excludeQuestItems = false,
            excludeSeasonItems = true
        } = options;

        const npcs = await this.all(`
            SELECT DISTINCT npc_id, name, level_min, level_max, zone, elite
            FROM npcs
            WHERE npc_id IN (SELECT DISTINCT npc_id FROM loot_drops)
            ORDER BY name
        `);

        let lua = `-- Auto-generated loot table database from Wowhead Classic
-- Generated: ${new Date().toISOString()}
-- Total enemies: ${npcs.length}
-- Filters: minDrop=${minDropPercent}%, minSample=${minSampleSize}
-- 
-- This file is automatically loaded by Database.lua
-- DO NOT manually edit this file - it will be overwritten by the scraper

local DB = LootTableExtreme.Database

-- Scraped enemy loot data
DB.ScrapedLoot = {
`;

        for (const npc of npcs) {
            const drops = await this.all(`
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
                npc.npc_id,
                minDropPercent,
                minSampleSize,
                minSampleSize,
                excludeQuestItems ? 1 : 0,
                excludeSeasonItems ? 1 : 0
            ]);

            if (drops.length === 0) continue;

            lua += `    -- ${npc.name}\n`;
            lua += `    ["${npc.name}"] = {\n`;
            lua += `        npcId = ${npc.npc_id},\n`;
            lua += `        level = {${npc.level_min}, ${npc.level_max}},\n`;
            lua += `        zone = "${npc.zone || 'Unknown'}",\n`;
            if (npc.elite) {
                lua += `        elite = true,\n`;
            }
            lua += `        loot = {\n`;

            drops.forEach((drop, index) => {
                const comma = index < drops.length - 1 ? ',' : '';
                lua += `            {itemId = ${drop.item_id}, dropChance = ${drop.drop_percent.toFixed(1)}`;
                
                // Optionally include sample size in comments
                if (drop.sample_size && drop.drop_count) {
                    lua += ` --[[ ${drop.drop_count}/${drop.sample_size} ]]`;
                }
                
                lua += `}${comma}\n`;
            });

            lua += `        },\n`;
            lua += `    },\n\n`;
        }

        lua += `}\n`;

        return lua;
    }

    /**
     * Close database connection
     */
    async close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) reject(err);
                    else {
                        console.log('📦 Database closed');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = { ScraperDatabase };
