# Jellyfin "Open with player" Plugin Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Jellyfin plugin that adds context menu options to open videos in external players via deep links (IINA, VLC, etc.).

**Architecture:** Server-side C# plugin with admin configuration UI, REST API endpoint, and client-side JavaScript that uses MutationObserver to inject menu items into Jellyfin's context menus. Direct streaming with no transcoding.

**Tech Stack:** C# .NET (Jellyfin Plugin API), JavaScript (ES6+), HTML/CSS for admin UI

---

## Scope Check

This plan covers a single focused subsystem: a Jellyfin plugin with server-side configuration and client-side menu injection. It's appropriately scoped for one implementation cycle.

## File Structure Overview

```
Jellyfin.Plugin.OpenWith/
├── Jellyfin.Plugin.OpenWith.csproj    # Project file
├── Plugin.cs                          # Main plugin entry point, IPlugin implementation
├── Configuration/
│   ├── PluginConfiguration.cs         # Config model: PluginConfiguration + PlayerConfig
│   └── configPage.html                # Admin UI for managing players
├── Api/
│   └── OpenWithController.cs          # API endpoint: GET /OpenWith/Config
├── Web/
│   └── js/
│       └── openWithMenu.js            # Client-side: MutationObserver, menu injection, deep links
├── build.xml                          # Plugin manifest metadata
└── README.md                          # Installation and usage docs
```

**Design decisions:**
- **Single configuration file** - PluginConfiguration.cs contains both the main config class and PlayerConfig model (they're tightly coupled)
- **Minimal API surface** - One read-only endpoint, no separate service layer needed
- **Self-contained JavaScript** - No build process, ships as single ES6 module
- **Standard Jellyfin patterns** - Follows plugin conventions for configuration, web resources, and API controllers
- **Simplified multiple-player UI** - For multiple players, show all options directly in the context menu rather than implementing a nested submenu. This is simpler to implement and more reliable across Jellyfin's various menu contexts. The spec's submenu approach could be added in a future iteration if needed.

---

## Chunk 1: Project Setup and Configuration Model

### Task 1: Initialize Project Structure

**Files:**
- Create: `Jellyfin.Plugin.OpenWith.csproj`
- Create: `.gitignore`

- [ ] **Step 1: Create .NET project file**

Create `Jellyfin.Plugin.OpenWith.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <RootNamespace>Jellyfin.Plugin.OpenWith</RootNamespace>
    <AssemblyName>Jellyfin.Plugin.OpenWith</AssemblyName>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Jellyfin.Controller" Version="10.8.0" />
    <PackageReference Include="Jellyfin.Model" Version="10.8.0" />
  </ItemGroup>

  <ItemGroup>
    <None Include="Web/**" CopyToOutputDirectory="PreserveNewest" />
    <None Include="Configuration/configPage.html" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>
</Project>
```

- [ ] **Step 2: Create .gitignore**

Create `.gitignore`:

```
bin/
obj/
*.user
*.suo
.vs/
.vscode/
*.DotSettings.user
```

- [ ] **Step 3: Verify project structure**

Run: `dotnet restore`
Expected: Packages restored successfully, no errors

- [ ] **Step 4: Commit**

```bash
git add Jellyfin.Plugin.OpenWith.csproj .gitignore
git commit -m "build: initialize Jellyfin plugin project structure"
```

---

### Task 2: Configuration Model

**Files:**
- Create: `Configuration/PluginConfiguration.cs`

- [ ] **Step 1: Write configuration model classes**

Create `Configuration/PluginConfiguration.cs`:

```csharp
using System;
using System.Collections.Generic;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.OpenWith.Configuration
{
    /// <summary>
    /// Plugin configuration for Open with player.
    /// </summary>
    public class PluginConfiguration : BasePluginConfiguration
    {
        /// <summary>
        /// Gets or sets the list of configured external players.
        /// </summary>
        public List<PlayerConfig> Players { get; set; }

        /// <summary>
        /// Initializes a new instance of the <see cref="PluginConfiguration"/> class.
        /// </summary>
        public PluginConfiguration()
        {
            // Default configuration: IINA player
            Players = new List<PlayerConfig>
            {
                new PlayerConfig
                {
                    Id = "iina",
                    Prefix = "iina://",
                    Name = "IINA",
                    UrlTemplate = null,
                    Enabled = true
                }
            };
        }
    }

    /// <summary>
    /// Configuration for an external player.
    /// </summary>
    public class PlayerConfig
    {
        /// <summary>
        /// Gets or sets the unique identifier for this player.
        /// </summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>
        /// Gets or sets the deep link protocol prefix (e.g., "iina://").
        /// </summary>
        public string Prefix { get; set; } = string.Empty;

        /// <summary>
        /// Gets or sets the display name. If empty, derived from Prefix.
        /// </summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Gets or sets the custom URL template. If null/empty, uses default pattern.
        /// </summary>
        public string? UrlTemplate { get; set; }

        /// <summary>
        /// Gets or sets a value indicating whether this player is enabled.
        /// </summary>
        public bool Enabled { get; set; } = true;
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `dotnet build`
Expected: Build succeeded with no errors

- [ ] **Step 3: Commit**

```bash
git add Configuration/PluginConfiguration.cs
git commit -m "feat: add plugin configuration model with default IINA player"
```

---

### Task 3: Main Plugin Class

**Files:**
- Create: `Plugin.cs`

- [ ] **Step 1: Implement IPlugin interface**

Create `Plugin.cs`:

```csharp
using System;
using System.Collections.Generic;
using Jellyfin.Plugin.OpenWith.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.OpenWith
{
    /// <summary>
    /// The main plugin class for Open with player.
    /// </summary>
    public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
    {
        /// <summary>
        /// Initializes a new instance of the <see cref="Plugin"/> class.
        /// </summary>
        /// <param name="applicationPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
        /// <param name="xmlSerializer">Instance of the <see cref="IXmlSerializer"/> interface.</param>
        public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
            : base(applicationPaths, xmlSerializer)
        {
            Instance = this;
        }

        /// <summary>
        /// Gets the current plugin instance.
        /// </summary>
        public static Plugin? Instance { get; private set; }

        /// <inheritdoc />
        public override string Name => "Open with player";

        /// <inheritdoc />
        public override Guid Id => Guid.Parse("a7d3a7e9-4b3c-4f1e-9d7a-6c5b4a3d2e1f");

        /// <inheritdoc />
        public IEnumerable<PluginPageInfo> GetPages()
        {
            return new[]
            {
                new PluginPageInfo
                {
                    Name = Name,
                    EmbeddedResourcePath = GetType().Namespace + ".Configuration.configPage.html"
                }
            };
        }
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `dotnet build`
Expected: Build succeeded

- [ ] **Step 3: Commit**

```bash
git add Plugin.cs
git commit -m "feat: add main plugin class with configuration page registration"
```

---

### Task 4: Plugin Manifest

**Files:**
- Create: `build.xml`

- [ ] **Step 1: Create plugin manifest**

Create `build.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://schemas.microsoft.com/packaging/2010/07/nuspec.xsd">
  <metadata>
    <id>Jellyfin.Plugin.OpenWith</id>
    <version>1.0.0</version>
    <title>Open with player</title>
    <authors>MildC</authors>
    <owners>MildC</owners>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <description>Open media with external players via deep links (IINA, VLC, etc.)</description>
    <projectUrl>https://github.com/MildC/jellyfin-plugin-open-with</projectUrl>
    <iconUrl>https://raw.githubusercontent.com/jellyfin/jellyfin-ux/master/branding/SVG/icon-transparent.svg</iconUrl>
    <tags>jellyfin plugin player external iina vlc deeplink</tags>
    <category>General</category>
    <releaseNotes>Initial release</releaseNotes>
  </metadata>
</package>
```

- [ ] **Step 2: Commit**

```bash
git add build.xml
git commit -m "build: add plugin manifest metadata"
```

---

## Chunk 2: API Endpoint

### Task 5: API Controller

**Files:**
- Create: `Api/OpenWithController.cs`

- [ ] **Step 1: Create API controller**

Create `Api/OpenWithController.cs`:

```csharp
using System.Collections.Generic;
using Jellyfin.Plugin.OpenWith.Configuration;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.OpenWith.Api
{
    /// <summary>
    /// API controller for Open with player plugin.
    /// </summary>
    [ApiController]
    [Route("OpenWith")]
    public class OpenWithController : ControllerBase
    {
        /// <summary>
        /// Gets the configured players.
        /// </summary>
        /// <returns>List of player configurations.</returns>
        [HttpGet("Config")]
        [ProducesResponseType(typeof(List<PlayerConfig>), 200)]
        public ActionResult<List<PlayerConfig>> GetConfig()
        {
            if (Plugin.Instance?.Configuration?.Players == null)
            {
                return Ok(new List<PlayerConfig>());
            }

            return Ok(Plugin.Instance.Configuration.Players);
        }
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `dotnet build`
Expected: Build succeeded

- [ ] **Step 3: Test endpoint manually (after deployment)**

After deploying plugin to Jellyfin:
1. Start Jellyfin server
2. Browse to: `http://localhost:8096/OpenWith/Config`
3. Expected: JSON array with default IINA player config

- [ ] **Step 4: Commit**

```bash
git add Api/OpenWithController.cs
git commit -m "feat: add API endpoint to serve player configuration"
```

---

## Chunk 3: Admin Configuration UI

### Task 6: Admin Configuration Page

**Files:**
- Create: `Configuration/configPage.html`

- [ ] **Step 1: Create admin UI HTML**

Create `Configuration/configPage.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Open with player - Configuration</title>
</head>
<body>
    <div data-role="page" class="page type-interior pluginConfigurationPage" data-require="emby-input,emby-button,emby-checkbox,emby-select">
        <div data-role="content">
            <div class="content-primary">
                <h1>Open with player - Configuration</h1>
                <p>Configure external players for opening media via deep links.</p>

                <div class="verticalSection">
                    <h2>Configured Players</h2>
                    <div id="playerList"></div>
                    <button is="emby-button" type="button" class="raised button-submit block" id="addPlayerBtn">
                        <span>Add Player</span>
                    </button>
                </div>

                <!-- Player Edit Modal -->
                <div id="playerModal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5);">
                    <div style="background-color: var(--theme-background-color); margin: 10% auto; padding: 20px; border: 1px solid #888; width: 80%; max-width: 600px; border-radius: 4px;">
                        <h2 id="modalTitle">Add Player</h2>
                        <form id="playerForm">
                            <input type="hidden" id="playerId">
                            <input type="hidden" id="playerIndex">

                            <div class="inputContainer">
                                <label for="playerName">Display Name (optional):</label>
                                <input is="emby-input" type="text" id="playerName" placeholder="Leave empty to use prefix name" maxlength="50">
                                <div class="fieldDescription">The name shown in the context menu.</div>
                            </div>

                            <div class="inputContainer">
                                <label for="playerPrefix">Deep Link Prefix (required):</label>
                                <input is="emby-input" type="text" id="playerPrefix" placeholder="iina://" required>
                                <div class="fieldDescription">Must end with "://" (e.g., iina://, vlc://, mpv://)</div>
                            </div>

                            <div class="inputContainer">
                                <label for="playerUrlTemplate">URL Template (optional):</label>
                                <textarea is="emby-textarea" id="playerUrlTemplate" rows="3" placeholder="Leave empty for default pattern"></textarea>
                                <div class="fieldDescription">
                                    Variables: {prefix}, {streamUrl}, {itemId}, {itemName}<br>
                                    Default: {prefix}weblink?url={streamUrl}
                                </div>
                            </div>

                            <div class="checkboxContainer">
                                <label>
                                    <input is="emby-checkbox" type="checkbox" id="playerEnabled" checked>
                                    <span>Enabled</span>
                                </label>
                            </div>

                            <div class="formFooter">
                                <button is="emby-button" type="submit" class="raised button-submit">
                                    <span>Save</span>
                                </button>
                                <button is="emby-button" type="button" class="raised button-cancel" id="cancelBtn">
                                    <span>Cancel</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <div class="verticalSection">
                    <button is="emby-button" type="button" class="raised button-submit block" id="saveBtn">
                        <span>Save Configuration</span>
                    </button>
                </div>
            </div>
        </div>

        <script type="text/javascript">
            (function() {
                const pluginId = 'a7d3a7e9-4b3c-4f1e-9d7a-6c5b4a3d2e1f';
                let config = null;

                // Load configuration
                function loadConfig() {
                    return ApiClient.getPluginConfiguration(pluginId).then(function(cfg) {
                        config = cfg;
                        if (!config.Players) {
                            config.Players = [];
                        }
                        renderPlayerList();
                    });
                }

                // Render player list
                function renderPlayerList() {
                    const container = document.getElementById('playerList');
                    if (!config.Players || config.Players.length === 0) {
                        container.innerHTML = '<p><em>No players configured yet.</em></p>';
                        return;
                    }

                    let html = '<table class="tblPlayers" style="width: 100%; border-collapse: collapse;">';
                    html += '<thead><tr><th>Name</th><th>Prefix</th><th>URL Template</th><th>Enabled</th><th>Actions</th></tr></thead><tbody>';

                    config.Players.forEach(function(player, index) {
                        const displayName = player.Name || player.Prefix.replace('://', '');
                        const templateDisplay = player.UrlTemplate || '<em>Default</em>';
                        const enabledDisplay = player.Enabled ? '✓' : '✗';
                        html += `<tr>
                            <td>${escapeHtml(displayName)}</td>
                            <td>${escapeHtml(player.Prefix)}</td>
                            <td>${templateDisplay}</td>
                            <td>${enabledDisplay}</td>
                            <td>
                                <button is="emby-button" type="button" class="raised button-edit" data-index="${index}">Edit</button>
                                <button is="emby-button" type="button" class="raised button-delete" data-index="${index}">Delete</button>
                            </td>
                        </tr>`;
                    });

                    html += '</tbody></table>';
                    container.innerHTML = html;

                    // Attach event listeners
                    container.querySelectorAll('.button-edit').forEach(function(btn) {
                        btn.addEventListener('click', function() {
                            editPlayer(parseInt(this.getAttribute('data-index')));
                        });
                    });

                    container.querySelectorAll('.button-delete').forEach(function(btn) {
                        btn.addEventListener('click', function() {
                            deletePlayer(parseInt(this.getAttribute('data-index')));
                        });
                    });
                }

                // Escape HTML to prevent XSS
                function escapeHtml(text) {
                    const div = document.createElement('div');
                    div.textContent = text;
                    return div.innerHTML;
                }

                // Add player
                document.getElementById('addPlayerBtn').addEventListener('click', function() {
                    openPlayerModal();
                });

                // Edit player
                function editPlayer(index) {
                    const player = config.Players[index];
                    openPlayerModal(player, index);
                }

                // Delete player
                function deletePlayer(index) {
                    if (!confirm('Remove this player?')) {
                        return;
                    }
                    config.Players.splice(index, 1);
                    renderPlayerList();
                }

                // Open modal
                function openPlayerModal(player, index) {
                    const modal = document.getElementById('playerModal');
                    const form = document.getElementById('playerForm');
                    const title = document.getElementById('modalTitle');

                    title.textContent = player ? 'Edit Player' : 'Add Player';

                    if (player) {
                        document.getElementById('playerId').value = player.Id || '';
                        document.getElementById('playerIndex').value = index;
                        document.getElementById('playerName').value = player.Name || '';
                        document.getElementById('playerPrefix').value = player.Prefix || '';
                        document.getElementById('playerUrlTemplate').value = player.UrlTemplate || '';
                        document.getElementById('playerEnabled').checked = player.Enabled !== false;
                    } else {
                        form.reset();
                        document.getElementById('playerId').value = '';
                        document.getElementById('playerIndex').value = '';
                        document.getElementById('playerEnabled').checked = true;
                    }

                    modal.style.display = 'block';
                }

                // Close modal
                function closePlayerModal() {
                    document.getElementById('playerModal').style.display = 'none';
                }

                document.getElementById('cancelBtn').addEventListener('click', closePlayerModal);

                // Save player
                document.getElementById('playerForm').addEventListener('submit', function(e) {
                    e.preventDefault();

                    const prefix = document.getElementById('playerPrefix').value.trim();
                    const name = document.getElementById('playerName').value.trim();
                    const urlTemplate = document.getElementById('playerUrlTemplate').value.trim();
                    const enabled = document.getElementById('playerEnabled').checked;
                    const index = document.getElementById('playerIndex').value;

                    // Validation
                    if (!prefix) {
                        alert('Prefix is required.');
                        return;
                    }
                    if (!prefix.endsWith('://')) {
                        alert('Prefix must end with "://"');
                        return;
                    }
                    if (urlTemplate && !urlTemplate.includes('{streamUrl}')) {
                        alert('URL template must contain {streamUrl} variable.');
                        return;
                    }

                    const player = {
                        Id: document.getElementById('playerId').value || generateId(),
                        Prefix: prefix,
                        Name: name,
                        UrlTemplate: urlTemplate || null,
                        Enabled: enabled
                    };

                    if (index !== '') {
                        // Edit existing
                        config.Players[parseInt(index)] = player;
                    } else {
                        // Add new
                        config.Players.push(player);
                    }

                    renderPlayerList();
                    closePlayerModal();
                });

                // Generate simple ID
                function generateId() {
                    return 'player-' + Date.now();
                }

                // Save configuration
                document.getElementById('saveBtn').addEventListener('click', function() {
                    Dashboard.showLoadingMsg();
                    ApiClient.updatePluginConfiguration(pluginId, config).then(function() {
                        Dashboard.hideLoadingMsg();
                        Dashboard.alert('Configuration saved successfully.');
                    }).catch(function(error) {
                        Dashboard.hideLoadingMsg();
                        Dashboard.alert('Error saving configuration: ' + error);
                    });
                });

                // Initialize
                loadConfig();
            })();
        </script>
    </div>
</body>
</html>
```

- [ ] **Step 2: Verify it compiles**

Run: `dotnet build`
Expected: Build succeeded, configPage.html copied to output

- [ ] **Step 3: Manual test (after deployment)**

After deploying to Jellyfin:
1. Navigate to Dashboard → Plugins → Open with player
2. Verify page loads with default IINA player
3. Test add player flow
4. Test edit player flow
5. Test delete player flow
6. Test validation (prefix without "://", template without {streamUrl})
7. Save and verify changes persist after page reload

- [ ] **Step 4: Commit**

```bash
git add Configuration/configPage.html
git commit -m "feat: add admin configuration UI with player management"
```

---

## Chunk 4: Client-Side JavaScript

### Task 7: Menu Injection JavaScript

**Files:**
- Create: `Web/js/openWithMenu.js`

- [ ] **Step 1: Create client-side JavaScript module**

Create `Web/js/openWithMenu.js`:

```javascript
(function() {
    'use strict';

    const PLUGIN_NAME = 'OpenWith';
    let playerConfig = [];
    let configLoaded = false;

    /**
     * Log message with plugin prefix
     */
    function log(message, level = 'info') {
        const prefix = `[${PLUGIN_NAME}]`;
        console[level](`${prefix} ${message}`);
    }

    /**
     * Get Jellyfin API client
     */
    function getApiClient() {
        return window.ApiClient || (window.Emby && window.Emby.ApiClient);
    }

    /**
     * Load player configuration from API
     */
    async function loadPlayerConfig() {
        try {
            const response = await fetch('/OpenWith/Config');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            playerConfig = await response.json();
            configLoaded = true;
            log(`Loaded ${playerConfig.length} player(s)`);
        } catch (error) {
            log(`Failed to load config: ${error}. Using default.`, 'warn');
            // Fallback to default IINA config
            playerConfig = [{
                Id: 'iina',
                Prefix: 'iina://',
                Name: 'IINA',
                UrlTemplate: null,
                Enabled: true
            }];
            configLoaded = true;
        }
    }

    /**
     * Get enabled players from config
     */
    function getEnabledPlayers() {
        return playerConfig.filter(p => p.Enabled);
    }

    /**
     * Extract item ID from DOM element
     */
    function getItemId(element) {
        // Check dataset
        if (element.dataset.id) return element.dataset.id;
        if (element.dataset.itemid) return element.dataset.itemid;

        // Check attributes
        const id = element.getAttribute('data-id') || element.getAttribute('data-itemid');
        if (id) return id;

        // Search parent cards
        const itemCard = element.closest('[data-id]');
        if (itemCard && itemCard.dataset.id) return itemCard.dataset.id;

        return null;
    }

    /**
     * Check if item is a video
     */
    async function isVideoItem(itemId) {
        const apiClient = getApiClient();
        if (!apiClient) return false;

        try {
            const item = await apiClient.getItem(apiClient.getCurrentUserId(), itemId);
            return item && item.MediaType === 'Video';
        } catch (error) {
            log(`Failed to get item ${itemId}: ${error}`, 'error');
            return false;
        }
    }

    /**
     * Get direct stream URL for item
     */
    function getDirectStreamUrl(itemId) {
        const apiClient = getApiClient();
        if (!apiClient) {
            log('API client not available', 'error');
            return null;
        }

        const serverUrl = apiClient.serverAddress();
        const accessToken = apiClient.accessToken();

        if (!serverUrl || !accessToken) {
            log('Server URL or access token missing', 'error');
            return null;
        }

        return `${serverUrl}/Videos/${itemId}/stream?Static=true&mediaSourceId=${itemId}&api_key=${accessToken}`;
    }

    /**
     * Build deep link URL for player
     */
    function buildDeepLinkUrl(player, streamUrl, itemId, itemName) {
        const template = player.UrlTemplate || '{prefix}weblink?url={streamUrl}';

        const encodedStreamUrl = encodeURIComponent(streamUrl);
        const encodedItemName = itemName ? encodeURIComponent(itemName) : '';

        return template
            .replace('{prefix}', player.Prefix)
            .replace('{streamUrl}', encodedStreamUrl)
            .replace('{itemId}', itemId)
            .replace('{itemName}', encodedItemName);
    }

    /**
     * Trigger deep link
     */
    function triggerDeepLink(url) {
        const link = document.createElement('a');
        link.href = url;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        log(`Triggered deep link: ${url.substring(0, 50)}...`);
    }

    /**
     * Handle player click
     */
    async function handlePlayerClick(player, itemId) {
        const apiClient = getApiClient();

        // Get stream URL
        const streamUrl = getDirectStreamUrl(itemId);
        if (!streamUrl) {
            alert('Cannot generate stream URL. Please ensure you are logged in.');
            return;
        }

        // Get item name (optional)
        let itemName = '';
        try {
            const item = await apiClient.getItem(apiClient.getCurrentUserId(), itemId);
            itemName = item ? item.Name : '';
        } catch (error) {
            log(`Failed to get item name: ${error}`, 'warn');
        }

        // Build and trigger deep link
        const deepLinkUrl = buildDeepLinkUrl(player, streamUrl, itemId, itemName);
        triggerDeepLink(deepLinkUrl);
    }

    /**
     * Create menu button element
     */
    function createMenuButton(text, iconName, onClick) {
        const button = document.createElement('button');
        button.className = 'listItem listItem-button open-with-menu-item';
        button.setAttribute('is', 'emby-button');
        button.setAttribute('type', 'button');
        button.style.cssText = 'display: flex; align-items: center; padding: 0.5em 1em;';

        button.innerHTML = `
            <span class="listItemIcon material-icons" style="margin-right: 1em;">${iconName}</span>
            <div class="listItemBody">
                <div class="listItemBodyText">${text}</div>
            </div>
        `;

        button.onclick = onClick;
        return button;
    }

    /**
     * Add menu items to context menu
     */
    async function addMenuItems(menu, itemId) {
        // Check if already processed
        if (menu.dataset.openWithProcessed) {
            return;
        }
        menu.dataset.openWithProcessed = 'true';

        // Check if config loaded
        if (!configLoaded) {
            log('Config not loaded yet, skipping menu injection', 'warn');
            return;
        }

        // Check if item is video
        const isVideo = await isVideoItem(itemId);
        if (!isVideo) {
            log(`Item ${itemId} is not a video, skipping`, 'debug');
            return;
        }

        // Get enabled players
        const enabledPlayers = getEnabledPlayers();
        if (enabledPlayers.length === 0) {
            log('No enabled players, skipping menu injection');
            return;
        }

        // Find menu content container
        const menuContent = menu.querySelector('.actionSheetContent, .verticalMenu');
        const container = menuContent || menu;

        // Single player mode - direct menu item
        if (enabledPlayers.length === 1) {
            const player = enabledPlayers[0];
            const displayName = player.Name || player.Prefix.replace('://', '');
            const button = createMenuButton(
                `Open with ${displayName}`,
                'open_in_new',
                (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // Close menu
                    const closeBtn = menu.querySelector('[data-action="close"]');
                    if (closeBtn) closeBtn.click();

                    handlePlayerClick(player, itemId);
                }
            );
            container.appendChild(button);
            log(`Added single player menu item for ${displayName}`);
        }
        // Multiple player mode - submenu (simplified: show all players directly)
        else {
            enabledPlayers.forEach(player => {
                const displayName = player.Name || player.Prefix.replace('://', '');
                const button = createMenuButton(
                    `Open with ${displayName}`,
                    'open_in_new',
                    (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        // Close menu
                        const closeBtn = menu.querySelector('[data-action="close"]');
                        if (closeBtn) closeBtn.click();

                        handlePlayerClick(player, itemId);
                    }
                );
                container.appendChild(button);
            });
            log(`Added ${enabledPlayers.length} player menu items`);
        }
    }

    /**
     * Process context menus in the DOM
     */
    async function processContextMenus() {
        // Find all visible context menus
        const menus = document.querySelectorAll('.menu.show, .actionsheet-content.show');

        for (const menu of menus) {
            if (menu.dataset.openWithProcessed) {
                continue;
            }

            // Try to find item ID from context
            let itemId = null;

            // Look for menu button that triggered this menu
            const menuButtons = document.querySelectorAll('[data-menu-id], .btnCardMenu, .cardMenu');
            for (const btn of menuButtons) {
                const card = btn.closest('[data-id]');
                if (card) {
                    itemId = getItemId(card);
                    if (itemId) break;
                }
            }

            // Fallback: check detail page
            if (!itemId) {
                const detailPage = document.querySelector('[data-id].detailPage-content, [data-id].itemDetailPage');
                if (detailPage) {
                    itemId = getItemId(detailPage);
                }
            }

            if (itemId) {
                await addMenuItems(menu, itemId);
            } else {
                log('Could not find item ID for menu', 'debug');
            }
        }
    }

    /**
     * Initialize plugin
     */
    async function initialize() {
        log('Initializing plugin');

        // Check API client availability
        const apiClient = getApiClient();
        if (!apiClient) {
            log('API client not available, plugin will not function', 'error');
            return;
        }

        // Load configuration
        await loadPlayerConfig();

        // Set up MutationObserver
        const observer = new MutationObserver(() => {
            processContextMenus();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Process any existing menus
        processContextMenus();

        log('Plugin initialized and active');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
```

- [ ] **Step 2: Verify it compiles**

Run: `dotnet build`
Expected: Build succeeded, openWithMenu.js copied to output directory

- [ ] **Step 3: Manual test (after deployment)**

After deploying to Jellyfin:
1. Open Jellyfin web interface
2. Open browser console and look for `[OpenWith]` log messages
3. Navigate to a video item
4. Open context menu (three dots button)
5. Verify "Open with IINA" appears (or "Open with..." if multiple players)
6. Click the menu item
7. Verify deep link triggers (IINA should launch if installed)
8. Test with multiple players configured
9. Test on non-video items (should not show menu)

- [ ] **Step 4: Commit**

```bash
git add Web/js/openWithMenu.js
git commit -m "feat: add client-side JavaScript for menu injection and deep links"
```

---

## Chunk 5: Documentation and Packaging

### Task 8: Documentation

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README**

Create `README.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add comprehensive README with installation and usage"
```

---

### Task 9: Build and Package

**Files:**
- Modify: `Jellyfin.Plugin.OpenWith.csproj`

- [ ] **Step 1: Add build metadata to project file**

Update `Jellyfin.Plugin.OpenWith.csproj` to include version and metadata:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <RootNamespace>Jellyfin.Plugin.OpenWith</RootNamespace>
    <AssemblyName>Jellyfin.Plugin.OpenWith</AssemblyName>
    <AssemblyVersion>1.0.0</AssemblyVersion>
    <FileVersion>1.0.0</FileVersion>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Jellyfin.Controller" Version="10.8.0" />
    <PackageReference Include="Jellyfin.Model" Version="10.8.0" />
  </ItemGroup>

  <ItemGroup>
    <None Include="Web/**" CopyToOutputDirectory="PreserveNewest" />
    <None Include="Configuration/configPage.html" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>
</Project>
```

- [ ] **Step 2: Build release version**

Run: `dotnet build -c Release`
Expected: Build succeeded, output in `bin/Release/net8.0/`

- [ ] **Step 3: Test deployment**

1. Copy contents of `bin/Release/net8.0/` to Jellyfin plugin directory
2. Restart Jellyfin
3. Verify plugin appears in Dashboard → Plugins
4. Run through full test checklist:
   - Admin UI loads and functions
   - API endpoint returns configuration
   - Menu items appear on video context menus
   - Deep links trigger correctly
   - Configuration persists across restarts

- [ ] **Step 4: Commit**

```bash
git add Jellyfin.Plugin.OpenWith.csproj
git commit -m "build: add version metadata and release configuration"
```

---

## Final Testing Checklist

After completing all tasks, perform end-to-end testing:

- [ ] **Configuration Management**
  - Add multiple players (IINA, VLC, MPV)
  - Edit player details
  - Delete a player
  - Disable a player and verify it doesn't appear in menu
  - Configure custom URL template
  - Verify configuration persists after Jellyfin restart

- [ ] **Menu Integration**
  - Test with 1 enabled player - verify shows direct "Open with [Name]" item
  - Test with 2+ enabled players - verify all players shown
  - Test on video items - verify menu appears
  - Test on audio items - verify menu doesn't appear
  - Test on folders - verify menu doesn't appear
  - Test on collection pages - verify menu doesn't appear

- [ ] **Deep Link Functionality**
  - Click menu item - verify player launches (if installed)
  - Test with special characters in video name
  - Test with different video formats (MKV, MP4, AVI)
  - Test without player installed - verify browser shows protocol error

- [ ] **Error Handling**
  - Log out and verify menu doesn't crash
  - Delete all players and verify no menu appears
  - Configure invalid URL template and verify validation

- [ ] **Browser Compatibility**
  - Chrome/Edge
  - Firefox
  - Safari

- [ ] **Performance**
  - No console errors during normal operation
  - Menu appears promptly when opened
  - No memory leaks during extended use

---

## Post-Implementation

After successful testing:

1. Create GitHub repository
2. Push code to repository
3. Create v1.0.0 release with compiled plugin zip
4. Update build.xml with correct project URL
5. Consider submitting to official Jellyfin plugin repository

---

**Plan complete. Ready for execution using @superpowers:subagent-driven-development or @superpowers:executing-plans.**
