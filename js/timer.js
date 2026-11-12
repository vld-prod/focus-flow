import { getState, update, uid } from "./store.js";
export const MODES = {
  work: "Фокус",
  short: "Короткий перерыв",
  long: "Длинный перерыв",
};
export function timerState() {
  return (
    getState().timer || {
      id: uid(),
      mode: "work",
      running: false,
      total: getState().settings.work * 60,
      remaining: getState().settings.work * 60000,
      deadline: null,
      taskId: null,
    }
  );
}
export function remaining(t = timerState()) {
  return t.running ? Math.max(0, t.deadline - Date.now()) : t.remaining;
}
export function setMode(mode) {
  if (!MODES[mode]) return;
  update((s) => {
    s.timer = {
      id: uid(),
      mode,
      running: false,
      total: s.settings[mode] * 60,
      remaining: s.settings[mode] * 60000,
      deadline: null,
      taskId: s.timer?.taskId || null,
    };
  });
}
export function toggleTimer() {
  const t = timerState(),
    ms = remaining(t);
  update((s) => {
    s.timer = {
      ...t,
      running: !t.running,
      remaining: ms || t.total * 1000,
      deadline: t.running ? null : Date.now() + (ms || t.total * 1000),
    };
  });
}
export function resetTimer() {
  const t = timerState();
  update((s) => {
    const total = s.settings[t.mode] * 60;
    s.timer = {
      ...t,
      id: uid(),
      total,
      running: false,
      deadline: null,
      remaining: total * 1000,
    };
  });
}
export function linkTask(id) {
  update((s) => {
    s.timer = {
      ...timerState(),
      taskId: s.tasks.some((t) => t.id === id) ? id : null,
    };
  });
}
export function tick() {
  const t = getState().timer;
  if (!t?.running || remaining(t) > 0) return false;
  let finished = false;
  update((s) => {
    if (!s.timer?.running || s.timer.id !== t.id) return;
    if (t.mode === "work" && !s.sessions.some((f) => f.id === t.id)) {
      s.sessions.push({
        id: t.id,
        endedAt: t.deadline,
        duration: t.total,
        taskId: t.taskId,
      });
      finished = true;
    } else if (t.mode !== "work") finished = true;
    s.timer = {
      ...t,
      id: uid(),
      running: false,
      deadline: null,
      remaining: t.total * 1000,
    };
  });
  if (finished)
    window.dispatchEvent(
      new CustomEvent("flow:finished", {
        detail: { mode: t.mode, duration: t.total },
      }),
    );
  return finished;
}
let audio;
export function primeSound() {
  if (!getState().settings.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
  } catch {
    /* Silent fallback. */
  }
}
export function chime() {
  if (!getState().settings.sound) return;
  try {
    primeSound();
    for (let i = 0; i < 3; i++) {
      const o = audio.createOscillator(),
        g = audio.createGain(),
        at = audio.currentTime + i * 0.22;
      o.type = "sine";
      o.frequency.value = [523.25, 659.25, 783.99][i];
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.13, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.7);
      o.connect(g);
      g.connect(audio.destination);
      o.start(at);
      o.stop(at + 0.7);
    }
  } catch {
    /* Notification still works without audio. */
  }
}
setInterval(() => {
  tick();
  window.dispatchEvent(new CustomEvent("flow:tick"));
}, 250);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    tick();
    window.dispatchEvent(new CustomEvent("flow:tick"));
  }
});
