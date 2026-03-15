# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Jellyfin plugin that adds context menu options to open videos in external players via deep links (IINA, VLC, MPV, etc.). Uses direct streaming with no transcoding.

**Key Architecture Decisions:**
1. **Direct HTML Injection:** The plugin directly modifies Jellyfin's `index.html` file at initialization to inject client-side JavaScript. This is necessary because Jellyfin's plugin system doesn't reliably load client JS through the standard `IHasWebPages` interface.
2. **No Default Players:** As of v1.0.12, the plugin initializes with an empty player list to prevent duplicate entries on restart. Users must add players via the configuration page.
3. **Auto-Save Configuration:** As of v1.0.13, all configuration changes are immediately persisted when clicking inline Save/Delete buttons (no separate page-level save required).
4. **Inline Table Editing:** Configuration UI uses inline row editing instead of modal dialogs (v1.0.11+).

## Build and Release Commands

```bash
# Build
dotnet clean
dotnet build -c Release

# Quick rebuild and rezip (when fixing existing version)
make rebuild

# Full release workflow (requires VERSION env var)
make VERSION=1.0.6 release

# Individual release steps
make build              # Clean and build
make zip                # Create zip from bin/Release/net9.0
make checksum           # Show MD5 checksum
make update-version     # Update .csproj version (requires VERSION env var)
make update-manifest    # Update manifest.json (requires VERSION, GITHUB_REPO, FILE env vars)
```

**Important:** When creating releases:
1. Update `VERSION` in Makefile before running `make release`
2. The version in manifest.json must match the .csproj version
3. Always run `dotnet clean` before building to ensure assembly version is updated
4. Test the built DLL version: `strings bin/Release/net9.0/Jellyfin.Plugin.OpenWith.dll | grep -E "1\.0\.[0-9]"`

## Architecture

### Runtime JavaScript Injection

**Plugin.cs:InjectScript()** runs at plugin initialization and:
1. Reads `Web/js/openWithMenu.js` from embedded resources
2. Injects it into Jellyfin's `{WebPath}/index.html` before `</body>`
3. Wraps in `<script plugin="OpenWith">` tag for identification
4. Updates existing script if already injected (idempotent)

This approach is based on how `jellyfin-plugin-custom-javascript` works - direct HTML modification is more reliable than plugin page registration for client-side JS.

### Client-Server Communication Flow

1. **Plugin initialization:** `Plugin.cs:InjectScript()` runs at server startup, injects JS into `index.html`
2. **Client startup:** `openWithMenu.js` loads from injected script tag
3. **Config fetch:** JS calls `/OpenWith/Config` API endpoint (AllowAnonymous) on page load
4. **Menu interception:** Click handlers capture item ID from video card/detail page BEFORE menu opens
5. **Menu injection:** MutationObserver detects when context menu appears, adds "Open with..." buttons
6. **Deep link trigger:** Button click constructs URL using template variables and opens deep link

**Critical Implementation Detail:** Item ID must be captured via click interception on the menu button itself (before the menu renders), then stored on the menu element via `menu.dataset.itemId`. The menu DOM doesn't contain item ID information, so it must be captured from the parent context.

### Data Flow

```
Plugin.Configuration.Players (server config, starts empty)
    ↓
Api/OpenWithController.GetConfig() [/OpenWith/Config]
    ↓
openWithMenu.js fetches config on page load
    ↓
Click handlers intercept menu button clicks, capture item ID
    ↓
MutationObserver watches for context menus
    ↓
Injects buttons with deep link URLs using stored item ID
```

### URL Template Variables

Client-side JS replaces these in PlayerConfig.UrlTemplate:
- `{prefix}` - Player's deep link prefix
- `{streamUrl}` - URL-encoded Jellyfin stream URL with API token
- `{itemId}` - Jellyfin item ID
- `{itemName}` - Media name

Default template: `{prefix}weblink?url={streamUrl}`

## Code Organization

```
Plugin.cs                           # Main plugin class, handles index.html injection
Configuration/
  PluginConfiguration.cs            # Config models (PluginConfiguration, PlayerConfig)
  configPage.html                   # Admin UI (embedded resource, uses string concat not template literals)
Api/
  OpenWithController.cs             # REST API endpoint /OpenWith/Config (AllowAnonymous)
Web/js/
  openWithMenu.js                   # Client-side JS (embedded resource, injected at runtime)
scripts/
  update-version.js                 # Updates .csproj version
  update-manifest.js                # Updates manifest.json with new release
Makefile                            # Automated build and release workflow
```

## Important Gotchas

### Configuration Model Changes

**Removed fields (v1.0.12-1.0.13):**
- `Enabled` field removed from `PlayerConfig` - all configured players are now active
- Default IINA player removed - `PluginConfiguration` constructor initializes empty `Players` list
- Separate page-level save button removed - changes auto-save on inline Save/Delete

**Current model:**
- `PlayerConfig.Id` - Unique identifier (GUID)
- `PlayerConfig.Prefix` - Deep link protocol (required)
- `PlayerConfig.Name` - Display name (optional, derived from prefix if empty)
- `PlayerConfig.UrlTemplate` - Custom URL pattern (optional, uses default if empty)

### JavaScript in configPage.html

**Never use ES6 template literals** (`${}`) in `configPage.html` - Jellyfin's resource system strips them when serving embedded HTML. Use string concatenation instead:

```javascript
// ❌ BAD - Jellyfin strips ${} syntax
html += `<td>${escapeHtml(value)}</td>`;

// ✅ GOOD - Use string concatenation
html += '<td>' + escapeHtml(value) + '</td>';
```

### Security Requirements

- Always use `escapeHtml()` when inserting user data into HTML (XSS prevention)
- Use `textContent` instead of `innerHTML` for dynamic content in JS
- Validate item IDs with regex before constructing URLs: `/^[a-zA-Z0-9-]+$/`
- Redact API tokens from logs: `url.split('?')[0]`
- URL construction must use `new URL()` constructor with validation

### Menu Selector Evolution

The correct Jellyfin menu selectors (as of v1.0.8+):
```javascript
// For detecting opened menus
'.actionSheet.opened, .actionsheet.opened, .dialog.opened'

// For intercepting menu button clicks
'.card[data-mediatype="Video"] .itemAction[data-action="menu"]'  // Card views
'.mainDetailButtons .btnMoreCommands'                             // Detail page
```

**Historical note:** Early versions used incorrect selectors (`.menu.show`, `.actionsheet-content.show`) which didn't match Jellyfin's actual DOM structure.

### Item ID Capture Pattern

Item IDs MUST be captured via click event interception on menu buttons before the menu renders:

```javascript
// Card view: item ID is in data-id attribute of ancestor .card
const card = button.closest('.card');
const itemId = card?.dataset?.id;

// Detail page: item ID is in data-itemid of ancestor .page
const page = button.closest('.page');
const itemId = page?.dataset?.itemid;
```

Store the captured ID on the menu element: `menu.dataset.itemId = itemId;`

Then retrieve when injecting buttons in MutationObserver callback.

### Configuration Page Index Handling

**Always use numeric indices** (v1.0.14+):
- Read with `parseInt(dataset.index)` to ensure numeric type
- Compare with `index === -1` for new player detection (not `index === '-1'`)
- Improves consistency between new player rows and existing player editing

### Multiple Plugin Versions

Jellyfin creates versioned directories (e.g., `Open with player_1.0.4`, `Open with player_1.0.5`) and doesn't auto-delete old ones. Users must manually delete old directories after updates to avoid conflicts.

## Git Conventions

- Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- Author: MildC <kevin.xizhu@gmail.com>
- Never commit `.claude/` directory or `*.zip` files (in .gitignore)
- Build warnings treated as errors (`TreatWarningsAsErrors` is true)

## Testing

No automated tests. Manual testing requires:
1. Building and installing plugin in Jellyfin instance
2. Restarting Jellyfin to trigger script injection
3. Checking browser console for `[OpenWith]` log messages
4. Navigating to video item and verifying context menu appears
5. Testing deep link functionality with installed player application

To verify script injection: Check `{WebPath}/index.html` for `<script plugin="OpenWith">` tag.

## Version History & Key Milestones

### v1.0.14 (Current)
- Fix: Consistent numeric index handling in configuration page

### v1.0.13
- **Breaking:** Remove `Enabled` field from PlayerConfig (all players now active)
- Feature: Auto-save on inline Save/Delete (no page-level save button)
- Simplify client JS by removing enabled player filtering

### v1.0.12
- **Breaking:** Remove default IINA player from constructor
- Fix: Prevent duplicate default player entries on restart

### v1.0.11
- Refactor: Replace modal dialog with inline table editing
- Fix: Duplicate icon rendering in menu buttons
- UX: ~150 lines of modal code removed

### v1.0.10
- Fix: Match Jellyfin's exact menu button DOM structure
- Refactor: Separate card menu vs detail page interception logic
- Improve: Item ID detection for detail page context

### v1.0.8-1.0.9
- **Critical Fix:** Correct menu selector (`.actionSheet.opened` not `.menu.show`)
- **Critical Fix:** Implement click interception for item ID capture
- Improve: Initialization timing and lazy-load config

### v1.0.5-1.0.7
- Initial public releases with JavaScript injection approach
- Add build automation (Makefile, version scripts)
- Add CLAUDE.md documentation

### Earlier Versions
- v1.0.0-1.0.4: Development iterations, plugin catalog setup, XSS fixes
