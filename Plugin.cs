using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.OpenWith.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.OpenWith
{
    /// <summary>
    /// The main plugin class for Open with player.
    /// </summary>
    public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
    {
        private readonly ILogger<Plugin> _logger;

        /// <summary>
        /// Initializes a new instance of the <see cref="Plugin"/> class.
        /// </summary>
        /// <param name="applicationPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
        /// <param name="xmlSerializer">Instance of the <see cref="IXmlSerializer"/> interface.</param>
        /// <param name="logger">Instance of the <see cref="ILogger"/> interface.</param>
        public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer, ILogger<Plugin> logger)
            : base(applicationPaths, xmlSerializer)
        {
            Instance = this;
            _logger = logger;

            // Inject script into index.html
            InjectScript(applicationPaths);
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

        private void InjectScript(IApplicationPaths applicationPaths)
        {
            if (string.IsNullOrWhiteSpace(applicationPaths.WebPath))
            {
                _logger.LogWarning("[OpenWith] WebPath is not set, cannot inject script");
                return;
            }

            var indexFile = Path.Combine(applicationPaths.WebPath, "index.html");
            if (!File.Exists(indexFile))
            {
                _logger.LogWarning("[OpenWith] index.html not found at {IndexFile}", indexFile);
                return;
            }

            try
            {
                string indexContents = File.ReadAllText(indexFile);

                // Read our JavaScript file
                var assembly = GetType().Assembly;
                var resourceName = GetType().Namespace + ".Web.js.openWithMenu.js";

                string scriptContent;
                using (var stream = assembly.GetManifestResourceStream(resourceName))
                {
                    if (stream == null)
                    {
                        _logger.LogError("[OpenWith] Could not find embedded resource: {ResourceName}", resourceName);
                        return;
                    }

                    using (var reader = new StreamReader(stream))
                    {
                        scriptContent = reader.ReadToEnd();
                    }
                }

                // Create script element
                string scriptReplace = "<script plugin=\"OpenWith\".*?</script>";
                string scriptElement = string.Format("<script plugin=\"OpenWith\" defer=\"defer\">{0}</script>", scriptContent);

                // Check if already injected
                if (indexContents.Contains("<script plugin=\"OpenWith\""))
                {
                    _logger.LogInformation("[OpenWith] Script already injected in {IndexFile}", indexFile);

                    // Update existing script
                    indexContents = Regex.Replace(indexContents, scriptReplace, scriptElement, RegexOptions.Singleline);
                }
                else
                {
                    _logger.LogInformation("[OpenWith] Injecting script into {IndexFile}", indexFile);

                    // Insert script before closing body tag
                    int bodyClosing = indexContents.LastIndexOf("</body>");
                    if (bodyClosing != -1)
                    {
                        indexContents = indexContents.Insert(bodyClosing, scriptElement);
                    }
                    else
                    {
                        _logger.LogError("[OpenWith] Could not find closing body tag in {IndexFile}", indexFile);
                        return;
                    }
                }

                File.WriteAllText(indexFile, indexContents);
                _logger.LogInformation("[OpenWith] Successfully injected script into {IndexFile}", indexFile);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[OpenWith] Error injecting script into index.html");
            }
        }
    }
}
