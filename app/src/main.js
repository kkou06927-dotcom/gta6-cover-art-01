// PosterForge editor — wires the page around the cover.js core.
// Photos come from files, drag & drop, or the kit samples; panels are
// clicked to select, dragged to reposition, wheeled to zoom. The preview
// canvas is kept at full export resolution, so editing is WYSIWYG.
// A ?shot= query sets up a fixed scene for screenshots.
import { drawCover, panelPolygons, pointInPolygon, LAYOUTS, GRADES } from './cover.js';

const $ = (id) => document.getElementById(id);
const canvas = $('cover');
const ctx = canvas.getContext('2d');

const EXPORT_SIZES = {
  square: [1080, 1080],
  portrait: [1080, 1350],
  wide: [1920, 1080],
};

const state = {
  layout: 'quad',
  grade: 'sunset',
  title: 'Neon Harbor',
  subtitle: 'Vice City Nights',
  sizeKey: 'square',
  panels: [],
  selected: 0,
};

function panelCount() {
  return LAYOUTS[state.layout];
}

function ensurePanels() {
  while (state.panels.length < panelCount()) {
    state.panels.push({ img: null, focusX: 0.5, focusY: 0.5, zoom: 1 });
  }
  state.panels.length = panelCount();
  if (state.selected >= panelCount()) state.selected = 0;
}

function resizeCanvas() {
  const [w, h] = EXPORT_SIZES[state.sizeKey];
  canvas.width = w;
  canvas.height = h;
}

function redraw() {
  resizeCanvas();
  ensurePanels();
  drawCover(ctx, canvas.width, canvas.height, {
    layout: state.layout,
    grade: state.grade,
    title: state.title,
    subtitle: state.subtitle,
    panels: state.panels,
  });
  // Selection ring over the chosen panel.
  const polys = panelPolygons(state.layout, canvas.width, canvas.height);
  const poly = polys[state.selected];
  if (poly) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(4, canvas.width * 0.006);
    ctx.setLineDash([canvas.width * 0.02, canvas.width * 0.012]);
    ctx.stroke();
    ctx.restore();
  }
  renderPanelList();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function placePhoto(img) {
  ensurePanels();
  const p = state.panels[state.selected];
  p.img = img;
  p.focusX = 0.5;
  p.focusY = 0.5;
  p.zoom = 1;
  redraw();
}

async function loadSample(name) {
  const img = await loadImage(`samples/${name}.jpg`);
  await placePhoto(img);
}

function buildLibrary() {
  const lib = $('library');
  lib.innerHTML = '';
  for (const name of ['pier', 'boulevard']) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sample';
    btn.title = `Place ${name} in the selected panel`;
    const img = document.createElement('img');
    img.src = `samples/${name}.jpg`;
    img.alt = name;
    btn.appendChild(img);
    btn.addEventListener('click', () => loadSample(name).catch(() => {}));
    lib.appendChild(btn);
  }
}

function renderPanelList() {
  const list = $('panels');
  list.innerHTML = '';
  state.panels.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'panel-row' + (i === state.selected ? ' selected' : '');
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'panel-label';
    label.textContent = `Panel ${i + 1}${p.img ? ' · photo' : ' · empty'}`;
    label.addEventListener('click', () => {
      state.selected = i;
      redraw();
    });
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'panel-clear';
    clear.textContent = 'Clear';
    clear.disabled = !p.img;
    clear.addEventListener('click', () => {
      p.img = null;
      p.focusX = 0.5;
      p.focusY = 0.5;
      p.zoom = 1;
      redraw();
    });
    row.appendChild(label);
    row.appendChild(clear);
    list.appendChild(row);
  });
  $('zoom').value = String(state.panels[state.selected]?.zoom ?? 1);
}

function bindControls() {
  $('photo').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    for (const f of files) {
      try {
        await placePhoto(await loadImage(URL.createObjectURL(f)));
      } catch {}
    }
    e.target.value = '';
  });

  $('fillAll').addEventListener('click', async () => {
    const img = state.panels[state.selected]?.img;
    if (!img) return;
    ensurePanels();
    for (const p of state.panels) {
      p.img = img;
      p.focusX = 0.5;
      p.focusY = 0.5;
      p.zoom = 1;
    }
    redraw();
  });

  document.querySelectorAll('[data-layout]').forEach((b) => {
    b.addEventListener('click', () => {
      state.layout = b.dataset.layout;
      document.querySelectorAll('[data-layout]').forEach((x) => x.classList.toggle('active', x === b));
      redraw();
    });
  });

  document.querySelectorAll('[data-grade]').forEach((b) => {
    b.addEventListener('click', () => {
      state.grade = b.dataset.grade;
      document.querySelectorAll('[data-grade]').forEach((x) => x.classList.toggle('active', x === b));
      redraw();
    });
  });

  $('title').addEventListener('input', (e) => {
    state.title = e.target.value;
    redraw();
  });
  $('subtitle').addEventListener('input', (e) => {
    state.subtitle = e.target.value;
    redraw();
  });

  $('zoom').addEventListener('input', (e) => {
    const p = state.panels[state.selected];
    if (p) p.zoom = Number(e.target.value);
    redraw();
  });

  $('size').addEventListener('change', (e) => {
    state.sizeKey = e.target.value;
    redraw();
  });

  $('export').addEventListener('click', () => {
    const [w, h] = EXPORT_SIZES[state.sizeKey];
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `posterforge-${w}x${h}.png`;
      a.click();
      $('status').textContent = `Saved posterforge-${w}x${h}.png`;
    }, 'image/png');
  });
}

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * canvas.width,
    y: ((e.clientY - r.top) / r.height) * canvas.height,
  };
}

function panelAt(x, y) {
  const polys = panelPolygons(state.layout, canvas.width, canvas.height);
  for (let i = 0; i < polys.length; i++) {
    if (pointInPolygon(x, y, polys[i])) return i;
  }
  return -1;
}

function bindCanvas() {
  let drag = null;

  canvas.addEventListener('pointerdown', (e) => {
    const { x, y } = canvasPoint(e);
    const i = panelAt(x, y);
    if (i < 0) return;
    state.selected = i;
    const p = state.panels[i];
    drag = { x, y, focusX: p.focusX, focusY: p.focusY, moved: false };
    canvas.setPointerCapture(e.pointerId);
    redraw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { x, y } = canvasPoint(e);
    const p = state.panels[state.selected];
    if (!p || !p.img) return;
    const iw = p.img.naturalWidth;
    const ih = p.img.naturalHeight;
    const polys = panelPolygons(state.layout, canvas.width, canvas.height);
    const poly = polys[state.selected];
    const xs = poly.map((pt) => pt[0]);
    const ys = poly.map((pt) => pt[1]);
    const bw = Math.max(...xs) - Math.min(...xs);
    const bh = Math.max(...ys) - Math.min(...ys);
    const scale = Math.max(bw / iw, bh / ih) * p.zoom;
    const slackX = Math.max(1, iw * scale - bw);
    const slackY = Math.max(1, ih * scale - bh);
    // Dragging the photo right moves it right: focus falls as x rises.
    p.focusX = Math.min(1, Math.max(0, drag.focusX - (x - drag.x) / slackX));
    p.focusY = Math.min(1, Math.max(0, drag.focusY - (y - drag.y) / slackY));
    drag.moved = true;
    redraw();
  });

  canvas.addEventListener('pointerup', () => {
    drag = null;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = state.panels[state.selected];
    if (!p) return;
    p.zoom = Math.min(3, Math.max(1, p.zoom - Math.sign(e.deltaY) * 0.15));
    redraw();
  }, { passive: false });

  canvas.addEventListener('dragover', (e) => e.preventDefault());
  canvas.addEventListener('drop', async (e) => {
    e.preventDefault();
    const { x, y } = canvasPoint(e);
    const i = panelAt(x, y);
    if (i >= 0) state.selected = i;
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    for (const f of files) {
      try {
        await placePhoto(await loadImage(URL.createObjectURL(f)));
      } catch {}
    }
  });
}

async function loadAnton() {
  try {
    const face = new FontFace('Anton', 'url(fonts/Anton-Regular.ttf)');
    await face.load();
    document.fonts.add(face);
  } catch {}
}

async function runShot() {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  if (!shot) return false;
  if (shot === 'cover') document.body.classList.add('shot-cover');
  if (q.get('layout') && LAYOUTS[q.get('layout')]) state.layout = q.get('layout');
  if (q.get('grade') && GRADES[q.get('grade')]) state.grade = q.get('grade');
  if (q.get('title')) {
    state.title = q.get('title');
    $('title').value = state.title;
  }
  if (q.get('subtitle')) {
    state.subtitle = q.get('subtitle');
    $('subtitle').value = state.subtitle;
  }
  const photo = q.get('photo') ?? 'pier';
  try {
    const img = await loadImage(`samples/${photo}.jpg`);
    ensurePanels();
    for (const p of state.panels) {
      p.img = img;
      p.focusX = 0.5;
      p.focusY = 0.5;
      p.zoom = 1;
    }
  } catch {}
  redraw();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
  return true;
}

buildLibrary();
bindControls();
bindCanvas();
ensurePanels();
loadAnton().then(() => {
  if (!runShot()) redraw();
});
redraw();
