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
