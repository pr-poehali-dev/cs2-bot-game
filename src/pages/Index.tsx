import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";

// ─── Types ─────────────────────────────────────────────────────────────────
interface ClassDef {
  id: string;
  name: string;
  role: string;
  desc: string;
  color: string;
  glowColor: string;
  icon: string;
  hp: number;
  mp: number;
  armor: number;
  speed: number;
  dmg: number;
  abilities: Ability[];
  image: string;
}

interface Ability {
  name: string;
  desc: string;
  icon: string;
  cost: number;
  cd: number;
  dmg: number;
  type: "damage" | "heal" | "shield" | "aoe";
}

interface Player {
  id: number;
  name: string;
  class: string;
  level: number;
  rank: string;
  wins: number;
  ping: number;
  ready: boolean;
}

interface DamageNumber {
  id: number;
  x: number;
  y: number;
  value: number;
  type: "damage" | "heal" | "crit";
}

interface BattleState {
  playerHp: number;
  playerMp: number;
  enemyHp: number;
  maxHp: number;
  maxMp: number;
  enemyMaxHp: number;
  combo: number;
  turn: "player" | "enemy" | "idle";
  log: string[];
  abilityCooldowns: Record<string, number>;
  phase: "idle" | "fighting" | "victory" | "defeat";
  round: number;
}

// ─── Data ───────────────────────────────────────────────────────────────────
const CLASSES: ClassDef[] = [
  {
    id: "warrior",
    name: "Берсерк",
    role: "Танк / Урон",
    desc: "Воин тьмы, закованный в проклятую броню. Чем меньше здоровья — тем сильнее удары.",
    color: "#e63030",
    glowColor: "rgba(230,48,48,0.4)",
    icon: "Sword",
    hp: 1200,
    mp: 300,
    armor: 45,
    speed: 65,
    dmg: 180,
    image: "https://cdn.poehali.dev/projects/1722ed7b-9526-4be9-a422-bcbecb711a0e/files/686de31a-2d1e-4d09-9127-579c8759925d.jpg",
    abilities: [
      { name: "Кровавый удар", desc: "Мощный удар с кровотечением", icon: "Sword", cost: 30, cd: 1, dmg: 220, type: "damage" },
      { name: "Берсерк", desc: "+50% урона на 3 хода", icon: "Flame", cost: 60, cd: 3, dmg: 0, type: "shield" },
      { name: "Вихрь смерти", desc: "Урон всем врагам в радиусе", icon: "Zap", cost: 80, cd: 4, dmg: 320, type: "aoe" },
      { name: "Жажда крови", desc: "Восстанавливает HP при атаке", icon: "Heart", cost: 40, cd: 2, dmg: -150, type: "heal" },
    ],
  },
  {
    id: "mage",
    name: "Архимаг",
    role: "Дальний бой / Контроль",
    desc: "Повелитель стихий, исказивший ткань реальности. Уничтожает врагов заклинаниями запредельной мощи.",
    color: "#7c3aed",
    glowColor: "rgba(124,58,237,0.4)",
    icon: "Wand2",
    hp: 700,
    mp: 600,
    armor: 15,
    speed: 75,
    dmg: 280,
    image: "https://cdn.poehali.dev/projects/1722ed7b-9526-4be9-a422-bcbecb711a0e/files/a9e6601a-6bb4-4cdf-9648-6134d2a93881.jpg",
    abilities: [
      { name: "Молния", desc: "Разряд молнии в цель", icon: "Zap", cost: 40, cd: 1, dmg: 310, type: "damage" },
      { name: "Метеорит", desc: "Призывает метеор из небес", icon: "Sparkles", cost: 100, cd: 5, dmg: 520, type: "aoe" },
      { name: "Щит Арканы", desc: "Магический барьер поглощает урон", icon: "Shield", cost: 50, cd: 3, dmg: 0, type: "shield" },
      { name: "Истощение", desc: "Сжигает МП врага и наносит урон", icon: "Flame", cost: 70, cd: 4, dmg: 200, type: "damage" },
    ],
  },
  {
    id: "assassin",
    name: "Тень",
    role: "Убийца / Мобильность",
    desc: "Призрак войны, который убивает прежде, чем враг успевает осознать опасность.",
    color: "#0ea5e9",
    glowColor: "rgba(14,165,233,0.4)",
    icon: "Eye",
    hp: 850,
    mp: 450,
    armor: 25,
    speed: 95,
    dmg: 240,
    image: "https://cdn.poehali.dev/projects/1722ed7b-9526-4be9-a422-bcbecb711a0e/files/686de31a-2d1e-4d09-9127-579c8759925d.jpg",
    abilities: [
      { name: "Теневой клинок", desc: "Удар из тени, всегда критический", icon: "Eye", cost: 35, cd: 1, dmg: 280, type: "damage" },
      { name: "Смертельный яд", desc: "Яд наносит урон 5 ходов", icon: "Skull", cost: 50, cd: 3, dmg: 180, type: "damage" },
      { name: "Невидимость", desc: "Исчезает, следующий удар — крит", icon: "EyeOff", cost: 60, cd: 4, dmg: 0, type: "shield" },
      { name: "Рывок", desc: "Мгновенный рывок и удар кинжалом", icon: "Move", cost: 45, cd: 2, dmg: 250, type: "damage" },
    ],
  },
];

const ONLINE_PLAYERS: Player[] = [
  { id: 1, name: "ShadowBlade_RU", class: "Тень", level: 87, rank: "Легенда", wins: 3241, ping: 18, ready: true },
  { id: 2, name: "Draconicus", class: "Берсерк", level: 72, rank: "Мастер", wins: 2108, ping: 32, ready: true },
  { id: 3, name: "Архимаг_Злобус", class: "Архимаг", level: 94, rank: "Легенда", wins: 4502, ping: 45, ready: false },
  { id: 4, name: "KnightFury_MSK", class: "Берсерк", level: 61, rank: "Элита", wins: 1673, ping: 22, ready: true },
  { id: 5, name: "VoidWalker", class: "Архимаг", level: 88, rank: "Мастер", wins: 2890, ping: 67, ready: true },
  { id: 6, name: "IronTempest", class: "Тень", level: 55, rank: "Элита", wins: 1234, ping: 15, ready: false },
];

// ─── Particle Embers ─────────────────────────────────────────────────────
function Embers() {
  const embers = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 4,
    duration: 2 + Math.random() * 3,
    size: 2 + Math.random() * 4,
  }));
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {embers.map((e) => (
        <div
          key={e.id}
          className="absolute rounded-full"
          style={{
            left: `${e.left}%`,
            bottom: "-10px",
            width: e.size,
            height: e.size,
            background: `rgba(255,${80 + Math.random() * 80},20,0.8)`,
            animation: `ember-float ${e.duration}s ${e.delay}s ease-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ─── HP / MP Bar ─────────────────────────────────────────────────────────
function StatBar({ current, max, color, label }: { current: number; max: number; color: string; label: string }) {
  const pct = Math.max(0, (current / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-game tracking-wider" style={{ color }}>
        <span>{label}</span>
        <span>{current}/{max}</span>
      </div>
      <div className="h-2 bg-black/60 rounded overflow-hidden border border-white/10">
        <div
          className="h-full rounded transition-all duration-500"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }}
        />
      </div>
    </div>
  );
}

// ─── Class Card ──────────────────────────────────────────────────────────
function ClassCard({ cls, selected, onSelect }: { cls: ClassDef; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="relative group text-left transition-all duration-300 rounded overflow-hidden border"
      style={{
        borderColor: selected ? cls.color : "rgba(255,255,255,0.08)",
        boxShadow: selected ? `0 0 20px ${cls.glowColor}, inset 0 0 30px ${cls.glowColor}` : "none",
        background: selected ? `linear-gradient(135deg, rgba(10,14,20,0.95), ${cls.glowColor})` : "rgba(10,14,20,0.7)",
      }}
    >
      <div className="aspect-[3/4] overflow-hidden relative">
        <img
          src={cls.image}
          alt={cls.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          style={{ filter: selected ? "none" : "grayscale(40%) brightness(0.7)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <div className="text-xs font-body tracking-widest uppercase mb-1" style={{ color: cls.color }}>
          {cls.role}
        </div>
        <div className="text-xl font-game text-white tracking-wider">{cls.name}</div>
        <p className="text-xs text-white/60 mt-1 leading-relaxed line-clamp-2">{cls.desc}</p>
        {selected && (
          <div className="mt-3 grid grid-cols-3 gap-1">
            {[
              { label: "HP", val: cls.hp },
              { label: "БРОНЯ", val: cls.armor },
              { label: "СКОРОСТЬ", val: cls.speed },
            ].map((s) => (
              <div key={s.label} className="bg-black/50 border border-white/10 rounded px-2 py-1 text-center">
                <div className="text-xs font-game" style={{ color: cls.color }}>{s.val}</div>
                <div className="text-[9px] text-white/40 tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <div
          className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: cls.color }}
        >
          <Icon name="Check" size={12} />
        </div>
      )}
    </button>
  );
}

// ─── Battle Arena ────────────────────────────────────────────────────────
function BattleArena({ selectedClass }: { selectedClass: ClassDef }) {
  const [battle, setBattle] = useState<BattleState>({
    playerHp: selectedClass.hp,
    playerMp: selectedClass.mp,
    enemyHp: 900,
    maxHp: selectedClass.hp,
    maxMp: selectedClass.mp,
    enemyMaxHp: 900,
    combo: 0,
    turn: "idle",
    log: [],
    abilityCooldowns: {},
    phase: "idle",
    round: 1,
  });
  const [dmgNumbers, setDmgNumbers] = useState<DamageNumber[]>([]);
  const [shake, setShake] = useState<"player" | "enemy" | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    setBattle({
      playerHp: selectedClass.hp,
      playerMp: selectedClass.mp,
      enemyHp: 900,
      maxHp: selectedClass.hp,
      maxMp: selectedClass.mp,
      enemyMaxHp: 900,
      combo: 0,
      turn: "idle",
      log: [],
      abilityCooldowns: {},
      phase: "idle",
      round: 1,
    });
  }, [selectedClass]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battle.log]);

  const addDmg = (x: number, y: number, value: number, type: DamageNumber["type"]) => {
    const id = nextId.current++;
    setDmgNumbers((prev) => [...prev, { id, x, y, value, type }]);
    setTimeout(() => setDmgNumbers((prev) => prev.filter((d) => d.id !== id)), 1000);
  };

  const enemyTurn = useCallback((currentState: BattleState): BattleState => {
    const enemyDmg = 80 + Math.floor(Math.random() * 120);
    const isCrit = Math.random() < 0.2;
    const finalDmg = isCrit ? Math.floor(enemyDmg * 1.8) : enemyDmg;
    const newHp = Math.max(0, currentState.playerHp - finalDmg);
    setShake("player");
    setTimeout(() => setShake(null), 400);
    addDmg(15, 50, finalDmg, isCrit ? "crit" : "damage");
    const logEntry = isCrit
      ? `💀 Враг: КРИТ! -${finalDmg} HP`
      : `⚔️ Враг атакует: -${finalDmg} HP`;
    if (newHp <= 0) {
      return { ...currentState, playerHp: 0, phase: "defeat", turn: "idle", log: [...currentState.log, logEntry, "💔 Вы повержены..."] };
    }
    return { ...currentState, playerHp: newHp, turn: "player", log: [...currentState.log, logEntry] };
  }, []);

  const startBattle = () => {
    setBattle((prev) => ({ ...prev, phase: "fighting", turn: "player", log: ["⚡ Битва начата! Ваш ход."] }));
  };

  const activateAbility = (ability: Ability) => {
    if (battle.turn !== "player" || battle.phase !== "fighting") return;
    if (battle.playerMp < ability.cost) return;
    const cd = battle.abilityCooldowns[ability.name] || 0;
    if (cd > 0) return;

    let newEnemyHp = battle.enemyHp;
    let newPlayerHp = battle.playerHp;
    const newPlayerMp = battle.playerMp - ability.cost;
    let logEntry = "";
    const isCrit = Math.random() < 0.25;

    if (ability.type === "heal") {
      const heal = Math.abs(ability.dmg);
      newPlayerHp = Math.min(battle.maxHp, newPlayerHp + heal);
      addDmg(20, 40, heal, "heal");
      logEntry = `💚 ${ability.name}: +${heal} HP`;
    } else if (ability.dmg > 0) {
      const dmgDealt = isCrit ? Math.floor(ability.dmg * 1.7) : ability.dmg + Math.floor(Math.random() * 60);
      newEnemyHp = Math.max(0, newEnemyHp - dmgDealt);
      setShake("enemy");
      setTimeout(() => setShake(null), 400);
      addDmg(75, 40, dmgDealt, isCrit ? "crit" : "damage");
      logEntry = isCrit ? `💥 ${ability.name}: КРИТ! -${dmgDealt} HP` : `⚔️ ${ability.name}: -${dmgDealt} HP`;
    } else {
      logEntry = `🛡️ ${ability.name} активировано`;
    }

    const newCooldowns = { ...battle.abilityCooldowns, [ability.name]: ability.cd };
    const newCombo = ability.dmg > 0 ? battle.combo + 1 : 0;
    const newLog = [...battle.log, logEntry];
    if (newCombo >= 3) newLog.push(`🔥 КОМБО x${newCombo}! +25% урона`);

    if (newEnemyHp <= 0) {
      setBattle((prev) => ({
        ...prev, enemyHp: 0, playerMp: newPlayerMp, playerHp: newPlayerHp,
        combo: 0, turn: "idle", phase: "victory", abilityCooldowns: newCooldowns,
        round: prev.round + 1, log: [...newLog, "🏆 ПОБЕДА!"],
      }));
      return;
    }

    const afterPlayer: BattleState = {
      ...battle, enemyHp: newEnemyHp, playerHp: newPlayerHp, playerMp: newPlayerMp,
      combo: newCombo, turn: "enemy", abilityCooldowns: newCooldowns, log: newLog,
    };

    const tickedCooldowns: Record<string, number> = {};
    for (const [k, v] of Object.entries(newCooldowns)) {
      if (v > 1) tickedCooldowns[k] = v - 1;
    }

    setBattle({ ...afterPlayer });
    setTimeout(() => {
      setBattle((prev) => {
        const afterEnemy = enemyTurn(prev);
        return { ...afterEnemy, abilityCooldowns: tickedCooldowns };
      });
    }, 800);
  };

  const resetBattle = () => {
    setBattle({
      playerHp: selectedClass.hp, playerMp: selectedClass.mp, enemyHp: 900,
      maxHp: selectedClass.hp, maxMp: selectedClass.mp, enemyMaxHp: 900,
      combo: 0, turn: "idle", log: [], abilityCooldowns: {}, phase: "idle", round: 1,
    });
  };

  return (
    <div className="relative">
      {(battle.phase === "victory" || battle.phase === "defeat") && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded" style={{ background: "rgba(0,0,0,0.85)" }}>
          <div className="text-center space-y-4">
            <div className="text-6xl font-game tracking-widest"
              style={{ color: battle.phase === "victory" ? "#c8963e" : "#e63030" }}>
              {battle.phase === "victory" ? "ПОБЕДА" : "ПОРАЖЕНИЕ"}
            </div>
            <p className="text-white/60 font-body">Раунд {battle.round}</p>
            <button onClick={resetBattle}
              className="px-6 py-2 font-game tracking-widest text-sm border transition-all hover:bg-white/10"
              style={{ borderColor: battle.phase === "victory" ? "#c8963e" : "#e63030",
                color: battle.phase === "victory" ? "#c8963e" : "#e63030" }}>
              СЫГРАТЬ СНОВА
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Player */}
        <div className={`relative space-y-3 transition-all duration-200 ${shake === "player" ? "translate-x-2" : ""}`}>
          <div className="text-xs font-game tracking-widest text-white/40 uppercase">Ваш персонаж</div>
          <div className="p-4 rounded border bg-game-panel space-y-3" style={{ borderColor: `${selectedClass.color}44` }}>
            <div className="font-game text-lg tracking-wider" style={{ color: selectedClass.color }}>
              {selectedClass.name.toUpperCase()}
            </div>
            <StatBar current={battle.playerHp} max={battle.maxHp} color="#e63030" label="HP" />
            <StatBar current={battle.playerMp} max={battle.maxMp} color="#7c3aed" label="MP" />
            {battle.combo >= 2 && (
              <div className="text-xs font-game text-game-orange animate-pulse">⚡ КОМБО x{battle.combo}</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {selectedClass.abilities.map((ab, i) => {
              const cd = battle.abilityCooldowns[ab.name] || 0;
              const noMp = battle.playerMp < ab.cost;
              const disabled = cd > 0 || noMp || battle.turn !== "player" || battle.phase !== "fighting";
              return (
                <button key={i} onClick={() => activateAbility(ab)} disabled={disabled}
                  className="relative p-3 rounded border text-left transition-all duration-200 overflow-hidden"
                  style={{
                    borderColor: disabled ? "rgba(255,255,255,0.06)" : `${selectedClass.color}66`,
                    background: disabled ? "rgba(10,14,20,0.5)" : "rgba(10,14,20,0.8)",
                    opacity: disabled ? 0.5 : 1,
                    boxShadow: !disabled ? `0 0 8px ${selectedClass.glowColor}` : "none",
                  }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon name={ab.icon} size={12} style={{ color: selectedClass.color }} />
                    <span className="text-xs font-game tracking-wider text-white/90">{ab.name}</span>
                  </div>
                  <div className="text-[10px] text-white/40">{ab.desc}</div>
                  <div className="flex justify-between mt-2 text-[10px]">
                    <span style={{ color: "#7c3aed" }}>{ab.cost} MP</span>
                    {cd > 0 ? (
                      <span className="text-white/40">КД: {cd}</span>
                    ) : ab.dmg > 0 ? (
                      <span style={{ color: selectedClass.color }}>{ab.dmg} урон</span>
                    ) : ab.dmg < 0 ? (
                      <span style={{ color: "#22c55e" }}>+{Math.abs(ab.dmg)} HP</span>
                    ) : (
                      <span className="text-white/40">буфф</span>
                    )}
                  </div>
                  {cd > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded">
                      <span className="font-game text-lg text-white/60">{cd}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Center */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-full">
            <img
              src="https://cdn.poehali.dev/projects/1722ed7b-9526-4be9-a422-bcbecb711a0e/files/835a8373-48ac-4d35-a166-708f65891251.jpg"
              alt="Battle Arena" className="w-full rounded object-cover"
              style={{ height: 120, objectPosition: "center 30%" }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 rounded" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-game text-3xl tracking-[0.3em] text-white/30">VS</span>
            </div>
            {dmgNumbers.map((d) => (
              <div key={d.id} className="absolute font-game font-bold pointer-events-none z-10"
                style={{
                  left: `${d.x}%`, top: `${d.y}%`,
                  color: d.type === "heal" ? "#22c55e" : d.type === "crit" ? "#fbbf24" : "#ef4444",
                  fontSize: d.type === "crit" ? 22 : 16,
                  textShadow: "0 0 10px currentColor",
                  animation: "number-pop 1s ease-out forwards",
                }}>
                {d.type === "heal" ? "+" : "-"}{d.value}{d.type === "crit" && " КРИТ!"}
              </div>
            ))}
          </div>

          <div className="w-full border rounded p-3 bg-game-panel" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="text-[10px] font-game tracking-widest text-white/30 mb-2">БОЙ-ЛОГ</div>
            <div ref={logRef} className="space-y-1 max-h-40 overflow-y-auto">
              {battle.log.length === 0 ? (
                <div className="text-xs text-white/30 italic font-body">Начните бой...</div>
              ) : (
                battle.log.slice(-8).map((entry, i) => (
                  <div key={i} className="text-xs font-body text-white/70 leading-relaxed">{entry}</div>
                ))
              )}
            </div>
          </div>

          {battle.phase === "idle" && (
            <button onClick={startBattle}
              className="w-full py-3 font-game tracking-widest text-sm border transition-all hover:bg-white/5 animate-pulse-glow"
              style={{ borderColor: "var(--game-orange)", color: "var(--game-orange)" }}>
              ⚔️ НАЧАТЬ БОЙ
            </button>
          )}
          {battle.phase === "fighting" && (
            <div className="text-center">
              <div className="text-xs font-game tracking-widest"
                style={{ color: battle.turn === "player" ? selectedClass.color : "#e63030" }}>
                {battle.turn === "player" ? "↑ ВАШ ХОД — выберите умение" : "⏳ Ход врага..."}
              </div>
            </div>
          )}
        </div>

        {/* Enemy */}
        <div className={`space-y-3 transition-all duration-200 ${shake === "enemy" ? "-translate-x-2" : ""}`}>
          <div className="text-xs font-game tracking-widest text-white/40 uppercase text-right">Противник</div>
          <div className="p-4 rounded border bg-game-panel space-y-3" style={{ borderColor: "#e6303044" }}>
            <div className="font-game text-lg tracking-wider text-right" style={{ color: "#e63030" }}>СТРАЖ РУИН</div>
            <StatBar current={battle.enemyHp} max={battle.enemyMaxHp} color="#e63030" label="HP" />
            <div className="text-xs text-white/40 font-body text-right">Уровень 65 · Элитный моб</div>
          </div>
          <div className="p-4 rounded border bg-game-panel space-y-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="text-xs font-game tracking-widest text-white/30 mb-3">АТАКИ ВРАГА</div>
            {["Дробящий удар", "Яростный рёв", "Каменный шип", "Поглощение"].map((atk, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5">
                <span className="text-xs font-body text-white/60">{atk}</span>
                <span className="text-xs font-game text-white/30">{80 + i * 30} урон</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Lobby ───────────────────────────────────────────────────────────────
function Lobby() {
  const [search, setSearch] = useState("");
  const filtered = ONLINE_PLAYERS.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.class.toLowerCase().includes(search.toLowerCase())
  );
  const rankColor: Record<string, string> = { Легенда: "#c8963e", Мастер: "#7c3aed", Элита: "#0ea5e9" };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <div className="flex-1 relative">
          <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск игрока или класса..."
            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 pl-8 text-sm font-body text-white/80 placeholder-white/20 focus:outline-none focus:border-white/20" />
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border rounded border-green-500/30 bg-green-500/5">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs font-game text-green-400 tracking-wider">{ONLINE_PLAYERS.length} ОНЛАЙН</span>
        </div>
      </div>
      <div className="space-y-2">
        {filtered.map((p) => (
          <div key={p.id} className="flex items-center gap-4 p-3 rounded border transition-all hover:border-white/15"
            style={{ background: "rgba(10,14,20,0.7)", borderColor: "rgba(255,255,255,0.07)" }}>
            <div className="w-8 h-8 rounded border flex items-center justify-center flex-shrink-0"
              style={{ borderColor: rankColor[p.rank] + "44", background: rankColor[p.rank] + "11" }}>
              <span className="text-xs font-game" style={{ color: rankColor[p.rank] }}>{p.level}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-game text-sm text-white tracking-wider truncate">{p.name}</div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs font-body text-white/40">{p.class}</span>
                <span className="text-[10px] font-game tracking-wider" style={{ color: rankColor[p.rank] }}>{p.rank}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs font-body text-white/50">{p.wins.toLocaleString()} побед</div>
              <div className="flex items-center gap-1 justify-end mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${p.ping < 40 ? "bg-green-400" : p.ping < 80 ? "bg-yellow-400" : "bg-red-400"}`} />
                <span className="text-[10px] font-body text-white/30">{p.ping}ms</span>
              </div>
            </div>
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.ready ? "bg-green-400" : "bg-white/20"}`} />
          </div>
        ))}
      </div>
      <button className="w-full py-3 font-game tracking-widest text-sm border transition-all hover:bg-white/5"
        style={{ borderColor: "var(--game-orange)", color: "var(--game-orange)" }}>
        🎮 ВОЙТИ В МАТЧ
      </button>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────
export default function Index() {
  const [selectedClassId, setSelectedClassId] = useState("warrior");
  const [activeTab, setActiveTab] = useState<"classes" | "battle" | "lobby" | "leaderboard">("classes");
  const selectedClass = CLASSES.find((c) => c.id === selectedClassId)!;

  const tabs = [
    { id: "classes", label: "КЛАССЫ", icon: "Layers" },
    { id: "battle", label: "БОЙ", icon: "Sword" },
    { id: "lobby", label: "ЛОББИ", icon: "Users" },
    { id: "leaderboard", label: "РЕЙТИНГ", icon: "Trophy" },
  ] as const;

  const leaderboard = [
    { rank: 1, name: "ShadowBlade_RU", class: "Тень", score: 98421, winrate: 74 },
    { rank: 2, name: "Архимаг_Злобус", class: "Архимаг", score: 92100, winrate: 71 },
    { rank: 3, name: "VoidWalker", class: "Архимаг", score: 87340, winrate: 69 },
    { rank: 4, name: "Draconicus", class: "Берсерк", score: 83210, winrate: 67 },
    { rank: 5, name: "KnightFury_MSK", class: "Берсерк", score: 76540, winrate: 64 },
    { rank: 6, name: "IronTempest", class: "Тень", score: 71200, winrate: 61 },
    { rank: 7, name: "StormReaper", class: "Берсерк", score: 68900, winrate: 60 },
    { rank: 8, name: "DarkProphet", class: "Архимаг", score: 64300, winrate: 58 },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Embers />

      <div className="fixed inset-0 opacity-15 z-0"
        style={{
          backgroundImage: `url(https://cdn.poehali.dev/projects/1722ed7b-9526-4be9-a422-bcbecb711a0e/files/835a8373-48ac-4d35-a166-708f65891251.jpg)`,
          backgroundSize: "cover", backgroundPosition: "center", filter: "blur(3px)",
        }} />
      <div className="fixed inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background z-0" />

      {/* Header */}
      <header className="relative z-10 border-b border-white/8 bg-black/60 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #e63030, #ff6a1a)" }}>
                <Icon name="Flame" size={16} className="text-white" />
              </div>
              <div>
                <div className="font-game text-base tracking-[0.15em] text-white leading-none">
                  FORGE <span style={{ color: "var(--game-orange)" }}>OF</span> LEGENDS
                </div>
                <div className="text-[9px] font-body text-white/30 tracking-[0.3em] uppercase">Multiplayer Battle Arena</div>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-6 text-xs font-game tracking-wider text-white/40">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span>СЕРВЕР ОНЛАЙН</span>
              </div>
              <div><span className="text-white/20">ИГРОКОВ: </span><span className="text-game-orange">12,847</span></div>
            </div>
            <button className="px-5 py-2 font-game text-sm tracking-widest border transition-all hover:bg-orange-500/10 animate-pulse-glow"
              style={{ borderColor: "var(--game-orange)", color: "var(--game-orange)" }}>
              ВОЙТИ
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 py-16 sm:py-20 text-center px-4">
        <div className="inline-block px-3 py-1 mb-6 text-[10px] font-game tracking-[0.4em] border rounded-full"
          style={{ borderColor: "var(--game-orange)44", color: "var(--game-orange)", background: "rgba(255,106,26,0.08)" }}>
          СЕЗОН 4 · ТЬМА НАСТУПАЕТ
        </div>
        <h1 className="font-game text-4xl sm:text-6xl lg:text-7xl text-white tracking-tight leading-none mb-4">
          СРАЖАЙСЯ.{" "}
          <span className="block" style={{
            background: "linear-gradient(90deg, #e63030, #ff6a1a, #c8963e)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            ПОБЕЖДАЙ.
          </span>
          ДОМИНИРУЙ.
        </h1>
        <p className="max-w-xl mx-auto font-body text-white/50 text-base sm:text-lg leading-relaxed mb-8">
          Сетевой боевик в реальном времени. Три уникальных класса с глубокой системой умений. Рейтинговые матчи 5v5.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button onClick={() => setActiveTab("battle")}
            className="px-8 py-3.5 font-game text-sm tracking-widest text-black transition-all hover:opacity-90 hover:scale-105 active:scale-95"
            style={{ background: "linear-gradient(135deg, #ff6a1a, #e63030)" }}>
            ИГРАТЬ СЕЙЧАС
          </button>
          <button onClick={() => setActiveTab("classes")}
            className="px-8 py-3.5 font-game text-sm tracking-widest text-white/80 border transition-all hover:bg-white/5"
            style={{ borderColor: "rgba(255,255,255,0.15)" }}>
            ВЫБРАТЬ КЛАСС
          </button>
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-8 sm:gap-16">
          {[
            { label: "АКТИВНЫХ ИГРОКОВ", value: "12,847" },
            { label: "МАТЧЕЙ В ДЕНЬ", value: "48,200" },
            { label: "ПОБЕД СЕГОДНЯ", value: "24,100" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-game text-2xl sm:text-3xl text-white">{s.value}</div>
              <div className="text-[10px] font-body tracking-widest text-white/30 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Tabs */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex border-b border-white/8 mb-6">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-5 py-3 font-game text-xs tracking-widest transition-all border-b-2"
              style={{
                borderBottomColor: activeTab === tab.id ? "var(--game-orange)" : "transparent",
                color: activeTab === tab.id ? "var(--game-orange)" : "rgba(255,255,255,0.35)",
              }}>
              <Icon name={tab.icon} size={13} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Classes */}
        {activeTab === "classes" && (
          <div className="animate-fade-in space-y-6 pb-12">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {CLASSES.map((cls) => (
                <ClassCard key={cls.id} cls={cls} selected={selectedClassId === cls.id}
                  onSelect={() => setSelectedClassId(cls.id)} />
              ))}
            </div>
            <div className="p-6 rounded border"
              style={{ borderColor: `${selectedClass.color}33`, background: "rgba(10,14,20,0.8)" }}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-xs font-game tracking-widest text-white/30 mb-1">УМЕНИЯ КЛАССА</div>
                  <div className="font-game text-xl tracking-wider" style={{ color: selectedClass.color }}>
                    {selectedClass.name.toUpperCase()}
                  </div>
                </div>
                <button onClick={() => setActiveTab("battle")}
                  className="px-4 py-2 font-game text-xs tracking-widest border transition-all hover:opacity-80"
                  style={{ borderColor: selectedClass.color, color: selectedClass.color, background: `${selectedClass.color}15` }}>
                  ИГРАТЬ ЗА КЛАСС →
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {selectedClass.abilities.map((ab, i) => (
                  <div key={i} className="p-4 rounded border space-y-2 transition-all"
                    style={{ borderColor: `${selectedClass.color}22`, background: "rgba(0,0,0,0.3)" }}>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                        style={{ background: `${selectedClass.color}22`, border: `1px solid ${selectedClass.color}44` }}>
                        <Icon name={ab.icon} size={14} style={{ color: selectedClass.color }} />
                      </div>
                      <div>
                        <div className="text-xs font-game tracking-wide text-white">{ab.name}</div>
                        <div className="text-[10px] text-white/30 font-body">КД: {ab.cd} · {ab.cost} MP</div>
                      </div>
                    </div>
                    <p className="text-xs font-body text-white/50 leading-relaxed">{ab.desc}</p>
                    {ab.dmg > 0 && <div className="text-xs font-game" style={{ color: selectedClass.color }}>{ab.dmg} урона</div>}
                    {ab.dmg < 0 && <div className="text-xs font-game text-green-400">+{Math.abs(ab.dmg)} лечение</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Battle */}
        {activeTab === "battle" && (
          <div className="animate-fade-in pb-12 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-game tracking-widest text-white/30">ТРЕНИРОВОЧНЫЙ БОЙ</div>
                <div className="font-game text-lg text-white mt-0.5">
                  Играете за: <span style={{ color: selectedClass.color }}>{selectedClass.name}</span>
                </div>
              </div>
              <button onClick={() => setActiveTab("classes")}
                className="text-xs font-game tracking-wider text-white/30 hover:text-white/60 transition-colors flex items-center gap-1">
                <Icon name="ArrowLeft" size={12} />СМЕНИТЬ КЛАСС
              </button>
            </div>
            <BattleArena selectedClass={selectedClass} />
          </div>
        )}

        {/* Lobby */}
        {activeTab === "lobby" && (
          <div className="animate-fade-in pb-12">
            <div className="mb-4">
              <div className="text-xs font-game tracking-widest text-white/30">МУЛЬТИПЛЕЕР</div>
              <div className="font-game text-lg text-white mt-0.5">Онлайн-лобби</div>
            </div>
            <Lobby />
          </div>
        )}

        {/* Leaderboard */}
        {activeTab === "leaderboard" && (
          <div className="animate-fade-in pb-12 space-y-3">
            <div className="mb-4">
              <div className="text-xs font-game tracking-widest text-white/30">ТАБЛИЦА ЛИДЕРОВ</div>
              <div className="font-game text-lg text-white mt-0.5">Топ игроки сезона</div>
            </div>
            {leaderboard.map((p) => (
              <div key={p.rank} className="flex items-center gap-4 p-4 rounded border transition-all hover:border-white/15"
                style={{
                  background: p.rank <= 3 ? "rgba(200,150,62,0.05)" : "rgba(10,14,20,0.6)",
                  borderColor: p.rank <= 3 ? "rgba(200,150,62,0.2)" : "rgba(255,255,255,0.07)",
                }}>
                <div className="w-8 h-8 flex items-center justify-center font-game text-base flex-shrink-0"
                  style={{ color: p.rank === 1 ? "#fbbf24" : p.rank === 2 ? "#94a3b8" : p.rank === 3 ? "#c8963e" : "rgba(255,255,255,0.3)" }}>
                  {p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : p.rank === 3 ? "🥉" : `#${p.rank}`}
                </div>
                <div className="flex-1">
                  <div className="font-game text-sm text-white tracking-wider">{p.name}</div>
                  <div className="text-xs text-white/40 font-body">{p.class}</div>
                </div>
                <div className="text-right">
                  <div className="font-game text-sm" style={{ color: "var(--game-gold)" }}>{p.score.toLocaleString()}</div>
                  <div className="text-[10px] text-white/30">WR: {p.winrate}%</div>
                </div>
                <div className="w-16 hidden sm:block">
                  <div className="h-1 bg-black/40 rounded overflow-hidden">
                    <div className="h-full rounded"
                      style={{ width: `${p.winrate}%`, background: p.winrate >= 70 ? "#c8963e" : "#0ea5e9" }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/6 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-4">
          <div className="font-game text-sm text-white/20 tracking-widest">FORGE OF LEGENDS © 2024</div>
          <div className="flex gap-6 text-xs font-body text-white/20">
            <span className="hover:text-white/40 cursor-pointer transition-colors">Условия</span>
            <span className="hover:text-white/40 cursor-pointer transition-colors">Поддержка</span>
            <span className="hover:text-white/40 cursor-pointer transition-colors">О проекте</span>
          </div>
        </div>
      </footer>
    </div>
  );
}