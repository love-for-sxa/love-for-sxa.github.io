(function () {
  const imgEl = document.getElementById('photoImage');
  const titleEl = document.getElementById('photoTitle');
  const dateEl = document.getElementById('photoDate');
  const locEl = document.getElementById('photoLocation');
  const textEl = document.getElementById('photoText');
  const tagsEl = document.getElementById('photoTags');
  const prevBtn = document.getElementById('photoPrev');
  const nextBtn = document.getElementById('photoNext');

  const DEFAULT_TOTAL_PHOTOS = 136;
  let totalPhotos = DEFAULT_TOTAL_PHOTOS;
  let photosMeta = {};
  let currentId = 1;

  function getQueryId() {
    const url = new URL(window.location.href);
    const idStr = url.searchParams.get('id');
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('无效的照片ID');
    }
    return id;
  }

  function render(id, meta) {
    imgEl.src = `assets/photos/${id}.jpg`;
    imgEl.alt = ``;
    titleEl.textContent = ``;
    dateEl.textContent = '';
    locEl.textContent = '';
    textEl.textContent = (meta && typeof meta.text === 'string') ? meta.text : '';
    tagsEl.innerHTML = '';
    dateEl.style.display = 'none';
    locEl.style.display = 'none';
    tagsEl.style.display = 'none';
  }

  function updateNavControls() {
    if (!prevBtn || !nextBtn) return;
    const isFirst = currentId <= 1;
    const isLast = currentId >= totalPhotos;
    prevBtn.disabled = isFirst;
    nextBtn.disabled = isLast;
    prevBtn.setAttribute('aria-disabled', String(isFirst));
    nextBtn.setAttribute('aria-disabled', String(isLast));
  }

  function goTo(id) {
    if (!Number.isFinite(id)) return;
    const clamped = Math.max(1, Math.min(Math.floor(id), totalPhotos));
    currentId = clamped;
    const meta = photosMeta && (photosMeta[String(clamped)] ?? photosMeta[clamped]) || null;
    render(clamped, meta);
    updateNavControls();
    const url = new URL(window.location.href);
    url.searchParams.set('id', String(clamped));
    window.history.replaceState(null, '', url.toString());
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentId > 1) {
        goTo(currentId - 1);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentId < totalPhotos) {
        goTo(currentId + 1);
      }
    });
  }

  // ---- 背景动画：星空 + 流星雨 ----
  function initStarfieldBackground() {
    const canvas = document.getElementById('bgCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    const stars = [];
    const meteors = [];
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      height = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      rebuildStars();
    }

    function rebuildStars() {
      stars.length = 0;
      const base = Math.floor((width * height) / 7000);
      const count = Math.max(280, base * 5);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: 1.2 + Math.random() * 1.6,
          phase: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 0.7
        });
      }
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });

    let lastTime = performance.now();

    function frame(now) {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const time = now / 1000;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (stars.length === 0) rebuildStars();

      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.45)';
      ctx.shadowBlur = 6;
      for (const s of stars) {
        const alpha = 0.45 + 0.35 * Math.sin(s.phase + s.speed * time);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (meteors.length < 10 && Math.random() < 0.08) {
        const angle = ((35 + Math.random() * 20) * Math.PI) / 180;
        const speed = 420 + Math.random() * 780;
        const tail = 280 + Math.random() * 480;
        const thickness = 1 + Math.random() * 2.5;
        const hue = Math.floor(Math.random() * 360);
        const sat = 70 + Math.random() * 20;
        const light = 55 + Math.random() * 15;
        meteors.push({
          x: -200 - Math.random() * 400,
          y: -120 - Math.random() * 240,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 1.6 + Math.random() * 1.4,
          tail,
          thickness,
          hue,
          sat,
          light
        });
      }

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.life += dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const progress = Math.max(0, 1 - m.life / m.maxLife);
        const headX = m.x;
        const headY = m.y;
        const speedLen = Math.hypot(m.vx, m.vy) || 1e-6;
        const ux = m.vx / speedLen;
        const uy = m.vy / speedLen;
        const tailLen = m.tail * progress;
        const tailX = headX - ux * tailLen;
        const tailY = headY - uy * tailLen;

        ctx.lineCap = 'round';
        ctx.lineWidth = m.thickness;
        const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
        grad.addColorStop(0, `hsla(${m.hue}, ${m.sat}%, ${m.light}%, 0)`);
        grad.addColorStop(1, `hsla(${m.hue}, ${m.sat}%, ${m.light}%, ${0.9 * progress})`);
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.stroke();

        if (m.life >= m.maxLife || headX > width + 400 || headY > height + 300) {
          meteors.splice(i, 1);
        }
      }

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  // ---- 前景动画：太阳系 / 双星 / 三体 / 心形 ----
  function initOverlayScenes() {
    const canvas = document.getElementById('bgCanvasOverlay');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const SCALE = 1.3;
    const mode = Math.floor(1 + Math.random() * 4);
    let state = {};

    function resizeCanvas() {
      const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
      canvas.width = Math.max(1, Math.floor(vw * dpr));
      canvas.height = Math.max(1, Math.floor(vh * dpr));
      setupState();
    }

    function center() {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      return { x: w * 0.5, y: h * 0.5, w, h };
    }

    function setupState() {
      const { w, h } = center();
      if (mode === 1) setupSolar(w, h);
      else if (mode === 2) setupBinary(w, h);
      else if (mode === 3) setupThreeBody(w, h);
      else setupHeart(w, h);
    }

    function setupSolar(w, h) {
      const cx = w * 0.8;
      const cy = h * 0.75;
      const rings = 8;
      const planets = [];
      for (let i = 0; i < rings; i++) {
        const r = (40 + i * 28 + Math.random() * 10) * SCALE * 0.5;
        const ang = Math.random() * Math.PI * 2;
        const speed = (0.15 + i * 0.03) * (Math.random() * 0.6 + 0.7);
        const size = (3 + Math.random() * 5) * (0.6 + 0.4 * SCALE);
        const hue = Math.floor(20 + i * 15 + Math.random() * 20);
        planets.push({ r, ang, speed, size, hue });
      }
      state = { type: 'solar', cx, cy, planets };
    }

    function setupBinary(w, h) {
      const cx = w * 0.8;
      const cy = h * 0.75;
      const r = Math.min(w, h) * 0.12 * SCALE;
      const omega = 0.8;
      state = { type: 'binary', cx, cy, r, a: Math.random() * Math.PI * 2, omega };
    }

    function setupThreeBody(w, h) {
      const cx = w * 0.8;
      const cy = h * 0.75;
      const bodies = [];
      const spread = Math.min(w, h) * 0.2 * SCALE;
      for (let i = 0; i < 3; i++) {
        bodies.push({
          x: cx + (Math.random() - 0.5) * spread,
          y: cy + (Math.random() - 0.5) * spread,
          vx: (Math.random() - 0.5) * 10 * SCALE,
          vy: (Math.random() - 0.5) * 10 * SCALE,
          color: i === 0 ? 'rgba(255,90,90,0.9)' : i === 1 ? 'rgba(80,220,120,0.9)' : 'rgba(90,140,255,0.9)',
          trail: []
        });
      }
      state = { type: 'three', bodies };
    }

    function setupHeart(w, h) {
      const cx = w * 0.8;
      const cy = h * 0.75;
      const scale = Math.min(w, h) * 0.01 * SCALE;
      state = { type: 'heart', t: Math.random() * Math.PI * 2, cx, cy, s: scale };
    }

    function step(dt) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const { x: centerX, y: centerY, w, h } = center();

      if (state.type === 'solar') {
        const { cx: sx, cy: sy, planets } = state;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 40);
        grad.addColorStop(0, 'rgba(255,170,60,0.85)');
        grad.addColorStop(1, 'rgba(255,80,20,0.5)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        planets.forEach((p) => {
          ctx.beginPath();
          ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
          ctx.stroke();
        });

        planets.forEach((p) => {
          p.ang += p.speed * dt;
          const x = sx + Math.cos(p.ang) * p.r;
          const y = sy + Math.sin(p.ang) * p.r;
          ctx.fillStyle = `hsl(${p.hue} 80% 60%)`;
          ctx.beginPath();
          ctx.arc(x, y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      if (state.type === 'binary') {
        const { cx: bx, cy: by, r } = state;
        state.a += state.omega * dt;
        const x1 = bx + Math.cos(state.a) * r;
        const y1 = by + Math.sin(state.a) * r;
        const x2 = bx - Math.cos(state.a) * r;
        const y2 = by - Math.sin(state.a) * r;

        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,80,80,0.85)';
        ctx.beginPath();
        ctx.arc(x1, y1, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(80,150,255,0.85)';
        ctx.beginPath();
        ctx.arc(x2, y2, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      if (state.type === 'three') {
        const bodies = state.bodies;
        const G = 8000;
        const maxAcc = 800;
        for (let i = 0; i < bodies.length; i++) {
          let ax = 0;
          let ay = 0;
          for (let j = 0; j < bodies.length; j++) {
            if (i === j) continue;
            const dx = bodies[j].x - bodies[i].x;
            const dy = bodies[j].y - bodies[i].y;
            const r2 = Math.max(dx * dx + dy * dy, 400);
            const invr = 1 / Math.sqrt(r2);
            const invr3 = invr * invr * invr;
            let fx = G * dx * invr3;
            let fy = G * dy * invr3;
            const acc = Math.hypot(fx, fy);
            const cap = Math.min(acc, maxAcc);
            if (acc > 1e-6) {
              const scale = cap / acc;
              fx *= scale;
              fy *= scale;
            }
            ax += fx;
            ay += fy;
          }
          bodies[i].vx += ax * dt;
          bodies[i].vy += ay * dt;
          const v = Math.hypot(bodies[i].vx, bodies[i].vy);
          const vmax = 100;
          if (v > vmax) {
            const scale = vmax / v;
            bodies[i].vx *= scale;
            bodies[i].vy *= scale;
          }
        }

        bodies.forEach((b) => {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        });

        const cxAvg = bodies.reduce((acc, b) => acc + b.x, 0) / bodies.length;
        const cyAvg = bodies.reduce((acc, b) => acc + b.y, 0) / bodies.length;
        const ox = centerX - cxAvg;
        const oy = centerY - cyAvg;
        bodies.forEach((b) => {
          b.x += ox;
          b.y += oy;
        });

        const MAX_TRAIL = 120;
        bodies.forEach((b) => {
          const px = b.x + centerX * 0.6;
          const py = b.y + centerY * 0.5;
          b.trail.push({ x: px, y: py });
          if (b.trail.length > MAX_TRAIL) b.trail.shift();
        });

        ctx.save();
        bodies.forEach((b) => {
          const tr = b.trail;
          if (!tr || tr.length < 2) return;
          for (let i = 1; i < tr.length; i++) {
            const tfrac = i / (tr.length - 1);
            ctx.globalAlpha = 0.08 + 0.6 * tfrac;
            ctx.lineWidth = 1 + 3 * tfrac;
            ctx.strokeStyle = b.color;
            ctx.beginPath();
            ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
            ctx.lineTo(tr[i].x, tr[i].y);
            ctx.stroke();
          }
        });
        ctx.restore();

        bodies.forEach((b) => {
          ctx.globalAlpha = 1;
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(b.x + centerX * 0.6, b.y + centerY * 0.5, 7, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      if (state.type === 'heart') {
        const { cx: hx, cy: hy } = state;
        state.t += dt * 0.9;
        const t0 = state.t;
        const s = state.s;
        const x = hx + s * Math.pow(Math.sin(t0), 3) * 16;
        const y = hy - s * (13 * Math.cos(t0) - 5 * Math.cos(2 * t0) - 2 * Math.cos(3 * t0) - Math.cos(4 * t0));

        ctx.strokeStyle = 'rgba(255,100,150,0.15)';
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.02) {
          const px = hx + s * Math.pow(Math.sin(a), 3) * 16;
          const py = hy - s * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,80,160,0.95)';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    resizeCanvas();
    window.addEventListener('resize', () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      resizeCanvas();
    }, { passive: true });

    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  async function main() {
    let id = 1;
    try {
      id = getNumberOrDefault(getQueryId(), 1);
    } catch (e) {
      alert(e.message);
      window.location.href = 'index.html';
      return;
    }

    try {
      const res = await fetch('./data/photos.json', { cache: 'no-store' });
      if (!res || !res.ok) throw new Error('无法加载照片描述JSON');
      const all = await res.json();
      if (all && all.photos) {
        photosMeta = all.photos;
        const numericKeys = Object.keys(all.photos)
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0);
        if (numericKeys.length) {
          const highest = Math.max(...numericKeys);
          if (highest > totalPhotos) totalPhotos = highest;
        }
      }
    } catch (e) {
      console.error('加载文字失败:', e);
      photosMeta = {};
    }

    initStarfieldBackground();
    initOverlayScenes();
    goTo(id);
  }

  function getNumberOrDefault(v, d){ return Number.isFinite(v) ? v : d; }

  window.addEventListener('DOMContentLoaded', main);
})();


