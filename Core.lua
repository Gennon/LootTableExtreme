-- LootTableExtreme Core
-- Main addon initialization and core functionality

LootTableExtreme = {}
LootTableExtreme.version = "1.0.0"

-- Default settings
local defaults = {
    minimap = {
        hide = false,
        minimapPos = 220,
    },
    filters = {
        showPoor = false,
        showCommon = false,
        showUncommon = true,
        showRare = true,
        showEpic = true,
        showQuestItems = true,
        minDropChance = 5, -- Show items with >5% drop chance by default
    },
    ui = {
        advancedMode = false, -- Start in simple mode by default
    },
}

-- Initialize addon
function LootTableExtreme:Initialize()
    -- Load saved variables or use defaults
    if not LootTableExtremeDB then
        LootTableExtremeDB = {}
    end
    
    -- Merge defaults with saved settings
    self:MergeDefaults(LootTableExtremeDB, defaults)
    
    self:Print("Loaded v" .. self.version)
    self:Print("Type /lte to open the loot table viewer")
    
    -- Initialize UI components
    self:InitializeMinimapButton()
    self:InitializeLootFrame()
    self:InitializeTooltips()
end

-- Merge default values into saved variables
function LootTableExtreme:MergeDefaults(dst, src)
    for k, v in pairs(src) do
        if type(v) == "table" then
            if type(dst[k]) ~= "table" then
                dst[k] = {}
            end
            self:MergeDefaults(dst[k], v)
        elseif dst[k] == nil then
            dst[k] = v
        end
    end
end

-- Print helper function
function LootTableExtreme:Print(msg)
    DEFAULT_CHAT_FRAME:AddMessage("|cff00ff00[LootTableExtreme]|r " .. msg)
end

-- Slash commands
SLASH_LOOTTABLEEXTREME1 = "/lte"
SLASH_LOOTTABLEEXTREME2 = "/loottable"
SlashCmdList["LOOTTABLEEXTREME"] = function(msg)
    msg = string.lower(msg or "")
    
    if msg == "" or msg == "show" then
        LootTableExtreme:ToggleLootFrame()
    elseif msg == "target" then
        LootTableExtreme:ShowTargetLoot()
    elseif msg == "minimap" then
        LootTableExtreme:ToggleMinimapButton()
    elseif msg == "help" then
        LootTableExtreme:Print("Commands:")
        LootTableExtreme:Print("/lte - Toggle loot table window")
        LootTableExtreme:Print("/lte target - Show loot for current target")
        LootTableExtreme:Print("/lte minimap - Toggle minimap button")
    else
        LootTableExtreme:Print("Unknown command. Type /lte help for commands.")
    end
end

-- Event frame
local eventFrame = CreateFrame("Frame")
eventFrame:RegisterEvent("ADDON_LOADED")
eventFrame:RegisterEvent("PLAYER_TARGET_CHANGED")
eventFrame:SetScript("OnEvent", function(self, event, arg1)
    if event == "ADDON_LOADED" and arg1 == "LootTableExtreme" then
        LootTableExtreme:Initialize()
    elseif event == "PLAYER_TARGET_CHANGED" then
        LootTableExtreme:OnTargetChanged()
    end
end)
