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
