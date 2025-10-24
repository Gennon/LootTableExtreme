-- LootTableExtreme Database
-- Contains enemy loot tables for WoW Classic

LootTableExtreme.Database = {}
local DB = LootTableExtreme.Database

-- Item quality constants
DB.Quality = {
    POOR = 0,
    COMMON = 1,
    UNCOMMON = 2,
    RARE = 3,
    EPIC = 4,
}

-- Sample loot table structure
-- Each enemy has a list of items with drop chances and quality
-- This is a starter database - you would expand this significantly
DB.EnemyLoot = {
    -- Example: Defias Bandit (level 1-5 human enemy)
    ["Defias Bandit"] = {
        npcId = 116,
        level = {1, 5},
        zone = "Elwynn Forest",
        loot = {
            {itemId = 2589, name = "Linen Cloth", quality = DB.Quality.COMMON, dropChance = 35.2, isQuestItem = false},
            {itemId = 117, name = "Tough Jerky", quality = DB.Quality.COMMON, dropChance = 15.5, isQuestItem = false},
            {itemId = 159, name = "Refreshing Spring Water", quality = DB.Quality.COMMON, dropChance = 12.8, isQuestItem = false},
            {itemId = 2287, name = "Haunch of Meat", quality = DB.Quality.COMMON, dropChance = 8.3, isQuestItem = false},
            {itemId = 1434, name = "Tattered Bandit Vest", quality = DB.Quality.POOR, dropChance = 6.2, isQuestItem = false},
        },
    },
    
    -- Example: Kobold Tunneler
    ["Kobold Tunneler"] = {
        npcId = 40,
        level = {1, 5},
        zone = "Elwynn Forest",
        loot = {
            {itemId = 2589, name = "Linen Cloth", quality = DB.Quality.COMMON, dropChance = 32.5, isQuestItem = false},
            {itemId = 2886, name = "Crag Boar Rib", quality = DB.Quality.COMMON, dropChance = 18.2, isQuestItem = false},
            {itemId = 774, name = "Malachite", quality = DB.Quality.UNCOMMON, dropChance = 8.5, isQuestItem = false},
            {itemId = 2589, name = "Gold Dust", quality = DB.Quality.COMMON, dropChance = 7.8, isQuestItem = false},
        },
    },
    
    -- Example: Hogger (Elite rare mob)
    ["Hogger"] = {
        npcId = 448,
        level = {11, 11},
        zone = "Elwynn Forest",
        elite = true,
        loot = {
            {itemId = 2589, name = "Linen Cloth", quality = DB.Quality.COMMON, dropChance = 65.3, isQuestItem = false},
            {itemId = 3274, name = "Hogan's Shiv", quality = DB.Quality.UNCOMMON, dropChance = 12.5, isQuestItem = false},
            {itemId = 1177, name = "Hogger's Trousers", quality = DB.Quality.UNCOMMON, dropChance = 10.8, isQuestItem = false},
            {itemId = 2287, name = "Haunch of Meat", quality = DB.Quality.COMMON, dropChance = 45.2, isQuestItem = false},
        },
    },
    
    -- Bristleback Water Seeker
    ["Bristleback Water Seeker"] = {
        npcId = 3261,
        level = {9, 10},
        zone = "Durotar",
        loot = {
            {itemId = 2589, name = "Linen Cloth", quality = DB.Quality.COMMON, dropChance = 42.5, isQuestItem = false},
            {itemId = 769, name = "Chunk of Boar Meat", quality = DB.Quality.COMMON, dropChance = 38.2, isQuestItem = false},
            {itemId = 4865, name = "Ruined Pelt", quality = DB.Quality.POOR, dropChance = 28.5, isQuestItem = false},
            {itemId = 2318, name = "Light Leather", quality = DB.Quality.COMMON, dropChance = 22.3, isQuestItem = false},
            {itemId = 3173, name = "Bristleback Belt", quality = DB.Quality.UNCOMMON, dropChance = 8.5, isQuestItem = false},
            {itemId = 3174, name = "Bristleback Buckler", quality = DB.Quality.UNCOMMON, dropChance = 6.2, isQuestItem = false},
            {itemId = 5571, name = "Small Black Pouch", quality = DB.Quality.COMMON, dropChance = 5.8, isQuestItem = false},
            {itemId = 4795, name = "Bear Meat", quality = DB.Quality.COMMON, dropChance = 3.2, isQuestItem = false},
        },
    },
}

-- Reverse lookup: Find which enemies drop a specific item
-- This is built dynamically from the enemy loot table
DB.ItemSources = {}

function DB:BuildItemSourcesCache()
    self.ItemSources = {}
    
    for enemyName, enemyData in pairs(self.EnemyLoot) do
        if enemyData.loot then
            for _, item in ipairs(enemyData.loot) do
                if not self.ItemSources[item.itemId] then
                    self.ItemSources[item.itemId] = {}
                end
                
                table.insert(self.ItemSources[item.itemId], {
                    enemyName = enemyName,
                    dropChance = item.dropChance,
                    zone = enemyData.zone,
                    level = enemyData.level,
                    elite = enemyData.elite or false,
                })
            end
        end
    end
    
    -- Sort each item's sources by drop chance (highest first)
    for itemId, sources in pairs(self.ItemSources) do
        table.sort(sources, function(a, b)
            return a.dropChance > b.dropChance
        end)
    end
end

-- Get loot table for a specific enemy
-- Enriches the data with item information from WoW API
function DB:GetEnemyLoot(enemyName)
    local enemyData = self.EnemyLoot[enemyName]
    if not enemyData then
        return nil
    end
    
    -- Enrich loot data with WoW item information
    if enemyData.loot then
        for _, item in ipairs(enemyData.loot) do
            if not item.name then
                -- Fetch item data from WoW API
                local itemName, itemLink, itemQuality, _, _, _, _, _, _, itemTexture = GetItemInfo(item.itemId)
                if itemName then
                    item.name = itemName
                    item.quality = itemQuality or DB.Quality.COMMON
                    item.texture = itemTexture
                    
                    -- Check if it's a quest item by scanning tooltip
                    item.isQuestItem = self:IsQuestItem(item.itemId)
                end
            end
        end
    end
    
    return enemyData
end

-- Check if an item is a quest item
function DB:IsQuestItem(itemId)
    -- Create a hidden tooltip to scan the item
    if not self.scanTooltip then
        self.scanTooltip = CreateFrame("GameTooltip", "LootTableExtremeScanTooltip", nil, "GameTooltipTemplate")
        self.scanTooltip:SetOwner(UIParent, "ANCHOR_NONE")
    end
    
    self.scanTooltip:ClearLines()
    self.scanTooltip:SetHyperlink("item:" .. itemId)
    
    -- Check tooltip lines for quest-related text
    for i = 1, self.scanTooltip:NumLines() do
        local line = getglobal("LootTableExtremeScanTooltipTextLeft" .. i)
        if line then
            local text = line:GetText()
            if text and (string.find(text, "Quest") or string.find(text, "Unique")) then
                return true
            end
        end
    end
    
    return false
end

function DB:GetTopItemSources(itemId, maxResults)
    maxResults = maxResults or 3
    local sources = self.ItemSources[itemId]
    
    if not sources then
        return {}
    end
    
    local result = {}
    for i = 1, math.min(maxResults, #sources) do
        table.insert(result, sources[i])
    end
    
    return result
end

-- Search for enemies by name
function DB:SearchEnemies(searchTerm)
    searchTerm = string.lower(searchTerm)
    local results = {}
    
    for enemyName, enemyData in pairs(self.EnemyLoot) do
        if string.find(string.lower(enemyName), searchTerm, 1, true) then
            table.insert(results, {
                name = enemyName,
                zone = enemyData.zone,
                level = enemyData.level,
            })
        end
    end
    
    return results
end

-- Get quality color
function DB:GetQualityColor(quality)
    local colors = {
        [self.Quality.POOR] = {r = 0.62, g = 0.62, b = 0.62},
        [self.Quality.COMMON] = {r = 1.0, g = 1.0, b = 1.0},
        [self.Quality.UNCOMMON] = {r = 0.12, g = 1.0, b = 0.0},
        [self.Quality.RARE] = {r = 0.0, g = 0.44, b = 0.87},
        [self.Quality.EPIC] = {r = 0.64, g = 0.21, b = 0.93},
    }
    
    return colors[quality] or colors[self.Quality.COMMON]
end

-- Get quality text
function DB:GetQualityText(quality)
    local text = {
        [self.Quality.POOR] = "Poor",
        [self.Quality.COMMON] = "Common",
        [self.Quality.UNCOMMON] = "Uncommon",
        [self.Quality.RARE] = "Rare",
        [self.Quality.EPIC] = "Epic",
    }
    
    return text[quality] or "Unknown"
end

-- Initialize the database
DB:BuildItemSourcesCache()
