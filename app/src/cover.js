// PosterForge drawing core.
//
// Everything that ends up on a cover is painted here, with nothing but Canvas2D calls: this file never
// touches the DOM, never reads a clock or a random source, and never loads anything. The browser editor
// (src/main.js) imports it to paint the live preview and the exported PNG; a plain Node script can import
// the very same file and paint the very same cover onto a server-side canvas, which is how this entry's
// screenshots were produced — the app's own drawing, not a mock-up of it.
//
// A cover is a stack of slanted photo panels in the poster tradition: white gutters between the panels, a
// white frame around the whole sheet, a colour grade washed over every panel, and a two-line caption —
// a small letter-spaced subtitle riding above a big sheared display title with a heavy dark outline and a
// two-stop gradient fill. Panels with no photo in them are not left blank: the core paints them a graded
// sky with a striped retro sun and palm silhouettes, so an unfinished cover still looks like a poster.

// ---------------------------------------------------------------------------
// Layouts. Each layout is a list of polygons in normalised cover space (0..1 on both axes); neighbouring
// polygons share their edges exactly, so the white gutters drawn over the seams line up. The slants lean
// the way poster panels lean: dividers drift left as they run down the sheet.
// ---------------------------------------------------------------------------

export const LAYOUTS = {
  duo: {
    label: 'Duo — 2 panels',
    panels: [
      [[0, 0], [0.58, 0], [0.42, 1], [0, 1]],
      [[0.58, 0], [1, 0], [1, 1], [0.42, 1]],
    ],
  },
  trio: {
    label: 'Trio — 3 panels',
    panels: [
      [[0, 0], [0.62, 0], [0.50, 1], [0, 1]],
      [[0.62, 0], [1, 0], [1, 0.52], [0.558, 0.52]],
      [[0.558, 0.52], [1, 0.52], [1, 1], [0.50, 1]],
    ],
  },
  quad: {
    label: 'Quad — 4 panels',
    panels: [
      [[0, 0], [0.55, 0], [0.499, 0.510], [0, 0.56]],
      [[0.55, 0], [1, 0], [1, 0.46], [0.499, 0.510]],
      [[0, 0.56], [0.499, 0.510], [0.45, 1], [0, 1]],
      [[0.499, 0.510], [1, 0.46], [1, 1], [0.45, 1]],
    ],
  },
  five: {
    label: 'Five — 5 panels',
    panels: [
      [[0, 0], [0.40, 0], [0.34, 1], [0, 1]],
      [[0.40, 0], [0.72, 0], [0.692, 0.469], [0.37, 0.50]],
      [[0.72, 0], [1, 0], [1, 0.44], [0.692, 0.469]],
      [[0.37, 0.50], [0.692, 0.469], [0.66, 1], [0.34, 1]],
      [[0.692, 0.469], [1, 0.44], [1, 1], [0.66, 1]],
    ],
  },
};

export const LAYOUT_KEYS = Object.keys(LAYOUTS);

// ---------------------------------------------------------------------------
// Colour grades. `sky` is the three-stop backdrop gradient for empty panels, `sun` the backdrop's sun,
// `wash` a translucent colour laid over photographs, `glow` a second wash rising from the bottom edge,
// and `title` the two stops of the caption's gradient fill.
// ---------------------------------------------------------------------------

export const GRADES = {
  vice: {
    label: 'Vice Sunset',
    sky: ['#38155e', '#c73e6d', '#ff9e5e'],
    sun: '#ffd76e',
    wash: 'rgba(255, 94, 98, 0.14)',
    glow: 'rgba(255, 158, 64, 0.20)',
    title: ['#ffe259', '#ff5e62'],
  },
  neon: {
    label: 'Neon Nights',
    sky: ['#0d0b26', '#3b2a6d', '#c81d7e'],
    sun: '#7bf1ff',
    wash: 'rgba(0, 180, 255, 0.12)',
    glow: 'rgba(255, 46, 136, 0.22)',
    title: ['#a8fff9', '#ff2e88'],
  },
  golden: {
    label: 'Golden Hour',
    sky: ['#3d2b52', '#b84a39', '#ffb347'],
    sun: '#fff3b0',
    wash: 'rgba(255, 150, 50, 0.15)',
    glow: 'rgba(255, 190, 90, 0.24)',
    title: ['#fff3b0', '#ff8c42'],
  },
  clean: {
    label: 'Clean',
    sky: ['#2f5d7d', '#7fb0c9', '#f6d8a8'],
    sun: '#fff6d8',
    wash: 'rgba(255, 255, 255, 0.05)',
    glow: 'rgba(255, 220, 160, 0.10)',
    title: ['#ffffff', '#ffd9a0'],
  },
};

export const GRADE_KEYS = Object.keys(GRADES);

// ---------------------------------------------------------------------------
// Geometry helpers.
// ---------------------------------------------------------------------------

// The layout's polygons scaled from normalised space into a width x height cover.
export function panelPolygons(layoutKey, width, height) {
  const layout = LAYOUTS[layoutKey] ?? LAYOUTS.quad;
  return layout.panels.map((poly) => poly.map(([nx, ny]) => [nx * width, ny * height]));
}

function polygonBounds(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function tracePolygon(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
}

// Point-in-polygon test (ray cast), used by the editor for panel picking.
export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// The painted backdrop for a panel with no photo: graded sky, striped sun, palm silhouettes.
// ---------------------------------------------------------------------------

function paintPalm(ctx, baseX, baseY, size, lean, colour) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineCap = 'round';
  // Trunk: a tapering curve rising from the base.
  ctx.lineWidth = size * 0.09;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(baseX + lean * size * 0.3, baseY - size * 0.55, baseX + lean * size, baseY - size);
  ctx.stroke();
  // Fronds: five arcs fanning out of the crown.
  const crownX = baseX + lean * size;
  const crownY = baseY - size;
  ctx.lineWidth = size * 0.055;
  const fronds = [
    [-1.05, -0.30], [-0.55, -0.52], [0, -0.62], [0.55, -0.52], [1.05, -0.30],
  ];
  for (const [dx, dy] of fronds) {
    ctx.beginPath();
    ctx.moveTo(crownX, crownY);
    ctx.quadraticCurveTo(
      crownX + dx * size * 0.55, crownY + dy * size * 0.9,
      crownX + dx * size, crownY + dy * size + size * 0.34,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function paintBackdrop(ctx, bounds, grade) {
  const sky = ctx.createLinearGradient(0, bounds.y, 0, bounds.y + bounds.h);
  sky.addColorStop(0, grade.sky[0]);
  sky.addColorStop(0.55, grade.sky[1]);
  sky.addColorStop(1, grade.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);

  // The retro sun: a disc low in the panel, its lower half cut by sky-coloured stripes that thicken
  // towards the horizon, the classic synthwave-poster trick.
  const sunR = Math.min(bounds.w, bounds.h) * 0.30;
  const sunX = bounds.x + bounds.w * 0.5;
  const sunY = bounds.y + bounds.h * 0.60;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.1, sunX, sunY, sunR);
  sunGrad.addColorStop(0, grade.sun);
  sunGrad.addColorStop(1, grade.sky[2]);
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = grade.sky[2];
  let stripeY = sunY + sunR * 0.08;
  let stripeH = sunR * 0.035;
  while (stripeY < sunY + sunR) {
    ctx.fillRect(sunX - sunR, stripeY, sunR * 2, stripeH);
    stripeY += stripeH + sunR * 0.11;
    stripeH *= 1.45;
  }

  // Palms silhouetted at the panel's bottom corners, scaled to the panel so small panels stay tidy.
  const palmSize = Math.min(bounds.w, bounds.h) * 0.52;
  const ink = 'rgba(24, 8, 28, 0.85)';
  paintPalm(ctx, bounds.x + bounds.w * 0.10, bounds.y + bounds.h * 1.01, palmSize, 0.55, ink);
  paintPalm(ctx, bounds.x + bounds.w * 0.94, bounds.y + bounds.h * 1.01, palmSize * 0.8, -0.6, ink);
}

// ---------------------------------------------------------------------------
// One panel: photo (cover-fit around the panel's focus point) or backdrop, then the grade over it.
// ---------------------------------------------------------------------------

function paintPanel(ctx, poly, panel, grade) {
  const bounds = polygonBounds(poly);
  ctx.save();
  tracePolygon(ctx, poly);
  ctx.clip();
  if (panel && panel.image) {
    const img = panel.image;
    const zoom = panel.zoom ?? 1;
    const scale = Math.max(bounds.w / img.width, bounds.h / img.height) * zoom;
    const drawnW = img.width * scale;
    const drawnH = img.height * scale;
    // The focus point (cx, cy in 0..1) says which part of the photo sits in the panel, mapped onto the
    // slack the scaled photo has inside the bounds — so at 0 the photo's left edge pins to the panel's
    // left edge, at 1 its right edge does, and the photo always covers the whole panel at any focus.
    const focusX = bounds.x + (bounds.w - drawnW / 2) + (panel.cx ?? 0.5) * (drawnW - bounds.w);
    const focusY = bounds.y + (bounds.h - drawnH / 2) + (panel.cy ?? 0.5) * (drawnH - bounds.h);
    ctx.drawImage(img, focusX - drawnW / 2, focusY - drawnH / 2, drawnW, drawnH);
  } else {
    paintBackdrop(ctx, bounds, grade);
  }
  // The grade: a flat wash for the colour cast, then a glow rising from the bottom edge.
  ctx.fillStyle = grade.wash;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  const glow = ctx.createLinearGradient(0, bounds.y + bounds.h, 0, bounds.y + bounds.h * 0.35);
  glow.addColorStop(0, grade.glow);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The caption: subtitle in tracked capitals above the big sheared title.
// ---------------------------------------------------------------------------

function trackedTextWidth(ctx, text, tracking) {
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width;
  return total + tracking * Math.max(0, text.length - 1);
}

function fillTrackedText(ctx, text, centreX, baselineY, tracking) {
  let cursor = centreX - trackedTextWidth(ctx, text, tracking) / 2;
  const previousAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, cursor, baselineY);
    cursor += ctx.measureText(ch).width + tracking;
  }
  ctx.textAlign = previousAlign;
}

function paintCaption(ctx, width, height, state, grade) {
  const title = (state.title ?? '').trim();
  const subtitle = (state.subtitle ?? '').trim();
  if (!title && !subtitle) return;
  const fontFamily = state.fontFamily ?? 'Anton';

  // A soft dark fall-off along the bottom so the lettering sits on the art, never fights it.
  const band = ctx.createLinearGradient(0, height * 0.68, 0, height);
  band.addColorStop(0, 'rgba(12, 4, 22, 0)');
  band.addColorStop(1, 'rgba(12, 4, 22, 0.44)');
  ctx.fillStyle = band;
  ctx.fillRect(0, height * 0.68, width, height * 0.32);

  const centreX = width / 2;
  const titleBase = height * 0.935;

  // Title: fit the size to the sheet, shrinking until the whole line fits inside 92% of the width.
  let titleSize = Math.min(width, height) * 0.205;
  if (title) {
    ctx.font = `${titleSize}px ${fontFamily}`;
    const measured = ctx.measureText(title).width;
    const limit = width * 0.92;
    if (measured > limit) {
      titleSize *= limit / measured;
      ctx.font = `${titleSize}px ${fontFamily}`;
    }
    ctx.save();
    ctx.translate(centreX, titleBase);
    ctx.transform(1, 0, -0.055, 1, 0, 0); // the poster's forward lean
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(10, 2, 18, 0.5)';
    ctx.shadowBlur = titleSize * 0.07;
    ctx.shadowOffsetY = titleSize * 0.045;
    ctx.lineWidth = titleSize * 0.17;
    ctx.strokeStyle = '#1b1030';
    ctx.strokeText(title, 0, 0);
    ctx.shadowColor = 'transparent';
    const fill = ctx.createLinearGradient(0, -titleSize * 0.78, 0, titleSize * 0.12);
    fill.addColorStop(0, grade.title[0]);
    fill.addColorStop(1, grade.title[1]);
    ctx.fillStyle = fill;
    ctx.fillText(title, 0, 0);
    ctx.restore();
  }

  // Subtitle: tracked capitals with a short rule on each side, riding above the title.
  if (subtitle) {
    const subSize = titleSize * 0.30;
    const tracking = subSize * 0.42;
    const subBase = titleBase - titleSize * 1.02;
    ctx.save();
    ctx.font = `${subSize}px ${fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(10, 2, 18, 0.55)';
    ctx.shadowBlur = subSize * 0.18;
    ctx.lineWidth = subSize * 0.14;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1b1030';
    const textWidth = trackedTextWidth(ctx, subtitle, tracking);
    let cursor = centreX - textWidth / 2;
    ctx.textAlign = 'left';
    for (const ch of subtitle) {
      ctx.strokeText(ch, cursor, subBase);
      cursor += ctx.measureText(ch).width + tracking;
    }
    ctx.fillStyle = '#ffffff';
    fillTrackedText(ctx, subtitle, centreX, subBase, tracking);
    // The flanking rules.
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = Math.max(2, subSize * 0.09);
    const ruleY = subBase - subSize * 0.32;
    const ruleLen = width * 0.055;
    const gap = subSize * 0.7;
    ctx.beginPath();
    ctx.moveTo(centreX - textWidth / 2 - gap - ruleLen, ruleY);
    ctx.lineTo(centreX - textWidth / 2 - gap, ruleY);
    ctx.moveTo(centreX + textWidth / 2 + gap, ruleY);
    ctx.lineTo(centreX + textWidth / 2 + gap + ruleLen, ruleY);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// The whole cover.
// ---------------------------------------------------------------------------

export function drawCover(ctx, width, height, state) {
  const grade = GRADES[state.grade] ?? GRADES.vice;
  const polygons = panelPolygons(state.layout, width, height);

  // Base coat in the grade's deep colour: any hairline seam between panels reads as poster shadow.
  ctx.fillStyle = grade.sky[0];
  ctx.fillRect(0, 0, width, height);

  polygons.forEach((poly, i) => {
    paintPanel(ctx, poly, state.panels?.[i], grade);
  });

  // White gutters over every panel edge, then the frame around the sheet.
  const gutter = Math.max(5, width * 0.0075);
  ctx.strokeStyle = '#ffffff';
  ctx.lineJoin = 'round';
  ctx.lineWidth = gutter;
  for (const poly of polygons) {
    tracePolygon(ctx, poly);
    ctx.stroke();
  }

  paintCaption(ctx, width, height, state, grade);

  const frame = Math.max(9, width * 0.011);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = frame;
  ctx.strokeRect(frame / 2, frame / 2, width - frame, height - frame);
}

// A fresh editing state: the quad layout, the Vice grade, no photos yet, and the starter caption.
export function createCoverState() {
  return {
    layout: 'quad',
    grade: 'vice',
    title: 'NEON HARBOR',
    subtitle: 'ONE LAST SCORE',
    fontFamily: 'Anton',
    panels: [],
  };
}

// The panel slots a state needs for its layout, padded with empty panels so indexes always line up.
export function syncPanels(state) {
  const count = (LAYOUTS[state.layout] ?? LAYOUTS.quad).panels.length;
  while (state.panels.length < count) state.panels.push({ image: null, zoom: 1, cx: 0.5, cy: 0.5 });
  state.panels.length = count;
  return state.panels;
}
