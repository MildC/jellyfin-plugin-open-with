# Jellyfin "Open with player" Plugin

Open video media with external players via deep links (IINA, VLC, MPV, etc.).

## Features

- Add "Open with..." option to video context menus
- Support for multiple external players
- Configurable deep link URL templates
- Direct streaming (no transcoding)
- Admin configuration UI

## Installation

1. Download the latest release from [Releases](https://github.com/MildC/jellyfin-plugin-open-with/releases)
2. Extract the zip file to your Jellyfin plugin directory:
   - Linux: `/var/lib/jellyfin/plugins/Jellyfin.Plugin.OpenWith/`
   - Windows: `%AppData%\Jellyfin\Server\plugins\Jellyfin.Plugin.OpenWith\`
   - macOS: `~/.local/share/jellyfin/plugins/Jellyfin.Plugin.OpenWith/`
3. Restart Jellyfin server
4. Navigate to Dashboard → Plugins → Open with player to configure

## Configuration

### Default Player

The plugin ships with IINA pre-configured:
- Prefix: `iina://`
- URL Template: Default (`iina://weblink?url={streamUrl}`)

### Adding Players

1. Go to Dashboard → Plugins → Open with player
2. Click "Add Player"
3. Fill in:
   - **Display Name** (optional): Name shown in menu
   - **Deep Link Prefix** (required): Protocol prefix ending with `://`
   - **URL Template** (optional): Custom URL pattern
   - **Enabled**: Check to activate
4. Click Save

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

1. Navigate to any video in Jellyfin
2. Click the three dots menu (context menu)
3. Click "Open with [Player]" (or "Open with..." for multiple players)
4. The video will open in your player application

**Note:** The player application must be installed on your system and registered for its deep link protocol.

## Requirements

- Jellyfin 10.8.0 or later
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

- Check browser console for `[OpenWith]` error messages
- Verify plugin is enabled in Dashboard → Plugins
- Ensure you're using a video item (not audio/image)
- Try refreshing the browser

### Deep link doesn't work

- Verify the player application is installed
- Check that the deep link protocol is registered with your OS
- Test the deep link manually in browser address bar
- Check plugin logs for URL construction errors

### Configuration doesn't save

- Check Jellyfin logs for errors
- Verify write permissions on plugin configuration directory
- Try restarting Jellyfin after configuration changes

## License

This project is licensed under the MIT License.

## Credits

Inspired by [Jellyfin-OpenWithVLC](https://github.com/J4N0kun/Jellyfin-OpenWithVLC).
