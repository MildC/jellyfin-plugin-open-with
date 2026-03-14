# Jellyfin "Open with player" Plugin - Design Document

**Date:** 2026-03-14
**Owner:** MildC
**Status:** Approved

## Overview

A Jellyfin server-side plugin that adds a context menu option to open video media with external players via deep link URLs. Users can click "Open with [Player]" in the context menu, and the video will launch in their locally installed player (e.g., IINA, VLC) using direct stream with no transcoding.

## Goals

- Add context menu integration for opening videos in external players
- Support configurable deep link prefixes (default: IINA)
- Allow admin to configure multiple players with custom URL templates
- Use direct play/direct stream (no transcoding)
- Provide clean UX: single item for one player, submenu for multiple players

## Non-Goals

- Per-user configuration (admin configures for all users)
- Support for audio/images/collections (video only)
- Userscript version (server plugin only)
- Player detection or installation checking

## Architecture

### Component Overview

The plugin consists of two main components:

**1. Server-Side Plugin (C#/.NET)**
- Standard Jellyfin plugin with manifest and configuration
- Admin configuration page for managing players
- API endpoint to serve player configuration to web client
- Stores configuration in XML file

**2. Client-Side JavaScript Module**
- Injected into Jellyfin web client via plugin web resources (standard Jellyfin plugin pattern - files in `Web/` directory are automatically served)
- Uses MutationObserver to detect context menu appearance
- Adds menu items for configured players
- Constructs deep link URLs and triggers them

### File Structure

```
Jellyfin.Plugin.OpenWith/
├── Configuration/
│   ├── PluginConfiguration.cs      # Configuration model
│   └── configPage.html              # Admin UI
├── Api/
│   └── OpenWithController.cs        # API endpoint
├── Web/
│   └── js/
│       └── openWithMenu.js          # Menu injection logic
├── Plugin.cs                        # Main plugin entry point
└── build.xml                        # Plugin manifest
```

## Data Model

### Player Configuration Object

```javascript
{
  id: "iina",                    // Unique identifier
  prefix: "iina://",             // Required: Deep link protocol prefix
  name: "IINA",                  // Optional: Display name (defaults to prefix without "://")
  urlTemplate: null,             // Optional: Custom template, null means use default
  enabled: true                  // Whether this player is active
}
```

### Default URL Template Pattern

When `urlTemplate` is null, the plugin uses:
```
{prefix}weblink?url={streamUrl}
```

Example: `iina://weblink?url=http%3A%2F%2Fjellyfin%3A8096%2FVideos%2F123%2Fstream%3F...`

### Custom URL Template Variables

- `{prefix}` - Player's deep link prefix (e.g., "iina://")
- `{streamUrl}` - URL-encoded Jellyfin direct stream URL with API token
- `{itemId}` - Jellyfin item ID
- `{itemName}` - Media name (optional)

### Configuration Storage

**Server Plugin Configuration (XML):**
```xml
<PluginConfiguration>
  <Players>
    <Player>
      <Id>iina</Id>
      <Prefix>iina://</Prefix>
      <Name>IINA</Name>
      <UrlTemplate></UrlTemplate>
      <Enabled>true</Enabled>
    </Player>
  </Players>
</PluginConfiguration>
```

**C# Configuration Model:**
```csharp
public class PluginConfiguration : BasePluginConfiguration
{
    public List<PlayerConfig> Players { get; set; }
}

public class PlayerConfig
{
    public string Id { get; set; }
    public string Prefix { get; set; }
    public string Name { get; set; }
    public string UrlTemplate { get; set; }
    public bool Enabled { get; set; }
}
```

### API Endpoint

```csharp
[Route("/OpenWith/Config")]
public ActionResult GetConfig()
{
    return Ok(Plugin.Instance.Configuration.Players);
}
```

Returns JSON array of player configurations to the web client.

## Menu Integration

### Context Menu Detection

The JavaScript uses MutationObserver (following the reference implementation pattern) to watch for Jellyfin's context menus:

```javascript
const observer = new MutationObserver((mutations) => {
    addOpenWithMenu();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});
```

When a menu appears (identified by `.menu.show` or `.actionsheet-content.show`), the plugin:
1. Checks if the menu is for a video item
2. Verifies the menu hasn't been processed already
3. Adds the appropriate menu items

### Video Item Detection

Strategy for determining if context menu is for a video:
- Extract item ID from DOM (`data-id` attribute on parent card)
- Call `apiClient.getItem()` to fetch item metadata
- Check if `MediaType === "Video"`
- Skip for audio, images, folders, collections

### Menu Item Structure

**Single Player Mode (1 enabled player):**
Shows direct menu item "Open with [PlayerName]":

```html
<button class="listItem listItem-button open-with-player" data-player-id="iina">
  <span class="listItemIcon material-icons">open_in_new</span>
  <div class="listItemBody">
    <div class="listItemBodyText">Open with IINA</div>
  </div>
</button>
```

**Multiple Player Mode (2+ enabled players):**
Shows parent item with submenu "Open with...":

```html
<button class="listItem listItem-button open-with-parent">
  <span class="listItemIcon material-icons">open_in_new</span>
  <div class="listItemBody">
    <div class="listItemBodyText">Open with...</div>
  </div>
  <span class="listItemIcon material-icons">chevron_right</span>
</button>
```

Clicking opens submenu with individual player buttons.

### Click Behavior

When user clicks a player menu item:
1. Extract item ID from context
2. Construct stream URL using Jellyfin API client
3. Generate deep link URL using player's template
4. Create temporary `<a>` element with deep link href
5. Programmatically click the link to trigger the deep link
6. Browser/OS launches the player application
7. Context menu closes automatically

### Stream URL Construction

Following the reference implementation for direct play:

```javascript
const apiClient = window.ApiClient;
const serverUrl = apiClient.serverAddress();
const accessToken = apiClient.accessToken();

const streamUrl = `${serverUrl}/Videos/${itemId}/stream?Static=true&mediaSourceId=${itemId}&api_key=${accessToken}`;
```

This ensures:
- Direct streaming (no transcoding)
- Original file quality
- Authentication via API token

## Admin Configuration UI

### Configuration Page (configPage.html)

The admin UI provides a form for managing players:

**Layout:**
- Header: "Open with player - Configuration"
- Player list table showing: Name, Prefix, URL Template (or "Default"), Enabled status, Actions (Edit/Delete)
- "Add Player" button at bottom

**Add/Edit Player Flow:**
1. Click "Add Player" or "Edit" on existing player
2. Modal/form appears with fields:
   - **Display Name** (optional text input) - "Leave empty to use prefix name"
   - **Deep Link Prefix** (required text input) - Must end with "://"
   - **URL Template** (optional textarea) - "Leave empty to use default pattern"
   - **Enabled** (checkbox) - Default: checked
3. Save validates:
   - Prefix is not empty and ends with "://"
   - Prefix doesn't conflict with existing player
   - URL template (if provided) contains valid variables
4. On save: updates configuration, shows success message, refreshes list

**Delete Player Flow:**
1. Click "Delete" button
2. Confirmation dialog: "Remove [PlayerName]?"
3. On confirm: removes from configuration, refreshes list

**Validation Rules:**
- Prefix required, must end with "://"
- Name max length: 50 characters
- URL template variables allowed: `{prefix}`, `{streamUrl}`, `{itemId}`, `{itemName}`
- URL template must contain `{streamUrl}` if provided
- Sanitize all inputs to prevent XSS

## Error Handling

### Missing Configuration
- If no players configured or all disabled: don't add menu items
- If config API fails: log error, fall back to default IINA config

### API Client Unavailable
- If `window.ApiClient` not found: log error, graceful degradation
- Don't inject menu items without API access

### Stream URL Construction Failures
- If server URL or access token missing: show alert "Cannot generate stream URL. Please ensure you're logged in."
- Don't attempt to trigger deep link

### Deep Link Not Triggering
- If player app not installed: browser shows "Protocol not supported"
- This is expected behavior - no special handling needed
- Document in README which players are supported

### Multiple Context Menus
- Track processed menus with `dataset.openWithProcessed` flag
- Don't add duplicate entries to same menu

### Rapid Menu Opening
- Check for existing menu items before adding new ones
- MutationObserver may fire multiple times - handle gracefully

## Testing Strategy

### Configuration Testing
- Add new player via admin UI - verify saves correctly
- Edit existing player - verify changes persist
- Disable player - verify doesn't appear in menu
- Remove player - verify deleted from config
- Configure custom URL template - verify generates correct URLs

### Menu Integration Testing
- Open context menu on video - verify "Open with..." appears
- Test with 1 enabled player - verify shows direct item
- Test with 2+ enabled players - verify shows submenu
- Open context menu on audio/photo - verify no option appears
- Open context menu on folder - verify no option appears

### Deep Link Testing
- Click player menu item - verify deep link triggers
- Test with URL-encoded characters - verify proper encoding
- Test different video formats (mkv, mp4, avi) - verify works
- Test without player installed - verify browser shows error

### Error Case Testing
- Log out of Jellyfin - verify graceful handling
- Configure invalid URL template - verify doesn't crash
- Delete all players - verify menu doesn't appear
- Test with very long video names - verify URL construction works

### Browser Compatibility
- Chrome/Edge (Chromium)
- Firefox
- Safari

### Development Testing
- Enable console logging with `[OpenWith]` prefix
- Log: config loaded, menus detected, URLs generated, errors

## Installation & Deployment

### For Users

1. Download plugin zip from GitHub releases
2. Extract to Jellyfin plugin directory: `/config/plugins/Jellyfin.Plugin.OpenWith/`
3. Restart Jellyfin server
4. Navigate to Dashboard → Plugins → Open with player
5. Configure players in admin UI
6. Refresh browser to load JavaScript

### Plugin Directory Structure After Installation

```
/config/plugins/Jellyfin.Plugin.OpenWith/
├── Jellyfin.Plugin.OpenWith.dll
├── meta.json
└── web/
    └── js/
        └── openWithMenu.js
```

### Development Setup

1. Clone repository
2. Build with `dotnet build`
3. Copy output to Jellyfin plugin directory
4. Or use symbolic link for hot reload during development

### Plugin Manifest (meta.json)

```json
{
  "name": "Open with player",
  "guid": "unique-guid-here",
  "version": "1.0.0",
  "targetAbi": "10.8.0.0",
  "owner": "MildC",
  "description": "Open media with external players via deep links",
  "category": "General"
}
```

### Versioning
- Follow semantic versioning (MAJOR.MINOR.PATCH)
- Maintain changelog in repository
- Tag releases in git

### Distribution
- Host on GitHub releases
- Optionally submit to Jellyfin plugin repository
- Provide installation instructions in README

## Security Considerations

### API Token Exposure
- Stream URL includes API token as query parameter
- Necessary for external player authentication
- Token exposed in deep link URL temporarily
- Risk acceptable: token already in browser memory, deep link is local
- Alternative (cookies) doesn't work for external players

### URL Encoding
- All stream URLs properly URL-encoded before embedding
- Use `encodeURIComponent()` to prevent injection
- Validate player configuration input in admin UI

### XSS Prevention
- Sanitize player names before DOM insertion
- Use `textContent` instead of `innerHTML` where possible
- Admin UI validates and escapes input fields

### Access Control
- Only admins configure players (Jellyfin permission system)
- All users see same menu options
- Jellyfin authentication controls stream URL access

## Performance Considerations

### MutationObserver Optimization
- Observe only `childList` and `subtree` (not attributes)
- Keep handler function lightweight
- Debounce if needed (though menus don't change rapidly)

### Configuration Caching
- Fetch player config once on page load
- Cache in JavaScript variable (no repeated API calls)
- Only refetch on page reload

### DOM Queries
- Use specific selectors (`.menu.show`)
- Exit early if menu already processed
- Minimize DOM traversal

### Memory Management
- MutationObserver runs continuously (expected)
- Clean up processed flags when menus close
- No memory leaks from event listeners (direct onclick)

## Future Enhancements (Out of Scope)

- Per-user player configuration
- Player detection/auto-configuration
- Support for audio files
- Integration with Jellyfin's "Play with" API (if available in future)
- Custom icons per player
- Player capability detection (codec support)

## References

- [Jellyfin-OpenWithVLC Plugin](https://github.com/J4N0kun/Jellyfin-OpenWithVLC) - Reference implementation
- [IINA Deep Link Documentation](https://iina.io/url-schemes/)
- Jellyfin Plugin Development Documentation
