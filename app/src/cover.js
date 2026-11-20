// PosterForge cover core — DOM-free pure Canvas2D.
// drawCover(ctx, width, height, state) paints a GTA-poster-style multi-panel
// cover onto any 2D context: a browser canvas or a Node canvas alike.
// state: {
//   layout: 'duo' | 'trio' | 'quad' | 'five',
//   grade:  'sunset' | 'neon' | 'golden' | 'clean',
//   title: string, subtitle: string,
//   panels: [{ img, focusX, focusY, zoom } | null, ...]  (img = any drawable
//            image with .width/.naturalWidth and .height/.naturalHeight)
// }
// focusX/focusY are 0..1 and map onto the photo's actual slack inside the
// panel, so a photo can never uncover a panel edge at any focus or zoom.

export const LAYOUTS = { duo: 2, trio: 3, quad: 4, five: 5 };

export const GRADES = {
  sunset: {
    sky: ['#ff9a5c', '#ff5e8a', '#7b2d8b'],
    sun: '#ffd319',
    title: ['#ffd319', '#ff2975'],
    stroke: '#1c0b2e',
    subtitle: '#ffffff',
    wash: 'rgba(255, 90, 120, 0.10)',
    glow: 'rgba(255, 94, 138, 0.38)',
    scrim: 'rgba(16, 6, 28, 0.55)',
    palm: 'rgba(24, 8, 40, 0.88)',
  },
  neon: {
    sky: ['#0b0b2e', '#2a0a5e', '#ff2fb3'],
    sun: '#00e5ff',
    title: ['#00e5ff', '#ff2fb3'],
    stroke: '#0a0618',
    subtitle: '#ffffff',
    wash: 'rgba(0, 229, 255, 0.08)',
    glow: 'rgba(123, 47, 247, 0.40)',
    scrim: 'rgba(8, 4, 26, 0.58)',
    palm: 'rgba(6, 4, 20, 0.90)',
  },
  golden: {
    sky: ['#ffd76e', '#ff9a3d', '#b34724'],
    sun: '#fff3b0',
    title: ['#fff3b0', '#ff7a18'],
    stroke: '#2a1206',
    subtitle: '#ffffff',
    wash: 'rgba(255, 160, 60, 0.10)',
    glow: 'rgba(255, 154, 61, 0.36)',
    scrim: 'rgba(26, 12, 4, 0.52)',
    palm: 'rgba(32, 14, 4, 0.88)',
  },
  clean: {
    sky: ['#cfe8ff', '#eef6ff', '#ffffff'],
    sun: '#ffd76e',
    title: ['#ffffff', '#cfe0f2'],
    stroke: '#14213d',
    subtitle: '#ffffff',
    wash: 'rgba(255, 255, 255, 0)',
    glow: 'rgba(20, 33, 61, 0.10)',
    scrim: 'rgba(20, 30, 50, 0.38)',
    palm: 'rgba(20, 33, 61, 0.85)',
  },
};

/** Slanted-polygon panel outlines for a layout, inside a white frame. */
export function panelPolygons(layout, w, h) {
  const n = LAYOUTS[layout] ?? 4;
  const frame = Math.max(6, Math.round(Math.min(w, h) * 0.028));
  const g = Math.max(4, Math.round(w * 0.012));
  const x0 = frame, y0 = frame, x1 = w - frame, y1 = h - frame;
  const pw = x1 - x0;
  const ph = y1 - y0;
  const slant = ph * 0.10;
  const span = pw - slant; // horizontal span shared by top and bottom edges
  const polys = [];
  for (let i = 0; i < n; i++) {
    const topL = x0 + slant + (span / n) * i;
    const topR = x0 + slant + (span / n) * (i + 1);
    const botL = x0 + (span / n) * i;
    const botR = x0 + (span / n) * (i + 1);
    polys.push([
      [topL + g / 2, y0 + g / 2],
      [topR - g / 2, y0 + g / 2],
      [botR - g / 2, y1 - g / 2],
      [botL + g / 2, y1 - g / 2],
    ]);
  }
  return polys;
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function bbox(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function tracePoly(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
}

function drawPalm(ctx, x, y, s, color) {
  // One stylised palm silhouette: curved trunk, five swept fronds.
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, s * 0.045);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + s * 0.08, y - s * 0.55, x + s * 0.22, y - s * 0.95);
  ctx.stroke();
  const cx = x + s * 0.22;
  const cy = y - s * 0.95;
  const fronds = [-2.6, -1.9, -1.2, -0.5, 0.2, 0.9];
  ctx.lineWidth = Math.max(1.5, s * 0.03);
  for (const a of fronds) {
    const tx = cx + Math.cos(a) * s * 0.62;
    const ty = cy + Math.sin(a) * s * 0.42 + s * 0.18;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + Math.cos(a) * s * 0.35, cy + Math.sin(a) * s * 0.1 - s * 0.08, tx, ty);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBackdrop(ctx, poly, grade) {
  const { x, y, w, h } = bbox(poly);
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, grade.sky[0]);
  sky.addColorStop(0.55, grade.sky[1]);
  sky.addColorStop(1, grade.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  // Striped retro sun.
  const r = Math.min(w, h) * 0.27;
  const sx = x + w * 0.5;
  const sy = y + h * 0.34;
  ctx.save();
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = grade.sun;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = grade.sky[1];
  let stripeY = sy + r * 0.05;
  let stripeH = Math.max(2, r * 0.09);
  while (stripeY < sy + r) {
    ctx.fillRect(sx - r, stripeY, r * 2, stripeH);
    stripeY += stripeH * 2.4;
    stripeH *= 1.35;
  }
  ctx.restore();
  // Palm silhouettes along the foot of the panel.
  drawPalm(ctx, x + w * 0.16, y + h * 0.99, Math.min(w, h) * 0.34, grade.palm);
  drawPalm(ctx, x + w * 0.84, y + h * 0.99, Math.min(w, h) * 0.26, grade.palm);
}

function drawPhoto(ctx, poly, panel) {
  const img = panel.img;
  const iw = img.naturalWidth ?? img.width;
  const ih = img.naturalHeight ?? img.height;
  const { x, y, w, h } = bbox(poly);
  const zoom = Math.min(3, Math.max(1, panel.zoom ?? 1));
  const scale = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const fx = Math.min(1, Math.max(0, panel.focusX ?? 0.5));
  const fy = Math.min(1, Math.max(0, panel.focusY ?? 0.5));
  const dx = x - fx * (dw - w);
  const dy = y - fy * (dh - h);
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawTrackedText(ctx, text, cx, baselineY, size, tracking, color) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let px = cx - total / 2;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], px, baselineY);
    px += widths[i] + tracking;
  }
  return total;
}

export function drawCover(ctx, width, height, state) {
  const grade = GRADES[state.grade] ?? GRADES.sunset;
  const polys = panelPolygons(state.layout, width, height);
  const panels = state.panels ?? [];

  // White sheet and frame.
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Panels: photo (cover-fit, focus-safe) or painted backdrop, then grade.
  polys.forEach((poly, i) => {
    const panel = panels[i];
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    if (panel && panel.img) drawPhoto(ctx, poly, panel);
    else drawBackdrop(ctx, poly, grade);
    ctx.fillStyle = grade.wash;
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createLinearGradient(0, height * 0.5, 0, height);
    glow.addColorStop(0, 'rgba(0,0,0,0)');
    glow.addColorStop(1, grade.glow);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  });

  // Bottom scrim so the caption reads over any photo.
  const scrim = ctx.createLinearGradient(0, height * 0.58, 0, height);
  scrim.addColorStop(0, 'rgba(0,0,0,0)');
  scrim.addColorStop(1, grade.scrim);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, width, height);

  // Title: Anton, sheared, auto-fit to 92% of the width, dark stroke,
  // two-stop gradient fill.
  const title = (state.title ?? '').trim().toUpperCase();
  const subtitle = (state.subtitle ?? '').trim().toUpperCase();
  const titleY = height * 0.88;
  const subY = height * 0.945;
  if (title) {
    ctx.save();
    ctx.translate(width / 2, titleY);
    ctx.transform(1, 0, -0.07, 1, 0, 0);
    let size = height * 0.115;
    const fit = () => {
      ctx.font = `${size}px Anton, sans-serif`;
      return ctx.measureText(title).width <= width * 0.92;
    };
    while (size > 14 && !fit()) size -= 2;
    ctx.font = `${size}px Anton, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.1);
    ctx.strokeStyle = grade.stroke;
    ctx.strokeText(title, 0, 0);
    const fill = ctx.createLinearGradient(0, -size * 0.8, 0, size * 0.2);
    fill.addColorStop(0, grade.title[0]);
    fill.addColorStop(1, grade.title[1]);
    ctx.fillStyle = fill;
    ctx.fillText(title, 0, 0);
    ctx.restore();
  }

  // Subtitle: tracked capitals with flanking rules.
  if (subtitle) {
    const size = Math.max(12, height * 0.028);
    ctx.save();
    ctx.font = `700 ${size}px sans-serif`;
    const tracking = size * 0.42;
    const total = drawTrackedText(ctx, subtitle, width / 2, subY, size, tracking, grade.subtitle);
    const ruleGap = size * 0.9;
    const ruleLen = Math.min(width * 0.14, size * 6);
    const ruleY = subY - size * 0.32;
    ctx.strokeStyle = grade.subtitle;
    ctx.lineWidth = Math.max(2, size * 0.09);
    ctx.beginPath();
    ctx.moveTo(width / 2 - total / 2 - ruleGap - ruleLen, ruleY);
    ctx.lineTo(width / 2 - total / 2 - ruleGap, ruleY);
    ctx.moveTo(width / 2 + total / 2 + ruleGap, ruleY);
    ctx.lineTo(width / 2 + total / 2 + ruleGap + ruleLen, ruleY);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
