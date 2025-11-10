// --- 数据：时间线节点 ---
const TIMELINE_EVENTS = [
];

// --- 相册：网格平铺 + 物理挤压 + 布朗运动 ---
const GRID_CFG = {
  total: 136,
  colsMin: 17,
  gap: 72, // 全局间隔（当 gapX/gapY 未设置时使用）
  gapX: undefined, // 可选：横向间隔
  gapY: undefined, // 可选：纵向间隔
  targetArea: 240 * 240, // 每张卡片目标显示面积（px^2），保持面积恒定
  baseScale: 0.9,
  mouseSigma: 140,
  mouseAmp: 0.6,
  mouseAttractK: 400, // 近处吸引
  mouseRepelK: 1000,    // 远处斥力
  mouseFarSigma: 700, // 远场宽度
  springK: 4.0,
  damping: 0.2,
  jitterAccel: 1, // 布朗更慢
  boundsPadding: 40,
  kNeighbors: 4,
  fixedCols: undefined, // 设置固定列数（可选）
  fixedRows: undefined, // 设置固定行数（可选）
  driftAmp: 25,   // 漂浮幅度（px）
  driftFreq: 0.08 // 漂浮频率（Hz）
};

// 可选：打表预设初始位置（基于 distance d，1 在外圈 → 0 在中心）
// 使用方式：
// 1) 将 enabled 设为 true
// 2) 填写 base（应用于所有臂），或在 byArm 中为特定臂提供数组（优先级更高）
// 3) 数组顺序建议从外到内（大→小），长度可与每臂张数不同，系统会线性重采样到目标长度
// 取消螺旋预设（不再使用）

// 资源路径（请将照片放入 assets/photos/，命名 1.jpg ~ 80.jpg）
const PHOTO_BASE_URL = 'assets/photos';

// --- 工具 ---
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function map(value, inMin, inMax, outMin, outMax) {
  const t = (value - inMin) / (inMax - inMin);
  return outMin + clamp(t, 0, 1) * (outMax - outMin);
}

// --- 初始化：相册（网格） ---
let PHOTO_NODES = [];
let MESH_EDGES = [];
let MOUSE = { x: 0, y: 0, inside: false };
let STARS = [];
let METEORS = [];
let CANVAS_READY = false;
let CANVAS_DPR = 1;
let GRID_DIM = { cols: 0, rows: 0 };

// 基于弧长的参数化：按实际轨迹长度线性映射
const ARC_TABLE = {
  samples: 3000,
  us: [],
  cumS: [],
  total: 0
};

function buildArcTable() {
  const n = ARC_TABLE.samples;
  ARC_TABLE.us.length = 0; ARC_TABLE.cumS.length = 0;
  let prev = spiralPoint(0, 0);
  ARC_TABLE.us.push(0);
  ARC_TABLE.cumS.push(0);
  let s = 0;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const p = spiralPoint(u, 0);
    const dx = p.x - prev.x; const dy = p.y - prev.y;
    s += Math.hypot(dx, dy);
    ARC_TABLE.us.push(u);
    ARC_TABLE.cumS.push(s);
    prev = p;
  }
  ARC_TABLE.total = s;
}

function lengthAtU(u) {
  const n = ARC_TABLE.samples;
  const idx = Math.min(n, Math.max(0, Math.floor(u * n)));
  // 线性插值
  const u0 = ARC_TABLE.us[idx];
  const u1 = ARC_TABLE.us[Math.min(n, idx + 1)];
  const s0 = ARC_TABLE.cumS[idx];
  const s1 = ARC_TABLE.cumS[Math.min(n, idx + 1)];
  const t = (u - u0) / Math.max(1e-6, (u1 - u0));
  return s0 + (s1 - s0) * t;
}

function uAtLength(sTarget) {
  // 二分查找 cumS
  const cum = ARC_TABLE.cumS;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = ((lo + hi) >> 1);
    if (cum[mid] < sTarget) lo = mid + 1; else hi = mid;
  }
  const i = Math.max(1, lo);
  const s0 = cum[i - 1], s1 = cum[i];
  const u0 = ARC_TABLE.us[i - 1], u1 = ARC_TABLE.us[i];
  const t = (sTarget - s0) / Math.max(1e-6, (s1 - s0));
  return u0 + (u1 - u0) * t;
}

function posFromD(d, armIndex) {
  const s = (1 - d) * ARC_TABLE.total; // d=1 外侧 s=0；d=0 中心 s=total
  const u = uAtLength(s);
  return { u, p: spiralPoint(u, armIndex) };
}

function posAtS(s, armIndex) {
  const u = uAtLength(s);
  return { u, p: spiralPoint(u, armIndex) };
}

// 工具：线性重采样数组到指定长度（支持插值）
function resampleArrayLinear(values, targetLen) {
  if (!Array.isArray(values) || values.length === 0 || targetLen <= 0) return [];
  if (values.length === targetLen) return values.slice();
  if (targetLen === 1) return [values[0]];
  const out = new Array(targetLen);
  for (let i = 0; i < targetLen; i++) {
    const t = i / (targetLen - 1);
    const f = t * (values.length - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(values.length - 1, i0 + 1);
    const lt = f - i0;
    const v = (1 - lt) * values[i0] + lt * values[i1];
    out[i] = clamp(v, 0, 1);
  }
  return out;
}

// 构建预设的 d 列表；若未启用或无数据则返回 null
function buildPresetDLists(perArm) {
  if (!SPIRAL_PRESET.enabled) return null;
  const lists = [];
  for (let arm = 0; arm < SPIRAL.arms; arm++) {
    const src = (SPIRAL_PRESET.byArm && Array.isArray(SPIRAL_PRESET.byArm[arm]) && SPIRAL_PRESET.byArm[arm].length)
      ? SPIRAL_PRESET.byArm[arm]
      : (SPIRAL_PRESET.base || []);
    if (!src || src.length === 0) return null; // 任何臂缺数据则整体放弃预设
    // 若用户给的是从内到外也可接受，这里统一为降序（外→内）
    const sorted = src.slice().sort((a, b) => b - a);
    lists[arm] = resampleArrayLinear(sorted, perArm);
  }
  return lists;
}

function generateArmParams(count, minCenterDistPx, armIndex, uMax = 0.7) {
  const params = [];
  let u = 0;
  params.push(u);
  while (params.length < count) {
    let step = 0.004; // 初始步长
    const lastU = params[params.length - 1];
    const lastP = spiralPoint(lastU, armIndex);
    let found = false;
    while (u < uMax) {
      u = Math.min(uMax, u + step);
      const p = spiralPoint(u, armIndex);
      const dx = p.x - lastP.x;
      const dy = p.y - lastP.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= minCenterDistPx) { params.push(u); found = true; break; }
      step *= 1.25; // 增大步长加速搜索
    }
    if (!found) break;
  }
  // 数量不足则在末尾两点之间均匀补齐（保持单调递增）
  while (params.length < count) {
    const a = params[params.length - 2] ?? 0;
    const b = params[params.length - 1] ?? 1;
    const mid = (a + b) / 2;
    params.splice(params.length - 1, 0, mid);
  }
  return params.slice(0, count);
}

const dFromU = (u) => 1 - u; // distance: 0中心, 1外侧
const uFromD = (d) => 1 - d;

function scaleByDistance(d) {
  const b = SPIRAL.baseScale;
  if (d >= 0.3) return b; // 0.3~1 不缩放
  const k = clamp(d / 0.3, 0, 1); // 0~0.3 线性 0→1
  return b * k;
}

function createSpiralGallery() {
  // 已弃用，改为网格系统
  const container = document.getElementById('gallery3d');
  const meshCanvas = document.getElementById('meshCanvas');
  if (!container) return;

  // 清空旧内容
  container.innerHTML = '';

  // 测量卡片宽度
  const measurer = document.createElement('div');
  measurer.className = 'photo-card';
  measurer.style.visibility = 'hidden';
  measurer.style.position = 'absolute';
  measurer.style.left = '0'; measurer.style.top = '0';
  container.appendChild(measurer);
  const baseCardWidth = parseFloat(getComputedStyle(measurer).width) || 160;
  container.removeChild(measurer);

  const viewport = document.querySelector('.gallery-viewport');
  const rect = viewport.getBoundingClientRect();
  const padding = GRID_CFG.boundsPadding;
  // 基于目标面积与默认比例预估网格步距
  const defaultRatio = 3 / 4; // w/h，默认 3:4 作为预估
  const baseW = Math.sqrt(GRID_CFG.targetArea * defaultRatio);
  const baseH = Math.sqrt(GRID_CFG.targetArea / defaultRatio);
  const gapX = GRID_CFG.gapX ?? GRID_CFG.gap;
  const gapY = GRID_CFG.gapY ?? GRID_CFG.gap;

  // 计算列数与缩放，使总高度适配视口高度
  const maxCols = Math.max(GRID_CFG.colsMin, Math.floor((rect.width - padding * 2 + gapX) / (baseW + gapX)));
  let bestCols = typeof GRID_CFG.fixedCols === 'number' && GRID_CFG.fixedCols > 0 ? GRID_CFG.fixedCols : maxCols;
  let bestScale = 1;
  if (!(typeof GRID_CFG.fixedCols === 'number' && GRID_CFG.fixedCols > 0)) {
    for (let c = maxCols; c >= GRID_CFG.colsMin; c--) {
      const r = Math.ceil(GRID_CFG.total / c);
      const totalH = r * (baseH + gapY) - gapY;
      if (totalH <= (rect.height - padding * 2)) {
        bestCols = c; bestScale = 1; break;
      }
    }
  }
  // 若仍超出高度，则按高度等比压缩
  const rowsFit = typeof GRID_CFG.fixedRows === 'number' && GRID_CFG.fixedRows > 0
    ? GRID_CFG.fixedRows
    : Math.ceil(GRID_CFG.total / bestCols);
  if (bestScale === 1) {
    const totalH = rowsFit * (baseH + gapY) - gapY;
    if (totalH > (rect.height - padding * 2)) {
      bestScale = (rect.height - padding * 2 + gapY) / (rowsFit * (baseH + gapY));
      bestScale = clamp(bestScale, 0.35, 1);
    }
  }
  const stepX = (baseW + gapX) * bestScale;
  const stepY = (baseH + gapY) * bestScale;
  const startX = -((bestCols - 1) * stepX) / 2;
  const startY = -((rowsFit - 1) * stepY) / 2;
  // 保存网格维度供连线使用
  GRID_DIM = { cols: bestCols, rows: rowsFit };

  PHOTO_NODES = [];
  for (let i = 0; i < GRID_CFG.total; i++) {
    const col = i % bestCols;
    const row = Math.floor(i / bestCols);
    const bx = startX + col * stepX;
    const by = startY + row * stepY;
    const x0 = bx + (Math.random() - 0.5) * 6;
    const y0 = by + (Math.random() - 0.5) * 6;

    const card = document.createElement('div');
    card.className = 'photo-card';
    card.style.left = '50%';
    card.style.top = '50%';
    card.style.transformOrigin = 'center center';
    const ratio = defaultRatio; // 先用默认值，加载后再精确修正
    const w0 = Math.sqrt(GRID_CFG.targetArea * ratio) * bestScale;
    const h0 = Math.sqrt(GRID_CFG.targetArea / ratio) * bestScale;
    card.style.width = `${w0}px`;
    card.style.height = `${h0}px`;
    const initialScale = GRID_CFG.baseScale; // 面积已体现在 width/height
    card.style.transform = `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(${initialScale})`;
    card.style.opacity = '1';

    const img = document.createElement('img');
    const idx = (i % GRID_CFG.total) + 1;
    img.loading = 'lazy';
    img.alt = `回忆 ${idx}`;
    img.src = `${PHOTO_BASE_URL}/${idx}.jpg`;
    img.addEventListener('load', () => {
      const r = img.naturalWidth && img.naturalHeight ? (img.naturalWidth / img.naturalHeight) : defaultRatio;
      const w = Math.sqrt(GRID_CFG.targetArea * r) * bestScale;
      const h = Math.sqrt(GRID_CFG.targetArea / r) * bestScale;
      card.style.width = `${w}px`;
      card.style.height = `${h}px`;
    });
    card.appendChild(img);
    card.addEventListener('click', () => { window.location.href = `photo.html?id=${idx}`; });
    container.appendChild(card);

    PHOTO_NODES.push({
      id: idx, el: card,
      x: x0, y: y0, vx: 0, vy: 0,
      bx, by, col, row,
      scale: initialScale, baseScale: initialScale,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      speedX: (0.5 + Math.random()) * GRID_CFG.driftFreq * 2 * Math.PI, // rad/s
      speedY: (0.5 + Math.random()) * GRID_CFG.driftFreq * 2 * Math.PI
    });
  }

  buildMeshEdges();

  // 鼠标交互
  viewport.addEventListener('mousemove', (e) => {
    const r = meshCanvas.getBoundingClientRect();
    MOUSE.x = e.clientX - r.left - r.width / 2;
    MOUSE.y = e.clientY - r.top - r.height / 2;
    MOUSE.inside = true;
  });
  viewport.addEventListener('mouseleave', () => { MOUSE.inside = false; });

  // 准备画布像素尺寸（DPR）
  setupMeshCanvas(meshCanvas);
  // 启动动画
  startAnimation(meshCanvas);
}

function setupMeshCanvas(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = document.querySelector('.gallery-viewport');
    const rect = vp ? vp.getBoundingClientRect() : canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    // 显式同步 CSS 尺寸，避免缩放/裁切错位
    canvas.style.width = `${Math.max(1, Math.floor(rect.width))}px`;
    canvas.style.height = `${Math.max(1, Math.floor(rect.height))}px`;
    CANVAS_DPR = dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    STARS.length = 0; // 触发重建星空
    CANVAS_READY = true;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
}

function startAnimation(meshCanvas) {
  const viewport = document.querySelector('.gallery-viewport');
  function frame() {
    const rect = viewport.getBoundingClientRect();
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;
    const sigma2 = GRID_CFG.mouseSigma * GRID_CFG.mouseSigma;
    const t = performance.now() / 1000;

    // 初始化星空
    if (STARS.length === 0) {
      const base = Math.floor((rect.width * rect.height) / 7000);
      const count = Math.max(300, base * 5);
      for (let i = 0; i < count; i++) {
        STARS.push({
          x: Math.random() * rect.width - halfW,
          y: Math.random() * rect.height - halfH,
          r: 1.5 + Math.random() * 1.5,
          phase: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 0.8
        });
      }
    }

    for (const n of PHOTO_NODES) {
      // 低频漂浮锚点偏移
      const offX = Math.sin(n.phaseX + n.speedX * t) * GRID_CFG.driftAmp;
      const offY = Math.cos(n.phaseY + n.speedY * t) * GRID_CFG.driftAmp;
      const tx = n.bx + offX;
      const ty = n.by + offY;

      const axSpring = (tx - n.x) * GRID_CFG.springK / 1000;
      const aySpring = (ty - n.y) * GRID_CFG.springK / 1000;
      const axJ = (Math.random() - 0.5) * GRID_CFG.jitterAccel;
      const ayJ = (Math.random() - 0.5) * GRID_CFG.jitterAccel;

      let axMouse = 0, ayMouse = 0, scale = n.baseScale ?? GRID_CFG.baseScale;
      if (MOUSE.inside) {
        const dx = n.x - MOUSE.x;
        const dy = n.y - MOUSE.y;
        const d2 = dx * dx + dy * dy;
        const dist = Math.sqrt(d2) + 1e-6;
        const gNear = Math.exp(-d2 / (2 * sigma2));
        const farTerm = Math.max(0, dist - GRID_CFG.mouseSigma);
        const gFar = Math.exp(-(farTerm ** 2) / (2 * GRID_CFG.mouseFarSigma * GRID_CFG.mouseFarSigma));
        // 缩放：近场放大
        scale = (n.baseScale ?? GRID_CFG.baseScale) * (1 + GRID_CFG.mouseAmp * gNear);
        // 力：近吸引、远斥力，且不超过弹簧力上限
        const dirx = (MOUSE.x - n.x) / dist;
        const diry = (MOUSE.y - n.y) / dist;
        let fx = GRID_CFG.mouseAttractK * gNear * dirx - GRID_CFG.mouseRepelK * gFar * dirx;
        let fy = GRID_CFG.mouseAttractK * gNear * diry - GRID_CFG.mouseRepelK * gFar * diry;
        const limitX = Math.abs((tx - n.x) * GRID_CFG.springK / 1000) * 0.9;
        const limitY = Math.abs((ty - n.y) * GRID_CFG.springK / 1000) * 0.9;
        fx = clamp(fx, -limitX, limitX);
        fy = clamp(fy, -limitY, limitY);
        axMouse = fx; ayMouse = fy;
      }

      const ax = axSpring + axJ + axMouse;
      const ay = aySpring + ayJ + ayMouse;
      n.vx = (n.vx + ax * 0.016) * (1 - GRID_CFG.damping);
      n.vy = (n.vy + ay * 0.016) * (1 - GRID_CFG.damping);
      n.x += n.vx; n.y += n.vy;

      n.x = Math.max(-halfW + GRID_CFG.boundsPadding, Math.min(halfW - GRID_CFG.boundsPadding, n.x));
      n.y = Math.max(-halfH + GRID_CFG.boundsPadding, Math.min(halfH - GRID_CFG.boundsPadding, n.y));

      n.scale = scale;
      n.el.style.transform = `translate(${n.x}px, ${n.y}px) translate(-50%, -50%) scale(${n.scale})`;
    }

    if (meshCanvas) {
      const ctx = meshCanvas.getContext('2d');
      if (ctx) {
        // 重置并应用 DPR 变换，使用 CSS 像素坐标绘制
        ctx.setTransform(CANVAS_DPR, 0, 0, CANVAS_DPR, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.save();
        // 绘制星空（闪烁）
        ctx.save();
        ctx.shadowColor = 'rgba(255,255,255,0.5)';
        ctx.shadowBlur = 6;
        for (const s of STARS) {
          const a = 0.45 + 0.35 * Math.sin(s.phase + s.speed * t);
          ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(s.x + halfW, s.y + halfH, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // 生成五彩长尾流星（从屏幕外左上角飞向右下）
        if (Math.random() < 0.1) {
          const ang = ((35 + Math.random() * 20) * Math.PI) / 180; // 35°~55°
          const speed = 400 + Math.random() * 800;         // px/s
          const tail = 300 + Math.random() * 500;          // tail length
          const thickness = 1 + Math.random() * 3;         // 1~4 px
          const hue = Math.floor(Math.random() * 360);
          const sat = 70 + Math.random() * 20;             // 70%~90%
          const light = 55 + Math.random() * 15;           // 55%~70%
          METEORS.push({
            x: - Math.random() * 1600,
            y: -halfH - Math.random() * 200,
            vx: Math.cos(ang) * speed,
            vy: Math.sin(ang) * speed,
            life: 0,
            maxLife: 1.8 + Math.random() * 1.2,
            tail,
            thickness,
            hue,
            sat,
            light
          });
        }
        // 更新/绘制流星：线性渐变+长尾
        for (let i = METEORS.length - 1; i >= 0; i--) {
          const m = METEORS[i];
          const dt = 1 / 60;
          m.life += dt;
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          const p = Math.max(0, 1 - m.life / m.maxLife);
          const headX = m.x + halfW;
          const headY = m.y + halfH;
          const vlen = Math.hyb || Math.hypot(m.vx, m.vy) || 1e-6;
          const ux = m.vx / vlen;
          const uy = m.vy / vlen;
          const tailLen = m.tail * p;
          const tailX = headX - ux * tailLen;
          const tailY = headY - uy * tailLen;

          const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
          grad.addColorStop(0, `hsla(${m.hue}, ${m.sat}%, ${m.light}%, 0)`);
          grad.addColorStop(1, `hsla(${m.hue}, ${m.sat}%, ${m.light}%, ${0.9 * p})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = m.thickness;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(headX, headY);
          ctx.stroke();

          if (m.life >= m.maxLife || headX > rect.width + 300 || headY > rect.height + 300) {
            METEORS.splice(i, 1);
          }
        }

        // 网格连线（增强可见度）
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.25;
        for (const [i, j] of MESH_EDGES) {
          const a = PHOTO_NODES[i];
          const b = PHOTO_NODES[j];
          ctx.beginPath();
          ctx.moveTo(a.x + halfW, a.y + halfH);
          ctx.lineTo(b.x + halfW, b.y + halfH);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function buildMeshEdges() {
  MESH_EDGES = [];
  const cols = GRID_DIM.cols;
  const rows = GRID_DIM.rows;
  if (!cols || !rows) return;
  // 仅连接横向相邻与纵向相邻的格点，确保横平竖直
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= PHOTO_NODES.length) continue;
      const right = c + 1 < cols ? r * cols + (c + 1) : -1;
      const down = r + 1 < rows ? (r + 1) * cols + c : -1;
      if (right >= 0 && right < PHOTO_NODES.length) MESH_EDGES.push([idx, right]);
      if (down >= 0 && down < PHOTO_NODES.length) MESH_EDGES.push([idx, down]);
    }
  }
}

// --- 滚动交互：沿固定轨迹推进 + 分段缩放 ---
// 移除滚动驱动逻辑

// --- 时间线：绘制弯折路径与节点布局 ---
function setupTimeline() {
  const svg = document.getElementById('timelineSvg');
  const list = document.getElementById('timelineItems');
  if (!svg || !list) return;

  // 准备 SVG 渐变给爱心使用（与 CSS 对应）
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  g.setAttribute('id', 'g-heart');
  g.setAttribute('x1', '0%'); g.setAttribute('x2', '100%');
  g.setAttribute('y1', '0%'); g.setAttribute('y2', '100%');
  const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#ff6b81');
  const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#6bc5ff');
  g.appendChild(s1); g.appendChild(s2); defs.appendChild(g); svg.appendChild(defs);

  function render() {
    const { width, height } = svg.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    // 清除内容
    while (svg.lastChild && svg.lastChild.tagName !== 'defs') svg.removeChild(svg.lastChild);
    list.innerHTML = '';

    // 构建平滑曲线路径（Catmull-Rom → Bézier）
    // 居中蛇形：以中心为基线，左右摆幅对称
    const paddingY = 80;
    const centerX = width / 2;
    const amplitude = Math.min(220, width * 0.28); // 左右摆幅
    const stepY = (height - paddingY * 2) / (TIMELINE_EVENTS.length - 1);
    const r = 22;

    const points = TIMELINE_EVENTS.map((_, i) => {
      const y = paddingY + stepY * i;
      const x = centerX + Math.sin(i * 0.9) * amplitude; // 像蛇一样蜿蜒
      return { x, y };
    });
    // 让最后一个点居中，便于与爱心上端对齐
    if (points.length) {
      points[points.length - 1].x = centerX;
    }

    // Catmull-Rom 样条转三次贝塞尔
    function catmullRomPath(pts, tension = 0.5) {
      if (pts.length < 2) return '';
      const path = [];
      path.push(`M ${pts[0].x},${pts[0].y}`);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = i === 0 ? pts[0] : pts[i - 1];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = i + 2 < pts.length ? pts[i + 2] : pts[i + 1];
        const t = (1 - tension) / 6; // 张力到贝塞尔控制缩放
        const cp1x = p1.x + (p2.x - p0.x) * t;
        const cp1y = p1.y + (p2.y - p0.y) * t;
        const cp2x = p2.x - (p3.x - p1.x) * t;
        const cp2y = p2.y - (p3.y - p1.y) * t;
        path.push(`C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`);
      }
      return path.join(' ');
    }

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', catmullRomPath(points, 0.35));
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('stroke', 'url(#g-heart)');
    pathEl.setAttribute('stroke-width', '5');
    pathEl.setAttribute('stroke-linecap', 'round');
    pathEl.setAttribute('stroke-linejoin', 'round');
    pathEl.style.filter = 'drop-shadow(0 6px 20px rgba(0,0,0,.35))';
    svg.appendChild(pathEl);

    // 路径绘制动画（基于滚动曝光）
    const length = pathEl.getTotalLength();
    pathEl.style.strokeDasharray = String(length);
    pathEl.style.strokeDashoffset = String(length);

    function onScroll() {
      const rect = svg.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const visible = clamp(1 - rect.top / vh, 0, 1);
      pathEl.style.strokeDashoffset = String(length * (1 - visible));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // 放置时间点卡片
    points.forEach((pt, idx) => {
      const li = document.createElement('li');
      li.className = 'timeline-item';
      const side = Math.sin(idx * 0.9) >= 0 ? 1 : -1;
      const offset = side > 0 ? 24 : -344;
      li.style.left = `${pt.x + offset}px`;
      li.style.top = `${pt.y - 24}px`;
      li.innerHTML = `<div class="timeline-date">${TIMELINE_EVENTS[idx].date}</div><div class="timeline-text">${TIMELINE_EVENTS[idx].text}</div>`;
      list.appendChild(li);
    });

    // 观察可视来显隐
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) e.target.classList.add('is-visible');
      }
    }, { root: null, rootMargin: '0px', threshold: 0.2 });
    document.querySelectorAll('.timeline-item').forEach(el => io.observe(el));
  }

  render();
  window.addEventListener('resize', render);
}

// --- 翻牌计时器 ---

function diffCalendar(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return {
      years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0
    };
  }
  let from = start;
  let to = end;
  if (to < from) {
    [from, to] = [to, from];
  }
  let temp = new Date(from);
  let years = 0;
  while (true) {
    const next = new Date(temp);
    next.setFullYear(next.getFullYear() + 1);
    if (next <= to) {
      temp = next;
      years++;
    } else {
      break;
    }
  }
  let months = 0;
  while (true) {
    const next = new Date(temp);
    next.setMonth(next.getMonth() + 1);
    if (next <= to) {
      temp = next;
      months++;
    } else {
      break;
    }
  }
  let days = 0;
  while (true) {
    const next = new Date(temp);
    next.setDate(next.getDate() + 1);
    if (next <= to) {
      temp = next;
      days++;
    } else {
      break;
    }
  }
  const remainingMs = to - temp;
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { years, months, days, hours, minutes, seconds };
}

class FlipDigit {
  constructor(root, initial = '0', direction = 'down') {
    this.root = root;
    this.duration = 600;
    this.direction = direction;
    this.frontNode = root.querySelector('.front');
    this.backNode = root.querySelector('.back');
    this.isFlipping = false;
    this.nextValue = null;
    this.currentValue = null;
    root.className = `flip ${direction}`;
    this._setFront(initial);
    this._setBack(initial);
    this.currentValue = initial;
  }

  _setFront(char) {
    this.frontNode.className = `digital front number${char}`;
  }

  _setBack(char) {
    this.backNode.className = `digital back number${char}`;
  }

  flipTo(char) {
    if (this.currentValue === char) {
      this.nextValue = null;
      return;
    }
    if (this.isFlipping) {
      this.nextValue = char;
      return;
    }
    this.isFlipping = true;
    this.nextValue = null;
    this._setBack(char);
    this.root.classList.remove('go');
    void this.root.offsetWidth;
    this.root.classList.add('go');
    setTimeout(() => {
      this._setFront(char);
      this.currentValue = char;
      this.root.classList.remove('go');
      this.isFlipping = false;
      if (this.nextValue && this.nextValue !== this.currentValue) {
        const pending = this.nextValue;
        this.nextValue = null;
        this.flipTo(pending);
      }
    }, this.duration);
  }

  setImmediate(char) {
    this.isFlipping = false;
    this.nextValue = null;
    this.currentValue = char;
    this.root.classList.remove('go');
    this._setFront(char);
    this._setBack(char);
  }
}

class FlipClock {
  constructor(root, options = {}) {
    this.root = root;
    this.startDate = options.startDate || new Date('2020-11-17T00:00:00');
    this.direction = options.direction || 'down';
    this.units = [
      { id: 'years', label: '年', digits: [] },
      { id: 'months', label: '月', digits: [] },
      { id: 'days', label: '日', digits: [] },
      { id: 'hours', label: '小时', digits: [] },
      { id: 'minutes', label: '分钟', digits: [] },
      { id: 'seconds', label: '秒', digits: [] }
    ];
    this.timer = null;
    this._build();
    this.initialized = false;
    this._update();
    this._start();
  }

  dispose() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  _build() {
    const frag = document.createDocumentFragment();
    this.units.forEach((unit, idx) => {
      const unitEl = document.createElement('div');
      unitEl.className = 'flip-unit';
      const digitsEl = document.createElement('div');
      digitsEl.className = 'flip-digits';
      unitEl.appendChild(digitsEl);
      const labelEl = document.createElement('span');
      labelEl.className = 'flip-unit-label';
      labelEl.textContent = unit.label;
      unitEl.appendChild(labelEl);
      unit.container = digitsEl;
      unit.labelEl = labelEl;
      frag.appendChild(unitEl);
    });
    this.root.textContent = '';
    this.root.appendChild(frag);
  }

  _ensureDigits(unit, targetLen) {
    while (unit.digits.length < targetLen) {
      const digitObj = this._createDigit('0');
      unit.container.insertBefore(digitObj.root, unit.container.firstChild);
      unit.digits.unshift(digitObj);
    }
    while (unit.digits.length > targetLen) {
      const digitObj = unit.digits.shift();
      digitObj.root.remove();
    }
  }

  _createDigit(initial) {
    const wrap = document.createElement('div');
    wrap.className = 'flip';
    const front = document.createElement('div');
    front.className = 'digital front';
    const back = document.createElement('div');
    back.className = 'digital back';
    wrap.appendChild(front);
    wrap.appendChild(back);
    const digit = new FlipDigit(wrap, initial, this.direction);
    return { root: wrap, control: digit };
  }

  _setDigits(unit, valueStr, animate) {
    this._ensureDigits(unit, valueStr.length);
    for (let i = 0; i < valueStr.length; i++) {
      const char = valueStr[valueStr.length - 1 - i];
      const digitObj = unit.digits[unit.digits.length - 1 - i];
      if (!animate) {
        digitObj.control.setImmediate(char);
      } else {
        digitObj.control.flipTo(char);
      }
    }
  }

  _update() {
    const now = new Date();
    const parts = diffCalendar(this.startDate, now);
    const animate = this.initialized;
    this._setDigits(this.units[0], String(parts.years), animate);
    this._setDigits(this.units[1], String(parts.months).padStart(2, '0'), animate);
    this._setDigits(this.units[2], String(parts.days).padStart(2, '0'), animate);
    this._setDigits(this.units[3], String(parts.hours).padStart(2, '0'), animate);
    this._setDigits(this.units[4], String(parts.minutes).padStart(2, '0'), animate);
    this._setDigits(this.units[5], String(parts.seconds).padStart(2, '0'), animate);
    if (!this.initialized) this.initialized = true;
  }

  _start() {
    this.dispose();
    this.timer = setInterval(() => this._update(), 1000);
  }
}

function initElapsedFlipClock() {
  const root = document.getElementById('elapsedFlipClock');
  if (!root) return null;
  const startAttr = root.dataset.start;
  let startDate = null;
  if (startAttr) {
    const parsed = new Date(startAttr);
    if (!Number.isNaN(parsed.getTime())) {
      startDate = parsed;
    }
  }
  if (!startDate) {
    startDate = new Date('2020-11-17T00:00:00+08:00');
  }
  return new FlipClock(root, { startDate });
}

// --- 启动 ---
window.addEventListener('DOMContentLoaded', () => {
  createSpiralGallery();
  initElapsedFlipClock();
});


