import { useEffect, useRef, useState, useCallback } from "react";

// ─── Constants ──────────────────────────────────────────────────────────────
const W = 960;
const H = 540;
const FOV = Math.PI / 3;
const NUM_RAYS = 240;
const MAX_DEPTH = 20;
const CELL = 1;
const PLAYER_SPEED = 0.055;
const PLAYER_TURN = 0.035;

// Map: 1 = wall A (concrete), 2 = wall B (crate), 3 = wall C (metal), 0 = floor
const MAP: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,2,2,0,0,0,0,3,3,0,0,0,0,0,0,0,0,1],
  [1,0,0,2,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,1],
  [1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,2,0,0,0,1],
  [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,3,3,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,2,2,0,0,0,0,1,0,0,0,0,3,0,0,1],
  [1,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,3,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1],
  [1,0,0,0,3,3,0,0,0,0,0,0,0,1,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,2,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];
const MH = MAP.length;
const MW = MAP[0].length;

// ─── Types ──────────────────────────────────────────────────────────────────
interface Enemy {
  id: number; x: number; y: number;
  hp: number; maxHp: number;
  alive: boolean;
  shootTimer: number;
  state: "patrol" | "chase" | "shoot";
  deathTimer: number;
}

interface Bullet {
  x: number; y: number;
  age: number;
}

interface GameState {
  phase: "menu" | "playing" | "dead" | "victory";
  score: number;
  kills: number;
  round: number;
  money: number;
}

interface PlayerState {
  x: number; y: number; angle: number;
  hp: number; armor: number;
  ammo: number; maxAmmo: number;
  reserve: number;
  reloading: boolean; reloadT: number;
  shootCd: number;
  recoil: number;
  bob: number;
  hitFlash: number;
  muzzleFlash: number;
  weapon: "ak47" | "awp" | "glock";
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function mapAt(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || ix >= MW || iy < 0 || iy >= MH) return 1;
  return MAP[iy][ix];
}

function wallColor(t: number, side: number, dark: boolean): string {
  let r = 120, g = 120, b = 120;
  if (t === 1) { r = 110; g = 100; b = 88; }       // concrete
  else if (t === 2) { r = 150; g = 100; b = 50; }  // wood crate
  else if (t === 3) { r = 90; g = 110; b = 130; }  // metal
  if (side === 1) { r *= 0.7; g *= 0.7; b *= 0.7; }
  if (dark) { r *= 0.6; g *= 0.6; b *= 0.6; }
  return `rgb(${r|0},${g|0},${b|0})`;
}

// DDA raycasting
function castRay(px: number, py: number, angle: number): { dist: number; wallType: number; side: number; hitX: number } {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let mapX = Math.floor(px), mapY = Math.floor(py);
  const deltaX = Math.abs(1 / dx), deltaY = Math.abs(1 / dy);
  let stepX: number, stepY: number, sideDistX: number, sideDistY: number;
  if (dx < 0) { stepX = -1; sideDistX = (px - mapX) * deltaX; }
  else { stepX = 1; sideDistX = (mapX + 1 - px) * deltaX; }
  if (dy < 0) { stepY = -1; sideDistY = (py - mapY) * deltaY; }
  else { stepY = 1; sideDistY = (mapY + 1 - py) * deltaY; }
  let side = 0, hit = 0, t = 0;
  for (let i = 0; i < 64; i++) {
    if (sideDistX < sideDistY) { sideDistX += deltaX; mapX += stepX; side = 0; }
    else { sideDistY += deltaY; mapY += stepY; side = 1; }
    t = MAP[mapY]?.[mapX] ?? 1;
    if (t > 0) { hit = 1; break; }
    if (Math.abs(mapX - px) > MAX_DEPTH || Math.abs(mapY - py) > MAX_DEPTH) break;
  }
  const dist = side === 0 ? (mapX - px + (1 - stepX) / 2) / dx : (mapY - py + (1 - stepY) / 2) / dy;
  const hitX = side === 0 ? py + dist * dy : px + dist * dx;
  return { dist: Math.max(0.01, dist), wallType: hit ? t : 1, side, hitX: hitX - Math.floor(hitX) };
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PlayerState>({
    x: 2.5, y: 2.5, angle: 0,
    hp: 100, armor: 100,
    ammo: 30, maxAmmo: 30, reserve: 90,
    reloading: false, reloadT: 0,
    shootCd: 0, recoil: 0, bob: 0,
    hitFlash: 0, muzzleFlash: 0,
    weapon: "ak47",
  });
  const stateRef = useRef<GameState>({ phase: "menu", score: 0, kills: 0, round: 1, money: 800 });
  const enemiesRef = useRef<Enemy[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const keysRef = useRef<Record<string, boolean>>({});
  const mouseDownRef = useRef(false);
  const mouseDxRef = useRef(0);
  const pointerLockedRef = useRef(false);
  const frameRef = useRef(0);
  const zBufferRef = useRef<number[]>(new Array(NUM_RAYS).fill(MAX_DEPTH));

  const [ui, setUi] = useState({ phase: "menu" as GameState["phase"], hp: 100, armor: 100, ammo: 30, reserve: 90,
    score: 0, kills: 0, round: 1, enemiesLeft: 0, money: 800, weapon: "ak47" as PlayerState["weapon"] });
  const [highKills, setHighKills] = useState(() => {
    try { return parseInt(localStorage.getItem("fps_hk") || "0"); } catch { return 0; }
  });

  const spawnEnemies = useCallback((round: number) => {
    const positions: [number, number][] = [
      [17, 2], [15, 14], [3, 13], [11, 10], [17, 13], [13, 5], [6, 9], [4, 6]
    ];
    const count = Math.min(2 + round, 6);
    const list: Enemy[] = [];
    for (let i = 0; i < count; i++) {
      const [x, y] = positions[(i + round) % positions.length];
      list.push({
        id: i + round * 100,
        x: x + 0.5, y: y + 0.5,
        hp: 100 + round * 10, maxHp: 100 + round * 10,
        alive: true, shootTimer: 60 + Math.random() * 60,
        state: "patrol", deathTimer: 0,
      });
    }
    enemiesRef.current = list;
  }, []);

  const resetGame = useCallback(() => {
    playerRef.current = {
      x: 2.5, y: 2.5, angle: 0,
      hp: 100, armor: 100,
      ammo: 30, maxAmmo: 30, reserve: 90,
      reloading: false, reloadT: 0,
      shootCd: 0, recoil: 0, bob: 0,
      hitFlash: 0, muzzleFlash: 0,
      weapon: "ak47",
    };
    stateRef.current = { phase: "playing", score: 0, kills: 0, round: 1, money: 800 };
    bulletsRef.current = [];
    spawnEnemies(1);
    setUi(u => ({ ...u, phase: "playing", hp: 100, armor: 100, ammo: 30, reserve: 90,
      score: 0, kills: 0, round: 1, money: 800, enemiesLeft: enemiesRef.current.length }));
  }, [spawnEnemies]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      keysRef.current[k] = down;
      if (down && k === "r" && !playerRef.current.reloading && playerRef.current.ammo < playerRef.current.maxAmmo && playerRef.current.reserve > 0) {
        playerRef.current.reloading = true;
        playerRef.current.reloadT = 120;
      }
      if (down && (k === "1" || k === "2" || k === "3")) {
        const w: PlayerState["weapon"] = k === "1" ? "ak47" : k === "2" ? "awp" : "glock";
        const p = playerRef.current;
        p.weapon = w;
        if (w === "ak47") { p.maxAmmo = 30; p.ammo = Math.min(p.ammo, 30); }
        if (w === "awp") { p.maxAmmo = 5; p.ammo = Math.min(p.ammo, 5); }
        if (w === "glock") { p.maxAmmo = 20; p.ammo = Math.min(p.ammo, 20); }
        setUi(u => ({ ...u, weapon: w, ammo: p.ammo, reserve: p.reserve }));
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (pointerLockedRef.current) mouseDxRef.current += e.movementX * 0.003;
    };
    const onMouseDown = () => {
      if (!pointerLockedRef.current) {
        canvas.requestPointerLock();
        if (stateRef.current.phase === "menu" || stateRef.current.phase === "dead") {
          resetGame();
        }
      }
      mouseDownRef.current = true;
    };
    const onMouseUp = () => { mouseDownRef.current = false; };
    const onLockChange = () => {
      pointerLockedRef.current = document.pointerLockElement === canvas;
    };

    window.addEventListener("keydown", (e) => onKey(e, true));
    window.addEventListener("keyup", (e) => onKey(e, false));
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onLockChange);

    let tick = 0;

    const drawSky = () => {
      const sky = ctx.createLinearGradient(0, 0, 0, H / 2);
      sky.addColorStop(0, "#1a1f2a");
      sky.addColorStop(1, "#3a3528");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H / 2);
      const floor = ctx.createLinearGradient(0, H / 2, 0, H);
      floor.addColorStop(0, "#2a2520");
      floor.addColorStop(1, "#0a0a08");
      ctx.fillStyle = floor; ctx.fillRect(0, H / 2, W, H / 2);
    };

    const render3D = (p: PlayerState) => {
      const colW = W / NUM_RAYS;
      const verticalShift = p.recoil * 6;

      for (let i = 0; i < NUM_RAYS; i++) {
        const rayAngle = p.angle - FOV / 2 + (i / NUM_RAYS) * FOV;
        const ray = castRay(p.x, p.y, rayAngle);
        const correctDist = ray.dist * Math.cos(rayAngle - p.angle);
        zBufferRef.current[i] = correctDist;
        const wallH = Math.min(H * 1.2, (H / correctDist) * 0.85);
        const wallTop = (H - wallH) / 2 + verticalShift;

        // wall slice
        const dark = correctDist > 6;
        ctx.fillStyle = wallColor(ray.wallType, ray.side, dark);
        ctx.fillRect(i * colW, wallTop, colW + 1, wallH);

        // vertical seam for crate
        if (ray.wallType === 2) {
          if (ray.hitX < 0.05 || ray.hitX > 0.95 || Math.abs(ray.hitX - 0.5) < 0.02) {
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.fillRect(i * colW, wallTop, colW + 1, wallH);
          }
        }
        if (ray.wallType === 3) {
          // metal panel strip
          if (Math.abs(ray.hitX - 0.33) < 0.015 || Math.abs(ray.hitX - 0.66) < 0.015) {
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(i * colW, wallTop, colW + 1, wallH);
          }
        }

        // fog
        const fog = Math.min(0.7, correctDist / 14);
        ctx.fillStyle = `rgba(10,15,20,${fog})`;
        ctx.fillRect(i * colW, wallTop, colW + 1, wallH);
      }
    };

    const drawSprites = (p: PlayerState) => {
      // Sort enemies by distance (farther first)
      const sorted = [...enemiesRef.current].map(e => ({
        ...e, dist: (p.x - e.x) ** 2 + (p.y - e.y) ** 2
      })).sort((a, b) => b.dist - a.dist);

      for (const e of sorted) {
        const dx = e.x - p.x, dy = e.y - p.y;
        const invDet = 1.0 / (Math.cos(p.angle + Math.PI / 2) * Math.sin(p.angle) - Math.sin(p.angle + Math.PI / 2) * Math.cos(p.angle));
        const transformX = invDet * (Math.sin(p.angle) * dx - Math.cos(p.angle) * dy);
        const transformY = invDet * (-Math.cos(p.angle + Math.PI / 2) * dx + Math.sin(p.angle + Math.PI / 2) * dy);
        if (transformY <= 0.1) continue;
        const screenX = (W / 2) * (1 + transformX / transformY);
        const spriteSize = Math.abs(H / transformY) * 0.8;
        const drawStartY = H / 2 - spriteSize / 2 + p.recoil * 6;
        const drawStartX = screenX - spriteSize / 2;

        if (!e.alive) {
          // Lying dead body
          const bodyH = spriteSize * 0.3;
          ctx.fillStyle = `rgba(80,20,20,${Math.max(0, 1 - e.deathTimer / 300)})`;
          ctx.fillRect(drawStartX + spriteSize * 0.1, H / 2 + spriteSize * 0.1, spriteSize * 0.8, bodyH);
          continue;
        }

        // Depth test: check center column
        const centerRay = Math.floor((screenX / W) * NUM_RAYS);
        if (centerRay >= 0 && centerRay < NUM_RAYS && transformY > zBufferRef.current[centerRay]) continue;

        // Body
        ctx.save();
        const headY = drawStartY + spriteSize * 0.05;
        const bodyY = drawStartY + spriteSize * 0.28;
        const legY = drawStartY + spriteSize * 0.6;
        const ew = spriteSize * 0.45;

        // shadow
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        ctx.ellipse(screenX, drawStartY + spriteSize * 0.98, ew * 0.6, spriteSize * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();

        // legs (dark pants)
        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(screenX - ew / 3, legY, ew * 0.3, spriteSize * 0.35);
        ctx.fillRect(screenX + ew / 30, legY, ew * 0.3, spriteSize * 0.35);

        // torso (tactical vest)
        ctx.fillStyle = "#1a1f2a";
        ctx.fillRect(screenX - ew / 2, bodyY, ew, spriteSize * 0.35);
        ctx.fillStyle = "#3a3f4a";
        ctx.fillRect(screenX - ew / 2 + 2, bodyY + 4, ew - 4, spriteSize * 0.1);

        // head
        ctx.fillStyle = "#c9a58a";
        ctx.beginPath();
        ctx.ellipse(screenX, headY + spriteSize * 0.08, ew * 0.35, spriteSize * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();

        // balaclava
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(screenX - ew * 0.35, headY + spriteSize * 0.02, ew * 0.7, spriteSize * 0.1);

        // eyes glint
        ctx.fillStyle = "#ff3030";
        ctx.fillRect(screenX - ew * 0.15, headY + spriteSize * 0.075, 2, 2);
        ctx.fillRect(screenX + ew * 0.1, headY + spriteSize * 0.075, 2, 2);

        // weapon
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(screenX - ew * 0.05, bodyY + spriteSize * 0.12, ew * 0.7, spriteSize * 0.06);

        // HP bar
        const hpPct = e.hp / e.maxHp;
        const barW = spriteSize * 0.6;
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(screenX - barW / 2, drawStartY - 8, barW, 4);
        ctx.fillStyle = hpPct > 0.5 ? "#2ecc71" : hpPct > 0.25 ? "#f39c12" : "#e74c3c";
        ctx.fillRect(screenX - barW / 2, drawStartY - 8, barW * hpPct, 4);

        ctx.restore();
      }
    };

    const drawWeapon = (p: PlayerState) => {
      const bob = Math.sin(tick * 0.15) * p.bob * 4;
      const offsetY = p.recoil * 12;
      const weapon = p.weapon;

      if (weapon === "ak47") {
        const wx = W * 0.55, wy = H - 220 + bob + offsetY;
        // stock
        ctx.fillStyle = "#3a2418";
        ctx.fillRect(wx, wy, 140, 70);
        ctx.fillStyle = "#5a3828";
        ctx.fillRect(wx + 4, wy + 4, 132, 15);
        // body
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(wx + 120, wy - 30, 200, 100);
        // magazine
        ctx.fillStyle = "#2a2520";
        ctx.beginPath();
        ctx.moveTo(wx + 170, wy + 70);
        ctx.lineTo(wx + 190, wy + 130);
        ctx.lineTo(wx + 240, wy + 130);
        ctx.lineTo(wx + 220, wy + 70);
        ctx.closePath(); ctx.fill();
        // barrel
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(wx + 320, wy - 10, 180, 20);
        // sight
        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(wx + 220, wy - 50, 30, 20);
        ctx.fillStyle = "#ff6a1a";
        ctx.fillRect(wx + 230, wy - 42, 10, 4);

        if (p.muzzleFlash > 0) {
          ctx.save();
          ctx.globalAlpha = p.muzzleFlash;
          const mx = wx + 500, my = wy;
          const grad = ctx.createRadialGradient(mx, my, 2, mx, my, 60);
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(0.3, "#ffcc00");
          grad.addColorStop(1, "rgba(255,100,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(mx, my, 60, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      } else if (weapon === "awp") {
        const wx = W * 0.5, wy = H - 200 + bob + offsetY;
        // stock
        ctx.fillStyle = "#0f3a28";
        ctx.fillRect(wx, wy + 10, 180, 60);
        // body
        ctx.fillStyle = "#0a2a1a";
        ctx.fillRect(wx + 160, wy, 180, 60);
        // long barrel
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(wx + 340, wy + 15, 260, 16);
        // scope
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(wx + 200, wy - 60, 140, 50);
        ctx.fillStyle = "#000";
        ctx.beginPath(); ctx.arc(wx + 270, wy - 35, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#4a8aff";
        ctx.beginPath(); ctx.arc(wx + 270, wy - 35, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#000";
        ctx.fillRect(wx + 248, wy - 36, 44, 2);
        ctx.fillRect(wx + 269, wy - 55, 2, 42);

        if (p.muzzleFlash > 0) {
          ctx.save();
          ctx.globalAlpha = p.muzzleFlash;
          const mx = wx + 600, my = wy + 23;
          const grad = ctx.createRadialGradient(mx, my, 2, mx, my, 80);
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(0.3, "#ffcc00");
          grad.addColorStop(1, "rgba(255,100,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(mx, my, 80, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      } else {
        // Glock
        const wx = W * 0.6, wy = H - 180 + bob + offsetY;
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(wx, wy, 120, 60);
        ctx.fillRect(wx + 90, wy, 80, 18);
        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(wx + 20, wy + 60, 50, 70);
        ctx.fillStyle = "#3a3a3a";
        ctx.fillRect(wx + 2, wy + 2, 116, 8);

        if (p.muzzleFlash > 0) {
          ctx.save();
          ctx.globalAlpha = p.muzzleFlash;
          const mx = wx + 170, my = wy + 9;
          const grad = ctx.createRadialGradient(mx, my, 2, mx, my, 40);
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(0.3, "#ffcc00");
          grad.addColorStop(1, "rgba(255,100,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(mx, my, 40, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    };

    const drawCrosshair = (p: PlayerState) => {
      const cx = W / 2, cy = H / 2;
      const spread = 4 + p.recoil * 20 + (mouseDownRef.current ? 3 : 0);
      ctx.strokeStyle = "rgba(0,255,120,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - spread - 6, cy); ctx.lineTo(cx - spread, cy);
      ctx.moveTo(cx + spread, cy); ctx.lineTo(cx + spread + 6, cy);
      ctx.moveTo(cx, cy - spread - 6); ctx.lineTo(cx, cy - spread);
      ctx.moveTo(cx, cy + spread); ctx.lineTo(cx, cy + spread + 6);
      ctx.stroke();
      ctx.fillStyle = "rgba(0,255,120,0.9)";
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    };

    const drawHUD = (p: PlayerState, gs: GameState) => {
      // Bottom gradient bar
      const grad = ctx.createLinearGradient(0, H - 90, 0, H);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, H - 90, W, 90);

      // HP
      ctx.fillStyle = "#fff";
      ctx.font = "bold 26px 'Oswald', monospace";
      ctx.textAlign = "left";
      const hpColor = p.hp > 50 ? "#fff" : p.hp > 25 ? "#f39c12" : "#e74c3c";
      ctx.fillStyle = hpColor;
      ctx.fillText(`+ ${p.hp}`, 30, H - 25);
      ctx.fillStyle = "#888";
      ctx.font = "10px monospace";
      ctx.fillText("HEALTH", 30, H - 52);

      // Armor
      ctx.fillStyle = "#4aaaff";
      ctx.font = "bold 26px 'Oswald', monospace";
      ctx.fillText(`◈ ${p.armor}`, 140, H - 25);
      ctx.fillStyle = "#888";
      ctx.font = "10px monospace";
      ctx.fillText("ARMOR", 140, H - 52);

      // Money
      ctx.fillStyle = "#a4d65e";
      ctx.font = "bold 22px 'Oswald', monospace";
      ctx.fillText(`$ ${gs.money}`, 260, H - 28);
      ctx.fillStyle = "#888";
      ctx.font = "10px monospace";
      ctx.fillText("CASH", 260, H - 52);

      // Ammo right
      ctx.textAlign = "right";
      ctx.fillStyle = p.reloading ? "#f39c12" : "#fff";
      ctx.font = "bold 34px 'Oswald', monospace";
      const ammoTxt = p.reloading ? "..." : `${p.ammo}`;
      ctx.fillText(ammoTxt, W - 140, H - 20);
      ctx.fillStyle = "#888";
      ctx.font = "bold 18px 'Oswald', monospace";
      ctx.fillText(`/ ${p.reserve}`, W - 30, H - 25);
      ctx.font = "10px monospace";
      ctx.fillText(p.weapon.toUpperCase(), W - 30, H - 52);

      // Top: round + kills
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(W / 2 - 90, 10, 180, 36);
      ctx.strokeStyle = "rgba(255,106,26,0.3)";
      ctx.strokeRect(W / 2 - 90, 10, 180, 36);
      ctx.fillStyle = "#ff6a1a";
      ctx.font = "bold 14px 'Oswald', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`ROUND ${gs.round}`, W / 2, 27);
      ctx.fillStyle = "#fff";
      ctx.font = "11px monospace";
      const alive = enemiesRef.current.filter(e => e.alive).length;
      ctx.fillText(`☠ ${gs.kills}   ·   ENEMIES: ${alive}`, W / 2, 42);

      // Hit flash
      if (p.hitFlash > 0) {
        ctx.fillStyle = `rgba(200,0,0,${p.hitFlash * 0.35})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Reload bar
      if (p.reloading) {
        const pct = 1 - p.reloadT / 120;
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(W / 2 - 80, H / 2 + 50, 160, 8);
        ctx.fillStyle = "#f39c12";
        ctx.fillRect(W / 2 - 80, H / 2 + 50, 160 * pct, 8);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px 'Oswald', monospace";
        ctx.textAlign = "center";
        ctx.fillText("ПЕРЕЗАРЯДКА", W / 2, H / 2 + 45);
      }

      // Minimap
      const mmSize = 120, mmX = W - mmSize - 14, mmY = 14;
      const cell = mmSize / MW;
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillRect(mmX, mmY, mmSize, (mmSize * MH / MW));
      for (let y = 0; y < MH; y++) {
        for (let x = 0; x < MW; x++) {
          if (MAP[y][x] > 0) {
            ctx.fillStyle = MAP[y][x] === 2 ? "rgba(150,100,50,0.9)" :
                             MAP[y][x] === 3 ? "rgba(90,110,130,0.9)" : "rgba(120,110,95,0.9)";
            ctx.fillRect(mmX + x * cell, mmY + y * cell, cell, cell);
          }
        }
      }
      // enemies on map
      enemiesRef.current.filter(e => e.alive).forEach(e => {
        ctx.fillStyle = "#ff3030";
        ctx.fillRect(mmX + e.x * cell - 2, mmY + e.y * cell - 2, 4, 4);
      });
      // player
      ctx.fillStyle = "#00ff88";
      ctx.beginPath();
      ctx.arc(mmX + p.x * cell, mmY + p.y * cell, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mmX + p.x * cell, mmY + p.y * cell);
      ctx.lineTo(mmX + (p.x + Math.cos(p.angle) * 1.5) * cell, mmY + (p.y + Math.sin(p.angle) * 1.5) * cell);
      ctx.stroke();

      // vignette
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.75);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    };

    const drawMenu = () => {
      ctx.fillStyle = "#050810";
      ctx.fillRect(0, 0, W, H);
      // scan lines
      for (let y = 0; y < H; y += 3) {
        ctx.fillStyle = "rgba(255,255,255,0.015)";
        ctx.fillRect(0, y, W, 1);
      }
      ctx.save();
      ctx.shadowColor = "#ff6a1a";
      ctx.shadowBlur = 30;
      ctx.fillStyle = "#ff6a1a";
      ctx.font = "bold 72px 'Oswald', monospace";
      ctx.textAlign = "center";
      ctx.fillText("OPERATION", W / 2, H / 2 - 80);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 54px 'Oswald', monospace";
      ctx.fillText("BLACK SITE", W / 2, H / 2 - 25);
      ctx.restore();

      ctx.fillStyle = "#aaa";
      ctx.font = "14px monospace";
      ctx.fillText("FPS · 1v6 BOT MATCH · TACTICAL COMBAT", W / 2, H / 2 + 10);

      const pulse = 0.6 + 0.4 * Math.sin(tick * 0.08);
      ctx.fillStyle = `rgba(255,200,50,${pulse})`;
      ctx.font = "bold 20px 'Oswald', monospace";
      ctx.fillText("НАЖМИ, ЧТОБЫ ВОЙТИ", W / 2, H / 2 + 70);

      ctx.fillStyle = "#555";
      ctx.font = "11px monospace";
      ctx.fillText("WASD — движение   МЫШЬ — осмотр   ЛКМ — огонь   R — перезарядка", W / 2, H / 2 + 110);
      ctx.fillText("1 — AK-47    2 — AWP    3 — Glock    ESC — выйти", W / 2, H / 2 + 128);

      if (highKills > 0) {
        ctx.fillStyle = "#c8963e";
        ctx.font = "12px monospace";
        ctx.fillText(`РЕКОРД: ${highKills} убийств`, W / 2, H / 2 + 155);
      }
      ctx.textAlign = "left";
    };

    const drawDead = (gs: GameState) => {
      ctx.fillStyle = "rgba(80,0,0,0.55)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, H / 2 - 80, W, 160);
      ctx.strokeStyle = "#ff3030";
      ctx.lineWidth = 1;
      ctx.strokeRect(0, H / 2 - 80, W, 160);
      ctx.fillStyle = "#ff3030";
      ctx.font = "bold 54px 'Oswald', monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = "#ff3030";
      ctx.shadowBlur = 20;
      ctx.fillText("YOU DIED", W / 2, H / 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      ctx.font = "16px 'Oswald', monospace";
      ctx.fillText(`УБИЙСТВ: ${gs.kills}   ·   РАУНДОВ: ${gs.round}`, W / 2, H / 2 + 40);
      const pulse = 0.6 + 0.4 * Math.sin(tick * 0.08);
      ctx.fillStyle = `rgba(255,200,50,${pulse})`;
      ctx.font = "bold 14px monospace";
      ctx.fillText("ЛКМ — играть снова", W / 2, H / 2 + 68);
      ctx.textAlign = "left";
    };

    const tryMove = (p: PlayerState, nx: number, ny: number) => {
      const pad = 0.25;
      if (mapAt(nx + pad, p.y) === 0 && mapAt(nx - pad, p.y) === 0) p.x = nx;
      if (mapAt(p.x, ny + pad) === 0 && mapAt(p.x, ny - pad) === 0) p.y = ny;
    };

    const doShoot = (p: PlayerState) => {
      const cost = p.weapon === "awp" ? 40 : p.weapon === "ak47" ? 8 : 6;
      const dmg = p.weapon === "awp" ? 115 : p.weapon === "ak47" ? 36 : 18;
      const cd = p.weapon === "awp" ? 45 : p.weapon === "ak47" ? 8 : 14;
      const spread = p.weapon === "awp" ? 0.005 : p.weapon === "ak47" ? 0.015 + p.recoil * 0.03 : 0.025;

      if (p.reloading || p.ammo <= 0 || p.shootCd > 0) return;
      p.ammo--;
      p.shootCd = cd;
      p.recoil = Math.min(1, p.recoil + (p.weapon === "awp" ? 0.7 : 0.25));
      p.muzzleFlash = 1;

      const angle = p.angle + (Math.random() - 0.5) * spread * 2;
      const ray = castRay(p.x, p.y, angle);

      // Check enemies along ray
      let hitEnemy: Enemy | null = null;
      let hitDist = ray.dist;
      for (const e of enemiesRef.current) {
        if (!e.alive) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        const proj = dx * Math.cos(angle) + dy * Math.sin(angle);
        if (proj < 0.2 || proj > hitDist) continue;
        const perp = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
        if (perp < 0.35) {
          hitEnemy = e;
          hitDist = proj;
        }
      }

      if (hitEnemy) {
        const headshot = Math.random() < 0.25;
        const finalDmg = headshot ? dmg * 2 : dmg;
        hitEnemy.hp -= finalDmg;
        stateRef.current.score += headshot ? 150 : 100;
        if (hitEnemy.hp <= 0 && hitEnemy.alive) {
          hitEnemy.alive = false;
          hitEnemy.deathTimer = 0;
          stateRef.current.kills++;
          stateRef.current.money += 300;
          setUi(u => ({ ...u, kills: stateRef.current.kills, money: stateRef.current.money,
            enemiesLeft: enemiesRef.current.filter(e => e.alive).length }));
        }
      }

      setUi(u => ({ ...u, ammo: p.ammo, reserve: p.reserve }));

      if (p.ammo === 0 && p.reserve > 0 && !p.reloading) {
        p.reloading = true; p.reloadT = 120;
      }
    };

    const loop = () => {
      tick++;
      frameRef.current = requestAnimationFrame(loop);
      const p = playerRef.current;
      const gs = stateRef.current;

      if (gs.phase === "menu") { drawMenu(); return; }

      // ── Update ──
      if (gs.phase === "playing") {
        // mouse look
        p.angle += mouseDxRef.current;
        mouseDxRef.current = 0;

        // keyboard look
        if (keysRef.current["arrowleft"]) p.angle -= PLAYER_TURN;
        if (keysRef.current["arrowright"]) p.angle += PLAYER_TURN;

        // movement
        let mvX = 0, mvY = 0;
        const fwd = (keysRef.current["w"] || keysRef.current["arrowup"]) ? 1 : (keysRef.current["s"] || keysRef.current["arrowdown"]) ? -1 : 0;
        const str = keysRef.current["d"] ? 1 : keysRef.current["a"] ? -1 : 0;
        mvX = Math.cos(p.angle) * fwd * PLAYER_SPEED + Math.cos(p.angle + Math.PI / 2) * str * PLAYER_SPEED;
        mvY = Math.sin(p.angle) * fwd * PLAYER_SPEED + Math.sin(p.angle + Math.PI / 2) * str * PLAYER_SPEED;
        tryMove(p, p.x + mvX, p.y + mvY);
        p.bob = (fwd !== 0 || str !== 0) ? Math.min(1, p.bob + 0.1) : Math.max(0, p.bob - 0.1);

        // timers
        if (p.shootCd > 0) p.shootCd--;
        p.recoil *= 0.88;
        p.muzzleFlash *= 0.7;
        p.hitFlash = Math.max(0, p.hitFlash - 0.04);

        // reload
        if (p.reloading) {
          p.reloadT--;
          if (p.reloadT <= 0) {
            const needed = p.maxAmmo - p.ammo;
            const give = Math.min(needed, p.reserve);
            p.ammo += give;
            p.reserve -= give;
            p.reloading = false;
            setUi(u => ({ ...u, ammo: p.ammo, reserve: p.reserve }));
          }
        }

        // shoot
        if (mouseDownRef.current && p.weapon === "ak47") doShoot(p);
        if (mouseDownRef.current && p.weapon !== "ak47" && p.shootCd <= 0) doShoot(p);

        // enemies AI
        let anyAlive = false;
        enemiesRef.current.forEach(e => {
          if (!e.alive) { e.deathTimer++; return; }
          anyAlive = true;
          const dx = p.x - e.x, dy = p.y - e.y;
          const dist = Math.hypot(dx, dy);
          // check visibility (simple)
          const ray = castRay(e.x, e.y, Math.atan2(dy, dx));
          const sees = ray.dist > dist - 0.3;

          if (sees && dist < 12) {
            // move toward player
            if (dist > 2) {
              const spd = 0.018;
              const nx = e.x + (dx / dist) * spd;
              const ny = e.y + (dy / dist) * spd;
              if (mapAt(nx, e.y) === 0) e.x = nx;
              if (mapAt(e.x, ny) === 0) e.y = ny;
            }
            e.shootTimer--;
            if (e.shootTimer <= 0) {
              e.shootTimer = 60 + Math.random() * 50;
              // chance to hit
              const hitChance = Math.max(0.15, 0.6 - dist * 0.04);
              if (Math.random() < hitChance) {
                const dmg = 10 + Math.floor(Math.random() * 15);
                if (p.armor > 0) {
                  const absorbed = Math.min(p.armor, Math.floor(dmg * 0.5));
                  p.armor -= absorbed;
                  p.hp -= dmg - absorbed;
                } else {
                  p.hp -= dmg;
                }
                p.hitFlash = 1;
                setUi(u => ({ ...u, hp: Math.max(0, p.hp), armor: p.armor }));
              }
            }
          }
        });

        // next round
        if (!anyAlive) {
          gs.round++;
          gs.money += 500;
          p.hp = Math.min(100, p.hp + 25);
          p.armor = Math.min(100, p.armor + 40);
          p.reserve += 60;
          spawnEnemies(gs.round);
          setUi(u => ({ ...u, round: gs.round, money: gs.money, hp: p.hp, armor: p.armor, reserve: p.reserve,
            enemiesLeft: enemiesRef.current.length }));
        }

        // death
        if (p.hp <= 0) {
          p.hp = 0;
          gs.phase = "dead";
          const newHk = Math.max(highKills, gs.kills);
          setHighKills(newHk);
          try { localStorage.setItem("fps_hk", String(newHk)); } catch { /* */ }
          setUi(u => ({ ...u, phase: "dead", hp: 0, kills: gs.kills }));
          if (document.pointerLockElement) document.exitPointerLock();
        }
      }

      // ── Render ──
      drawSky();
      render3D(p);
      drawSprites(p);
      drawWeapon(p);
      drawCrosshair(p);
      drawHUD(p, gs);

      if (gs.phase === "dead") drawDead(gs);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("keydown", (e) => onKey(e, true));
      window.removeEventListener("keyup", (e) => onKey(e, false));
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, [resetGame, highKills, spawnEnemies]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: "#030508", userSelect: "none" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between w-full max-w-[960px] px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 flex items-center justify-center rounded"
            style={{ background: "linear-gradient(135deg,#ff6a1a,#c8963e)" }}>
            <span className="text-black text-xs font-bold">B</span>
          </div>
          <div>
            <div className="font-game text-base tracking-[0.2em] text-white/90 leading-none">BLACK SITE</div>
            <div className="text-[9px] font-body text-white/30 tracking-[0.3em] uppercase mt-0.5">Tactical FPS · Bot Match</div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-body text-white/40">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            LIVE
          </span>
          <span>KILLS: <span className="text-white/80 font-bold">{ui.kills}</span></span>
          <span>RD: <span className="text-orange-400 font-bold">{ui.round}</span></span>
          <span className="text-white/20">|</span>
          <span>REC: <span className="text-yellow-400">{highKills}</span></span>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative rounded overflow-hidden"
        style={{ boxShadow: "0 0 60px rgba(255,106,26,0.18), 0 0 120px rgba(0,0,0,0.9)",
          border: "1px solid rgba(255,106,26,0.15)" }}>
        <canvas ref={canvasRef} width={W} height={H} className="block"
          style={{ maxWidth: "100%", cursor: "none", touchAction: "none" }} />
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between w-full max-w-[960px] px-3 py-2 text-[10px] font-body text-white/30">
        <div className="flex gap-3">
          <span>WASD — движение</span>
          <span>МЫШЬ — осмотр</span>
          <span>ЛКМ — огонь</span>
          <span>R — перезарядка</span>
        </div>
        <div className="flex gap-2">
          <span className={ui.weapon === "ak47" ? "text-orange-400" : ""}>[1] AK-47</span>
          <span className={ui.weapon === "awp" ? "text-orange-400" : ""}>[2] AWP</span>
          <span className={ui.weapon === "glock" ? "text-orange-400" : ""}>[3] GLOCK</span>
        </div>
      </div>
    </div>
  );
}
