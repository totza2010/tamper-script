// Local test server — serves the freshly built userscript so Tampermonkey can
// load uncommitted changes. Point the script's @require at this URL temporarily:
//
//   // @require http://localhost:8823/sonarr-naming.js
//
// Iterate with `npm run dev` (webpack --watch) in another terminal: every
// request re-reads dist from disk (no-store), so a rebuild + page reload is
// enough. Port is configurable: `PORT=9000 npm run serve`.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "dist", "sonarr-naming.js");
const PORT = Number(process.env.PORT) || 8823;

createServer(async (req, res) => {
    try {
        const js = await readFile(DIST);
        res.writeHead(200, {
            "Content-Type": "text/javascript; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
        });
        res.end(js);
        console.log(new Date().toISOString(), req.method, req.url, "→", js.length, "bytes");
    } catch (e) {
        res.writeHead(500);
        res.end(String(e));
        console.error("failed to read dist — run `npm run build` first:", e.message);
    }
}).listen(PORT, () =>
    console.log(`Serving dist/sonarr-naming.js at http://localhost:${PORT}/sonarr-naming.js`));
