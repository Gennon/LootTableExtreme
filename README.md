# LootTableExtreme

A World of Warcraft Classic (Vanilla) addon that provides comprehensive loot table information for enemies and items.

## Features

### 1. Enemy Loot Table Viewer
- View complete loot tables for any enemy in the game
- Filter by item quality (Poor, Common, Uncommon, Rare, Epic)
- Filter by minimum drop chance percentage
- Show/hide quest items separately
- Search enemies by name
- View loot for your current target with one click

### 2. Item Tooltip Enhancement
- Hover over any item in your bags to see the top 3 enemies that drop it
- Shows enemy level, zone, elite status, and drop percentage
- Helps you quickly find where to farm specific items

## Installation

1. Copy the `LootTableExtreme` folder to your WoW Classic addons directory:
   - Windows: `C:\Program Files (x86)\World of Warcraft\_classic_\Interface\AddOns\`
   - Mac: `/Applications/World of Warcraft/_classic_/Interface/AddOns/`

2. Restart WoW or reload your UI (`/reload`)

3. The addon should appear in your character selection screen addon list

## Usage

### Commands

- `/lte` or `/loottable` - Toggle the loot table viewer window
- `/lte target` - Show loot table for your current target
- `/lte minimap` - Toggle minimap button visibility
- `/lte help` - Show command list

### Minimap Button

- **Left-click**: Open/close the loot table viewer
- **Right-click**: Show loot for your current target
- **Drag**: Reposition the button around the minimap

### Loot Table Viewer

The main window allows you to:

1. **Search for enemies**: Type an enemy name in the search box and click "Search Enemy"
2. **Show target loot**: Click "Show Target" button or target an enemy and right-click the minimap button
3. **Filter items**: Use the checkboxes to show/hide specific item qualities
4. **Adjust minimum drop chance**: Use the slider to only show items above a certain drop percentage

### Default Filters

By default, the addon shows:
- Quest items (always visible when filter is on)
- Items with >5% drop chance
- Uncommon, Rare, and Epic quality items
- Hides Poor and Common quality items (unless they're above the drop chance threshold)

## Development

### Project Structure

```
LootTableExtreme/
├── LootTableExtreme.toc    # Addon manifest
├── Core.lua                # Main addon initialization
├── Database.lua            # Loot table database
├── UI.xml                  # UI frame definitions
├── LootFrame.lua           # Loot table viewer logic
└── Tooltip.lua             # Tooltip enhancement and minimap button
```

### Expanding the Database

The loot database is stored in `Database.lua` in the `DB.EnemyLoot` table. Each enemy entry follows this structure:

```lua
["Enemy Name"] = {
    npcId = 123,                    -- NPC ID (optional)
    level = {1, 5},                 -- Min and max level
    zone = "Zone Name",             -- Zone where enemy is found
    elite = true,                   -- (optional) If enemy is elite
    loot = {
        {
            itemId = 2589,          -- Item ID
            name = "Item Name",     -- Item name
            quality = DB.Quality.COMMON,  -- Quality (0-4)
            dropChance = 35.2,      -- Drop percentage
            isQuestItem = false,    -- Whether it's a quest item
        },
        -- More items...
    },
},
```

To add more enemies:
1. Find the enemy's loot data (from databases like ClassicDB, Wowhead Classic, etc.)
2. Add a new entry to the `DB.EnemyLoot` table
3. Reload the UI to rebuild the item sources cache

### VSCode Extensions

The following extensions are recommended for development:

- **WoW Bundle** - Complete WoW addon development toolset
- **WoW API** - WoW API IntelliSense and documentation
- **Lua** - Lua language support
- **XML** - XML language support

## Known Limitations

- The current database only includes a small sample of enemies (Defias Bandit, Kobold Tunneler, Hogger)
- You'll need to populate the database with more enemy data for full functionality
- Item icons are not yet implemented (would require actual item data from the game)

## Future Enhancements

- Add more comprehensive enemy database
- Import data from external sources
- Show item icons in the loot table
- Add zone filtering
- Add level range filtering
- Export/import custom loot data
- Track personal loot history

## License

Free to use and modify for personal use.

## Credits

Created for WoW Classic (Vanilla) - Patch 1.15.0
