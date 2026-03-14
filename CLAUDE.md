# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Jellyfin plugin that adds context menu options to open videos in external players via deep links (IINA, VLC, MPV, etc.). Uses direct streaming with no transcoding.

**Key Architecture Decision:** The plugin directly modifies Jellyfin's `index.html` file at initialization to inject client-side JavaScript. This is necessary because Jellyfin's plugin system doesn't reliably load client JS through the standard `IHasWebPages` interface.

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

1. **Client startup:** `openWithMenu.js` loads from injected script tag
2. **Config fetch:** JS calls `/OpenWith/Config` API endpoint (AllowAnonymous)
3. **Menu injection:** MutationObserver watches for video context menus, adds "Open with..." buttons
4. **Deep link trigger:** Button click constructs URL using template variables and opens deep link

### Data Flow

```
Plugin.Configuration.Players (server config)
    ↓
Api/OpenWithController.GetConfig() [/OpenWith/Config]
    ↓
openWithMenu.js fetches config on page load
    ↓
MutationObserver watches for context menus
    ↓
Injects buttons with deep link URLs
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
