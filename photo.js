(function () {
  const imgEl = document.getElementById('photoImage');
  const titleEl = document.getElementById('photoTitle');
  const dateEl = document.getElementById('photoDate');
  const locEl = document.getElementById('photoLocation');
  const textEl = document.getElementById('photoText');
  const tagsEl = document.getElementById('photoTags');

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

  // ---- 背景动画 ----
  function initBackground() {
    const canvas = document.getElementById('bgCanvas');
    const ctx = canvas.getContext('2d');
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const SCALE = 1.3; // 放大背景运动整体尺度
    function resize() {
      const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
      canvas.width = Math.max(1, Math.floor(vw * dpr));
      canvas.height = Math.max(1, Math.floor(vh * dpr));
    }
    resize();
    window.addEventListener('resize', () => { dpr = Math.min(window.devicePixelRatio || 1, 2); resize(); setup(); });

    // 选择模式：1=太阳系, 2=双星, 3=三体, 4=爱心
    const mode = Math.floor(1 + Math.random() * 4);

    // 公共中心：居中（0.5W, 0.5H），使用 canvas CSS 尺寸
    function center() {
      const w = canvas.width / dpr, h = canvas.height / dpr;
      return { x: w * 0.5, y: h * 0.5, w, h };
    }

    let state = {};

    function setup() {
      const { w, h } = center();
      if (mode === 1) setupSolar(w, h);
      else if (mode === 2) setupBinary(w, h);
      else if (mode === 3) setupThreeBody(w, h);
      else setupHeart(w, h);
    }

    function setupSolar(w, h) {
      const cx = w * 0.8, cy = h * 0.75;
      const rings = 8;
      const planets = [];
      for (let i = 0; i < rings; i++) {
        const r = (40 + i * 28 + Math.random() * 10) * SCALE*0.5;
        const ang = Math.random() * Math.PI * 2;
        const speed = (0.15 + i * 0.03) * (Math.random() * 0.6 + 0.7);
        const size = (3 + Math.random() * 5) * (0.6 + 0.4 * SCALE);
        const hue = Math.floor(20 + i * 15 + Math.random() * 20);
        planets.push({ r, ang, speed, size, hue });
      }
      state = { type: 'solar', cx, cy, planets };
    }

    function setupBinary(w, h) {
      const cx = w * 0.8, cy = h * 0.75;
      const r = Math.min(w, h) * 0.12 * SCALE;
      const omega = 0.8; // rad/s
      state = { type: 'binary', cx, cy, r, a: Math.random() * Math.PI * 2, omega };
    }

    function setupThreeBody(w, h) {
      const cx = w * 0.8, cy = h * 0.75;
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
      state = { type: 'three', bodies, cx, cy };
    }

    function setupHeart(w, h) {
      const cx = w * 0.8, cy = h * 0.75;
      const scale = Math.min(w, h) * 0.01 * SCALE;
      state = { type: 'heart', t: Math.random() * Math.PI * 2, cx, cy, s: scale };
    }

    setup();

    function step(dt) {
      const { w, h } = center();
      // 先用像素尺寸清屏，再设定DPR变换，后续用CSS坐标绘制
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (state.type === 'solar') {
        // sun
        const { cx, cy, planets } = state;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
        grad.addColorStop(0, 'rgba(255,170,60,1)');
        grad.addColorStop(1, 'rgba(255,80,20,0.6)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.fill();
        // orbits
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        planets.forEach(p => { ctx.beginPath(); ctx.arc(cx, cy, p.r, 0, Math.PI * 2); ctx.stroke(); });
        // planets
        planets.forEach(p => {
          p.ang += p.speed * dt;
          const x = cx + Math.cos(p.ang) * p.r;
          const y = cy + Math.sin(p.ang) * p.r;
          ctx.fillStyle = `hsl(${p.hue} 80% 60%)`;
          ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2); ctx.fill();
        });
      }

      if (state.type === 'binary') {
        const { cx, cy, r } = state; state.a += state.omega * dt;
        const x1 = cx + Math.cos(state.a) * r;
        const y1 = cy + Math.sin(state.a) * r;
        const x2 = cx - Math.cos(state.a) * r;
        const y2 = cy - Math.sin(state.a) * r;
        // faint orbit
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,80,80,0.9)'; ctx.beginPath(); ctx.arc(x1, y1, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(80,150,255,0.9)'; ctx.beginPath(); ctx.arc(x2, y2, 8, 0, Math.PI * 2); ctx.fill();
      }

      if (state.type === 'three') {
        const G = 8000, maxAcc = 800; // clamp acceleration
        const { bodies } = state;
        // compute pairwise forces
        for (let i = 0; i < bodies.length; i++) {
          let ax = 0, ay = 0;
          for (let j = 0; j < bodies.length; j++) if (i !== j) {
            const dx = bodies[j].x - bodies[i].x;
            const dy = bodies[j].y - bodies[i].y;
            const r2 = dx*dx + dy*dy // clamp min radius^2
            const invr = 1 / Math.sqrt(r2);
            const invr3 = invr * invr * invr;
            let fx = G * dx * invr3;
            let fy = G * dy * invr3;
            const acc = Math.hypot(fx, fy);
            const cap = Math.min(acc, maxAcc);
            if (acc > 1e-6) { fx *= (cap/acc); fy *= (cap/acc); }
            ax += fx; ay += fy;
          }
          bodies[i].vx += ax * dt;
          bodies[i].vy += ay * dt;
        // 限制 v max = 100
        const v_max = 100;
        const v = Math.hypot(bodies[i].vx, bodies[i].vy);
        if (v > v_max) {
          bodies[i].vx = bodies[i].vx * (v_max / v);
          bodies[i].vy = bodies[i].vy * (v_max / v);
        }
        }
        bodies.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });
        // center by average position
        const cxAvg = (bodies[0].x + bodies[1].x + bodies[2].x) / 3;
        const cyAvg = (bodies[0].y + bodies[1].y + bodies[2].y) / 3;
        const { x: cx, y: cy } = center();
        const ox = cx - cxAvg, oy = cy - cyAvg;
        bodies.forEach(b => { b.x += ox; b.y += oy; });
        // update trails (screen-space) and draw trails
        const MAX_TRAIL = 120;
        bodies.forEach(b => {
          const px = b.x + cx * 0.6;
          const py = b.y + cy * 0.5;
          b.trail.push({ x: px, y: py });
          if (b.trail.length > MAX_TRAIL) b.trail.shift();
        });
        ctx.save();
        bodies.forEach(b => {
          const tr = b.trail;
          if (!tr || tr.length < 2) return;
          for (let i = 1; i < tr.length; i++) {
            const tfrac = i / (tr.length - 1);
            ctx.globalAlpha = 0.08 + 0.6 * tfrac; // newer segments更亮
            ctx.lineWidth = 1 + 3 * tfrac; // 尾部逐渐变细
            ctx.strokeStyle = b.color;
            ctx.beginPath();
            ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
            ctx.lineTo(tr[i].x, tr[i].y);
            ctx.stroke();
          }
        });
        ctx.restore();
        // draw bodies on top
        bodies.forEach(b => { ctx.globalAlpha = 1; ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x + cx*0.6, b.y + cy*0.5, 7, 0, Math.PI*2); ctx.fill(); });
      }

      if (state.type === 'heart') {
        const { cx, cy } = state; state.t += dt * 0.9;
        const t0 = state.t;
        const s = state.s;
        const x = cx + s * Math.pow(Math.sin(t0), 3) * 16;
        const y = cy - s * (13*Math.cos(t0) - 5*Math.cos(2*t0) - 2*Math.cos(3*t0) - Math.cos(4*t0));
        // faint heart path
        ctx.strokeStyle = 'rgba(255,100,150,0.15)';
        ctx.beginPath();
        for (let a = 0; a < Math.PI*2; a += 0.02) {
          const hx = cx + s * Math.pow(Math.sin(a), 3) * 16;
          const hy = cy - s * (13*Math.cos(a) - 5*Math.cos(2*a) - 2*Math.cos(3*a) - Math.cos(4*a));
          if (a === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath(); ctx.stroke();
        // star
        ctx.fillStyle = 'rgba(255,80,160,0.95)';
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI*2); ctx.fill();
      }
    }

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
      let meta = null;
      if (all && all.photos) {
        meta = all.photos[String(id)] ?? all.photos[id] ?? null;
      }
      render(id, meta);
    } catch (e) {
      console.error('加载文字失败:', e);
      render(id, null);
    }

    initBackground();
  }

  function getNumberOrDefault(v, d){ return Number.isFinite(v) ? v : d; }

  window.addEventListener('DOMContentLoaded', main);
})();


