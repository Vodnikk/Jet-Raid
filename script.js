(function () {
  'use strict';

  const CONFIG = {
    roadWidthRatio: 0.55,
    jetWidthRatio: 0.22,
    jetHeightRatio: 0.22,
    jetSpeed: 6,
    roadScrollSpeed: 4,
    shadowOffsetY: 4,
    missile: {
      // core missile tuning (standard only)
      standardSpeed: 14,
      standardSpawnChance: 1.0, // all missiles are standard now
      spawnIntervalMs: 800,
      // visual size
      width: 84,
      height: 108,
    },
    gun: {
      bulletSpeed: 26,
      fireIntervalMs: 160,
      bulletRadius: 5,
    },
    intel: {
      perFile: 3,
    },
    score: {
      perMissile: 25,
      perTower: 100,
      survivalPerSecond: 5,
    },
  };

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  let width = 0;
  let height = 0;
  let roadScrollY = 0;
  let jetX = 0;
  let jetY = 0;

  // core images
  let jetImage = null;
  let roadImage = null;
  let desertImage = null;
  let smokeImage = null;

  // scenery and structure images
  let house1Image = null;
  let house2Image = null;
  let palm1Image = null;
  let palm2Image = null;
  let palm3Image = null;
  let barel1Image = null;
  let barel2Image = null;
  let box1Image = null;
  let box2Image = null;
  let tower1Image = null;
  let tower2Image = null;
  let towerExplosionFrames = [];
  let fileImage = null;  // collectable
  let skullImage = null; // game over icon

  const keys = { up: false, down: false, left: false, right: false, fire: false };

  // gameplay state
  let missiles = [];
  let bullets = [];
  let explosions = [];
  let lastMissileSpawn = 0;
  let lastShotTime = 0;

  let score = 0;
  let missilesDestroyed = 0;
  let towersDestroyed = 0;
  let timeAliveMs = 0;
  let hp = 3;
  const MAX_HP = 3;
  let gameOver = false;
  let gameOverStats = null;
  let paused = false;
  let intelPercent = 0;

  // final mission state
  let inFinalMission = false;
  let missionPhase = 'fade_out'; // fade_out | fade_in | choose | fly_to_target | explode | result
  let missionTargetIndex = 0;
  let missionHintIndex = 0;
  let missionCertainty = 0;
  let missionChoiceIndex = -1;
  let missionResolved = false;
  let missionSuccess = false;
  let missionFadeAlpha = 0;
  let missionFadeDuration = 900;
  let missionFadeElapsed = 0;
  let missionJetX = 0;
  let missionJetY = 0;
  let missionChooseTimer = 10;
  let missionChooseTimerElapsed = 0;
  let missionPalaceExplosion = null;
  let missionResultElapsed = 0;
  const MISSION_PALACE_SPACING = 200;
  const MISSION_JET_FLY_SPEED = 4.5;
  const MISSION_CHOOSE_DURATION_MS = 1000;

  // scenery state
  let roadsideProps = []; // houses + palms + towers
  let freeProps = [];     // barrels + boxes
  let collectibles = [];  // dropped files
  let lastRoadsideSpawn = 0;
  let lastFreePropSpawn = 0;
  let towerExplosions = [];

  const CANVAS_WIDTH = 900;
  const CANVAS_HEIGHT = 700;

  function resize() {
    width = CANVAS_WIDTH;
    height = CANVAS_HEIGHT;
    canvas.width = width;
    canvas.height = height;
    jetX = width * 0.5;
    jetY = height * (1 - CONFIG.jetHeightRatio);
  }

  function loadAssets() {
    return Promise.all([
      loadImage('Assets/Images/jet.png'),
      loadImage('Assets/Images/road.png'),
      loadImage('Assets/Images/desert.png'),
      loadImage('Assets/Images/misslesmoke.png'),
      loadImage('Assets/Images/house1.png'),
      loadImage('Assets/Images/house2.png'),
      loadImage('Assets/Images/palm1.png'),
      loadImage('Assets/Images/palm2.png'),
      loadImage('Assets/Images/palm3.png'),
      loadImage('Assets/Images/barel1.png'),
      loadImage('Assets/Images/barel2.png'),
      loadImage('Assets/Images/box1.png'),
      loadImage('Assets/Images/box2.png'),
      loadImage('Assets/Images/tower1.png'),
      loadImage('Assets/Images/tower2.png'),
      loadImage('Assets/Images/explo1.png'),
      loadImage('Assets/Images/explo2.png'),
      loadImage('Assets/Images/explo3.png'),
      loadImage('Assets/Images/explo4.png'),
      loadImage('Assets/Images/file.png').catch(() => null),
      loadImage('Assets/Images/skull.png').catch(() => null),
    ]).then(([
      jet,
      road,
      desert,
      smoke,
      house1,
      house2,
      palm1,
      palm2,
      palm3,
      barel1,
      barel2,
      box1,
      box2,
      tower1,
      tower2,
      explo1,
      explo2,
      explo3,
      explo4,
      fileImg,
      skull,
    ]) => {
      jetImage = jet;
      roadImage = road;
      desertImage = desert;
      smokeImage = smoke;

      house1Image = house1;
      house2Image = house2;
      palm1Image = palm1;
      palm2Image = palm2;
      palm3Image = palm3;
      barel1Image = barel1;
      barel2Image = barel2;
      box1Image = box1;
      box2Image = box2;
      tower1Image = tower1;
      tower2Image = tower2;
      towerExplosionFrames = [explo1, explo2, explo3, explo4];
      fileImage = fileImg;
      skullImage = skull;
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load ' + src));
      img.src = src;
    });
  }

  function getRoadBounds() {
    const roadWidth = width * CONFIG.roadWidthRatio;
    const roadLeft = (width - roadWidth) * 0.5;
    const roadRight = roadLeft + roadWidth;
    return { roadLeft, roadRight, roadWidth };
  }

  // --- Scenery helpers ------------------------------------------------------

  function worldScrollPerFrame(dt) {
    return CONFIG.roadScrollSpeed * (dt / 16);
  }

  function rectanglesOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return dx < (aw + bw) * 0.5 && dy < (ah + bh) * 0.5;
  }

  function canPlaceProp(list, x, y, w, h) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (rectanglesOverlap(x, y, w, h, p.x, p.y, p.w, p.h)) return false;
    }
    return true;
  }

  function spawnRoadsideProp(img, type, yStart) {
    if (!img) return;
    const { roadLeft, roadRight } = getRoadBounds();
    const side = Math.random() < 0.5 ? 'left' : 'right';
    const margin = 40;
    const minX = side === 'left' ? margin : roadRight + margin;
    const maxX = side === 'left' ? roadLeft - margin : width - margin;
    if (maxX <= minX) return;
    const w = img.width;
    const h = img.height;
    const x = minX + Math.random() * (maxX - minX);
    if (!canPlaceProp(roadsideProps, x, yStart, w, h)) return;
    roadsideProps.push({
      type,
      img,
      x,
      y: yStart,
      w,
      h,
      alive: true,
    });
  }

  function spawnFreeProp(img, type, yStart) {
    if (!img) return;
    const margin = 40;
    const w = img.width;
    const h = img.height;
    const x = margin + Math.random() * (width - margin * 2);
    if (!canPlaceProp(freeProps, x, yStart, w, h)) return;
    freeProps.push({
      type,
      img,
      x,
      y: yStart,
      w,
      h,
    });
  }

  function createMissile(x, y) {
    const cfg = CONFIG.missile;
    const angle = 0;
    const speed = cfg.standardSpeed;
  
    missiles.push({
      type: 'standard',
      x,
      y,
      vx: 0,
      vy: speed,
      angle,
      speed,
      w: cfg.width,
      h: cfg.height,
    });
  }

  function updateStandardMissile(m, dt) {
    const scale = dt / 16;
    m.y += CONFIG.missile.standardSpeed * scale;
  }

  function updateMissiles(dt) {
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      updateStandardMissile(m, dt);
      if (m.y > height + m.h || m.y < -m.h || m.x < -m.w || m.x > width + m.w) {
        missiles.splice(i, 1);
      }
    }
  }

  function getMissileDrawAngle(m) {
    // sprite graphic points upward by default, missiles travel downward
    // all missiles are standard now, always point straight down
    return Math.PI;
  }

  function drawMissileSprite(m) {
    if (!smokeImage) return;
    const { w, h } = m;
    const angle = getMissileDrawAngle(m);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(angle);
    ctx.drawImage(smokeImage, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawMissileTrail(m) {
    if (!smokeImage) return;
    const { w, h } = m;
    const angle = getMissileDrawAngle(m);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.7;
    ctx.drawImage(smokeImage, -w * 0.4, h * 0.1, w * 0.8, 20);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawMissiles() {
    missiles.forEach((m) => {
      drawMissileTrail(m);
      drawMissileSprite(m);
    });
  }

  // --- Scenery update/render ------------------------------------------------

  function updateScenery(dt) {
    const dy = worldScrollPerFrame(dt);

    // roadside props (houses, palms, towers)
    for (let i = roadsideProps.length - 1; i >= 0; i--) {
      const p = roadsideProps[i];
      p.y += dy;
      if (p.y > height + p.h + 40) {
        roadsideProps.splice(i, 1);
      }
    }

    // free props (barrels, boxes)
    for (let i = freeProps.length - 1; i >= 0; i--) {
      const p = freeProps[i];
      p.y += dy;
      if (p.y > height + p.h + 40) {
        freeProps.splice(i, 1);
      }
    }

    // collectibles (files)
    for (let i = collectibles.length - 1; i >= 0; i--) {
      const c = collectibles[i];
      c.y += dy;
      if (c.y > height + c.h + 40) {
        collectibles.splice(i, 1);
      }
    }

    // tower explosions
    for (let i = towerExplosions.length - 1; i >= 0; i--) {
      const e = towerExplosions[i];
      e.t += dt;
      if (e.t >= e.frameDuration) {
        e.t -= e.frameDuration;
        e.frame++;
        if (e.frame >= towerExplosionFrames.length) {
          towerExplosions.splice(i, 1);
          continue;
        }
      }
    }
  }

  function drawScenery() {
    // roadside props
    roadsideProps.forEach((p) => {
      ctx.drawImage(p.img, p.x - p.w / 2, p.y - p.h, p.w, p.h);
    });

    // free props
    freeProps.forEach((p) => {
      ctx.drawImage(p.img, p.x - p.w / 2, p.y - p.h, p.w, p.h);
    });

    // collectibles
    collectibles.forEach((c) => {
      ctx.drawImage(c.img, c.x - c.w / 2, c.y - c.h, c.w, c.h);
    });

    // tower explosions
    towerExplosions.forEach((e) => {
      const frameImg = towerExplosionFrames[e.frame];
      if (!frameImg) return;
      const w = frameImg.width;
      const h = frameImg.height;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.drawImage(frameImg, -w / 2, -h / 2, w, h);
      ctx.restore();
    });
  }

  function spawnMissiles(now) {
    if (now - lastMissileSpawn < CONFIG.missile.spawnIntervalMs) return;
    lastMissileSpawn = now;
    const x = 80 + Math.random() * (width - 160);
    createMissile(x, -30);
  }

  function spawnScenery(now) {
    // roadside houses, palms, and towers
    const roadsideInterval = 800; // spawn a bit more often
    if (now - lastRoadsideSpawn >= roadsideInterval) {
      lastRoadsideSpawn = now;

      const choice = Math.random();
      if (choice < 0.28) {
        const img = Math.random() < 0.5 ? house1Image : house2Image;
        spawnRoadsideProp(img, 'house', -40);
      } else if (choice < 0.56) {
        const palmPool = [palm1Image, palm2Image, palm3Image].filter(Boolean);
        if (palmPool.length) {
          const img = palmPool[Math.floor(Math.random() * palmPool.length)];
          spawnRoadsideProp(img, 'palm', -40);
        }
      } else {
        const img = Math.random() < 0.5 ? tower1Image : tower2Image;
        spawnRoadsideProp(img, 'tower', -40);
      }
    }

    // free props (barrels/boxes) anywhere
    const freeInterval = 900;
    if (now - lastFreePropSpawn >= freeInterval) {
      lastFreePropSpawn = now;
      const r = Math.random();
      let img = null;
      if (r < 0.25) img = barel1Image;
      else if (r < 0.5) img = barel2Image;
      else if (r < 0.75) img = box1Image;
      else img = box2Image;
      spawnFreeProp(img, 'prop', -40);
    }
  }

  function hitTestMissileJet(m) {
    const halfW = jetImage ? (getRoadBounds().roadWidth * CONFIG.jetWidthRatio) * 0.5 : 30;
    const halfH = jetImage ? halfW * (jetImage.height / jetImage.width) : 30;
    const dx = Math.abs(m.x - jetX);
    const dy = Math.abs(m.y - jetY);
    return dx < halfW + m.w / 2 && dy < halfH + m.h / 2;
  }

  function hitTestMissileMissile(a, b) {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const sumHalfW = (a.w + b.w) * 0.5;
    const sumHalfH = (a.h + b.h) * 0.5;
    return dx < sumHalfW && dy < sumHalfH;
  }

  function spawnExplosion(x, y) {
    // missile / jet explosions: use same sprite frames as towers, but scaled down
    explosions.push({
      x,
      y,
      frame: 0,
      t: 0,
      frameDuration: 70,
      scale: 0.55,
    });
  }

  function spawnTowerExplosion(x, y) {
    if (!towerExplosionFrames.length) return;
    towerExplosions.push({
      x,
      y,
      frame: 0,
      t: 0,
      frameDuration: 70,
    });
  }

  function checkMissileCollisions() {
    const missileIndicesToRemove = new Set();
    const explosionsToAdd = [];

    // missile vs jet and missile vs missile
    for (let i = 0; i < missiles.length; i++) {
      const mi = missiles[i];
      if (hitTestMissileJet(mi)) {
        missileIndicesToRemove.add(i);
        explosionsToAdd.push({ x: mi.x, y: mi.y });
        if (!gameOver) {
          hp -= 1;
          spawnExplosion(jetX, jetY);
          if (hp <= 0) {
            gameOver = true;
            paused = false;
            const timeSeconds = Math.floor(timeAliveMs / 1000);
            gameOverStats = {
              score,
              missilesDestroyed,
              towersDestroyed,
              timeSeconds,
            };
          }
        }
      }
      for (let j = i + 1; j < missiles.length; j++) {
        const mj = missiles[j];
        if (hitTestMissileMissile(mi, mj)) {
          missileIndicesToRemove.add(i);
          missileIndicesToRemove.add(j);
          explosionsToAdd.push({ x: mi.x, y: mi.y });
          explosionsToAdd.push({ x: mj.x, y: mj.y });
        }
      }
    }

    const sortedMissiles = Array.from(missileIndicesToRemove).sort((a, b) => b - a);
    sortedMissiles.forEach((i) => missiles.splice(i, 1));
    explosionsToAdd.forEach(({ x, y }) => spawnExplosion(x, y));
  }

  function hitTestBulletMissile(b, m) {
    const dx = Math.abs(b.x - m.x);
    const dy = Math.abs(b.y - m.y);
    const sumHalfW = m.w * 0.5 + b.r;
    const sumHalfH = m.h * 0.5 + b.r;
    return dx < sumHalfW && dy < sumHalfH;
  }

  function hitTestBulletTower(b, t) {
    const dx = Math.abs(b.x - t.x);
    const dy = Math.abs(b.y - t.y);
    const sumHalfW = t.w * 0.5 + b.r;
    const sumHalfH = t.h * 0.5 + b.r;
    return dx < sumHalfW && dy < sumHalfH;
  }

  function checkBulletCollisions() {
    // bullets vs missiles
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      let bulletRemoved = false;
      for (let j = missiles.length - 1; j >= 0; j--) {
        const m = missiles[j];
        if (hitTestBulletMissile(b, m)) {
          missiles.splice(j, 1);
          spawnExplosion(m.x, m.y);
          score += CONFIG.score.perMissile;
          missilesDestroyed += 1;
          bullets.splice(i, 1);
          bulletRemoved = true;
          break;
        }
      }
      if (bulletRemoved) continue;

      // bullets vs towers (roadside props) — only when visible on screen
      for (let tIndex = roadsideProps.length - 1; tIndex >= 0; tIndex--) {
        const t = roadsideProps[tIndex];
        if (t.type !== 'tower') continue;
        // require tower bottom to be within or just above the canvas to be hittable
        if (t.y - t.h > height) continue;
        if (hitTestBulletTower(b, t)) {
          roadsideProps.splice(tIndex, 1);
          spawnTowerExplosion(t.x, t.y - t.h * 0.5);

          // 30% chance to drop a collectable file (small, similar to box2)
          if (fileImage && Math.random() < 0.3) {
            // scale file sprite down to be very small (7x smaller)
            const baseScale = box2Image ? box2Image.width / fileImage.width : 0.35;
            const scale = baseScale / 7;
            const w = fileImage.width * scale;
            const h = fileImage.height * scale;
            collectibles.push({
              img: fileImage,
              x: t.x,
              y: t.y,
              w,
              h,
            });
          }

          score += CONFIG.score.perTower;
          towersDestroyed += 1;
          bullets.splice(i, 1);
          bulletRemoved = true;
          break;
        }
      }
    }
  }

  function hitTestJetCollectible(c) {
    const halfW = jetImage
      ? (getRoadBounds().roadWidth * CONFIG.jetWidthRatio) * 0.5
      : 30;
    const halfH = jetImage
      ? halfW * (jetImage.height / jetImage.width)
      : 30;
    const dx = Math.abs(c.x - jetX);
    const dy = Math.abs(c.y - jetY);
    return dx < halfW + c.w * 0.5 && dy < halfH + c.h * 0.5;
  }

  function addIntel(amount) {
    intelPercent = Math.max(0, Math.min(100, intelPercent + amount));
  }

  function showIntelComment() {
    const comments = [
      'Heat signature visible.',
      'Enemy seen near a palace.',
      'Satellite picked up movement.',
      'Thermal spike on the ground.',
      'Recon just flagged new activity.',
    ];

    const text = comments[Math.floor(Math.random() * comments.length)];

    const textEl = document.getElementById('intelText');
    if (textEl) {
      textEl.innerText = text;
    }

    const gifEl = document.getElementById('advisorGif');
    if (gifEl) {
      // Restart GIF animation each time intel is collected
      const baseSrc = 'Assets/Images/cap.gif';
      gifEl.src = `${baseSrc}?t=${Date.now()}`;
    }
  }

  function updateExplosions(dt) {
    for (let i = explosions.length - 1; i >= 0; i--) {
      const e = explosions[i];
      e.t += dt;
      if (e.t >= e.frameDuration) {
        e.t -= e.frameDuration;
        e.frame++;
        if (e.frame >= towerExplosionFrames.length) {
          explosions.splice(i, 1);
        }
      }
    }
  }

  function drawExplosions() {
    explosions.forEach((e) => {
      const frameImg = towerExplosionFrames[e.frame];
      if (!frameImg) return;
      const scale = e.scale ?? 0.55;
      const w = frameImg.width * scale;
      const h = frameImg.height * scale;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.drawImage(frameImg, -w / 2, -h / 2, w, h);
      ctx.restore();
    });
  }

  function drawDesert() {
    if (!desertImage) return;

    const dw = desertImage.width;
    const dh = desertImage.height;
    const offset = (roadScrollY % dh + dh) % dh;
    const drawHeight = height + dh;

    let y = -offset;
    while (y < drawHeight) {
      let x = 0;
      while (x < width) {
        ctx.drawImage(desertImage, x, y, dw, dh);
        x += dw;
      }
      y += dh;
    }
  }

  function drawRoad() {
    const { roadLeft, roadWidth } = getRoadBounds();
    if (!roadImage) return;

    const th = roadImage.height;
    const drawHeight = height + th;
    const offset = (roadScrollY % th + th) % th;

    ctx.save();
    ctx.beginPath();
    ctx.rect(roadLeft, 0, roadWidth, height);
    ctx.clip();

    let y = -offset;
    while (y < drawHeight) {
      ctx.drawImage(roadImage, roadLeft, y, roadWidth, th);
      y += th;
    }

    ctx.restore();
  }

  function drawJet() {
    if (!jetImage) return;

    const { roadWidth } = getRoadBounds();
    const jetW = roadWidth * CONFIG.jetWidthRatio;
    const jetH = jetW * (jetImage.height / jetImage.width);
    const x = jetX - jetW * 0.5;
    const y = jetY - jetH * 0.5;

    ctx.save();

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(jetX, jetY + CONFIG.shadowOffsetY, jetW * 0.4, jetH * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(jetImage, x, y, jetW, jetH);
    ctx.restore();
  }

  // --- Jet gun (bullets) ----------------------------------------------------

  function createBullet() {
    const cfg = CONFIG.gun;
    const { roadWidth } = getRoadBounds();
    const jetW = roadWidth * CONFIG.jetWidthRatio;
    const jetH = jetImage ? jetW * (jetImage.height / jetImage.width) : 40;
    const startX = jetX;
    const startY = jetY - jetH * 0.6;

    bullets.push({
      x: startX,
      y: startY,
      vy: -cfg.bulletSpeed,
      r: cfg.bulletRadius,
    });
  }

  function spawnBullets(now) {
    const cfg = CONFIG.gun;
    if (!keys.fire) return;
    if (now - lastShotTime < cfg.fireIntervalMs) return;
    lastShotTime = now;
    createBullet();
  }

  function updateBullets(dt) {
    const dy = CONFIG.gun.bulletSpeed * (dt / 16);
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.y -= dy;
      if (b.y < -20) {
        bullets.splice(i, 1);
      }
    }
  }

  function drawBullets() {
    ctx.save();
    ctx.fillStyle = '#ffeb8a';
    bullets.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawHUD() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(10, 10, 230, 86);

    ctx.fillStyle = '#ffffff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillText(`Score: ${Math.floor(score)}`, 20, 16);
    const timeSeconds = Math.floor(timeAliveMs / 1000);
    ctx.fillText(`Time: ${timeSeconds}s`, 20, 34);

    const hpText = 'HP: ' + '❤'.repeat(hp) + ' '.repeat(Math.max(0, MAX_HP - hp));
    ctx.fillText(hpText, 20, 52);

    // intel bar
    const barX = 20;
    const barY = 72;
    const barW = 190;
    const barH = 10;
    ctx.fillStyle = '#333333';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#4caf50';
    const filledW = (barW * Math.max(0, Math.min(100, intelPercent))) / 100;
    ctx.fillRect(barX, barY, filledW, barH);

    ctx.fillStyle = '#ffffff';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`INTEL ${intelPercent.toFixed(0)}%`, barX + barW / 2, barY + barH / 2);

    ctx.restore();
  }

  function drawGameOver() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = '36px sans-serif';
    ctx.fillText('GAME OVER', width / 2, height / 2 - 120);

    if (skullImage) {
      const skullSize = 96;
      ctx.drawImage(
        skullImage,
        width / 2 - skullSize / 2,
        height / 2 - skullSize / 2 - 20,
        skullSize,
        skullSize
      );
    }

    const stats = gameOverStats || {
      score: Math.floor(score),
      missilesDestroyed,
      towersDestroyed,
      timeSeconds: Math.floor(timeAliveMs / 1000),
    };

    ctx.font = '18px sans-serif';
    let y = height / 2 + 60;
    ctx.fillText(`Score: ${Math.floor(stats.score)}`, width / 2, y);
    y += 24;
    ctx.fillText(`Time: ${stats.timeSeconds}s`, width / 2, y);
    y += 24;
    ctx.fillText(`Missiles destroyed: ${stats.missilesDestroyed}`, width / 2, y);
    y += 24;
    ctx.fillText(`Towers destroyed: ${stats.towersDestroyed}`, width / 2, y);
    y += 40;

    // respawn button
    const btnW = 260;
    const btnH = 52;
    const btnX = width / 2 - btnW / 2;
    const btnY = y;

    ctx.fillStyle = 'rgba(30, 30, 30, 0.9)';
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = '#ffcc66';
    ctx.lineWidth = 3;
    ctx.strokeRect(btnX, btnY, btnW, btnH);

    ctx.fillStyle = '#ffeb8a';
    ctx.font = '20px sans-serif';
    ctx.fillText('RESPAWN  (R)', width / 2, btnY + 14);

    ctx.restore();
  }

  function drawPauseMenu() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = '32px sans-serif';
    ctx.fillText('PAUSED', width / 2, height / 2 - 100);

    ctx.font = '18px sans-serif';
    let y = height / 2 - 50;
    ctx.fillText('ESC - Resume', width / 2, y);
    y += 26;
    ctx.fillText('R - Restart', width / 2, y);
    y += 26;
    ctx.fillText('SPACE - Fire', width / 2, y);
    y += 26;
    ctx.fillText('WASD / Arrows - Move', width / 2, y);

    ctx.restore();
  }

  function getMissionPalacePositions() {
    const cx = width / 2;
    const baseY = height - 180;
    return [
      { x: cx - MISSION_PALACE_SPACING, y: baseY, img: house1Image },
      { x: cx, y: baseY, img: house2Image },
      { x: cx + MISSION_PALACE_SPACING, y: baseY, img: house1Image },
    ];
  }

  function startFinalMission() {
    inFinalMission = true;
    paused = false;
    missionPhase = 'fade_out';
    missionFadeAlpha = 0;
    missionFadeElapsed = 0;
    missionChoiceIndex = -1;
    missionResolved = false;
    missionSuccess = false;
    missionJetX = 0;
    missionJetY = 0;
    missionPalaceExplosion = null;
    missionResultElapsed = 0;

    missionTargetIndex = Math.floor(Math.random() * 3);
    missionCertainty = Math.min(50, intelPercent);
    if (Math.random() * 100 < missionCertainty && missionCertainty > 0) {
      missionHintIndex = missionTargetIndex;
    } else {
      const others = [0, 1, 2].filter((i) => i !== missionTargetIndex);
      missionHintIndex = others[Math.floor(Math.random() * others.length)];
    }
  }

  function pickMissionPalace(choiceIndex) {
    if (missionChoiceIndex >= 0 || missionPhase !== 'choose') return;
    missionChoiceIndex = choiceIndex;
    const palaces = getMissionPalacePositions();
    const target = palaces[choiceIndex];
    if (!target) return;
    missionJetX = target.x;
    missionJetY = height + 80;
    missionPhase = 'fly_to_target';
  }

  function updateFinalMission(dt) {
    if (missionPhase === 'fade_out') {
      missionFadeElapsed += dt;
      missionFadeAlpha = Math.min(1, missionFadeElapsed / missionFadeDuration);
      if (missionFadeAlpha >= 1) {
        missionPhase = 'fade_in';
        missionFadeElapsed = 0;
      }
      return;
    }

    if (missionPhase === 'fade_in') {
      missionFadeElapsed += dt;
      missionFadeAlpha = Math.max(0, 1 - missionFadeElapsed / missionFadeDuration);
      if (missionFadeElapsed >= missionFadeDuration) {
        missionFadeAlpha = 0;
        missionPhase = 'choose';
        missionChooseTimer = 10;
        missionChooseTimerElapsed = 0;
      }
      return;
    }

    if (missionPhase === 'choose') {
      missionChooseTimerElapsed += dt;
      if (missionChooseTimerElapsed >= MISSION_CHOOSE_DURATION_MS) {
        missionChooseTimerElapsed -= MISSION_CHOOSE_DURATION_MS;
        missionChooseTimer -= 1;
        if (missionChooseTimer <= 0) {
          missionChooseTimer = 0;
          if (missionChoiceIndex < 0) {
            missionChoiceIndex = missionHintIndex;
          }
          const palaces = getMissionPalacePositions();
          const target = palaces[missionChoiceIndex];
          if (target) {
            missionJetX = target.x;
            missionJetY = height + 80;
            missionPhase = 'fly_to_target';
          }
        }
      }
      return;
    }

    if (missionPhase === 'fly_to_target') {
      const move = MISSION_JET_FLY_SPEED * (dt / 16);
      missionJetY -= move;
      if (missionJetY < -80) {
        const palaces = getMissionPalacePositions();
        const chosen = palaces[missionChoiceIndex];
        if (chosen) {
          missionPalaceExplosion = {
            x: chosen.x,
            y: chosen.y - (chosen.img ? chosen.img.height * 0.5 : 60),
            frame: 0,
            t: 0,
            frameDuration: 70,
          };
        }
        missionSuccess = missionChoiceIndex === missionTargetIndex;
        missionPhase = 'explode';
      }
      return;
    }

    if (missionPhase === 'explode') {
      if (missionPalaceExplosion) {
        missionPalaceExplosion.t += dt;
        if (missionPalaceExplosion.t >= missionPalaceExplosion.frameDuration) {
          missionPalaceExplosion.t = 0;
          missionPalaceExplosion.frame += 1;
          if (missionPalaceExplosion.frame >= towerExplosionFrames.length) {
            missionPalaceExplosion = null;
            missionPhase = 'result';
            missionResolved = true;
            gameOver = true;
            gameOverStats = {
              score,
              missilesDestroyed,
              towersDestroyed,
              timeSeconds: Math.floor(timeAliveMs / 1000),
            };
          }
        }
      } else {
        missionPhase = 'result';
        missionResolved = true;
        gameOver = true;
        gameOverStats = {
          score,
          missilesDestroyed,
          towersDestroyed,
          timeSeconds: Math.floor(timeAliveMs / 1000),
        };
      }
      return;
    }

    if (missionPhase === 'result') {
      missionResultElapsed += dt;
    }
  }

  function getMissionIntelText() {
    const labels = ['1', '2', '3'];
    const sector = labels[missionHintIndex];
    if (missionCertainty > 30) {
      return `Heat signature detected at Palace ${sector}. Confidence: ${missionCertainty}%`;
    }
    if (missionCertainty > 10) {
      return `Unconfirmed thermal reading near Palace ${sector}. Low confidence.`;
    }
    return 'Insufficient intel — no reliable heat signature. Pick a target.';
  }

  function drawFinalMission() {
    const palaces = getMissionPalacePositions();
    const labels = ['1', '2', '3'];

    if (missionPhase === 'fade_out') {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${missionFadeAlpha})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      return;
    }

    function drawMissionScene(drawJet, overlayAlpha) {
      if (desertImage) {
        const dw = desertImage.width;
        const dh = desertImage.height;
        let y = 0;
        while (y < height) {
          let x = 0;
          while (x < width) {
            ctx.drawImage(desertImage, x, y, dw, dh);
            x += dw;
          }
          y += dh;
        }
      } else {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#2d3a2d';
        ctx.fillRect(0, height * 0.6, width, height);
      }
      for (let i = 0; i < palaces.length; i++) {
        const p = palaces[i];
        const img = p.img || house1Image;
        if (img) {
          const w = img.width * 0.7;
          const h = img.height * 0.7;
          ctx.drawImage(img, p.x - w / 2, p.y - h, w, h);
        }
        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`Palace ${labels[i]} (${labels[i]})`, p.x, p.y + 8);
        ctx.fillStyle = '#1a1a1a';
      }
      if (drawJet && jetImage) {
        const jetW = 70;
        const jetH = jetW * (jetImage.height / jetImage.width);
        ctx.drawImage(jetImage, missionJetX - jetW / 2, missionJetY - jetH / 2, jetW, jetH);
      }
      if (missionPalaceExplosion) {
        const e = missionPalaceExplosion;
        const frameImg = towerExplosionFrames[e.frame];
        if (frameImg) {
          const w = frameImg.width;
          const h = frameImg.height;
          ctx.save();
          ctx.translate(e.x, e.y);
          ctx.drawImage(frameImg, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
      }
      if (overlayAlpha > 0) {
        ctx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
        ctx.fillRect(0, 0, width, height);
      }
    }

    if (missionPhase === 'fade_in') {
      ctx.save();
      drawMissionScene(false, 0);
      ctx.fillStyle = `rgba(0,0,0,${missionFadeAlpha})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      return;
    }

    if (missionPhase === 'choose') {
      ctx.save();
      drawMissionScene(false, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(width / 2 - 220, 18, 440, 100);
      ctx.strokeStyle = '#6a8a6a';
      ctx.lineWidth = 2;
      ctx.strokeRect(width / 2 - 220, 18, 440, 100);
      ctx.fillStyle = '#fff';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Choose target palace: 1, 2, or 3', width / 2, 32);
      ctx.fillStyle = '#b8e0b8';
      ctx.font = '14px sans-serif';
      ctx.fillText(getMissionIntelText(), width / 2, 56);
      ctx.fillStyle = '#aaa';
      ctx.font = '12px sans-serif';
      ctx.fillText('Press 1, 2, or 3 to strike', width / 2, 78);
      ctx.font = 'bold 28px sans-serif';
      ctx.fillStyle = missionChooseTimer <= 3 ? '#ff6666' : '#ffeb8a';
      ctx.fillText(`${missionChooseTimer}`, width / 2, 98);
      ctx.restore();
      return;
    }

    if (missionPhase === 'fly_to_target' || missionPhase === 'explode') {
      ctx.save();
      drawMissionScene(true, 0);
      ctx.restore();
      return;
    }

    if (missionPhase === 'result') {
      drawFinalMissionResult();
    }
  }

  function drawFinalMissionResult() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '36px sans-serif';
    if (missionSuccess) {
      ctx.fillStyle = '#6bcf70';
      ctx.fillText('MISSION SUCCESS', width / 2, 80);
    } else {
      ctx.fillStyle = '#e05555';
      ctx.fillText('MISSION FAILED', width / 2, 80);
      if (skullImage) {
        const sz = 100;
        ctx.drawImage(skullImage, width / 2 - sz / 2, 120, sz, sz);
      }
      ctx.fillStyle = '#aaa';
      ctx.font = '14px sans-serif';
      ctx.fillText('Wrong palace — target escaped.', width / 2, 230);
    }

    const stats = gameOverStats || { score: 0, missilesDestroyed: 0, towersDestroyed: 0, timeSeconds: 0 };
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    let y = height / 2 - 40;
    ctx.fillText(`Score: ${Math.floor(stats.score)}`, width / 2, y);
    y += 26;
    ctx.fillText(`Time: ${stats.timeSeconds}s`, width / 2, y);
    y += 26;
    ctx.fillText(`Missiles destroyed: ${stats.missilesDestroyed}`, width / 2, y);
    y += 26;
    ctx.fillText(`Towers destroyed: ${stats.towersDestroyed}`, width / 2, y);
    y += 44;

    ctx.fillStyle = 'rgba(40,40,40,0.95)';
    ctx.fillRect(width / 2 - 130, y, 260, 52);
    ctx.strokeStyle = '#ffcc66';
    ctx.lineWidth = 3;
    ctx.strokeRect(width / 2 - 130, y, 260, 52);
    ctx.fillStyle = '#ffeb8a';
    ctx.font = '20px sans-serif';
    ctx.fillText('RESPAWN (R)', width / 2, y + 16);
    ctx.restore();
  }

  function isInsideRespawnButton(x, y) {
    const btnW = 260;
    const btnH = 52;
    const centerY = height / 2 + 60 + 24 * 3 + 40; // match drawGameOver layout
    const btnX = width / 2 - btnW / 2;
    const btnY = centerY;
    return x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH;
  }

  function resetGame() {
    score = 0;
    missilesDestroyed = 0;
    towersDestroyed = 0;
    timeAliveMs = 0;
    hp = MAX_HP;
    gameOver = false;
    gameOverStats = null;
    paused = false;
    intelPercent = 0;
    inFinalMission = false;
    missionPhase = 'fade_out';
    missionChoiceIndex = -1;
    missionResolved = false;
    missionSuccess = false;
    missionPalaceExplosion = null;

    missiles = [];
    bullets = [];
    explosions = [];
    roadsideProps = [];
    freeProps = [];
    collectibles = [];
    towerExplosions = [];

    lastMissileSpawn = 0;
    lastShotTime = 0;
    lastRoadsideSpawn = 0;
    lastFreePropSpawn = 0;

    roadScrollY = 0;
    jetX = width * 0.5;
    jetY = height * (1 - CONFIG.jetHeightRatio);
  }

  function update(dt) {
    if (!gameOver && !paused && !inFinalMission) {
      const s = CONFIG.jetSpeed * (dt / 16);
      if (keys.left) jetX -= s;
      if (keys.right) jetX += s;
      if (keys.up) jetY -= s;
      if (keys.down) jetY += s;
    }

    const halfW = jetImage
      ? (getRoadBounds().roadWidth * CONFIG.jetWidthRatio) * 0.5
      : 30;
    const halfH = jetImage
      ? halfW * (jetImage.height / jetImage.width)
      : 30;
    jetX = Math.max(halfW, Math.min(width - halfW, jetX));
    jetY = Math.max(halfH, Math.min(height - halfH, jetY));

    if (!gameOver && !paused && !inFinalMission) {
      timeAliveMs += dt;
      score += (CONFIG.score.survivalPerSecond * dt) / 1000;
      roadScrollY -= CONFIG.roadScrollSpeed * (dt / 16);

      updateMissiles(dt);
      checkMissileCollisions();
      updateBullets(dt);
      checkBulletCollisions();
      // jet collecting intel files
      for (let i = collectibles.length - 1; i >= 0; i--) {
        const c = collectibles[i];
        if (hitTestJetCollectible(c)) {
          collectibles.splice(i, 1);
          addIntel(CONFIG.intel.perFile);
          showIntelComment();
        }
      }
      updateScenery(dt);
      updateExplosions(dt);

      // trigger final mission after 60 seconds of flight
      if (!inFinalMission && timeAliveMs >= 60000) {
        startFinalMission();
      }
    } else if (inFinalMission) {
      updateFinalMission(dt);
    } else {
      // let explosions + scenery finish even after game over / paused
      updateScenery(dt);
      updateExplosions(dt);
    }
  }

  function draw() {
    drawDesert();
    drawRoad();
    drawScenery();
    drawJet();
    drawBullets();
    drawMissiles();
    drawExplosions();
    drawHUD();
    if (gameOver && inFinalMission) {
      drawFinalMissionResult();
    } else if (gameOver) {
      drawGameOver();
    } else if (inFinalMission) {
      drawFinalMission();
    } else if (paused) {
      drawPauseMenu();
    }
  }

  function loop(now) {
    const prev = loop.last || now;
    const dt = Math.min(now - prev, 64);
    loop.last = now;

    if (!gameOver && !paused && !inFinalMission) {
      spawnMissiles(now);
      spawnScenery(now);
      spawnBullets(now);
    }

    update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  function onKey(e, down) {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') keys.up = down;
    if (k === 's' || k === 'arrowdown') keys.down = down;
    if (k === 'a' || k === 'arrowleft') keys.left = down;
    if (k === 'd' || k === 'arrowright') keys.right = down;
    if (k === ' ' || k === 'space') keys.fire = down;
    if (down && k === 'r' && gameOver) {
      resetGame();
    }
    if (down && k === 'escape' && !gameOver && !inFinalMission) {
      paused = !paused;
    }
    if (down && inFinalMission && !gameOver && (k === '1' || k === '2' || k === '3')) {
      const choiceIndex = parseInt(k, 10) - 1;
      pickMissionPalace(choiceIndex);
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      e.preventDefault();
    }
  }

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  canvas.addEventListener('click', (e) => {
    if (!gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    if (inFinalMission) {
      const btnX = width / 2 - 130;
      const btnY = height / 2 - 40 + 26 * 4 + 44;
      if (x >= btnX && x <= btnX + 260 && y >= btnY && y <= btnY + 52) {
        resetGame();
      }
    } else if (isInsideRespawnButton(x, y)) {
      resetGame();
    }
  });

  resize();
  loadAssets()
    .then(() => requestAnimationFrame(loop))
    .catch((err) => console.error(err));
})();
