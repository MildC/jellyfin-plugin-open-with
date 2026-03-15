# Jellyfin "Open with player" Plugin

Open video media with external players via deep links (IINA, VLC, MPV, etc.).

## Features

- Add "Open with..." option to video context menus
- Support for multiple external players
- Configurable deep link URL templates
- Direct streaming (no transcoding)
- Admin configuration UI

## Installation

### Method 1: Install via Jellyfin Catalog (Recommended)

1. Open Jellyfin admin dashboard
2. Go to **Dashboard → Plugins → Repositories**
3. Click **"+"** to add a new repository
4. Enter:
   - **Repository Name:** MildC's Plugins
   - **Repository URL:**
     ```
     https://raw.githubusercontent.com/MildC/jellyfin-plugin-open-with/main/manifest.json
     ```
5. Click **Save**
6. Go to **Dashboard → Plugins → Catalog**
7. Find **"Open with player"** and click **Install**
8. **Restart** Jellyfin when prompted
9. Navigate to **Dashboard → Plugins → Open with player** to configure

### Method 2: Manual Installation

1. Download the latest release from [Releases](https://github.com/MildC/jellyfin-plugin-open-with/releases)
2. Extract the zip file to your Jellyfin plugin directory:
   - Linux: `/var/lib/jellyfin/plugins/Jellyfin.Plugin.OpenWith/`
   - Windows: `%AppData%\Jellyfin\Server\plugins\Jellyfin.Plugin.OpenWith\`
   - macOS: `~/.local/share/jellyfin/plugins/Jellyfin.Plugin.OpenWith/`
3. Restart Jellyfin server
4. Navigate to Dashboard → Plugins → Open with player to configure

## Configuration

### Initial Setup

The plugin starts with an empty player list. You'll need to add at least one player.

### Adding Players

1. Go to Dashboard → Plugins → Open with player
2. Click "Add Player" to insert a new row at the top of the table
3. Fill in the fields inline:
   - **Display Name** (optional): Name shown in menu (auto-generated from prefix if empty)
   - **Deep Link Prefix** (required): Protocol prefix ending with `://`
   - **URL Template** (optional): Custom URL pattern (uses default if empty)
4. Click "Save" on the row (changes are saved immediately)

**Note:** Changes are auto-saved when you click the inline Save button. No need for a separate page-level save.

### URL Template Variables

- `{prefix}` - Player's deep link prefix
- `{streamUrl}` - URL-encoded Jellyfin stream URL with API token
- `{itemId}` - Jellyfin item ID
- `{itemName}` - Media name

Default template: `{prefix}weblink?url={streamUrl}`

### Example Configurations

**IINA (macOS):**
- Prefix: `iina://`
- Template: `{prefix}weblink?url={streamUrl}` (default)

**VLC:**
- Prefix: `vlc://`
- Template: `{prefix}{streamUrl}`

**MPV:**
- Prefix: `mpv://`
- Template: `{prefix}{streamUrl}`

## Usage

1. Navigate to any video in Jellyfin (works on both card views and detail pages)
2. Click the three dots menu (context menu)
3. Click "Open with [Player Name]" for the player you want to use
4. The video will open in your player application

**Note:** The player application must be installed on your system and registered for its deep link protocol.

### How It Works

- The plugin injects JavaScript directly into Jellyfin's `index.html` at server startup
- A MutationObserver watches for video context menus
- When a menu appears, the plugin adds "Open with..." buttons for each configured player
- Clicking a button constructs a deep link URL and opens it in your default browser/system handler

## Requirements

- Jellyfin 10.11.0 or later
- External player application installed locally

## Development

### Building

```bash
dotnet build
```

### Testing

1. Build the plugin
2. Copy output to Jellyfin plugin directory
3. Restart Jellyfin
4. Test in Jellyfin web interface

### Project Structure

```
Jellyfin.Plugin.OpenWith/
├── Configuration/         # Configuration model and admin UI
├── Api/                   # REST API endpoints
├── Web/js/                # Client-side JavaScript
├── Plugin.cs              # Main plugin class
└── build.xml              # Plugin manifest
```

## Troubleshooting

### Menu option doesn't appear

- **Restart Jellyfin** after installing or updating the plugin (required to inject script into index.html)
- Check browser console for `[OpenWith]` error messages
- Verify plugin is enabled in Dashboard → Plugins
- Ensure you've added at least one player in the configuration
- Ensure you're clicking on a video item (not audio/image)
- Try hard-refreshing the browser (Ctrl+Shift+R / Cmd+Shift+R)

### Deep link doesn't work

- Verify the player application is installed
- Check that the deep link protocol is registered with your OS
- Test the deep link manually in browser address bar
- Check plugin logs for URL construction errors
- Ensure the deep link prefix ends with `://`

## License

This project is licensed under the MIT License.

## Credits

Inspired by [Jellyfin-OpenWithVLC](https://github.com/J4N0kun/Jellyfin-OpenWithVLC).
