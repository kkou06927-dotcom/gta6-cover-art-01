// PosterForge — my entry for gta6-cover-art-01 (Node 22, standard library only).
// The app is the plain static folder app/ beside this file: index.html and its
// ES modules, no library and no network request, so a desktop browser can open
// it offline. This program hands it in: it copies app/ and screenshots/ to
// /output and writes /output/dossier.json, the summary the judge reads, using
// the vendored make.fun library. The cover maker itself lives in
// app/src/cover.js: a DOM-free Canvas2D core that paints a multi-panel
// GTA-style poster — slanted panels, per-panel photos with focus and zoom,
// painted backdrops where a panel is empty, four colour grades, and a big
// Anton caption — and exports it as a PNG. The two kit sample photos in
// app/samples/ were made for make.fun with an image model and are free to use.
// Screenshots live in screenshots/ (the first by name is the cover).
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of app
// files, in all, or a path under app/ over 1000 bytes: app/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);

console.log('PosterForge handed in: app/ and screenshots/ copied, dossier.json written.');
