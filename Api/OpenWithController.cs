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
