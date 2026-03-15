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

        // Validate itemId is alphanumeric/UUID format
        if (!/^[a-zA-Z0-9-]+$/.test(itemId)) {
            log(`Invalid item ID format: ${itemId}`, 'error');
            return null;
        }

        const url = new URL(`/Videos/${itemId}/stream`, serverUrl);
        url.searchParams.set('Static', 'true');
        url.searchParams.set('mediaSourceId', itemId);
        url.searchParams.set('api_key', accessToken);

        return url.toString();
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
        log(`Triggered deep link: ${url.split('?')[0]}...`); // Only log path, not query params with token
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
        button.className = 'listItem listItem-button actionSheetMenuItem emby-button';
        button.setAttribute('is', 'emby-button');
        button.setAttribute('type', 'button');

        const icon = document.createElement('span');
        icon.className = 'actionsheetMenuItemIcon listItemIcon listItemIcon-transparent material-icons ' + iconName;
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = iconName;

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'listItemBody actionsheetListItemBody';

        const textDiv = document.createElement('div');
        textDiv.className = 'listItemBodyText actionSheetItemText';
        textDiv.textContent = text; // Safe: uses textContent instead of innerHTML

        bodyDiv.appendChild(textDiv);
        button.appendChild(icon);
        button.appendChild(bodyDiv);
        button.onclick = onClick;

        return button;
    }

    /**
     * Add menu items to context menu
     */
    async function addMenuItems(menu, itemId) {
        // Check if already processed
        if (menu.dataset.openWithMenuAdded) {
            return;
        }
        menu.dataset.openWithMenuAdded = 'true';

        // Load config if not already loaded
        if (!configLoaded) {
            await loadPlayerConfig();
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
        const menuScroller = menu.querySelector('.actionSheetScroller, .verticalMenu');
        if (!menuScroller) {
            log('Menu scroller not found', 'warn');
            return;
        }

        // Find insertion point (after copy-stream button if exists)
        const copyStreamBtn = menuScroller.querySelector('[data-id="copy-stream"]');
        const insertionPoint = copyStreamBtn ? copyStreamBtn.nextSibling : menuScroller.firstChild;

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

            if (copyStreamBtn) {
                copyStreamBtn.parentNode.insertBefore(button, insertionPoint);
            } else {
                menuScroller.insertBefore(button, insertionPoint);
            }

            log(`Added single player menu item for ${displayName}`);
        }
        // Multiple player mode - show all players
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

                if (copyStreamBtn) {
                    copyStreamBtn.parentNode.insertBefore(button, insertionPoint);
                } else {
                    menuScroller.insertBefore(button, insertionPoint);
                }
            });
            log(`Added ${enabledPlayers.length} player menu items`);
        }
    }

    /**
     * Setup click interception on card menu buttons
     */
    function setupCardMenuInterception() {
        document.querySelectorAll('.card[data-mediatype="Video"] .itemAction[data-action="menu"]').forEach(btn => {
            // Avoid duplicates
            if (btn.dataset.openWithIntercepted) return;
            btn.dataset.openWithIntercepted = 'true';

            // Intercept click to capture item ID
            btn.addEventListener('click', function() {
                // Get item ID from parent card
                const card = btn.closest('[data-id]');
                const itemId = card ? getItemId(card) : null;

                if (itemId) {
                    log(`Intercepted card menu click for item: ${itemId}`);
                    scheduleMenuInjection(itemId);
                }
            });
        });
    }

    /**
     * Setup click interception on detail page menu button
     */
    function setupDetailPageMenuInterception() {
        document.querySelectorAll('.mainDetailButtons .btnMoreCommands').forEach(btn => {
            // Avoid duplicates
            if (btn.dataset.openWithIntercepted) return;
            btn.dataset.openWithIntercepted = 'true';

            // Intercept click to capture item ID
            btn.addEventListener('click', function() {
                // Get item ID from sibling buttons on detail page
                let itemId = null;
                const siblings = btn.parentElement?.querySelectorAll('[data-id]');
                if (siblings && siblings.length > 0) {
                    itemId = getItemId(siblings[0]);
                }

                if (itemId) {
                    log(`Intercepted detail page menu click for item: ${itemId}`);
                    scheduleMenuInjection(itemId);
                }
            });
        });
    }

    /**
     * Schedule menu item injection after menu opens
     */
    function scheduleMenuInjection(itemId) {
        // Wait for menu to open, then store itemId on it
        setTimeout(() => {
            const menu = document.querySelector('.actionSheet.opened, .actionsheet.opened, .dialog.opened');
            if (menu) {
                menu.dataset.itemId = itemId;
                log(`Stored itemId on menu: ${itemId}`);
                addMenuItems(menu, itemId);
            }
        }, 150);
    }

    /**
     * Setup click interception on menu buttons
     */
    function setupMenuButtonInterception() {
        setupCardMenuInterception();
        setupDetailPageMenuInterception();
    }

    /**
     * Process context menus in the DOM
     */
    async function processContextMenus() {
        // Find all visible context menus
        const menus = document.querySelectorAll('.actionSheet.opened, .actionsheet.opened, .dialog.opened');

        for (const menu of menus) {
            // Check if itemId was stored during click interception
            const itemId = menu.dataset.itemId;

            if (itemId) {
                await addMenuItems(menu, itemId);
            } else {
                log('Menu found but no itemId stored', 'debug');
            }
        }
    }

    /**
     * Initialize plugin
     */
    function initialize() {
        log('Initializing plugin');

        // Set up MutationObserver immediately (don't wait for API client)
        let debounceTimer;
        const observer = new MutationObserver(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                setupMenuButtonInterception();
                processContextMenus();
            }, 100);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initial setup
        setupMenuButtonInterception();

        log('Plugin initialized and active');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
