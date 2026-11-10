(() => {
  'use strict';
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = (id) => document.getElementById(id);
  const ui = {
    intro: $('introCard'), result: $('resultCard'), pause: $('pauseCard'),
    score: $('scoreboard'), scoreValue: $('scoreValue'), best: $('bestScore'),
    finalScore: $('finalScore'), finalBest: $('finalBest'), resultTitle: $('resultTitle'),
    resultCopy: $('resultCopy'), medal: $('resultMedal'), bottom: $('bottomNote'),
    hint: $('gameHint'), pauseButton: $('pauseButton'), toast: $('toast'),
    sound: $('soundButton'), soundIcon: $('soundIcon')
  };
  const storeKey = 'skybound-best-v1';
  let best = Number(localStorage.getItem(storeKey) || 0);
  ui.best.textContent = String(best).padStart(2, '0');

  let width = 0, height = 0, dpr = 1, lastTime = 0, elapsed = 0;
  let state = 'intro', score = 0, birdY = 0, birdV = 0, birdAngle = 0;
  let pipes = [], particles = [], clouds = [], floorOffset = 0, spawnClock = 0;
  let soundOn = true, audioContext = null, hintTimer = 0, toastTimer = 0;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const unit = () => Math.min(width, height);
  const birdX = () => width * (width < 600 ? .31 : .34);
  const groundY = () => height * .86;
  const birdR = () => unit() * .034;
  const pipeW = () => unit() * .105;
  const speed = () => unit() * .38;
  const gapSize = () => clamp(height * .255, 142, 205);

  function resize() {
    width = window.innerWidth; height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clouds = Array.from({ length: 8 }, (_, i) => ({
      x: (i / 8) * width + Math.random() * 65, y: height * (.13 + Math.random() * .38),
      s: unit() * (.038 + Math.random() * .045), v: unit() * (.012 + Math.random() * .018),
      a: .25 + Math.random() * .3
    }));
    if (!birdY || state === 'intro') birdY = height * .47;
    paint();
  }
  window.addEventListener('resize', resize, { passive: true });

  function initAudio() {
    if (!audioContext) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) audioContext = new Audio();
    }
    if (audioContext?.state === 'suspended') audioContext.resume();
  }
  function chirp(freq = 500, duration = .09, type = 'sine', volume = .045) {
    if (!soundOn || !audioContext) return;
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(100, freq * .72), audioContext.currentTime + duration);
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + duration);
  }
  function setState(next) {
    state = next;
    const playing = next === 'playing';
    ui.intro.classList.toggle('hidden', next !== 'intro');
    ui.result.classList.toggle('hidden', next !== 'over');
    ui.pause.classList.toggle('hidden', next !== 'paused');
    ui.pauseButton.classList.toggle('hidden', !playing);
    ui.score.classList.toggle('visible', playing);
    ui.bottom.classList.toggle('hidden', playing || next === 'paused');
    ui.hint.classList.toggle('hidden', !playing || hintTimer <= 0);
  }
  function startGame() {
    initAudio(); score = 0; pipes = []; particles = []; spawnClock = .72;
    birdY = height * .47; birdV = 0; birdAngle = 0; floorOffset = 0;
    ui.scoreValue.textContent = '0'; hintTimer = 3.2;
    setState('playing'); flap();
  }
  function flap() {
    if (state !== 'playing') return;
    birdV = -unit() * .57;
    birdAngle = -.32;
    chirp(650, .075, 'sine', .032);
    for (let i = 0; i < 3; i++) particles.push({
      x: birdX() - birdR() * .8, y: birdY + (Math.random() - .5) * birdR(),
      vx: -unit() * (.12 + Math.random() * .12), vy: (Math.random() - .5) * unit() * .08,
      life: .35 + Math.random() * .15, max: .5, r: unit() * (.003 + Math.random() * .003)
    });
  }
  function finishGame() {
    if (state !== 'playing') return;
    setState('over'); chirp(210, .28, 'triangle', .06);
    const newBest = score > best;
    if (newBest) { best = score; try { localStorage.setItem(storeKey, String(best)); } catch (_) {} ui.best.textContent = String(best).padStart(2, '0'); }
    ui.finalScore.textContent = score; ui.finalBest.textContent = best;
    if (score >= 10) { ui.resultTitle.textContent = 'Sky legend!'; ui.resultCopy.textContent = 'Well, look at you go. What a flight!'; ui.medal.textContent = '♛'; }
    else if (score >= 4) { ui.resultTitle.textContent = 'Soaring high!'; ui.resultCopy.textContent = 'That was a wonderful little flight.'; ui.medal.textContent = '✧'; }
    else { ui.resultTitle.textContent = score === 0 ? 'Nice try!' : 'Look at you fly!'; ui.resultCopy.textContent = score === 0 ? 'The sky is still yours.' : 'The sky is still yours. Go again?'; ui.medal.textContent = '✦'; }
    if (newBest && score > 0) {
      ui.toast.classList.remove('hidden'); clearTimeout(toastTimer);
      toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), 1900);
    }
  }
  function addPipe() {
    const gap = gapSize();
    const margin = Math.max(unit() * .12, gap * .67);
    const center = margin + Math.random() * Math.max(1, groundY() - margin * 2 - gap);
    pipes.push({ x: width + pipeW(), center, gap, passed: false, shimmer: Math.random() * Math.PI * 2 });
  }
  function hitTest(pipe) {
    const r = birdR() * .78, bx = birdX(), px = pipe.x, pw = pipeW();
    if (bx + r < px || bx - r > px + pw) return false;
    return birdY - r < pipe.center - pipe.gap / 2 || birdY + r > pipe.center + pipe.gap / 2;
  }
  function update(dt) {
    elapsed += dt;
    for (const c of clouds) { c.x -= c.v * dt; if (c.x < -c.s * 2) { c.x = width + c.s; c.y = height * (.12 + Math.random() * .4); } }
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    if (state !== 'playing') return;
    hintTimer = Math.max(0, hintTimer - dt);
    birdV += unit() * 1.43 * dt;
    birdY += birdV * dt;
    birdAngle = clamp(birdV / (unit() * .8), -.38, .92);
    floorOffset = (floorOffset + speed() * dt) % (unit() * .12);
    spawnClock -= dt;
    if (spawnClock <= 0) { addPipe(); spawnClock = width < 600 ? 1.72 : 1.9; }
    for (const p of pipes) {
      p.x -= speed() * dt;
      if (!p.passed && p.x + pipeW() < birdX()) {
        p.passed = true; score++; ui.scoreValue.textContent = score; chirp(890, .1, 'sine', .04);
        if (score % 5 === 0) chirp(1120, .13, 'sine', .035);
      }
      if (hitTest(p)) { finishGame(); return; }
    }
    pipes = pipes.filter(p => p.x > -pipeW() * 2);
    if (birdY + birdR() > groundY() || birdY - birdR() < height * .055) finishGame();
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawCloud(x, y, s, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = '#fffefa';
    ctx.beginPath(); ctx.ellipse(x, y, s * .85, s * .27, 0, 0, Math.PI * 2);
    ctx.ellipse(x - s * .35, y - s * .10, s * .34, s * .31, -.12, 0, Math.PI * 2);
    ctx.ellipse(x + s * .04, y - s * .22, s * .39, s * .43, .04, 0, Math.PI * 2);
    ctx.ellipse(x + s * .42, y - s * .08, s * .31, s * .28, .12, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function drawBackdrop(t) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#94d9f3'); sky.addColorStop(.51, '#c6edf1'); sky.addColorStop(.82, '#f4e9bf'); sky.addColorStop(1, '#f9d99d');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    const sunX = width * .77, sunY = height * .24, sunR = unit() * .073;
    const halo = ctx.createRadialGradient(sunX, sunY, sunR * .2, sunX, sunY, sunR * 2.7);
    halo.addColorStop(0, 'rgba(255,244,197,.55)'); halo.addColorStop(1, 'rgba(255,247,215,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 2.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff4ca'; ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
    clouds.forEach(c => drawCloud(c.x, c.y, c.s, c.a));
    const distant = height * .68;
    ctx.fillStyle = '#acdcd1'; ctx.beginPath(); ctx.moveTo(0, distant + height * .04);
    for (let x = 0; x <= width + 10; x += width / 5) ctx.quadraticCurveTo(x + width / 10, distant - height * (.055 + Math.sin(x * .02 + 1) * .025), x + width / 5, distant + height * .03);
    ctx.lineTo(width, groundY()); ctx.lineTo(0, groundY()); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8ed0b2'; ctx.beginPath(); ctx.moveTo(0, height * .76);
    for (let x = 0; x <= width + 10; x += width / 4) ctx.quadraticCurveTo(x + width / 8, height * (.67 + Math.sin(x * .01 + 2.5) * .045), x + width / 4, height * .76);
    ctx.lineTo(width, groundY()); ctx.lineTo(0, groundY()); ctx.closePath(); ctx.fill();
    // Soft, drifting sky flecks add a sense of scale without distracting from play.
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 10; i++) { const x = ((i * 197 + t * 9) % (width + 20)) - 10, y = height * (.22 + (i * .127 % .4)); ctx.beginPath(); ctx.arc(x, y, unit() * .002, 0, Math.PI * 2); ctx.fill(); }
  }
  function drawPipeHalf(x, y, w, h, isTop, phase) {
    if (h <= 0) return;
    const lipH = unit() * .035, radius = unit() * .011;
    ctx.save();
    // Quiet groundward shadow gives each obstacle a rounded, toy-like 3D edge.
    ctx.fillStyle = 'rgba(37,103,92,.14)'; roundRect(x + w * .09, y + 5, w, h, radius); ctx.fill();
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#58bd8d'); grad.addColorStop(.18, '#7bd5a5'); grad.addColorStop(.58, '#63c797'); grad.addColorStop(1, '#3da87d');
    ctx.fillStyle = grad; roundRect(x, y, w, h, radius); ctx.fill();
    ctx.save(); roundRect(x, y, w, h, radius); ctx.clip();
    const shine = ctx.createLinearGradient(x + w * .17, 0, x + w * .39, 0);
    shine.addColorStop(0, 'rgba(255,255,255,.0)'); shine.addColorStop(.5, 'rgba(255,255,255,.31)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine; ctx.fillRect(x + w * .12, y, w * .32, h);
    ctx.fillStyle = 'rgba(28,125,94,.12)'; ctx.fillRect(x + w * .82, y, w * .18, h);
    // tiny embossed glints
    ctx.globalAlpha = .26; ctx.strokeStyle = '#e0ffe8'; ctx.lineWidth = 1.5;
    for (let yy = y + (isTop ? 26 : 20); yy < y + h - 10; yy += unit() * .105) {
      ctx.beginPath(); ctx.moveTo(x + w * .23, yy); ctx.lineTo(x + w * .4, yy + 2); ctx.stroke();
    }
    ctx.restore();
    const lipY = isTop ? y + h - lipH : y;
    const lipGrad = ctx.createLinearGradient(x, 0, x + w, 0);
    lipGrad.addColorStop(0, '#42ad80'); lipGrad.addColorStop(.25, '#93e4b2'); lipGrad.addColorStop(.62, '#68cc99'); lipGrad.addColorStop(1, '#32966f');
    ctx.fillStyle = lipGrad; roundRect(x - w * .11, lipY, w * 1.22, lipH, lipH * .25); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - w * .055, lipY + lipH * .22); ctx.quadraticCurveTo(x + w * .5, lipY + lipH * .05, x + w * 1.055, lipY + lipH * .2); ctx.stroke();
    // dark inset at opening edge emphasizes the gap
    ctx.fillStyle = 'rgba(34,116,88,.13)';
    if (isTop) { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w * .51, lipH * .22, 0, 0, Math.PI); ctx.fill(); }
    else { ctx.beginPath(); ctx.ellipse(x + w / 2, y, w * .51, lipH * .22, 0, Math.PI, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function drawPipe(p) {
    const w = pipeW(), topEnd = p.center - p.gap / 2, bottomStart = p.center + p.gap / 2;
    drawPipeHalf(p.x, 0, w, topEnd, true, p.shimmer);
    drawPipeHalf(p.x, bottomStart, w, groundY() - bottomStart, false, p.shimmer);
    // floating score sparkle near the gap
    if (!p.passed && p.x < width * .82 && p.x > width * .48) {
      const a = .24 + Math.sin(elapsed * 4 + p.shimmer) * .12;
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#fff4c9'; ctx.font = `${unit() * .025}px Outfit`; ctx.textAlign = 'center'; ctx.fillText('✦', p.x + w / 2, p.center + 4); ctx.restore();
    }
  }
  function drawFloor() {
    const gy = groundY();
    const g = ctx.createLinearGradient(0, gy, 0, height);
    g.addColorStop(0, '#f6d990'); g.addColorStop(.12, '#edc779'); g.addColorStop(1, '#d7aa69');
    ctx.fillStyle = g; ctx.fillRect(0, gy, width, height - gy);
    ctx.fillStyle = 'rgba(255,252,223,.78)'; ctx.fillRect(0, gy, width, unit() * .012);
    const stripe = unit() * .12;
    for (let x = -stripe + floorOffset; x < width + stripe; x += stripe) {
      ctx.fillStyle = 'rgba(255,250,220,.19)'; ctx.beginPath(); ctx.moveTo(x, gy + unit() * .012); ctx.lineTo(x + stripe * .38, gy + unit() * .012); ctx.lineTo(x - stripe * .5, height); ctx.lineTo(x - stripe * .85, height); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(170,121,71,.13)';
    for (let i = 0; i < 16; i++) { const x = (i * 173 + floorOffset * .5) % width, y = gy + 14 + (i * 29 % Math.max(20, height - gy - 14)); ctx.beginPath(); ctx.ellipse(x, y, unit() * .006, unit() * .002, .3, 0, Math.PI * 2); ctx.fill(); }
  }
  function drawBird(t) {
    const x = birdX(), y = birdY, r = birdR();
    const bob = state === 'intro' ? Math.sin(t * 2.8) * unit() * .008 : 0;
    ctx.save(); ctx.translate(x, y + bob); ctx.rotate(state === 'intro' ? Math.sin(t * 2) * .06 : birdAngle);
    // soft little shadow
    ctx.fillStyle = 'rgba(62,117,127,.13)'; ctx.beginPath(); ctx.ellipse(-r * .02, r * 1.25, r * 1.12, r * .24, 0, 0, Math.PI * 2); ctx.fill();
    // tail
    ctx.fillStyle = '#f28c57'; ctx.beginPath(); ctx.moveTo(-r * .8, r * .04); ctx.lineTo(-r * 1.46, -r * .24); ctx.lineTo(-r * 1.34, r * .35); ctx.closePath(); ctx.fill();
    // wings behind the body
    ctx.save(); ctx.translate(-r * .23, r * .22); ctx.rotate(state === 'playing' ? Math.sin(t * 23) * .44 - .2 : Math.sin(t * 5) * .14);
    const wg = ctx.createLinearGradient(0, -r * .55, 0, r * .5); wg.addColorStop(0, '#ffcb6b'); wg.addColorStop(1, '#f49a50');
    ctx.fillStyle = wg; ctx.beginPath(); ctx.ellipse(0, 0, r * .58, r * .32, -.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(207,122,55,.38)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-r * .24, r * .04); ctx.quadraticCurveTo(0, r * .15, r * .31, r * .03); ctx.stroke(); ctx.restore();
    // chubby golden body
    const body = ctx.createRadialGradient(-r * .3, -r * .4, r * .08, 0, 0, r * 1.2);
    body.addColorStop(0, '#ffe49a'); body.addColorStop(.55, '#ffc65e'); body.addColorStop(1, '#f2a94c');
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.1, r * .88, -.08, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,246,207,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(-r * .12, -r * .08, r * .78, r * .69, -.13, Math.PI * 1.1, Math.PI * 1.67); ctx.stroke();
    // beak
    ctx.fillStyle = '#f27c58'; ctx.beginPath(); ctx.moveTo(r * .74, -r * .12); ctx.quadraticCurveTo(r * 1.43, -r * .13, r * 1.47, r * .08); ctx.quadraticCurveTo(r * 1.1, r * .3, r * .7, r * .18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,165,.7)'; ctx.beginPath(); ctx.moveTo(r * .96, -r * .03); ctx.quadraticCurveTo(r * 1.2, -r * .08, r * 1.31, r * .01); ctx.lineTo(r * 1.13, r * .04); ctx.closePath(); ctx.fill();
    // oversized, bright eye
    ctx.fillStyle = '#fffdf1'; ctx.beginPath(); ctx.ellipse(r * .44, -r * .31, r * .27, r * .3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#254d5d'; ctx.beginPath(); ctx.arc(r * .52, -r * .29, r * .135, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r * .56, -r * .36, r * .045, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(245,120,99,.42)'; ctx.beginPath(); ctx.ellipse(r * .24, r * .17, r * .18, r * .1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawParticles() {
    for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * .72; ctx.fillStyle = '#fff7dc'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function paint() {
    if (!width || !height) return;
    drawBackdrop(elapsed);
    // clouds and distant landscape establish a clear center flight lane
    if (state !== 'intro' || pipes.length) pipes.forEach(drawPipe);
    drawFloor(); drawParticles(); drawBird(elapsed);
  }
  function frame(now) {
    const dt = lastTime ? Math.min((now - lastTime) / 1000, .04) : 0;
    lastTime = now; update(dt); paint(); requestAnimationFrame(frame);
  }

  $('playButton').addEventListener('click', startGame);
  $('againButton').addEventListener('click', startGame);
  $('pauseButton').addEventListener('click', () => { if (state === 'playing') setState('paused'); });
  $('resumeButton').addEventListener('click', () => { if (state === 'paused') { initAudio(); setState('playing'); lastTime = performance.now(); } });
  ui.sound.addEventListener('click', () => { soundOn = !soundOn; ui.soundIcon.textContent = soundOn ? '♫' : '♪̸'; ui.sound.setAttribute('aria-label', soundOn ? 'Mute sound' : 'Enable sound'); if (soundOn) { initAudio(); chirp(560, .08); } });
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'Enter') {
      if (event.code === 'Space') event.preventDefault();
      if (state === 'intro' || state === 'over') startGame(); else if (state === 'playing') flap(); else if (state === 'paused') { setState('playing'); lastTime = performance.now(); }
    } else if (event.code === 'Escape' || event.code === 'KeyP') {
      if (state === 'playing') setState('paused'); else if (state === 'paused') { setState('playing'); lastTime = performance.now(); }
    }
  });
  document.getElementById('gameShell').addEventListener('pointerdown', (event) => {
    if (event.target.closest('button,a')) return;
    if (state === 'playing') { event.preventDefault(); flap(); }
    else if (state === 'intro' || state === 'over') { /* cards keep their explicit start/retry button */ }
  }, { passive: false });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') setState('paused'); });
  resize(); setState('intro'); requestAnimationFrame(frame);
})();
