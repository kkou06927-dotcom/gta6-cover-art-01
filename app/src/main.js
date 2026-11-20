// PosterForge editor: the page around the drawing core.
//
// This module owns everything the browser adds — the photo library, the panel list, pointer gestures on
// the preview, the caption fields and the PNG export — and keeps one cover state (from src/cover.js) as
// the single thing being edited. Every change simply repaints the preview canvas through drawCover, so
// what you see while editing is pixel-for-pixel what the export writes. Photos are read from the person's
// own machine with object URLs and are never uploaded anywhere; the two bundled samples in app/samples/
// are loaded the same way so the app opens with a poster already on the easel.

import {
  GRADES, GRADE_KEYS, LAYOUTS, LAYOUT_KEYS,
  createCoverState, drawCover, panelPolygons, pointInPolygon, syncPanels,
} from './cover.js';

const EXPORT_SIZES = {
  square: { label: 'Square — 1080 × 1080', width: 1080, height: 1080 },
  portrait: { label: 'Portrait — 1080 × 1350', width: 1080, height: 1350 },
  wide: { label: 'Wide — 1920 × 1080', width: 1920, height: 1080 },
};

const SAMPLES = [
  { name: 'Boulevard (sample)', url: 'samples/boulevard.jpg' },
  { name: 'Pier (sample)', url: 'samples/pier.jpg' },
];

const state = createCoverState();
syncPanels(state);

const library = []; // { id, name, image } — every photo the person has brought in
let selectedPanel = 0;
let nextPhotoId = 1;

const els = {
  canvas: document.getElementById('preview'),
  fileInput: document.getElementById('photo-input'),
  library: document.getElementById('library'),
  layoutSelect: document.getElementById('layout-select'),
  gradeSelect: document.getElementById('grade-select'),
  sizeSelect: document.getElementById('size-select'),
  titleInput: document.getElementById('title-input'),
  subtitleInput: document.getElementById('subtitle-input'),
  panelList: document.getElementById('panel-list'),
  zoomSlider: document.getElementById('zoom-slider'),
  zoomValue: document.getElementById('zoom-value'),
  fillAllButton: document.getElementById('fill-all'),
  clearPanelButton: document.getElementById('clear-panel'),
  exportButton: document.getElementById('export-png'),
  dropHint: document.getElementById('drop-hint'),
};

// ---------------------------------------------------------------------------
// Painting.
// ---------------------------------------------------------------------------

function render() {
  const { width, height } = EXPORT_SIZES[els.sizeSelect.value];
  if (els.canvas.width !== width) els.canvas.width = width;
  if (els.canvas.height !== height) els.canvas.height = height;
  const ctx = els.canvas.getContext('2d');
  drawCover(ctx, width, height, state);
  paintPanelList();
}

function paintPanelList() {
  els.panelList.innerHTML = '';
  state.panels.forEach((panel, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'panel-chip' + (i === selectedPanel ? ' selected' : '');
    const photo = library.find((entry) => entry.image === panel.image);
    item.textContent = `Panel ${i + 1} — ${photo ? photo.name : 'empty (backdrop)'}`;
    item.addEventListener('click', () => {
      selectedPanel = i;
      syncZoomControl();
      render();
    });
    els.panelList.appendChild(item);
  });
  syncZoomControl();
}

function syncZoomControl() {
  const panel = state.panels[selectedPanel];
  const zoom = panel?.zoom ?? 1;
  els.zoomSlider.value = String(zoom);
  els.zoomValue.textContent = `${Math.round(zoom * 100)}%`;
}

// ---------------------------------------------------------------------------
// The photo library.
// ---------------------------------------------------------------------------

function addPhoto(name, image) {
  const entry = { id: nextPhotoId++, name, image };
  library.push(entry);
  const thumb = document.createElement('button');
  thumb.type = 'button';
  thumb.className = 'thumb';
  thumb.title = `${name} — click to place in panel ${selectedPanel + 1}`;
  const img = document.createElement('img');
  img.src = image.src;
  img.alt = name;
  const caption = document.createElement('span');
  caption.textContent = name;
  thumb.append(img, caption);
  thumb.addEventListener('click', () => placeInPanel(entry, selectedPanel));
  els.library.appendChild(thumb);
  return entry;
}

function placeInPanel(entry, panelIndex) {
  const panel = state.panels[panelIndex];
  if (!panel) return;
  panel.image = entry.image;
  panel.zoom = 1;
  panel.cx = 0.5;
  panel.cy = 0.5;
  render();
}

function loadPhotoFile(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.addEventListener('load', () => {
    const entry = addPhoto(file.name, image);
    if (!state.panels.some((panel) => panel.image)) placeInPanel(entry, selectedPanel);
    render();
  });
  image.src = url;
}

function loadSample(sample, assign) {
  const image = new Image();
  image.addEventListener('load', () => {
    const entry = addPhoto(sample.name, image);
    if (assign) assign(entry);
    render();
  });
  image.src = sample.url;
}

// ---------------------------------------------------------------------------
// Controls.
// ---------------------------------------------------------------------------

function fillSelect(select, keys, labels, value) {
  for (const key of keys) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = labels[key];
    select.appendChild(option);
  }
  select.value = value;
}

function wireControls() {
  fillSelect(els.layoutSelect, LAYOUT_KEYS, Object.fromEntries(LAYOUT_KEYS.map((k) => [k, LAYOUTS[k].label])), state.layout);
  fillSelect(els.gradeSelect, GRADE_KEYS, Object.fromEntries(GRADE_KEYS.map((k) => [k, GRADES[k].label])), state.grade);
  fillSelect(els.sizeSelect, Object.keys(EXPORT_SIZES), Object.fromEntries(Object.entries(EXPORT_SIZES).map(([k, v]) => [k, v.label])), 'wide');

  els.layoutSelect.addEventListener('change', () => {
    state.layout = els.layoutSelect.value;
    syncPanels(state);
    if (selectedPanel >= state.panels.length) selectedPanel = 0;
    render();
  });
  els.gradeSelect.addEventListener('change', () => {
    state.grade = els.gradeSelect.value;
    render();
  });
  els.sizeSelect.addEventListener('change', render);
  els.titleInput.addEventListener('input', () => {
    state.title = els.titleInput.value.toUpperCase();
    render();
  });
  els.subtitleInput.addEventListener('input', () => {
    state.subtitle = els.subtitleInput.value.toUpperCase();
    render();
  });
  els.zoomSlider.addEventListener('input', () => {
    const panel = state.panels[selectedPanel];
    if (panel) panel.zoom = Number(els.zoomSlider.value);
    els.zoomValue.textContent = `${Math.round(Number(els.zoomSlider.value) * 100)}%`;
    render();
  });
  els.fillAllButton.addEventListener('click', () => {
    const source = state.panels[selectedPanel];
    if (!source?.image) return;
    for (const panel of state.panels) {
      panel.image = source.image;
      panel.zoom = 1;
      panel.cx = 0.5;
      panel.cy = 0.5;
    }
    render();
  });
  els.clearPanelButton.addEventListener('click', () => {
    const panel = state.panels[selectedPanel];
    if (panel) {
      panel.image = null;
      panel.zoom = 1;
      panel.cx = 0.5;
      panel.cy = 0.5;
    }
    render();
  });
  els.fileInput.addEventListener('change', () => {
    for (const file of els.fileInput.files) loadPhotoFile(file);
    els.fileInput.value = '';
  });
  els.exportButton.addEventListener('click', exportPng);
}

function exportPng() {
  const { width, height } = EXPORT_SIZES[els.sizeSelect.value];
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  drawCover(offscreen.getContext('2d'), width, height, state);
  offscreen.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `posterforge-${width}x${height}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  }, 'image/png');
}

// ---------------------------------------------------------------------------
// Pointer gestures on the preview: click a panel to select it, drag to slide its photo, wheel to zoom.
// ---------------------------------------------------------------------------

function canvasPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (els.canvas.width / rect.width),
    y: (event.clientY - rect.top) * (els.canvas.height / rect.height),
  };
}

function panelAt(x, y) {
  const polygons = panelPolygons(state.layout, els.canvas.width, els.canvas.height);
  for (let i = 0; i < polygons.length; i++) {
    if (pointInPolygon(x, y, polygons[i])) return i;
  }
  return -1;
}

function polygonBoundsOf(poly) {
  const xs = poly.map(([x]) => x);
  const ys = poly.map(([, y]) => y);
  return {
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

function wirePointer() {
  let drag = null;
  els.canvas.addEventListener('pointerdown', (event) => {
    const point = canvasPoint(event);
    const index = panelAt(point.x, point.y);
    if (index === -1) return;
    selectedPanel = index;
    const panel = state.panels[index];
    const polygons = panelPolygons(state.layout, els.canvas.width, els.canvas.height);
    drag = {
      panel,
      bounds: polygonBoundsOf(polygons[index]),
      startX: point.x,
      startY: point.y,
      cx: panel.cx ?? 0.5,
      cy: panel.cy ?? 0.5,
    };
    els.canvas.setPointerCapture(event.pointerId);
    render();
  });
  els.canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const point = canvasPoint(event);
    // The focus point names which part of the photo the panel shows, so dragging the photo right
    // means walking the focus leftwards through the photo (and likewise vertically).
    drag.panel.cx = Math.min(1, Math.max(0, drag.cx - (point.x - drag.startX) / drag.bounds.w));
    drag.panel.cy = Math.min(1, Math.max(0, drag.cy - (point.y - drag.startY) / drag.bounds.h));
    render();
  });
  const endDrag = () => { drag = null; };
  els.canvas.addEventListener('pointerup', endDrag);
  els.canvas.addEventListener('pointercancel', endDrag);
  els.canvas.addEventListener('wheel', (event) => {
    const point = canvasPoint(event);
    const index = panelAt(point.x, point.y);
    if (index === -1) return;
    event.preventDefault();
    selectedPanel = index;
    const panel = state.panels[index];
    panel.zoom = Math.min(3, Math.max(1, (panel.zoom ?? 1) * (event.deltaY < 0 ? 1.06 : 0.94)));
    syncZoomControl();
    render();
  }, { passive: false });

  // Drag and drop: dropping files anywhere on the preview adds them to the library; a drop that lands
  // on a panel also places the first dropped photo into that panel.
  els.canvas.addEventListener('dragover', (event) => {
    event.preventDefault();
    els.dropHint.classList.add('hot');
  });
  els.canvas.addEventListener('dragleave', () => els.dropHint.classList.remove('hot'));
  els.canvas.addEventListener('drop', (event) => {
    event.preventDefault();
    els.dropHint.classList.remove('hot');
    const point = canvasPoint(event);
    const index = panelAt(point.x, point.y);
    const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
    files.forEach((file, i) => {
      if (i === 0 && index !== -1) {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.addEventListener('load', () => {
          const entry = addPhoto(file.name, image);
          placeInPanel(entry, index);
        });
        image.src = url;
      } else {
        loadPhotoFile(file);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Boot: wire everything, load the samples, and paint once the display font is ready.
// ---------------------------------------------------------------------------

wireControls();
wirePointer();
els.titleInput.value = state.title;
els.subtitleInput.value = state.subtitle;

loadSample(SAMPLES[0], (entry) => {
  for (const panel of state.panels) panel.image = entry.image;
});
loadSample(SAMPLES[1], (entry) => {
  const panel = state.panels[state.panels.length - 1];
  if (panel) panel.image = entry.image;
});

if (document.fonts?.load) {
  document.fonts.load('120px Anton').then(() => render()).catch(() => render());
}
render();
