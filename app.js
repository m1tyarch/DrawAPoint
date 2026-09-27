/**
 * Бесконечный Холст — Основная логика приложения
 * Infinite Canvas Web Application
 */

(function () {
  'use strict';

  // --- Конфигурация и константы ---
  const STORAGE_KEY = 'infinite_canvas_state_v1';
  const MIN_SCALE = 0.05; // 5%
  const MAX_SCALE = 20.0; // 2000%
  const BASE_GRID_STEP = 36;

  // --- Состояние приложения ---
  const state = {
    // Камера / трансформация
    panX: window.innerWidth / 2,
    panY: window.innerHeight / 2,
    scale: 1.0,

    // Active tool
    activeTool: 'pen', // 'pen' | 'eraser' | 'hand'
    color: '#ffffff',
    size: 5,
    gridType: 'dots', // 'dots' | 'lines' | 'none'
    theme: 'dark', // 'dark' | 'light'

    // Данные рисунка
    strokes: [], // массив объектов Stroke
    history: [], // стек отмены
    redoStack: [], // стек повтора

    // Состояния взаимодействия
    isInteracting: false,
    isPanning: false,
    spacePressed: false,
    activePointers: new Map(), // pointerId -> { x, y, sx, sy }
    currentStroke: null, // текущий штрих во время рисования
    lastPointerPos: { x: 0, y: 0 },
    touchStartDist: 0,
    touchStartCenter: { x: 0, y: 0 },
    touchStartPan: { x: 0, y: 0 },
    touchStartScale: 1.0,

    // Настройки интерфейса
    uiHidden: false,
  };

  // --- DOM-элементы ---
  const container = document.getElementById('canvas-container');
  const mainCanvas = document.getElementById('main-canvas');
  const mainCtx = mainCanvas.getContext('2d');
  const activeCanvas = document.getElementById('active-canvas');
  const activeCtx = activeCanvas.getContext('2d');

  // Панели и кнопки
  const toolbar = document.getElementById('toolbar');
  const toolButtons = document.querySelectorAll('.tool-btn');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const customColorInput = document.getElementById('custom-color-input');
  const customColorPreview = document.getElementById('custom-color-preview');
  const sizeButtons = document.querySelectorAll('.size-btn');
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnClear = document.getElementById('btn-clear');
  const btnMenuToggle = document.getElementById('btn-menu-toggle');
  const dropdownMenu = document.getElementById('dropdown-menu');
  const zoomPercentage = document.getElementById('zoom-percentage');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomReset = document.getElementById('btn-zoom-reset');
  const btnFitView = document.getElementById('btn-fit-view');
  const btnToggleUi = document.getElementById('btn-toggle-ui');
  const gridSelectors = document.querySelectorAll('#grid-selector .pill-opt');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const menuShortcuts = document.getElementById('menu-shortcuts');
  const modalShortcuts = document.getElementById('modal-shortcuts');
  const btnCloseShortcuts = document.getElementById('btn-close-shortcuts');
  const btnAckShortcuts = document.getElementById('btn-ack-shortcuts');
  const modalClearConfirm = document.getElementById('modal-clear-confirm');
  const btnCancelClear = document.getElementById('btn-cancel-clear');
  const btnConfirmClear = document.getElementById('btn-confirm-clear');
  const toastContainer = document.getElementById('toast-container');

  // --- Преобразование координат ---

  /** Перевод экранных пикселей в мировые координаты */
  function screenToWorld(sx, sy) {
    return {
      x: (sx - state.panX) / state.scale,
      y: (sy - state.panY) / state.scale,
    };
  }

  /** Перевод мировых координат в экранные пиксели */
  function worldToScreen(wx, wy) {
    return {
      x: wx * state.scale + state.panX,
      y: wy * state.scale + state.panY,
    };
  }

  // --- Масштабирование и холст (DPI) ---
  let dpr = window.devicePixelRatio || 1;

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    mainCanvas.width = Math.round(w * dpr);
    mainCanvas.height = Math.round(h * dpr);
    activeCanvas.width = Math.round(w * dpr);
    activeCanvas.height = Math.round(h * dpr);

    mainCanvas.style.width = w + 'px';
    mainCanvas.style.height = h + 'px';
    activeCanvas.style.width = w + 'px';
    activeCanvas.style.height = h + 'px';

    redrawMainCanvas();
  }

  window.addEventListener('resize', resizeCanvas);

  // --- Отрисовка сетки и фона ---
  function renderGrid(ctx, w, h) {
    if (state.gridType === 'none') return;

    const isDark = state.theme === 'dark';
    const gridDotColor = isDark ? '#2a2e36' : '#cbd5e1';
    const gridLineColor = isDark ? '#1e2126' : '#e2e8f0';

    // Адаптивный шаг сетки в зависимости от масштаба
    let step = BASE_GRID_STEP;
    let visualStep = step * state.scale;
    while (visualStep < 20) {
      step *= 2;
      visualStep = step * state.scale;
    }
    while (visualStep > 120) {
      step /= 2;
      visualStep = step * state.scale;
    }

    const minX = Math.floor((-state.panX / state.scale) / step) * step;
    const maxX = Math.ceil(((w - state.panX) / state.scale) / step) * step;
    const minY = Math.floor((-state.panY / state.scale) / step) * step;
    const maxY = Math.ceil(((h - state.panY) / state.scale) / step) * step;

    if (state.gridType === 'dots') {
      ctx.fillStyle = gridDotColor;
      const dotRadius = Math.max(0.75, 1.2 / state.scale);

      ctx.beginPath();
      for (let x = minX; x <= maxX; x += step) {
        for (let y = minY; y <= maxY; y += step) {
          ctx.moveTo(x + dotRadius, y);
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    } else if (state.gridType === 'lines') {
      ctx.strokeStyle = gridLineColor;
      ctx.lineWidth = 1 / state.scale;

      ctx.beginPath();
      for (let x = minX; x <= maxX; x += step) {
        ctx.moveTo(x, minY);
        ctx.lineTo(x, maxY);
      }
      for (let y = minY; y <= maxY; y += step) {
        ctx.moveTo(minX, y);
        ctx.lineTo(maxX, y);
      }
      ctx.stroke();
    }
  }

  // --- Draw individual stroke ---
  function renderStroke(ctx, stroke) {
    const pts = stroke.points;
    if (!pts || pts.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.globalCompositeOperation = 'source-over';

    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, Math.max(1, ctx.lineWidth / 2), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Сглаживание квадратичными кривыми Безье
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }

    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();

    ctx.restore();
  }

  // --- Full redraw of main canvas ---
  let redrawPending = false;
  function scheduleRedraw() {
    if (redrawPending) return;
    redrawPending = true;
    requestAnimationFrame(() => {
      redrawPending = false;
      redrawMainCanvas();
      if (state.currentStroke) {
        redrawActiveCanvas();
      }
    });
  }

  function redrawMainCanvas() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    mainCtx.setTransform(1, 0, 0, 1, 0, 0);
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

    // Устанавливаем матрицу камеры с учетом DPR
    mainCtx.setTransform(
      state.scale * dpr, 0,
      0, state.scale * dpr,
      state.panX * dpr, state.panY * dpr
    );

    // Сетка
    renderGrid(mainCtx, w, h);

    // Видимая область для отсечения (Viewport Culling)
    const viewLeft = -state.panX / state.scale;
    const viewTop = -state.panY / state.scale;
    const viewRight = (w - state.panX) / state.scale;
    const viewBottom = (h - state.panY) / state.scale;

    // Отрисовка всех сохраненных штрихов
    for (let i = 0; i < state.strokes.length; i++) {
      const s = state.strokes[i];
      if (s.bbox) {
        const pad = (s.size || 5) * 2;
        if (
          s.bbox.maxX + pad < viewLeft ||
          s.bbox.minX - pad > viewRight ||
          s.bbox.maxY + pad < viewTop ||
          s.bbox.minY - pad > viewBottom
        ) {
          continue; // Вне зоны видимости
        }
      }
      renderStroke(mainCtx, s);
    }
  }

  // --- Clear active overlay canvas safely ---
  function clearActiveCanvas() {
    activeCtx.setTransform(1, 0, 0, 1, 0, 0);
    activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
  }

  // --- Active stroke rendering on overlay canvas ---
  function redrawActiveCanvas() {
    clearActiveCanvas();

    if (!state.currentStroke) return;

    activeCtx.setTransform(
      state.scale * dpr, 0,
      0, state.scale * dpr,
      state.panX * dpr, state.panY * dpr
    );

    renderStroke(activeCtx, state.currentStroke);

    // Always reset transform back to identity so active canvas operations are never skewed
    activeCtx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // --- Расчет ограничивающего прямоугольника штриха ---
  function computeBoundingBox(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  // --- Математика для ластика (проверка пересечения точки со штрихом) ---
  function distanceSqToSegment(p, a, b) {
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (l2 === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (p.x - (a.x + t * (b.x - a.x))) ** 2 + (p.y - (a.y + t * (b.y - a.y))) ** 2;
  }

  function eraseStrokesNear(worldPoint, radiusWorld) {
    const rSq = radiusWorld * radiusWorld;
    const strokesToRemove = [];
    const remainingStrokes = [];

    for (let i = 0; i < state.strokes.length; i++) {
      const stroke = state.strokes[i];
      const bbox = stroke.bbox;
      const pad = radiusWorld + (stroke.size || 5);

      // Быстрая проверка AABB
      if (
        worldPoint.x < bbox.minX - pad ||
        worldPoint.x > bbox.maxX + pad ||
        worldPoint.y < bbox.minY - pad ||
        worldPoint.y > bbox.maxY + pad
      ) {
        remainingStrokes.push(stroke);
        continue;
      }

      // Точная проверка расстояния до сегментов
      let hit = false;
      const pts = stroke.points;
      if (pts.length === 1) {
        const dSq = (worldPoint.x - pts[0].x) ** 2 + (worldPoint.y - pts[0].y) ** 2;
        if (dSq <= (radiusWorld + stroke.size / 2) ** 2) {
          hit = true;
        }
      } else {
        const threshold = radiusWorld + stroke.size / 2;
        const threshSq = threshold * threshold;
        for (let j = 0; j < pts.length - 1; j++) {
          if (distanceSqToSegment(worldPoint, pts[j], pts[j + 1]) <= threshSq) {
            hit = true;
            break;
          }
        }
      }

      if (hit) {
        strokesToRemove.push({ index: i, stroke });
      } else {
        remainingStrokes.push(stroke);
      }
    }

    if (strokesToRemove.length > 0) {
      state.strokes = remainingStrokes;
      state.history.push({
        type: 'remove',
        items: strokesToRemove,
      });
      state.redoStack = [];
      updateHistoryButtons();
      scheduleRedraw();
      debouncedSave();
    }
  }

  // --- Управление масштабом (Zoom) ---
  function setZoom(newScale, centerScreenX, centerScreenY) {
    const clampedScale = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);
    if (Math.abs(clampedScale - state.scale) < 0.0001) return;

    const cx = centerScreenX !== undefined ? centerScreenX : window.innerWidth / 2;
    const cy = centerScreenY !== undefined ? centerScreenY : window.innerHeight / 2;

    // Сохраняем мировую точку под курсором на месте
    state.panX = cx - (cx - state.panX) * (clampedScale / state.scale);
    state.panY = cy - (cy - state.panY) * (clampedScale / state.scale);
    state.scale = clampedScale;

    updateZoomUI();
    scheduleRedraw();
    debouncedSave();
  }

  function updateZoomUI() {
    const percent = Math.round(state.scale * 100);
    zoomPercentage.textContent = percent + '%';
  }

  // Center and fit drawing to view
  function fitViewToContent() {
    if (state.strokes.length === 0) {
      // Reset to center 100%
      state.panX = window.innerWidth / 2;
      state.panY = window.innerHeight / 2;
      state.scale = 1.0;
      updateZoomUI();
      scheduleRedraw();
      debouncedSave();
      showToast('Canvas centered');
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of state.strokes) {
      if (!s.bbox) continue;
      if (s.bbox.minX < minX) minX = s.bbox.minX;
      if (s.bbox.minY < minY) minY = s.bbox.minY;
      if (s.bbox.maxX > maxX) maxX = s.bbox.maxX;
      if (s.bbox.maxY > maxY) maxY = s.bbox.maxY;
    }

    const padding = 60;
    const contentW = Math.max(50, maxX - minX);
    const contentH = Math.max(50, maxY - minY);
    const availW = window.innerWidth - padding * 2;
    const availH = window.innerHeight - padding * 2;

    const fitScale = Math.min(availW / contentW, availH / contentH, 1.5);
    const targetScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, fitScale));

    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;

    state.scale = targetScale;
    state.panX = window.innerWidth / 2 - contentCenterX * targetScale;
    state.panY = window.innerHeight / 2 - contentCenterY * targetScale;

    updateZoomUI();
    scheduleRedraw();
    debouncedSave();
    showToast('Fitted view to drawing');
  }

  // --- Обработка событий мыши, тача и стилуса ---

  container.addEventListener('wheel', (e) => {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey || !e.shiftKey) {
      // Плавный зум
      const zoomFactor = e.deltaY < 0 ? 1.12 : (1 / 1.12);
      setZoom(state.scale * zoomFactor, e.clientX, e.clientY);
    } else {
      // Панорамирование колесом при Shift
      state.panX -= e.deltaX;
      state.panY -= e.deltaY;
      scheduleRedraw();
    }
  }, { passive: false });

  container.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return; // Правая кнопка мыши игнорируется

    container.setPointerCapture(e.pointerId);
    state.activePointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
    });

    state.lastPointerPos = { x: e.clientX, y: e.clientY };

    // Multi-touch pinch-to-zoom / multi-pan
    if (state.activePointers.size === 2) {
      if (state.currentStroke) {
        state.currentStroke = null;
        clearActiveCanvas();
      }
      initTwoFingerGesture();
      return;
    }

    if (state.activePointers.size > 2) return;

    // Панорамирование средней кнопкой, зажатым пробелом или инструментом 'hand'
    const isPanTrigger =
      e.button === 1 ||
      state.spacePressed ||
      state.activeTool === 'hand';

    if (isPanTrigger) {
      state.isPanning = true;
      container.classList.add('is-dragging');
      return;
    }

    // Если ластик
    if (state.activeTool === 'eraser') {
      state.isInteracting = true;
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const eraseRadius = Math.max(8, (state.size * 2) / state.scale);
      eraseStrokesNear(worldPos, eraseRadius);
      return;
    }

    // Рисование (перо или маркер)
    state.isInteracting = true;
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const pressure = e.pressure !== 0 && e.pressure !== 0.5 ? e.pressure : 1;

    state.currentStroke = {
      id: 's_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      tool: state.activeTool,
      color: state.color,
      size: state.size,
      points: [{ x: worldPos.x, y: worldPos.y, p: pressure }],
      bbox: { minX: worldPos.x, minY: worldPos.y, maxX: worldPos.x, maxY: worldPos.y },
    };

    redrawActiveCanvas();
  });

  function initTwoFingerGesture() {
    const pts = Array.from(state.activePointers.values());
    const p1 = pts[0];
    const p2 = pts[1];

    state.touchStartDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    state.touchStartCenter = {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    };
    state.touchStartPan = { x: state.panX, y: state.panY };
    state.touchStartScale = state.scale;
  }

  container.addEventListener('pointermove', (e) => {
    if (!state.activePointers.has(e.pointerId)) return;

    state.activePointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
    });

    // Мультитач (2 пальца) — масштабирование и перемещение
    if (state.activePointers.size === 2) {
      const pts = Array.from(state.activePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];

      const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const currentCenter = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };

      if (state.touchStartDist > 0) {
        const factor = currentDist / state.touchStartDist;
        const newScale = Math.min(Math.max(state.touchStartScale * factor, MIN_SCALE), MAX_SCALE);

        // Смещение камеры
        state.scale = newScale;
        state.panX = currentCenter.x - (state.touchStartCenter.x - state.touchStartPan.x) * (newScale / state.touchStartScale) + (currentCenter.x - state.touchStartCenter.x);
        state.panY = currentCenter.y - (state.touchStartCenter.y - state.touchStartPan.y) * (newScale / state.touchStartScale) + (currentCenter.y - state.touchStartCenter.y);

        updateZoomUI();
        scheduleRedraw();
      }
      return;
    }

    // Одиночное панорамирование
    if (state.isPanning) {
      const dx = e.clientX - state.lastPointerPos.x;
      const dy = e.clientY - state.lastPointerPos.y;
      state.panX += dx;
      state.panY += dy;
      state.lastPointerPos = { x: e.clientX, y: e.clientY };
      scheduleRedraw();
      return;
    }

    // Ластик в движении
    if (state.activeTool === 'eraser' && state.isInteracting) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const eraseRadius = Math.max(8, (state.size * 2) / state.scale);
      eraseStrokesNear(worldPos, eraseRadius);
      state.lastPointerPos = { x: e.clientX, y: e.clientY };
      return;
    }

    // Рисование в движении
    if (state.currentStroke && state.isInteracting) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const pts = state.currentStroke.points;
      const lastPt = pts[pts.length - 1];

      // Фильтрация слишком близких точек для оптимизации производительности
      const distSq = (worldPos.x - lastPt.x) ** 2 + (worldPos.y - lastPt.y) ** 2;
      const minDist = (1.5 / state.scale);
      if (distSq < minDist * minDist) return;

      const pressure = e.pressure !== 0 && e.pressure !== 0.5 ? e.pressure : 1;
      pts.push({ x: worldPos.x, y: worldPos.y, p: pressure });

      // Обновляем bounding box
      const bbox = state.currentStroke.bbox;
      if (worldPos.x < bbox.minX) bbox.minX = worldPos.x;
      if (worldPos.y < bbox.minY) bbox.minY = worldPos.y;
      if (worldPos.x > bbox.maxX) bbox.maxX = worldPos.x;
      if (worldPos.y > bbox.maxY) bbox.maxY = worldPos.y;

      redrawActiveCanvas();
      state.lastPointerPos = { x: e.clientX, y: e.clientY };
    }
  });

  function endPointerInteraction(e) {
    if (state.activePointers.has(e.pointerId)) {
      state.activePointers.delete(e.pointerId);
      try {
        container.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Игнорируем ошибку сброса capture
      }
    }

    if (state.activePointers.size === 1) {
      const remaining = Array.from(state.activePointers.values())[0];
      state.lastPointerPos = { x: remaining.x, y: remaining.y };
    }

    if (state.activePointers.size === 0) {
      state.isPanning = false;
      state.isInteracting = false;
      container.classList.remove('is-dragging');

      // Commit completed stroke
      if (state.currentStroke) {
        const strokeToCommit = state.currentStroke;
        state.currentStroke = null;
        clearActiveCanvas();

        if (strokeToCommit.points.length > 0) {
          strokeToCommit.bbox = computeBoundingBox(strokeToCommit.points);
          state.strokes.push(strokeToCommit);
          state.history.push({
            type: 'add',
            stroke: strokeToCommit,
          });
          state.redoStack = []; // Clear redo stack on new action
          updateHistoryButtons();
          redrawMainCanvas();
          debouncedSave();
        }
      }
    }
  }

  container.addEventListener('pointerup', endPointerInteraction);
  container.addEventListener('pointercancel', endPointerInteraction);

  // Handle window blur / tab switch so no active strokes or gestures get orphaned
  window.addEventListener('blur', () => {
    state.activePointers.clear();
    state.isPanning = false;
    state.isInteracting = false;
    state.spacePressed = false;
    container.classList.remove('is-dragging', 'panning');
    if (state.currentStroke) {
      const strokeToCommit = state.currentStroke;
      state.currentStroke = null;
      clearActiveCanvas();
      if (strokeToCommit.points.length > 0) {
        strokeToCommit.bbox = computeBoundingBox(strokeToCommit.points);
        state.strokes.push(strokeToCommit);
        state.history.push({ type: 'add', stroke: strokeToCommit });
        state.redoStack = [];
        updateHistoryButtons();
        redrawMainCanvas();
        debouncedSave();
      }
    }
  });

  // --- Отмена и Повтор (Undo / Redo) ---
  function undo() {
    if (state.history.length === 0) return;

    const action = state.history.pop();
    state.redoStack.push(action);

    if (action.type === 'add') {
      const idx = state.strokes.indexOf(action.stroke);
      if (idx !== -1) {
        state.strokes.splice(idx, 1);
      }
    } else if (action.type === 'remove') {
      // Восстанавливаем удаленные штрихи по их индексам
      const sorted = action.items.slice().sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        state.strokes.splice(item.index, 0, item.stroke);
      }
    } else if (action.type === 'clear') {
      state.strokes = action.strokes.slice();
    }

    updateHistoryButtons();
    scheduleRedraw();
    debouncedSave();
  }

  function redo() {
    if (state.redoStack.length === 0) return;

    const action = state.redoStack.pop();
    state.history.push(action);

    if (action.type === 'add') {
      state.strokes.push(action.stroke);
    } else if (action.type === 'remove') {
      const idsToRemove = new Set(action.items.map(i => i.stroke.id));
      state.strokes = state.strokes.filter(s => !idsToRemove.has(s.id));
    } else if (action.type === 'clear') {
      state.strokes = [];
    }

    updateHistoryButtons();
    scheduleRedraw();
    debouncedSave();
  }

  function updateHistoryButtons() {
    btnUndo.disabled = state.history.length === 0;
    btnRedo.disabled = state.redoStack.length === 0;
  }

  // --- Выбор инструментов, цвета и толщины ---
  function selectTool(toolName) {
    state.activeTool = toolName;

    toolButtons.forEach(btn => {
      const isActive = btn.dataset.tool === toolName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    container.classList.toggle('tool-hand', toolName === 'hand');
    container.classList.toggle('tool-eraser', toolName === 'eraser');
  }

  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      selectTool(btn.dataset.tool);
    });
  });

  function selectColor(hex) {
    state.color = hex;

    colorSwatches.forEach(swatch => {
      const matches = swatch.dataset.color.toLowerCase() === hex.toLowerCase();
      swatch.classList.toggle('active', matches);
    });

    customColorPreview.classList.toggle(
      'active',
      !Array.from(colorSwatches).some(s => s.dataset.color.toLowerCase() === hex.toLowerCase())
    );

    if (customColorPreview.classList.contains('active')) {
      customColorPreview.style.borderColor = hex;
      customColorPreview.style.color = hex;
    } else {
      customColorPreview.style.borderColor = '';
      customColorPreview.style.color = '';
    }

    // Если был активен ластик или рука, возвращаем перо
    if (state.activeTool === 'eraser' || state.activeTool === 'hand') {
      selectTool('pen');
    }
  }

  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      selectColor(swatch.dataset.color);
    });
  });

  customColorInput.addEventListener('input', (e) => {
    selectColor(e.target.value);
  });

  function selectSize(sizeNum) {
    state.size = parseInt(sizeNum, 10);
    sizeButtons.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.size, 10) === state.size);
    });
  }

  sizeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      selectSize(btn.dataset.size);
    });
  });

  // --- Меню и диалоги ---
  function toggleDropdownMenu(force) {
    const isHidden = dropdownMenu.classList.contains('hidden');
    const shouldShow = force !== undefined ? force : isHidden;

    dropdownMenu.classList.toggle('hidden', !shouldShow);
    btnMenuToggle.setAttribute('aria-expanded', shouldShow ? 'true' : 'false');
  }

  btnMenuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdownMenu();
  });

  document.addEventListener('click', (e) => {
    if (!dropdownMenu.contains(e.target) && !btnMenuToggle.contains(e.target)) {
      toggleDropdownMenu(false);
    }
  });

  // Clear canvas
  btnClear.addEventListener('click', () => {
    if (state.strokes.length === 0) {
      showToast('Canvas is already empty');
      return;
    }
    modalClearConfirm.showModal();
  });

  btnCancelClear.addEventListener('click', () => {
    modalClearConfirm.close();
  });

  btnConfirmClear.addEventListener('click', () => {
    if (state.strokes.length > 0) {
      state.history.push({
        type: 'clear',
        strokes: state.strokes.slice(),
      });
      state.redoStack = [];
      state.strokes = [];
      updateHistoryButtons();
      scheduleRedraw();
      debouncedSave();
      showToast('Canvas cleared (press Ctrl+Z to undo)');
    }
    modalClearConfirm.close();
  });

  // Grid
  gridSelectors.forEach(btn => {
    btn.addEventListener('click', () => {
      gridSelectors.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.gridType = btn.dataset.grid;
      scheduleRedraw();
      debouncedSave();
    });
  });

  // Color theme
  function setTheme(newTheme) {
    state.theme = newTheme;
    document.body.classList.toggle('theme-dark', newTheme === 'dark');

    const themeLabel = document.querySelector('.theme-text');
    if (themeLabel) {
      themeLabel.textContent = newTheme === 'dark' ? 'Dark' : 'Light';
    }

    const firstSwatch = colorSwatches[0];
    if (firstSwatch) {
      const defaultColor = newTheme === 'dark' ? '#f4f4f5' : '#18181b';
      firstSwatch.dataset.color = defaultColor;
      firstSwatch.style.setProperty('--swatch-color', defaultColor);
      firstSwatch.title = newTheme === 'dark' ? 'White' : 'Black';
      firstSwatch.setAttribute('aria-label', firstSwatch.title);

      if (state.color === '#f4f4f5' || state.color === '#18181b') {
        selectColor(defaultColor);
      }
    }

    scheduleRedraw();
    debouncedSave();
  }

  btnThemeToggle.addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  // Shortcuts modal
  menuShortcuts.addEventListener('click', () => {
    toggleDropdownMenu(false);
    modalShortcuts.showModal();
  });

  btnCloseShortcuts.addEventListener('click', () => {
    modalShortcuts.close();
  });

  btnAckShortcuts.addEventListener('click', () => {
    modalShortcuts.close();
  });

  // Toggle UI visibility (Zen mode)
  function toggleUI() {
    state.uiHidden = !state.uiHidden;
    document.body.classList.toggle('ui-hidden', state.uiHidden);
    btnToggleUi.title = state.uiHidden ? 'Show interface (F)' : 'Hide interface (F)';
    if (state.uiHidden) {
      showToast('Interface hidden (press F to show)');
    }
  }

  btnToggleUi.addEventListener('click', toggleUI);

  // Zoom controls
  btnZoomIn.addEventListener('click', () => setZoom(state.scale * 1.25));
  btnZoomOut.addEventListener('click', () => setZoom(state.scale / 1.25));
  btnZoomReset.addEventListener('click', () => setZoom(1.0));
  btnFitView.addEventListener('click', fitViewToContent);

  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);

  // --- Автосохранение (LocalStorage) ---
  let saveTimer = null;
  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveStateToStorage, 600);
  }

  function saveStateToStorage() {
    try {
      const data = {
        theme: state.theme,
        gridType: state.gridType,
        color: state.color,
        size: state.size,
        camera: { panX: state.panX, panY: state.panY, scale: state.scale },
        strokes: state.strokes,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // Квота хранилища превышена при огромном количестве штрихов
    }
  }

  function loadStateFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);

      if (data.theme) setTheme(data.theme);
      if (data.gridType) {
        state.gridType = data.gridType;
        gridSelectors.forEach(b => b.classList.toggle('active', b.dataset.grid === data.gridType));
      }
      if (data.color) selectColor(data.color);
      if (data.size) selectSize(data.size);

      if (data.camera) {
        state.panX = data.camera.panX || window.innerWidth / 2;
        state.panY = data.camera.panY || window.innerHeight / 2;
        state.scale = data.camera.scale || 1.0;
        updateZoomUI();
      }

      if (Array.isArray(data.strokes) && data.strokes.length > 0) {
        state.strokes = data.strokes;
        // Пересчитаем bboxes если отсутствовали
        for (const s of state.strokes) {
          if (!s.bbox && s.points) {
            s.bbox = computeBoundingBox(s.points);
          }
        }
      }
    } catch (e) {
      // Игнорируем поврежденные данные
    }
  }

  // --- Тосты ---
  let toastTimeout = null;
  function showToast(message) {
    clearTimeout(toastTimeout);
    toastContainer.innerHTML = '';

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  // --- Горячие клавиши ---
  window.addEventListener('keydown', (e) => {
    // Не перехватываем ввод в текстовых полях
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Закрытие модалок по Escape
    if (e.key === 'Escape') {
      if (modalShortcuts.open) modalShortcuts.close();
      if (modalClearConfirm.open) modalClearConfirm.close();
      toggleDropdownMenu(false);
      return;
    }

    // Пробел для панорамирования
    if (e.code === 'Space' && !state.spacePressed) {
      state.spacePressed = true;
      container.classList.add('panning');
      return;
    }

    // Undo / Redo
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
      e.preventDefault();
      redo();
      return;
    }

    // Zoom shortcuts
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      setZoom(state.scale * 1.25);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      setZoom(state.scale / 1.25);
      return;
    }
    if (e.key === '0') {
      e.preventDefault();
      setZoom(1.0);
      return;
    }

    if (e.shiftKey && e.key === '!') { // Shift + 1
      e.preventDefault();
      fitViewToContent();
      return;
    }

    // Tools
    if (e.code === 'KeyB' || e.code === 'KeyP') {
      selectTool('pen');
      return;
    }
    if (e.code === 'KeyE') {
      selectTool('eraser');
      return;
    }
    if (e.code === 'KeyH') {
      selectTool('hand');
      return;
    }

    // F — переключение интерфейса
    if (e.code === 'KeyF') {
      e.preventDefault();
      toggleUI();
      return;
    }

    // ? — справка
    if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
      e.preventDefault();
      modalShortcuts.showModal();
      return;
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      state.spacePressed = false;
      if (!state.isPanning) {
        container.classList.remove('panning');
      }
    }
  });

  // --- Инициализация ---
  function init() {
    loadStateFromStorage();
    resizeCanvas();
    updateZoomUI();
    updateHistoryButtons();

    // Если нет сохраненной позиции, центрируем начало координат
    if (state.panX === 0 && state.panY === 0) {
      state.panX = window.innerWidth / 2;
      state.panY = window.innerHeight / 2;
      scheduleRedraw();
    }
  }

  init();
})();
