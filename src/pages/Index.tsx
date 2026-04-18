import { useEffect, useRef, useState, useCallback } from "react";

// ─── Constants ──────────────────────────────────────────────────────────────
const W = 800;
const H = 500;
const PLAYER_SPEED = 4;
const BULLET_SPEED = 9;
const ENEMY_BASE_SPEED = 1.2;

// ─── Types ──────────────────────────────────────────────────────────────────
interface Vec2 { x: number; y: number; }

interface Player {
  x: number; y: number;
  w: number; h: number;
  hp: number; maxHp: number;
  ammo: number; maxAmmo: number;
  reloading: boolean; reloadTimer: number;
  shootCooldown: number;
  shield: number;
  score: number;
  kills: number;
}

interface Bullet {
  id: number; x: number; y: number;
  vx: number; vy: number;
  friendly: boolean;
  dmg: number;
  r: number;
}

interface Enemy {
  id: number; x: number; y: number;
  w: number; h: number;
  hp: number; maxHp: number;
  speed: number;
  vx: number; vy: number;
  type: "grunt" | "tank" | "fast" | "boss";
  shootTimer: number; shootRate: number;
  reward: number;
  color: string;
}

interface Particle {
  id: number; x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  r: number; color: string;
}

interface GameState {
  phase: "menu" | "playing" | "paused" | "dead" | "wave_clear";
  wave: number;
  waveTimer: number;
  spawnQueue: number;
  spawnTimer: number;
  totalScore: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
let nextId = 1;
const uid = () => nextId++;

function rect(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function spawnEnemy(wave: number): Enemy {
  const side = Math.floor(Math.random() * 4);
  let x = 0, y = 0;
  if (side === 0) { x = Math.random() * W; y = -40; }
  else if (side === 1) { x = W + 40; y = Math.random() * H; }
  else if (side === 2) { x = Math.random() * W; y = H + 40; }
  else { x = -40; y = Math.random() * H; }

  const roll = Math.random();
  const isBoss = wave % 5 === 0 && Math.random() < 0.15;

  if (isBoss) {
    return { id: uid(), x, y, w: 52, h: 52, hp: 400 + wave * 60, maxHp: 400 + wave * 60,
      speed: 0.7, vx: 0, vy: 0, type: "boss", shootTimer: 0, shootRate: 80,
      reward: 500, color: "#ff2020" };
  } else if (roll < 0.2) {
    return { id: uid(), x, y, w: 36, h: 36, hp: 80 + wave * 15, maxHp: 80 + wave * 15,
      speed: 0.8, vx: 0, vy: 0, type: "tank", shootTimer: 0, shootRate: 120,
      reward: 80, color: "#e67e22" };
  } else if (roll < 0.4) {
    return { id: uid(), x, y, w: 22, h: 22, hp: 25 + wave * 5, maxHp: 25 + wave * 5,
      speed: ENEMY_BASE_SPEED * 2.2 + wave * 0.1, vx: 0, vy: 0, type: "fast",
      shootTimer: 0, shootRate: 999, reward: 30, color: "#2ecc71" };
  } else {
    return { id: uid(), x, y, w: 28, h: 28, hp: 40 + wave * 10, maxHp: 40 + wave * 10,
      speed: ENEMY_BASE_SPEED + wave * 0.08, vx: 0, vy: 0, type: "grunt",
      shootTimer: 0, shootRate: 150, reward: 20, color: "#e74c3c" };
  }
}

function makeParticles(x: number, y: number, color: string, count = 8): Particle[] {
  return Array.from({ length: count }, () => ({
    id: uid(), x, y,
    vx: (Math.random() - 0.5) * 6,
    vy: (Math.random() - 0.5) * 6,
    life: 30 + Math.random() * 20,
    maxLife: 50,
    r: 2 + Math.random() * 4,
    color,
  }));
}

// ─── Draw helpers ────────────────────────────────────────────────────────────
function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Game Component ──────────────────────────────────────────────────────────
export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>({
    phase: "menu", wave: 1, waveTimer: 0, spawnQueue: 0, spawnTimer: 0, totalScore: 0,
  });
  const playerRef = useRef<Player>({
    x: W / 2 - 16, y: H / 2 - 16,
    w: 32, h: 32,
    hp: 100, maxHp: 100,
    ammo: 30, maxAmmo: 30,
    reloading: false, reloadTimer: 0,
    shootCooldown: 0,
    shield: 0,
    score: 0, kills: 0,
  });
  const bulletsRef = useRef<Bullet[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const keysRef = useRef<Record<string, boolean>>({});
  const mouseRef = useRef<Vec2>({ x: W / 2, y: H / 2 });
  const mouseDownRef = useRef(false);
  const frameRef = useRef(0);
  const [ui, setUi] = useState({ phase: "menu" as GameState["phase"], wave: 1, score: 0 });
  const [highScore, setHighScore] = useState(() => {
    try { return parseInt(localStorage.getItem("fol_hs") || "0"); } catch { return 0; }
  });

  const resetGame = useCallback(() => {
    nextId = 1;
    stateRef.current = { phase: "playing", wave: 1, waveTimer: 0, spawnQueue: 8, spawnTimer: 60, totalScore: 0 };
    playerRef.current = {
      x: W / 2 - 16, y: H / 2 - 16, w: 32, h: 32,
      hp: 100, maxHp: 100, ammo: 30, maxAmmo: 30,
      reloading: false, reloadTimer: 0, shootCooldown: 0, shield: 0, score: 0, kills: 0,
    };
    bulletsRef.current = [];
    enemiesRef.current = [];
    particlesRef.current = [];
    setUi({ phase: "playing", wave: 1, score: 0 });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const onKey = (e: KeyboardEvent, down: boolean) => {
      keysRef.current[e.key.toLowerCase()] = down;
      if (down && e.key.toLowerCase() === "r" && !playerRef.current.reloading && playerRef.current.ammo < playerRef.current.maxAmmo) {
        playerRef.current.reloading = true;
        playerRef.current.reloadTimer = 120;
      }
      if (down && e.key === " ") {
        const gs = stateRef.current;
        if (gs.phase === "menu") { resetGame(); }
        else if (gs.phase === "paused") { gs.phase = "playing"; setUi(u => ({ ...u, phase: "playing" })); }
        else if (gs.phase === "playing") { gs.phase = "paused"; setUi(u => ({ ...u, phase: "paused" })); }
        else if (gs.phase === "dead") { resetGame(); }
        else if (gs.phase === "wave_clear") { startNextWave(); }
        e.preventDefault();
      }
    };

    const startNextWave = () => {
      const gs = stateRef.current;
      gs.wave++;
      gs.phase = "playing";
      gs.spawnQueue = 6 + gs.wave * 3;
      gs.spawnTimer = 90;
      playerRef.current.ammo = playerRef.current.maxAmmo;
      playerRef.current.reloading = false;
      setUi(u => ({ ...u, phase: "playing", wave: gs.wave }));
    };

    const getCanvasPos = (e: MouseEvent): Vec2 => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    const onMouseMove = (e: MouseEvent) => { mouseRef.current = getCanvasPos(e); };
    const onMouseDown = (e: MouseEvent) => {
      mouseDownRef.current = true;
      if (stateRef.current.phase === "menu") { resetGame(); }
      else if (stateRef.current.phase === "dead") { resetGame(); }
      else if (stateRef.current.phase === "wave_clear") { startNextWave(); }
      mouseRef.current = getCanvasPos(e);
    };
    const onMouseUp = () => { mouseDownRef.current = false; };

    window.addEventListener("keydown", (e) => onKey(e, true));
    window.addEventListener("keyup", (e) => onKey(e, false));
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    // ── Stars background ──
    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.5 + 0.3,
      b: Math.random(),
    }));

    // ── Grid lines ──
    const drawGrid = () => {
      ctx.strokeStyle = "rgba(50,100,160,0.15)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    };

    const drawBg = (tick: number) => {
      ctx.fillStyle = "#060a12";
      ctx.fillRect(0, 0, W, H);
      drawGrid();
      stars.forEach(s => {
        const b = 0.3 + 0.7 * Math.abs(Math.sin(tick * 0.01 + s.b * 10));
        ctx.fillStyle = `rgba(180,220,255,${b * 0.7})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      });
    };

    const drawPlayer = (p: Player, tick: number) => {
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      const mx = mouseRef.current.x, my = mouseRef.current.y;
      const angle = Math.atan2(my - cy, mx - cx);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle + Math.PI / 2);

      // glow
      if (p.shield > 0) {
        ctx.shadowColor = "#00aaff";
        ctx.shadowBlur = 20;
      } else {
        ctx.shadowColor = "#ff6a1a";
        ctx.shadowBlur = 12;
      }

      // body
      ctx.fillStyle = p.shield > 0 ? "#1a8fff" : "#ff6a1a";
      drawRoundRect(ctx, -10, -14, 20, 28, 4);
      ctx.fill();

      // cockpit
      ctx.fillStyle = p.shield > 0 ? "#aaddff" : "#ffcc88";
      ctx.beginPath(); ctx.ellipse(0, -6, 6, 9, 0, 0, Math.PI * 2); ctx.fill();

      // engines
      ctx.fillStyle = "#333";
      ctx.fillRect(-12, 8, 8, 10);
      ctx.fillRect(4, 8, 8, 10);
      // engine glow
      const thrust = (Math.sin(tick * 0.3) + 1) / 2;
      ctx.fillStyle = `rgba(255,${100 + thrust * 100},20,${0.7 + thrust * 0.3})`;
      ctx.fillRect(-11, 18, 6, 4 + thrust * 4);
      ctx.fillRect(5, 18, 6, 4 + thrust * 4);

      ctx.shadowBlur = 0;
      ctx.restore();

      // shield ring
      if (p.shield > 0) {
        ctx.strokeStyle = `rgba(0,170,255,${p.shield / 200})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, p.w, 0, Math.PI * 2); ctx.stroke();
      }
    };

    const drawEnemy = (e: Enemy) => {
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      const px = playerRef.current.x + 16, py = playerRef.current.y + 16;
      const angle = Math.atan2(py - cy, px - cx) + Math.PI / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 10;

      if (e.type === "boss") {
        ctx.fillStyle = e.color;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const r = i % 2 === 0 ? e.w / 2 : e.w / 3.5;
          if (i === 0) { ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } else { ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#ff8888";
        ctx.beginPath(); ctx.arc(0, 0, e.w / 5, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === "tank") {
        ctx.fillStyle = e.color;
        ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);
        ctx.fillStyle = "#ffaa44";
        ctx.fillRect(-e.w / 4, -e.h / 2 - 8, e.w / 2, 10);
      } else if (e.type === "fast") {
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(0, -e.h / 2);
        ctx.lineTo(e.w / 2, e.h / 2);
        ctx.lineTo(-e.w / 2, e.h / 2);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = e.color;
        drawRoundRect(ctx, -e.w / 2, -e.h / 2, e.w, e.h, 4);
        ctx.fill();
        ctx.fillStyle = "#ff9999";
        ctx.beginPath(); ctx.arc(0, 0, e.w / 5, 0, Math.PI * 2); ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.restore();

      // HP bar
      const bw = e.w + 8;
      const bx = e.x + e.w / 2 - bw / 2;
      const by = e.y - 10;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(bx, by, bw, 4);
      const hpPct = e.hp / e.maxHp;
      ctx.fillStyle = hpPct > 0.5 ? "#2ecc71" : hpPct > 0.25 ? "#f39c12" : "#e74c3c";
      ctx.fillRect(bx, by, bw * hpPct, 4);
    };

    const drawBullet = (b: Bullet) => {
      ctx.save();
      if (b.friendly) {
        ctx.shadowColor = "#00ccff";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "#88eeff";
      } else {
        ctx.shadowColor = "#ff4444";
        ctx.shadowBlur = 6;
        ctx.fillStyle = "#ff8888";
      }
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    };

    const drawHUD = (p: Player, gs: GameState, tick: number) => {
      // HP bar
      const hpPct = p.hp / p.maxHp;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(12, H - 44, 160, 14);
      ctx.fillStyle = hpPct > 0.5 ? "#2ecc71" : hpPct > 0.25 ? "#f39c12" : "#e74c3c";
      ctx.fillRect(12, H - 44, 160 * hpPct, 14);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.strokeRect(12, H - 44, 160, 14);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px 'Oswald', monospace";
      ctx.fillText(`HP  ${p.hp}/${p.maxHp}`, 16, H - 33);

      // Ammo
      const ammoPct = p.ammo / p.maxAmmo;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(12, H - 24, 160, 10);
      ctx.fillStyle = p.reloading ? `rgba(255,200,0,${0.5 + 0.5 * Math.sin(tick * 0.2)})` : "#4488ff";
      ctx.fillRect(12, H - 24, 160 * (p.reloading ? 1 - p.reloadTimer / 120 : ammoPct), 10);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.strokeRect(12, H - 24, 160, 10);
      ctx.fillStyle = "#aaa";
      ctx.font = "9px monospace";
      ctx.fillText(p.reloading ? "ПЕРЕЗАРЯДКА..." : `${p.ammo}/${p.maxAmmo}`, 16, H - 16);

      // Score & wave
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(W - 160, 10, 148, 52);
      ctx.fillStyle = "#ff6a1a";
      ctx.font = "bold 22px 'Oswald', monospace";
      ctx.textAlign = "right";
      ctx.fillText(p.score.toLocaleString(), W - 14, 36);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "11px monospace";
      ctx.fillText(`СЧЁТ`, W - 14, 52);
      ctx.fillStyle = "#aaa";
      ctx.fillText(`ВОЛНА ${gs.wave}`, W - 14, 14);
      ctx.textAlign = "left";

      // kills
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "11px monospace";
      ctx.fillText(`☠ ${p.kills}`, 12, H - 54);

      // crosshair
      const mx = mouseRef.current.x, my = mouseRef.current.y;
      ctx.strokeStyle = "rgba(0,220,255,0.8)";
      ctx.lineWidth = 1.5;
      const cs = 10;
      ctx.beginPath(); ctx.moveTo(mx - cs, my); ctx.lineTo(mx + cs, my); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, my - cs); ctx.lineTo(mx, my + cs); ctx.stroke();
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.stroke();
    };

    const drawMenu = (tick: number) => {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, 0, W, H);

      // Title
      ctx.save();
      ctx.shadowColor = "#ff6a1a";
      ctx.shadowBlur = 30 + 10 * Math.sin(tick * 0.05);
      ctx.fillStyle = "#ff6a1a";
      ctx.font = "bold 64px 'Oswald', monospace";
      ctx.textAlign = "center";
      ctx.fillText("FORGE", W / 2, H / 2 - 60);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 32px 'Oswald', monospace";
      ctx.fillText("OF LEGENDS", W / 2, H / 2 - 20);
      ctx.shadowBlur = 0;
      ctx.restore();

      ctx.fillStyle = "#888";
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("топ-вид шутер · волновой режим", W / 2, H / 2 + 20);

      const pulse = 0.7 + 0.3 * Math.sin(tick * 0.08);
      ctx.fillStyle = `rgba(255,200,50,${pulse})`;
      ctx.font = "bold 18px monospace";
      ctx.fillText("НАЖМИ ДЛЯ СТАРТА", W / 2, H / 2 + 70);

      ctx.fillStyle = "#444";
      ctx.font = "12px monospace";
      ctx.fillText("WASD / стрелки — движение   ЛКМ — огонь   R — перезарядка", W / 2, H / 2 + 100);

      if (highScore > 0) {
        ctx.fillStyle = "#c8963e";
        ctx.font = "13px monospace";
        ctx.fillText(`РЕКОРД: ${highScore.toLocaleString()}`, W / 2, H / 2 + 124);
      }
      ctx.textAlign = "left";
    };

    const drawDead = (p: Player, tick: number) => {
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e74c3c";
      ctx.font = "bold 56px 'Oswald', monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = "#e74c3c";
      ctx.shadowBlur = 20;
      ctx.fillText("GAME OVER", W / 2, H / 2 - 50);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ccc";
      ctx.font = "20px 'Oswald', monospace";
      ctx.fillText(`СЧЁТ: ${p.score.toLocaleString()}`, W / 2, H / 2);
      ctx.font = "15px monospace";
      ctx.fillText(`Убито врагов: ${p.kills}`, W / 2, H / 2 + 28);
      const pulse = 0.7 + 0.3 * Math.sin(tick * 0.08);
      ctx.fillStyle = `rgba(255,200,50,${pulse})`;
      ctx.font = "bold 16px monospace";
      ctx.fillText("НАЖМИ ДЛЯ РЕСТАРТА", W / 2, H / 2 + 70);
      ctx.textAlign = "left";
    };

    const drawWaveClear = (gs: GameState, tick: number) => {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#c8963e";
      ctx.font = "bold 48px 'Oswald', monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = "#c8963e";
      ctx.shadowBlur = 20;
      ctx.fillText(`ВОЛНА ${gs.wave} ПРОЙДЕНА!`, W / 2, H / 2 - 30);
      ctx.shadowBlur = 0;
      const pulse = 0.7 + 0.3 * Math.sin(tick * 0.1);
      ctx.fillStyle = `rgba(255,255,255,${pulse})`;
      ctx.font = "bold 16px monospace";
      ctx.fillText("НАЖМИ ДЛЯ СЛЕДУЮЩЕЙ ВОЛНЫ", W / 2, H / 2 + 20);
      ctx.textAlign = "left";
    };

    const drawPaused = () => {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 48px 'Oswald', monospace";
      ctx.textAlign = "center";
      ctx.fillText("ПАУЗА", W / 2, H / 2);
      ctx.fillStyle = "#888";
      ctx.font = "14px monospace";
      ctx.fillText("ПРОБЕЛ — продолжить", W / 2, H / 2 + 36);
      ctx.textAlign = "left";
    };

    let tick = 0;

    const loop = () => {
      tick++;
      frameRef.current = requestAnimationFrame(loop);
      const gs = stateRef.current;
      const p = playerRef.current;

      drawBg(tick);

      if (gs.phase === "menu") {
        drawMenu(tick);
        return;
      }
      if (gs.phase === "dead") {
        drawDead(p, tick);
        return;
      }
      if (gs.phase === "wave_clear") {
        particlesRef.current.forEach(pt => {
          ctx.globalAlpha = pt.life / pt.maxLife;
          ctx.fillStyle = pt.color;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
        drawWaveClear(gs, tick);
        return;
      }
      if (gs.phase === "paused") {
        // draw world frozen
        enemiesRef.current.forEach(drawEnemy);
        bulletsRef.current.forEach(drawBullet);
        drawPlayer(p, tick);
        drawHUD(p, gs, tick);
        drawPaused();
        return;
      }

      // ── Update phase: playing ──
      // Player movement
      const keys = keysRef.current;
      let dx = 0, dy = 0;
      if (keys["arrowleft"] || keys["a"]) dx -= PLAYER_SPEED;
      if (keys["arrowright"] || keys["d"]) dx += PLAYER_SPEED;
      if (keys["arrowup"] || keys["w"]) dy -= PLAYER_SPEED;
      if (keys["arrowdown"] || keys["s"]) dy += PLAYER_SPEED;
      if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
      p.x = Math.max(0, Math.min(W - p.w, p.x + dx));
      p.y = Math.max(0, Math.min(H - p.h, p.y + dy));

      // Reload
      if (p.reloading) {
        p.reloadTimer--;
        if (p.reloadTimer <= 0) { p.reloading = false; p.ammo = p.maxAmmo; }
      }
      if (p.shield > 0) p.shield--;

      // Shoot
      if (p.shootCooldown > 0) p.shootCooldown--;
      if (mouseDownRef.current && !p.reloading && p.ammo > 0 && p.shootCooldown <= 0) {
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        const mx = mouseRef.current.x, my = mouseRef.current.y;
        const len = Math.hypot(mx - cx, my - cy) || 1;
        const vx = (mx - cx) / len * BULLET_SPEED;
        const vy = (my - cy) / len * BULLET_SPEED;
        bulletsRef.current.push({ id: uid(), x: cx, y: cy, vx, vy, friendly: true, dmg: 25, r: 4 });
        p.ammo--;
        p.shootCooldown = 8;
        if (p.ammo === 0 && !p.reloading) { p.reloading = true; p.reloadTimer = 120; }
      }

      // Spawn enemies
      if (gs.spawnQueue > 0) {
        gs.spawnTimer--;
        if (gs.spawnTimer <= 0) {
          enemiesRef.current.push(spawnEnemy(gs.wave));
          gs.spawnQueue--;
          gs.spawnTimer = Math.max(20, 60 - gs.wave * 3);
        }
      }

      // Check wave clear
      if (gs.spawnQueue === 0 && enemiesRef.current.length === 0) {
        gs.phase = "wave_clear";
        setUi(u => ({ ...u, phase: "wave_clear", wave: gs.wave }));
        return;
      }

      // Update enemies
      const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
      enemiesRef.current = enemiesRef.current.filter(e => {
        const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
        const dist = Math.hypot(pcx - ecx, pcy - ecy);
        const len = dist || 1;

        // Move toward player (with slight jitter for fast)
        let jx = 0, jy = 0;
        if (e.type === "fast") { jx = (Math.random() - 0.5) * 2; jy = (Math.random() - 0.5) * 2; }
        e.vx += ((pcx - ecx) / len * e.speed - e.vx) * 0.1 + jx * 0.1;
        e.vy += ((pcy - ecy) / len * e.speed - e.vy) * 0.1 + jy * 0.1;
        e.x += e.vx; e.y += e.vy;

        // Enemy shoot
        e.shootTimer++;
        if (e.shootTimer >= e.shootRate && e.type !== "fast") {
          e.shootTimer = 0;
          const vx = (pcx - ecx) / len * 4;
          const vy = (pcy - ecy) / len * 4;
          const count = e.type === "boss" ? 5 : 1;
          for (let i = 0; i < count; i++) {
            const spread = e.type === "boss" ? (i - 2) * 0.15 : 0;
            bulletsRef.current.push({
              id: uid(), x: ecx, y: ecy,
              vx: vx + Math.sin(spread) * 2,
              vy: vy + Math.cos(spread) * 2,
              friendly: false, dmg: e.type === "boss" ? 15 : 8, r: 3,
            });
          }
        }

        // Collision with player
        if (rect(e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h)) {
          const dmg = e.type === "boss" ? 30 : e.type === "tank" ? 20 : 10;
          if (p.shield > 0) { p.shield = Math.max(0, p.shield - dmg); }
          else { p.hp -= dmg; }
          particlesRef.current.push(...makeParticles(pcx, pcy, "#ff6a1a", 6));
          return false;
        }
        return true;
      });

      // Update bullets
      bulletsRef.current = bulletsRef.current.filter(b => {
        b.x += b.vx; b.y += b.vy;
        if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) return false;

        if (b.friendly) {
          for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
            const e = enemiesRef.current[i];
            if (rect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, e.x, e.y, e.w, e.h)) {
              e.hp -= b.dmg;
              particlesRef.current.push(...makeParticles(b.x, b.y, e.color, 5));
              if (e.hp <= 0) {
                particlesRef.current.push(...makeParticles(e.x + e.w / 2, e.y + e.h / 2, e.color, 14));
                p.score += e.reward;
                p.kills++;
                enemiesRef.current.splice(i, 1);
              }
              return false;
            }
          }
        } else {
          if (rect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, p.x, p.y, p.w, p.h)) {
            if (p.shield > 0) { p.shield = Math.max(0, p.shield - b.dmg); }
            else { p.hp -= b.dmg; }
            particlesRef.current.push(...makeParticles(pcx, pcy, "#4488ff", 4));
            return false;
          }
        }
        return true;
      });

      // Update particles
      particlesRef.current = particlesRef.current.filter(pt => {
        pt.x += pt.vx; pt.y += pt.vy;
        pt.vx *= 0.92; pt.vy *= 0.92;
        pt.life--;
        return pt.life > 0;
      });

      // Player death
      if (p.hp <= 0) {
        p.hp = 0;
        particlesRef.current.push(...makeParticles(pcx, pcy, "#ff6a1a", 30));
        gs.phase = "dead";
        const newHs = Math.max(highScore, p.score);
        setHighScore(newHs);
        try { localStorage.setItem("fol_hs", String(newHs)); } catch { /* */ }
        setUi(u => ({ ...u, phase: "dead", score: p.score }));
      }

      // ── Draw ──
      particlesRef.current.forEach(pt => {
        ctx.globalAlpha = pt.life / pt.maxLife;
        ctx.fillStyle = pt.color;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;

      enemiesRef.current.forEach(drawEnemy);
      bulletsRef.current.forEach(drawBullet);
      drawPlayer(p, tick);
      drawHUD(p, gs, tick);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("keydown", (e) => onKey(e, true));
      window.removeEventListener("keyup", (e) => onKey(e, false));
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resetGame, highScore]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: "#020408", userSelect: "none" }}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between w-full max-w-[800px] px-2 mb-2">
        <div>
          <span className="font-game text-lg tracking-widest text-white/80">FORGE</span>
          <span className="font-game text-lg tracking-widest ml-1" style={{ color: "var(--game-orange)" }}>SHOOTER</span>
        </div>
        <div className="flex gap-4 text-xs font-body text-white/40">
          <span>WASD — движение</span>
          <span>ЛКМ — огонь</span>
          <span>R — перезарядка</span>
          <span>ПРОБЕЛ — пауза</span>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="relative rounded overflow-hidden"
        style={{ boxShadow: "0 0 40px rgba(255,106,26,0.25), 0 0 80px rgba(0,0,0,0.8)", border: "1px solid rgba(255,106,26,0.2)" }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block"
          style={{ maxWidth: "100%", cursor: "none", touchAction: "none" }}
        />
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between w-full max-w-[800px] px-2 mt-2">
        <div className="text-xs font-body text-white/20">
          {highScore > 0 && `Рекорд: ${highScore.toLocaleString()}`}
        </div>
        <div className="flex gap-2 text-[10px] font-body text-white/20">
          <span className="text-red-400/60">■ Базовый</span>
          <span className="text-orange-400/60">■ Танк</span>
          <span className="text-green-400/60">■ Быстрый</span>
          <span className="text-red-300/60">★ Босс</span>
        </div>
      </div>
    </div>
  );
}