/** Local-first state, strict JSON schema, and local-calendar date helpers. */
export const KEY = "focus-flow.v1";
export const CATEGORIES = {
  work: "Работа",
  personal: "Личное",
  learn: "Учёба",
  health: "Здоровье",
};
export const PRIORITIES = { high: "Высокий", medium: "Средний", low: "Низкий" };
export const DEFAULTS = {
  name: "",
  theme: "light",
  work: 25,
  short: 5,
  long: 15,
  sound: false,
  notifications: false,
};
export const uid = () => crypto.randomUUID();
export function dateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function fromDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export function shiftDate(key, days) {
  const d = fromDate(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}
export const today = () => dateKey();
const validDate = (value) =>
  typeof value === "string" &&
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) &&
  value >= "1900-01-01" &&
  value <= "2200-12-31" &&
  dateKey(fromDate(value)) === value;
const str = (v, max, empty = true) =>
  typeof v === "string" && v.length <= max && (empty || v.trim().length > 0);
const num = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const stamp = (v) => num(v, 0, Date.now() + 366 * 86400000);
function need(test, message) {
  if (!test) throw new Error(message);
}
export function validate(raw) {
  need(
    raw && typeof raw === "object" && raw.version === 1,
    "Неизвестный формат данных. Нужен экспорт FOCUS FLOW v1.",
  );
  need(
    Array.isArray(raw.tasks) && raw.tasks.length <= 10000,
    "Некорректный список задач (максимум 10 000).",
  );
  need(
    Array.isArray(raw.sessions) && raw.sessions.length <= 20000,
    "Некорректная история сессий.",
  );
  const ids = new Set();
  const tasks = raw.tasks.map((t, i) => {
    need(
      t && str(t.id, 80, false) && !ids.has(t.id),
      "Повторяющийся или неверный ID задачи.",
    );
    ids.add(t.id);
    need(
      str(t.title, 160, false) && str(t.description, 4000),
      "Проверьте название и описание задач.",
    );
    need(
      Object.hasOwn(CATEGORIES, t.category) &&
        Object.hasOwn(PRIORITIES, t.priority),
      "Неизвестная категория или приоритет.",
    );
    need(
      (t.date === "" || validDate(t.date)) &&
        typeof t.time === "string" &&
        (!t.time || /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(t.time)),
      "Некорректная дата или время.",
    );
    need(
      num(t.duration, 1, 480) &&
        Number.isInteger(t.duration) &&
        typeof t.done === "boolean" &&
        stamp(t.createdAt) &&
        (t.completedAt === null || stamp(t.completedAt)) &&
        (!t.done || t.completedAt !== null),
      "Некорректные параметры задачи.",
    );
    return {
      id: t.id,
      title: t.title.trim(),
      description: t.description,
      category: t.category,
      priority: t.priority,
      date: t.date,
      time: t.time,
      duration: t.duration,
      done: t.done,
      createdAt: t.createdAt,
      completedAt: t.done ? t.completedAt : null,
      order: num(t.order, -1e6, 1e6) ? t.order : i,
      demo: t.demo === true,
    };
  });
  const sessionIds = new Set();
  const sessions = raw.sessions.map((s) => {
    need(
      s &&
        str(s.id, 80, false) &&
        !sessionIds.has(s.id) &&
        stamp(s.endedAt) &&
        num(s.duration, 1, 10800),
      "Некорректная сессия фокуса.",
    );
    sessionIds.add(s.id);
    return {
      id: s.id,
      endedAt: s.endedAt,
      duration: s.duration,
      taskId: ids.has(s.taskId) ? s.taskId : null,
    };
  });
  const s = raw.settings;
  need(
    s && str(s.name, 40) && ["light", "dark"].includes(s.theme),
    "Некорректные настройки интерфейса.",
  );
  for (const k of ["work", "short", "long"])
    need(
      Number.isInteger(s[k]) && num(s[k], 1, k === "work" ? 180 : 60),
      "Длительности должны быть целыми числами в допустимом диапазоне.",
    );
  need(
    typeof s.sound === "boolean" && typeof s.notifications === "boolean",
    "Некорректные настройки уведомлений.",
  );
  const settings = {
    name: s.name,
    theme: s.theme,
    work: s.work,
    short: s.short,
    long: s.long,
    sound: s.sound,
    notifications: s.notifications,
  };
  let timer = null;
  if (raw.timer) {
    const t = raw.timer;
    need(
      ["work", "short", "long"].includes(t.mode) &&
        typeof t.running === "boolean" &&
        num(t.total, 60, 10800) &&
        num(t.remaining, 0, 10800000) &&
        str(t.id, 80, false) &&
        (!t.running || stamp(t.deadline)),
      "Некорректное состояние таймера.",
    );
    timer = {
      id: t.id,
      mode: t.mode,
      running: t.running,
      total: t.total,
      remaining: Math.min(t.remaining, t.total * 1000),
      deadline: t.running ? t.deadline : null,
      taskId: ids.has(t.taskId) ? t.taskId : null,
    };
  }
  return { version: 1, tasks, sessions, settings, timer };
}
export function seed() {
  const now = Date.now(),
    d = today();
  const entries = [
    [
      "Наметить главное на день",
      "Начните с одной действительно важной вещи.",
      "personal",
      "medium",
      "09:00",
      15,
      true,
    ],
    [
      "Собрать концепцию проекта",
      "Референсы, ключевая идея и первые наброски.",
      "work",
      "high",
      "10:00",
      50,
      false,
    ],
    [
      "Почитать 20 страниц",
      "Немного пространства для новых идей.",
      "learn",
      "low",
      "13:00",
      30,
      false,
    ],
    ["Прогуляться без телефона", "", "health", "medium", "16:30", 30, false],
    [
      "Подвести итоги дня",
      "Что получилось? Что можно отпустить?",
      "personal",
      "low",
      "18:00",
      10,
      false,
    ],
    ["Разобрать входящие", "", "work", "medium", "09:30", 20, true],
  ];
  return {
    version: 1,
    settings: { ...DEFAULTS },
    sessions: [],
    timer: null,
    tasks: entries.map((e, i) => ({
      id: uid(),
      title: e[0],
      description: e[1],
      category: e[2],
      priority: e[3],
      time: e[4],
      duration: e[5],
      done: e[6],
      date: d,
      createdAt: now,
      completedAt: e[6] ? now : null,
      order: i,
      demo: true,
    })),
  };
}
export let storageWarning = "";
function readDisk() {
  const raw = localStorage.getItem(KEY);
  return raw ? validate(JSON.parse(raw)) : null;
}
let state;
try {
  state = readDisk();
  if (!state) {
    state = seed();
    localStorage.setItem(KEY, JSON.stringify(state));
  }
} catch {
  state = seed();
  storageWarning =
    "Не удалось прочитать локальные данные. Проверьте доступ к хранилищу; экспортируйте важные данные перед закрытием.";
}
export const getState = () => state;
function notify() {
  window.dispatchEvent(new CustomEvent("flow:change"));
}
export function save(next) {
  state = validate(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageWarning = "";
  } catch {
    storageWarning =
      "Изменения пока только в памяти: хранилище недоступно или заполнено. Сохраните JSON-экспорт.";
    window.dispatchEvent(new CustomEvent("flow:storage"));
  }
  notify();
  return state;
}
export function update(fn) {
  // Rebase writes on the latest committed data, avoiding stale-tab overwrites.
  if (!storageWarning) {
    try {
      const fresh = readDisk();
      if (fresh) state = fresh;
    } catch {
      /* keep recoverable in-memory state */
    }
  }
  const next = structuredClone(state);
  fn(next);
  return save(next);
}
window.addEventListener("storage", (e) => {
  if (e.key === KEY) {
    try {
      const next = readDisk();
      if (next) {
        state = next;
        notify();
      }
    } catch {
      storageWarning = "Данные в другой вкладке изменены некорректно.";
      window.dispatchEvent(new CustomEvent("flow:storage"));
    }
  }
});
export function dailyStats(key) {
  const s = getState();
  return {
    completed: s.tasks.filter(
      (t) => t.done && dateKey(new Date(t.completedAt)) === key,
    ).length,
    focus: s.sessions
      .filter((f) => dateKey(new Date(f.endedAt)) === key)
      .reduce((a, f) => a + f.duration / 60, 0),
  };
}
export function streak() {
  let count = 0,
    d = today();
  if (!dailyStats(d).completed && !dailyStats(d).focus) d = shiftDate(d, -1);
  for (let i = 0; i < 3660; i++) {
    const a = dailyStats(d);
    if (!a.completed && !a.focus) break;
    count++;
    d = shiftDate(d, -1);
  }
  return count;
}
export function periodDays(count) {
  return Array.from({ length: count }, (_, i) =>
    shiftDate(today(), i - count + 1),
  );
}
