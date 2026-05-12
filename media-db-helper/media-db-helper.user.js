// ==UserScript==
// @name         TMDB ↔ TVDB Episode Filler
// @namespace    https://tampermonkey.net/
// @version      4.0
// @description  Bulk add/sync episodes on TVDB and TMDB. Fetch from TMDB or TVDB API. Manual schedule. ID cross-linking.
// @author       You
// @match        https://www.thetvdb.com/series/*/seasons/official/*/bulkadd
// @match        https://www.themoviedb.org/tv/*/season/*/edit*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      api.themoviedb.org
// @connect      api4.thetvdb.com
// @require      https://raw.githubusercontent.com/totza2010/tamper-script/main/media-db-helper/dist/media-db-helper.js
// @updateURL    https://raw.githubusercontent.com/totza2010/tamper-script/main/media-db-helper/dist/media-db-helper.js
// @downloadURL  https://raw.githubusercontent.com/totza2010/tamper-script/main/media-db-helper/dist/media-db-helper.js
// ==/UserScript==
