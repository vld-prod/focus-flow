import {
  KEY,
  CATEGORIES,
  PRIORITIES,
  DEFAULTS,
  getState,
  save,
  update,
  validate,
  uid,
  today,
  dateKey,
  fromDate,
  shiftDate,
  dailyStats,
  streak,
  periodDays,
  storageWarning,
} from "./store.js";
import {
  MODES,
  timerState,
  remaining,
  setMode,
  toggleTimer,
  resetTimer,
  linkTask,
  tick,
  chime,
  primeSound,
} from "./timer.js";
import { icon } from "./icons.js";
import { activityChart, ring } from "./charts.js";
const $ = (s, root = document) => root.querySelector(s);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const views = {
  dashboard: ["Мой день", "grid"],
  tasks: ["Задачи", "tasks"],
  focus: ["Фокус", "timer"],
  calendar: ["Календарь", "calendar"],
  analytics: ["Аналитика", "chart"],
  settings: ["Настройки", "settings"],
};
let view = Object.hasOwn(views, location.hash.slice(1))
  ? location.hash.slice(1)
  : "dashboard";
const ui = {
  query: "",
  status: "all",
  category: "all",
  priority: "all",
  sort: "manual",
  selected: today(),
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12),
  period: 7,
};
let confirmFn = null,
  dragged = null,
  toastTimeout,
  discardDraft = false;
const dateFormatters = new Map();
const fmtDate = (key, options = { day: "numeric", month: "long" }) => {
  const id = JSON.stringify(options);
  if (!dateFormatters.has(id))
    dateFormatters.set(id, new Intl.DateTimeFormat("ru-RU", options));
  return dateFormatters.get(id).format(fromDate(key));
};
const minutes = (n) => Math.round(n) + " мин";
const tasksToday = () => getState().tasks.filter((t) => t.date === today());
const button = (text, action, cls = "subtle", extra = "") =>
  '<button class="button ' +
  cls +
  '" data-action="' +
  action +
  '" ' +
  extra +
  ">" +
  text +
  "</button>";
function toast(message) {
  const node = $("#toasts");
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => node.classList.remove("visible"), 4200);
}
function confirmation(title, description, callback, label = "Подтвердить") {
  confirmFn = callback;
  $("#confirm-title").textContent = title;
  $("#confirm-description").textContent = description;
  $("#confirm-ok").textContent = label;
  $("#confirm-dialog").showModal();
  $('#confirm-dialog [data-action="cancel-confirm"]').focus();
}
function empty(title, description, action = "add") {
  return (
    '<div class="empty-state">' +
    icon("leaf") +
    "<h3>" +
    title +
    "</h3><p>" +
    description +
    "</p>" +
    button("Добавить задачу " + icon("plus"), action) +
    "</div>"
  );
}
function pageHead(eyebrow, title, description, action = "") {
  return (
    '<div class="page-heading"><div><div class="eyebrow">' +
    eyebrow +
    "</div><h1>" +
    title +
    "</h1><p>" +
    description +
    "</p></div>" +
    action +
    "</div>"
  );
}
function sorted(tasks) {
  const ranks = { high: 0, medium: 1, low: 2 };
  return [...tasks].sort((a, b) =>
    ui.sort === "priority"
      ? ranks[a.priority] - ranks[b.priority] || a.order - b.order
      : ui.sort === "date"
        ? (a.date || "9999").localeCompare(b.date || "9999") ||
          a.time.localeCompare(b.time)
        : ui.sort === "duration"
          ? a.duration - b.duration
          : a.order - b.order,
  );
}
function taskRow(t, manual = false) {
  const overdue = !t.done && t.date && t.date < today();
  return (
    '<article class="task-row ' +
    (t.done ? "is-done" : "") +
    '" data-id="' +
    esc(t.id) +
    '" ' +
    (manual ? 'draggable="true"' : "") +
    ">" +
    (manual
      ? '<span class="drag-handle" aria-hidden="true">' +
        icon("grip") +
        "</span>"
      : "") +
    '<button class="task-check" data-action="complete" data-id="' +
    esc(t.id) +
    '" aria-label="' +
    esc((t.done ? "Вернуть в работу: " : "Завершить: ") + t.title) +
    '" aria-pressed="' +
    t.done +
    '">' +
    icon("check") +
    '</button><div class="task-content"><button class="task-title" data-action="edit" data-id="' +
    esc(t.id) +
    '">' +
    esc(t.title) +
    '</button><div class="task-meta"><span class="category ' +
    t.category +
    '"><i></i>' +
    CATEGORIES[t.category] +
    "</span><span>" +
    icon("clock") +
    t.duration +
    " мин</span>" +
    (t.date
      ? '<span class="' +
        (overdue ? "overdue" : "") +
        '">' +
        (t.date === today() ? "Сегодня" : fmtDate(t.date)) +
        (t.time ? " · " + t.time : "") +
        "</span>"
      : "<span>Без даты</span>") +
    '</div></div><span class="priority ' +
    t.priority +
    '" title="Приоритет: ' +
    PRIORITIES[t.priority] +
    '"><i></i><span>' +
    PRIORITIES[t.priority] +
    '</span></span><div class="task-actions">' +
    (!t.done
      ? '<button class="icon-button" data-action="focus-task" data-id="' +
        esc(t.id) +
        '" aria-label="Фокус: ' +
        esc(t.title) +
        '">' +
        icon("play") +
        "</button>"
      : "") +
    '<button class="icon-button" data-action="edit" data-id="' +
    esc(t.id) +
    '" aria-label="Изменить: ' +
    esc(t.title) +
    '">' +
    icon("edit") +
    '</button><button class="icon-button" data-action="delete" data-id="' +
    esc(t.id) +
    '" aria-label="Удалить: ' +
    esc(t.title) +
    '">' +
    icon("trash") +
    "</button>" +
    (manual
      ? '<button class="icon-button move-up" data-action="move-up" data-id="' +
        esc(t.id) +
        '" aria-label="Выше: ' +
        esc(t.title) +
        '">' +
        icon("up") +
        '</button><button class="icon-button move-down" data-action="move-down" data-id="' +
        esc(t.id) +
        '" aria-label="Ниже: ' +
        esc(t.title) +
        '">' +
        icon("down") +
        "</button>"
      : "") +
    "</div></article>"
  );
}
function dashboard() {
  const all = tasksToday(),
    done = all.filter((t) => t.done).length,
    pct = all.length ? Math.round((done / all.length) * 100) : 0,
    s = dailyStats(today()),
    pending = all
      .filter((t) => !t.done)
      .sort((a, b) => (a.time || "99").localeCompare(b.time || "99")),
    greeting = getState().settings.name
      ? ", " + esc(getState().settings.name)
      : "";
  return (
    pageHead(
      fmtDate(today(), { weekday: "long", day: "numeric", month: "long" }) +
        ' <span class="heading-line"></span> В ВАШЕМ РИТМЕ',
      "Сегодня — ваш день" + greeting + ".",
      "Не нужно успевать всё. Достаточно сделать важное.",
    ) +
    '<div class="dashboard-top"><section class="focus-hero"><div class="hero-copy"><span class="hero-label"><i></i> ПРОСТРАНСТВО ДЛЯ КОНЦЕНТРАЦИИ</span><h2>Меньше шума.<br><span>Больше фокуса.</span></h2><p>Одна задача. Один спокойный вдох.<br>Начните с ' +
    getState().settings.work +
    " минут для главного.</p>" +
    button(
      "Поймать поток " + icon("arrow"),
      "navigate",
      "lime",
      'data-view="focus"',
    ) +
    '</div><div class="orbit-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="orbit orbit-three"></div><div class="orbit-core">✳</div><span class="orbit-caption">FIND YOUR<br>OWN RHYTHM</span><span class="orbit-dot"></span></div><div class="hero-foot"><span>МАЛЕНЬКИЕ ШАГИ → БОЛЬШИЕ ПЕРЕМЕНЫ</span><span>01 / FOCUS</span></div></section><section class="day-progress panel"><div class="section-title"><h2>Ваш сегодняшний ритм</h2>' +
    icon("spark") +
    '</div><div class="progress-visual">' +
    ring(pct) +
    "<div><strong>" +
    pct +
    "<span>%</span></strong><small>дня в потоке</small></div></div><p><b>" +
    done +
    " из " +
    all.length +
    '</b> задач завершено</p><div class="progress-caption">' +
    (pct === 100 && all.length
      ? "Отличная работа. Можно выдохнуть."
      : pct
        ? "Вы уже сделали первый шаг. Так держать!"
        : "Новый день — чистый лист. Начнём?") +
    '</div></section></div><div class="metrics-strip"><div>' +
    icon("tasks") +
    "<span><strong>" +
    pending.length +
    "</strong><small>задач впереди</small></span></div><div>" +
    icon("timer") +
    "<span><strong>" +
    Math.round(s.focus) +
    "<em> мин</em></strong><small>фокус сегодня</small></span></div><div>" +
    icon("fire") +
    "<span><strong>" +
    streak() +
    "<em> дн.</em></strong><small>продуктивная серия</small></span></div><div>" +
    icon("check") +
    "<span><strong>" +
    done +
    '</strong><small>маленьких побед</small></span></div></div><div class="dashboard-bottom"><section class="panel agenda"><div class="section-title"><div><span class="eyebrow">ШАГ ЗА ШАГОМ</span><h2>На повестке <span class="count">' +
    pending.length +
    "</span></h2></div>" +
    button(
      "Все задачи " + icon("arrow"),
      "navigate",
      "text-button",
      'data-view="tasks"',
    ) +
    '</div><div class="task-list">' +
    (pending.length
      ? pending
          .slice(0, 4)
          .map((t) => taskRow(t))
          .join("")
      : empty(
          "На сегодня всё спокойно",
          "Добавьте новую задачу или оставьте время для себя.",
        )) +
    '</div><button class="add-inline" data-action="add">' +
    icon("plus") +
    ' Добавить в мой день</button></section><div class="dashboard-aside"><section class="activity-panel"><div class="section-title"><div><span class="eyebrow">ВАЖНО ПОСТОЯНСТВО</span><h2>Ваша неделя</h2></div><span class="week-badge">7 дней</span></div>' +
    activityChart(periodDays(7)) +
    '<div class="activity-foot"><span><i></i> Выполненные задачи</span><button class="icon-button" data-action="navigate" data-view="analytics" aria-label="Открыть аналитику">' +
    icon("arrow") +
    '</button></div></section><div class="gentle-note">' +
    icon("leaf") +
    "<p>Продуктивность — не о том,<br>чтобы делать больше.<br><b>А о том, чтобы делать своё.</b></p><span>ЗАМЕТКА НА ПОЛЯХ</span></div></div></div>" +
    (getState().tasks.some((t) => t.demo)
      ? '<div class="demo-note">' +
        icon("spark") +
        ' Здесь несколько примеров для знакомства. Статистика включает их. <button data-action="clear-demo">Убрать примеры</button></div>'
      : "")
  );
}
function filteredTasks() {
  return sorted(
    getState().tasks.filter(
      (t) =>
        (!ui.query ||
          (t.title + " " + t.description)
            .toLocaleLowerCase("ru")
            .includes(ui.query.toLocaleLowerCase("ru"))) &&
        (ui.status === "all" || (ui.status === "done" ? t.done : !t.done)) &&
        (ui.category === "all" || t.category === ui.category) &&
        (ui.priority === "all" || t.priority === ui.priority),
    ),
  );
}
function taskResults() {
  const list = filteredTasks();
  return (
    '<div class="list-summary"><span>' +
    list.length +
    " задач · " +
    list.filter((t) => !t.done).reduce((a, t) => a + t.duration, 0) +
    ' мин запланировано</span><span class="reorder-note">' +
    (ui.sort === "manual" ? "Перетаскивайте или используйте стрелки" : "") +
    '</span></div><div class="task-list">' +
    (list.length
      ? list.map((t) => taskRow(t, ui.sort === "manual")).join("")
      : empty(
          "Здесь пока тихо",
          getState().tasks.length
            ? "Попробуйте изменить фильтры или добавить задачу."
            : "Добавьте первый маленький шаг.",
        )) +
    "</div>"
  );
}
function selectFilter(name, label, options, value) {
  return (
    '<label class="filter-label"><span class="sr-only">' +
    label +
    '</span><select id="filter-' +
    name +
    '" data-filter="' +
    name +
    '" aria-label="' +
    label +
    '">' +
    Object.entries(options)
      .map(
        ([k, v]) =>
          '<option value="' +
          k +
          '" ' +
          (k === value ? "selected" : "") +
          ">" +
          v +
          "</option>",
      )
      .join("") +
    "</select></label>"
  );
}
function tasksView() {
  return (
    pageHead(
      "ОТ ИДЕИ К ДЕЙСТВИЮ",
      "Каждому делу — своё место.",
      "Выгрузите мысли. Расставьте акценты. Начните с одного.",
    ) +
    '<section class="panel tasks-panel"><div class="task-toolbar"><label class="search-field">' +
    icon("search") +
    '<input id="task-search" type="search" placeholder="Найти задачу…" aria-label="Поиск задач" value="' +
    esc(ui.query) +
    '"></label><div class="segmented" aria-label="Статус задач">' +
    Object.entries({ all: "Все", active: "В работе", done: "Готово" })
      .map(
        ([k, v]) =>
          '<button data-action="status" data-value="' +
          k +
          '" class="' +
          (ui.status === k ? "selected" : "") +
          '" aria-pressed="' +
          (ui.status === k) +
          '">' +
          v +
          "</button>",
      )
      .join("") +
    '</div></div><div class="filters">' +
    selectFilter(
      "category",
      "Категория",
      { all: "Все категории", ...CATEGORIES },
      ui.category,
    ) +
    selectFilter(
      "priority",
      "Приоритет",
      { all: "Все приоритеты", ...PRIORITIES },
      ui.priority,
    ) +
    selectFilter(
      "sort",
      "Сортировка",
      {
        manual: "Мой порядок",
        date: "По дате",
        priority: "По приоритету",
        duration: "По длительности",
      },
      ui.sort,
    ) +
    button("Сбросить", "reset-filters", "text-button") +
    '</div><div id="task-results">' +
    taskResults() +
    '</div><button class="add-inline" data-action="add">' +
    icon("plus") +
    " Добавить задачу</button></section>"
  );
}
function focusView() {
  const t = timerState(),
    s = getState(),
    count = s.sessions.filter(
      (f) => dateKey(new Date(f.endedAt)) === today(),
    ).length;
  return (
    pageHead(
      "ОДНА ЗАДАЧА. ВСЁ ВНИМАНИЕ.",
      "Войдите в свой поток.",
      "Пусть остальной мир немного подождёт.",
      '<span class="quiet-label">' +
        icon("leaf") +
        " Сейчас достаточно одного дела</span>",
    ) +
    '<div class="focus-layout"><section class="timer-panel panel"><div class="segmented mode-tabs" aria-label="Режим таймера">' +
    Object.entries(MODES)
      .map(
        ([k, v]) =>
          '<button class="' +
          (t.mode === k ? "selected" : "") +
          '" data-action="mode" data-mode="' +
          k +
          '" aria-pressed="' +
          (t.mode === k) +
          '">' +
          (k === "short" ? "Короткий" : k === "long" ? "Длинный" : v) +
          "</button>",
      )
      .join("") +
    '</div><div class="timer-dial">' +
    ring(remaining(t) / t.total / 10, "timer-ring") +
    '<div class="timer-face"><span class="eyebrow">' +
    MODES[t.mode] +
    '</span><strong id="timer-display" aria-label="Осталось времени">00:00</strong><span id="timer-status">Время для главного</span></div><span class="dial-star" aria-hidden="true">✳</span></div><div class="timer-controls"><button class="icon-button large" data-action="timer-reset" aria-label="Сбросить таймер">' +
    icon("reset") +
    '</button><button class="button primary timer-start" data-action="timer-toggle" id="timer-toggle">' +
    icon(t.running ? "pause" : "play") +
    (t.running
      ? "Пауза"
      : remaining(t) < t.total * 1000
        ? "Продолжить"
        : "Начать фокус") +
    '</button><button class="icon-button large" data-action="sound" aria-label="' +
    (s.settings.sound ? "Отключить" : "Включить") +
    ' звук" aria-pressed="' +
    s.settings.sound +
    '">' +
    icon(s.settings.sound ? "volume" : "mute") +
    '</button></div><label class="linked-task">Сфокусироваться на<select id="linked-task"><option value="">Свободная сессия — без задачи</option>' +
    s.tasks
      .filter((task) => !task.done || task.id === t.taskId)
      .map(
        (task) =>
          '<option value="' +
          esc(task.id) +
          '" ' +
          (task.id === t.taskId ? "selected" : "") +
          ">" +
          esc(task.title) +
          "</option>",
      )
      .join("") +
    '</select></label><p class="timer-hint">' +
    icon("clock") +
    ' Таймер сохранит ритм, даже если вы смените вкладку.</p></section><aside class="focus-aside"><section class="focus-guide"><span class="eyebrow">МАЛЕНЬКИЙ РИТУАЛ</span><h2>Освободите<br>немного места.</h2><ol><li><span>01</span> Выберите одну задачу</li><li><span>02</span> Уберите всё, что отвлекает</li><li><span>03</span> Позвольте себе начать</li></ol><div class="guide-flower" aria-hidden="true">✳</div></section><section class="panel focus-summary"><span class="eyebrow">СЕГОДНЯ В ПОТОКЕ</span><strong>' +
    minutes(dailyStats(today()).focus) +
    "</strong><p>" +
    count +
    " завершённых сессий</p>" +
    button(
      "Настроить свой ритм " + icon("arrow"),
      "navigate",
      "text-button",
      'data-view="settings"',
    ) +
    "</section></aside></div>"
  );
}
function calendarView() {
  const year = ui.month.getFullYear(),
    month = ui.month.getMonth(),
    start = new Date(year, month, 1, 12);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const todayKey = today();
  const selected = getState()
    .tasks.filter((t) => t.date === ui.selected)
    .sort((a, b) => a.time.localeCompare(b.time));
  return (
    pageHead(
      "ПОСМОТРЕТЬ ЧУТЬ ШИРЕ",
      "Ваше время, в перспективе.",
      "Оставляйте в расписании место не только для дел.",
    ) +
    '<div class="calendar-layout"><section class="panel calendar-panel"><div class="section-title"><h2>' +
    new Intl.DateTimeFormat("ru", { month: "long", year: "numeric" }).format(
      ui.month,
    ) +
    '</h2><div class="calendar-controls"><button class="icon-button prev" data-action="month" data-delta="-1" aria-label="Предыдущий месяц">' +
    icon("chevron") +
    "</button>" +
    button("Сегодня", "calendar-today") +
    '<button class="icon-button" data-action="month" data-delta="1" aria-label="Следующий месяц">' +
    icon("chevron") +
    '</button></div></div><div class="calendar-weekdays">' +
    ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"]
      .map((d) => "<span>" + d + "</span>")
      .join("") +
    '</div><div class="calendar-grid">' +
    Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dateKey(d),
        tasks = getState().tasks.filter((t) => t.date === key);
      return (
        '<button class="calendar-day ' +
        (d.getMonth() !== month ? "other-month " : "") +
        (key === ui.selected ? "is-selected " : "") +
        (key === todayKey ? "is-today" : "") +
        '" data-action="select-day" data-date="' +
        key +
        '" aria-label="' +
        fmtDate(key, { day: "numeric", month: "long", year: "numeric" }) +
        ", задач: " +
        tasks.length +
        '" aria-pressed="' +
        (key === ui.selected) +
        '"><span>' +
        d.getDate() +
        '</span><div class="calendar-dots">' +
        tasks
          .slice(0, 3)
          .map(
            (t) =>
              '<i class="' + t.category + (t.done ? " done" : "") + '"></i>',
          )
          .join("") +
        "</div>" +
        (tasks.length ? "<small>" + tasks.length + " задач</small>" : "") +
        "</button>"
      );
    }).join("") +
    '</div></section><section class="panel calendar-agenda"><div class="section-title"><div><span class="eyebrow">ВЫБРАННЫЙ ДЕНЬ</span><h2>' +
    fmtDate(ui.selected) +
    '</h2></div><button class="icon-button" data-action="add-selected" aria-label="Создать задачу на выбранный день">' +
    icon("plus") +
    "</button></div>" +
    (selected.length
      ? selected.map((t) => taskRow(t)).join("")
      : empty(
          "Свободное пространство",
          "Этот день ещё не заполнен.",
          "add-selected",
        )) +
    "</section></div>"
  );
}
function analyticsView() {
  const days = periodDays(ui.period),
    daily = days.map((d) => dailyStats(d)),
    total = daily.reduce(
      (a, d) => ({
        completed: a.completed + d.completed,
        focus: a.focus + d.focus,
      }),
      { completed: 0, focus: 0 },
    ),
    active = daily.filter((d) => d.completed || d.focus).length,
    s = getState();
  return (
    pageHead(
      "ПРОГРЕСС, А НЕ ПЕРФЕКЦИОНИЗМ",
      "Маленькие шаги заметны.",
      "Не сравнивайте себя с другими. Посмотрите, сколько вы уже сделали.",
      '<div class="segmented">' +
        [7, 30]
          .map(
            (n) =>
              '<button data-action="period" data-value="' +
              n +
              '" class="' +
              (ui.period === n ? "selected" : "") +
              '" aria-pressed="' +
              (ui.period === n) +
              '">' +
              (n === 7 ? "Неделя" : "Месяц") +
              "</button>",
          )
          .join("") +
        "</div>",
    ) +
    '<div class="analytics-metrics"><section class="panel"><span>' +
    icon("check") +
    " Завершённые задачи</span><strong>" +
    total.completed +
    "</strong><small>за последние " +
    ui.period +
    ' дней</small></section><section class="panel"><span>' +
    icon("timer") +
    " Время фокуса</span><strong>" +
    Math.round(total.focus) +
    '<em> мин</em></strong><small>настоящего внимания</small></section><section class="panel"><span>' +
    icon("fire") +
    " Активные дни</span><strong>" +
    active +
    "<em> / " +
    ui.period +
    '</em></strong><small>дней с задачами или фокусом</small></section></div><div class="analytics-grid"><section class="panel chart-panel"><div class="section-title"><h2>Задачи в вашем ритме</h2><span class="chart-legend"><i></i> Завершено</span></div>' +
    activityChart(days) +
    '</section><section class="panel chart-panel"><div class="section-title"><h2>Пространство для фокуса</h2><span class="chart-legend violet"><i></i> Минуты</span></div><div class="violet-chart">' +
    activityChart(days, "focus") +
    '</div></section><section class="panel categories-panel"><div class="section-title"><h2>Что наполняет ваши дни</h2></div><p class="muted">Все ваши задачи по категориям</p>' +
    Object.entries(CATEGORIES)
      .map(([k, v]) => {
        const count = s.tasks.filter((t) => t.category === k).length;
        return (
          '<div class="category-stat"><div><span class="category ' +
          k +
          '"><i></i>' +
          v +
          "</span><b>" +
          count +
          '</b></div><div class="category-track"><span class="' +
          k +
          '" style="width:' +
          (s.tasks.length ? (count / s.tasks.length) * 100 : 0) +
          '%"></span></div></div>'
        );
      })
      .join("") +
    '</section><section class="panel history-panel"><h2>Последние сессии</h2>' +
    (s.sessions.length
      ? s.sessions
          .slice()
          .sort((a, b) => b.endedAt - a.endedAt)
          .slice(0, 5)
          .map(
            (f) =>
              '<div class="history-row"><span class="history-icon">' +
              icon("timer") +
              "</span><div><b>" +
              esc(
                s.tasks.find((t) => t.id === f.taskId)?.title ||
                  "Свободный фокус",
              ) +
              "</b><small>" +
              fmtDate(dateKey(new Date(f.endedAt))) +
              " · " +
              new Intl.DateTimeFormat("ru", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(f.endedAt)) +
              "</small></div><strong>" +
              minutes(f.duration / 60) +
              "</strong></div>",
          )
          .join("")
      : '<div class="empty-state">' +
        icon("timer") +
        "<h3>Ваш первый поток — впереди</h3><p>Завершите сессию: здесь появится ваш настоящий прогресс.</p>" +
        button(
          "Начать фокус " + icon("arrow"),
          "navigate",
          "subtle",
          'data-view="focus"',
        ) +
        "</div>") +
    '</section></div><p class="data-note">Без нарисованных достижений: графики используют завершённые задачи и полные фокус-сессии. Примеры задач тоже учитываются.</p>'
  );
}
function settingsView() {
  const s = getState().settings;
  return (
    pageHead(
      "ПОД ВАШ РИТМ",
      "Пусть здесь будет по-вашему.",
      "Немного настроек — и больше пространства для себя.",
    ) +
    '<div class="settings-layout"><form id="settings-form" class="panel settings-panel"><div class="section-title"><h2>Личное пространство</h2>' +
    icon("settings") +
    '</div><label>Как к вам обращаться<input name="name" maxlength="40" value="' +
    esc(s.name) +
    '" placeholder="Ваше имя" autocomplete="given-name"></label><div class="setting-row"><div><b>Оформление</b><p>Светлая бумага или тёмный графит</p></div><div class="segmented theme-options"><button type="button" data-action="set-theme" data-theme="light" class="' +
    (s.theme === "light" ? "selected" : "") +
    '" aria-pressed="' +
    (s.theme === "light") +
    '">' +
    icon("sun") +
    ' Свет</button><button type="button" data-action="set-theme" data-theme="dark" class="' +
    (s.theme === "dark" ? "selected" : "") +
    '" aria-pressed="' +
    (s.theme === "dark") +
    '">' +
    icon("moon") +
    ' Тьма</button></div></div><h3 class="settings-subhead">Ваш фокус-ритм</h3><div class="duration-grid">' +
    [
      ["work", "Фокус", 180],
      ["short", "Короткий перерыв", 60],
      ["long", "Длинный перерыв", 60],
    ]
      .map(
        ([key, label, max]) =>
          "<label>" +
          label +
          '<span class="number-field"><input name="' +
          key +
          '" type="number" min="1" max="' +
          max +
          '" required value="' +
          s[key] +
          '"><span>мин</span></span></label>',
      )
      .join("") +
    '</div><p class="field-help">Новая длительность применяется со следующего сброса или смены режима. Текущая сессия не прервётся.</p><label class="setting-row"><span><b>Звук завершения</b><span class="setting-description">Три мягкие ноты в конце сессии</span></span><input class="switch" name="sound" type="checkbox" ' +
    (s.sound ? "checked" : "") +
    '></label><div class="setting-row"><div><b>Уведомления браузера</b><p id="notification-state">' +
    (!("Notification" in window)
      ? "Не поддерживаются этим браузером"
      : Notification.permission === "granted"
        ? s.notifications
          ? "Включены"
          : "Разрешены, но выключены"
        : Notification.permission === "denied"
          ? "Заблокированы в настройках браузера"
          : "Только с вашего разрешения") +
    "</p></div>" +
    button(
      s.notifications ? "Отключить" : "Включить",
      "notifications",
      "subtle",
      'type="button"',
    ) +
    '</div><p id="settings-error" class="form-error" role="alert"></p><div class="settings-save">' +
    button(
      "Сохранить настройки " + icon("check"),
      "save-settings",
      "primary",
      'type="submit"',
    ) +
    '</div></form><div class="settings-aside"><section class="privacy-card">' +
    icon("leaf") +
    '<h2>Личное.<br>По-настоящему.</h2><p>Никаких аккаунтов и трекеров. Ваши задачи остаются в этом браузере, на этом устройстве.</p><span>ВАШИ ДАННЫЕ — ВАШЕ ПРОСТРАНСТВО</span></section><section class="panel data-panel"><h2>Данные под контролем</h2><p>Сохраняйте резервную копию. Очистка данных браузера удалит локальные записи.</p><div class="data-buttons">' +
    button(icon("download") + " Экспортировать JSON", "export") +
    button(icon("upload") + " Импортировать JSON", "import") +
    '</div><div class="data-danger">' +
    button("Убрать демонстрационные задачи", "clear-demo", "text-button") +
    button("Начать с чистого листа", "reset-app", "text-button danger-text") +
    "</div></section></div></div>"
  );
}
const renderers = {
  dashboard,
  tasks: tasksView,
  focus: focusView,
  calendar: calendarView,
  analytics: analyticsView,
  settings: settingsView,
};
function navMarkup(mobile = false) {
  return Object.entries(views)
    .filter(([k]) => !mobile || k !== "settings")
    .map(
      ([key, [name, ic]]) =>
        '<a href="#' +
        key +
        '" class="nav-item ' +
        (key === view ? "active" : "") +
        '" ' +
        (key === view ? 'aria-current="page"' : "") +
        ">" +
        icon(ic) +
        "<span>" +
        name +
        "</span>" +
        (key === "tasks" && !mobile
          ? '<span class="nav-count">' +
            getState().tasks.filter((t) => !t.done).length +
            "</span>"
          : "") +
        "</a>",
    )
    .join("");
}
function applyTheme() {
  const s = getState().settings;
  document.documentElement.dataset.theme = s.theme;
  $('meta[name="theme-color"]').content =
    s.theme === "dark" ? "#191c19" : "#f5f4ef";
  $("#theme-toggle").innerHTML = icon(s.theme === "dark" ? "sun" : "moon");
  $("#theme-toggle").setAttribute(
    "aria-label",
    s.theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему",
  );
  $("#profile-name").textContent = s.name || "Моё пространство";
  $(".avatar").textContent = s.name ? s.name.slice(0, 1).toUpperCase() : "Я";
}
function render() {
  document.body.classList.add("app-ready");
  const draft =
    view === "settings" && !discardDraft && $("#settings-form")
      ? new FormData($("#settings-form"))
      : null;
  discardDraft = false;
  applyTheme();
  $("#navigation").innerHTML = navMarkup();
  $("#mobile-nav").innerHTML = navMarkup(true);
  $("#mobile-settings").innerHTML = icon("settings");
  $("#page-label").textContent = views[view][0];
  $("#storage-warning").hidden = !storageWarning;
  $("#storage-warning").textContent = storageWarning;
  const active = document.activeElement,
    action = active?.dataset?.action,
    id = active?.dataset?.id;
  $("#main").innerHTML = renderers[view]();
  if (draft && $("#settings-form")) {
    const form = $("#settings-form");
    for (const key of ["name", "work", "short", "long"])
      form.elements[key].value = draft.get(key);
    form.elements.sound.checked = draft.has("sound");
  }
  if (action) {
    const next = [...$("#main").querySelectorAll("[data-action]")].find(
      (n) => n.dataset.action === action && n.dataset.id === id,
    );
    next?.focus({ preventScroll: true });
  }
  updateClock();
}
function navigate(next) {
  if (!Object.hasOwn(views, next)) return;
  if (location.hash !== "#" + next) {
    location.hash = next;
    return;
  }
  view = next;
  render();
  $("#main").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
}
window.addEventListener("hashchange", () =>
  navigate(
    Object.hasOwn(views, location.hash.slice(1))
      ? location.hash.slice(1)
      : "dashboard",
  ),
);
function updateClock() {
  const t = timerState(),
    ms = remaining(t),
    seconds = Math.ceil(ms / 1000),
    text =
      String(Math.floor(seconds / 60)).padStart(2, "0") +
      ":" +
      String(seconds % 60).padStart(2, "0");
  const display = $("#timer-display");
  if (display) {
    display.textContent = text;
    $("#timer-status").textContent = t.running
      ? "Вы в потоке. Всё остальное подождёт."
      : ms < t.total * 1000
        ? "Пауза — тоже часть пути."
        : "Готовы уделить время главному?";
    $(".timer-ring .ring-value").style.strokeDashoffset =
      100 - ms / t.total / 10;
  }
  const mini = $("#mini-timer");
  mini.hidden = view === "focus" || !t.running;
  if (!mini.hidden) {
    if (!mini.firstChild)
      mini.innerHTML =
        '<button data-action="navigate" data-view="focus">' +
        icon("timer") +
        "<span></span>" +
        icon("arrow") +
        "</button>";
    mini.querySelector("span").textContent = MODES[t.mode] + " · " + text;
  }
  const title = t.running
    ? text + " · FOCUS FLOW"
    : "FOCUS FLOW — " + views[view][0];
  if (document.title !== title) document.title = title;
}
window.addEventListener("flow:change", render);
window.addEventListener("flow:storage", () => {
  $("#storage-warning").hidden = false;
  $("#storage-warning").textContent = storageWarning;
});
window.addEventListener("flow:tick", () => {
  if (view === "focus" || getState().timer?.running) updateClock();
});
window.addEventListener("flow:finished", (e) => {
  chime();
  const message =
    e.detail.mode === "work"
      ? "Фокус-сессия завершена. Отличная работа! Время немного отдохнуть."
      : "Перерыв завершён. Можно возвращаться в поток.";
  toast(message);
  if (
    getState().settings.notifications &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    try {
      new Notification("FOCUS FLOW", { body: message, icon: "./favicon.svg" });
    } catch {
      /* On-screen completion remains available. */
    }
  }
});
function openTask(
  id = null,
  date = view === "calendar" ? ui.selected : today(),
) {
  const t = getState().tasks.find((t) => t.id === id),
    form = $("#task-form");
  form.reset();
  $("#task-dialog-title").textContent = t ? "Изменить задачу" : "Новая задача";
  $("#task-dialog").setAttribute("aria-labelledby", "task-dialog-title");
  for (const key of [
    "id",
    "title",
    "description",
    "category",
    "priority",
    "date",
    "time",
    "duration",
  ])
    form.elements[key].value = t
      ? t[key]
      : {
          id: "",
          title: "",
          description: "",
          category: "work",
          priority: "medium",
          date,
          time: "",
          duration: 25,
        }[key];
  $("#task-error").textContent = "";
  $("#task-dialog").showModal();
  form.elements.title.focus();
}
$("#task-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target),
    title = f.get("title").trim();
  if (!title) {
    $("#task-error").textContent = "Добавьте название задачи.";
    return;
  }
  const id = f.get("id"),
    old = getState().tasks.find((t) => t.id === id),
    item = {
      id: id || uid(),
      title,
      description: f.get("description").trim(),
      category: f.get("category"),
      priority: f.get("priority"),
      date: f.get("date"),
      time: f.get("time"),
      duration: Number(f.get("duration")),
      done: old?.done || false,
      createdAt: old?.createdAt || Date.now(),
      completedAt: old?.completedAt || null,
      order:
        old?.order ?? Math.max(-1, ...getState().tasks.map((t) => t.order)) + 1,
      demo: old?.demo || false,
    };
  try {
    update((s) => {
      if (id) {
        const i = s.tasks.findIndex((t) => t.id === id);
        if (i < 0) throw Error("Эта задача уже удалена в другой вкладке.");
        s.tasks[i] = item;
      } else s.tasks.push(item);
    });
    $("#task-dialog").close();
    toast(
      old
        ? "Задача обновлена. Всё на своих местах."
        : "Первый шаг записан. Теперь можно выдохнуть.",
    );
  } catch (error) {
    $("#task-error").textContent = error.message;
  }
});
function reorder(id, targetId, delta) {
  if (!targetId) {
    const visible = filteredTasks();
    const index = visible.findIndex((t) => t.id === id);
    targetId = visible[index + delta]?.id;
    if (!targetId) return;
  }
  update((s) => {
    const list = [...s.tasks].sort((a, b) => a.order - b.order),
      from = list.findIndex((t) => t.id === id);
    let to = targetId ? list.findIndex((t) => t.id === targetId) : from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    list.forEach((t, i) => (t.order = i));
  });
}
function setTheme(theme) {
  update((s) => (s.settings.theme = theme));
  toast(
    theme === "dark"
      ? "Немного тишины. Тёмная тема включена."
      : "Светлая тема включена.",
  );
}
const actions = {
  navigate: (el) => navigate(el.dataset.view),
  add: () => openTask(),
  "add-selected": () => openTask(null, ui.selected),
  edit: (el) => openTask(el.dataset.id),
  "close-task": () => $("#task-dialog").close(),
  "cancel-confirm": () => $("#confirm-dialog").close(),
  theme: () =>
    setTheme(getState().settings.theme === "light" ? "dark" : "light"),
  "set-theme": (el) => setTheme(el.dataset.theme),
  complete: (el) => {
    const id = el.dataset.id;
    update((s) => {
      const t = s.tasks.find((t) => t.id === id);
      if (t) {
        t.done = !t.done;
        t.completedAt = t.done ? Date.now() : null;
      }
    });
    toast(
      getState().tasks.find((t) => t.id === id)?.done
        ? "Ещё одна маленькая победа. ✳"
        : "Задача снова в работе.",
    );
  },
  delete: (el) => {
    const id = el.dataset.id,
      t = getState().tasks.find((t) => t.id === id);
    if (t)
      confirmation(
        "Убрать эту задачу?",
        t.title + " — задача будет удалена. История фокуса останется.",
        () => {
          update((s) => {
            s.tasks = s.tasks.filter((t) => t.id !== id);
            if (s.timer?.taskId === id) s.timer.taskId = null;
            s.sessions.forEach((f) => {
              if (f.taskId === id) f.taskId = null;
            });
          });
          toast("Задача удалена.");
        },
        "Удалить задачу",
      );
  },
  status: (el) => {
    ui.status = el.dataset.value;
    render();
  },
  "reset-filters": () => {
    Object.assign(ui, {
      query: "",
      status: "all",
      category: "all",
      priority: "all",
      sort: "manual",
    });
    render();
  },
  "move-up": (el) => reorder(el.dataset.id, null, -1),
  "move-down": (el) => reorder(el.dataset.id, null, 1),
  "focus-task": (el) => {
    linkTask(el.dataset.id);
    navigate("focus");
  },
  mode: (el) => {
    if (timerState().running)
      confirmation(
        "Сменить ритм?",
        "Текущая незавершённая сессия не попадёт в статистику.",
        () => setMode(el.dataset.mode),
        "Сменить режим",
      );
    else setMode(el.dataset.mode);
  },
  "timer-toggle": () => {
    primeSound();
    toggleTimer();
  },
  "timer-reset": () => {
    const t = timerState();
    if (t.running || remaining(t) < t.total * 1000)
      confirmation(
        "Начать сессию заново?",
        "Прогресс текущего таймера будет сброшен. Завершённые сессии сохранятся.",
        resetTimer,
        "Сбросить таймер",
      );
    else {
      setMode(t.mode);
      toast("Таймер готов к новому старту.");
    }
  },
  sound: () => {
    update((s) => (s.settings.sound = !s.settings.sound));
    primeSound();
    toast(getState().settings.sound ? "Звук включён." : "Звук выключен.");
  },
  month: (el) => {
    const next = new Date(
      ui.month.getFullYear(),
      ui.month.getMonth() + Number(el.dataset.delta),
      1,
      12,
    );
    if (next.getFullYear() >= 1900 && next.getFullYear() <= 2200) {
      ui.month = next;
      render();
    }
  },
  "calendar-today": () => {
    ui.selected = today();
    ui.month = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
    render();
  },
  "select-day": (el) => {
    ui.selected = el.dataset.date;
    render();
  },
  period: (el) => {
    ui.period = Number(el.dataset.value);
    render();
  },
  "clear-demo": () => {
    if (!getState().tasks.some((t) => t.demo)) {
      toast("Демонстрационных задач уже нет.");
      return;
    }
    confirmation(
      "Убрать примеры?",
      "Удалятся только демонстрационные задачи. Ваши собственные задачи и сессии останутся.",
      () => {
        update((s) => {
          const ids = new Set(s.tasks.filter((t) => t.demo).map((t) => t.id));
          s.tasks = s.tasks.filter((t) => !t.demo);
          if (ids.has(s.timer?.taskId)) s.timer.taskId = null;
          s.sessions.forEach((f) => {
            if (ids.has(f.taskId)) f.taskId = null;
          });
        });
        toast("Чистое пространство для ваших собственных планов.");
      },
      "Убрать примеры",
    );
  },
  "reset-app": () =>
    confirmation(
      "Начать с чистого листа?",
      "Все задачи, настройки и история будут удалены. Сначала рекомендуем экспортировать JSON. Это действие нельзя отменить.",
      () => {
        discardDraft = true;
        save({
          version: 1,
          tasks: [],
          sessions: [],
          settings: { ...DEFAULTS },
          timer: null,
        });
        toast("Новое начало. Пространство снова свободно.");
      },
      "Удалить все данные",
    ),
  export: () => {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "focus-flow-" + today() + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast("Резервная копия скачана.");
  },
  import: () => $("#import-file").click(),
  notifications: async () => {
    if (!("Notification" in window)) {
      toast("Этот браузер не поддерживает уведомления.");
      return;
    }
    if (getState().settings.notifications) {
      update((s) => (s.settings.notifications = false));
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      update((s) => (s.settings.notifications = permission === "granted"));
      toast(
        permission === "granted"
          ? "Уведомления включены."
          : "Разрешение не получено. Таймер сообщит о завершении в приложении.",
      );
    } catch {
      toast(
        "Уведомления недоступны. Таймер сообщит о завершении в приложении.",
      );
    }
  },
  "save-settings": () => {},
};
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (el) {
    const action = actions[el.dataset.action];
    if (action) action(el);
  }
});
$("#confirm-ok").addEventListener("click", () => {
  const fn = confirmFn;
  confirmFn = null;
  $("#confirm-dialog").close();
  fn?.();
});
$("#confirm-dialog").addEventListener("close", () => {
  confirmFn = null;
});
document.addEventListener("input", (e) => {
  if (e.target.id === "task-search") {
    ui.query = e.target.value;
    $("#task-results").innerHTML = taskResults();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.dataset.filter) {
    ui[e.target.dataset.filter] = e.target.value;
    $("#task-results").innerHTML = taskResults();
  }
  if (e.target.id === "linked-task") linkTask(e.target.value);
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "settings-form") return;
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    update((s) => {
      s.settings = {
        ...s.settings,
        name: f.get("name").trim(),
        work: Number(f.get("work")),
        short: Number(f.get("short")),
        long: Number(f.get("long")),
        sound: f.has("sound"),
      };
    });
    primeSound();
    toast("Ваш ритм сохранён.");
  } catch (error) {
    $("#settings-error").textContent = error.message;
  }
});
$("#import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024)
      throw Error("Файл больше 5 МБ. Выберите JSON-экспорт FOCUS FLOW.");
    const next = validate(JSON.parse(await file.text()));
    if (next.timer?.running) {
      next.timer.remaining = Math.max(0, next.timer.deadline - Date.now());
      next.timer.remaining = Math.min(
        next.timer.remaining,
        next.timer.total * 1000,
      );
      next.timer.running = false;
      next.timer.deadline = null;
    }
    confirmation(
      "Восстановить резервную копию?",
      "В файле " +
        next.tasks.length +
        " задач и " +
        next.sessions.length +
        " сессий. Текущие данные будут заменены. Сначала сохраните экспорт, если они нужны.",
      () => {
        discardDraft = true;
        save(next);
        toast("Пространство восстановлено из резервной копии.");
      },
      "Импортировать",
    );
  } catch (error) {
    toast(
      error instanceof SyntaxError
        ? "Это не корректный JSON. Данные не изменены."
        : error.message,
    );
  }
});
document.addEventListener("dragstart", (e) => {
  const row = e.target.closest(".task-row[draggable]");
  if (!row || e.target.closest("button,input,select")) return;
  dragged = row.dataset.id;
  row.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragged);
});
document.addEventListener("dragover", (e) => {
  const row = e.target.closest(".task-row[draggable]");
  if (row && dragged) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
});
document.addEventListener("drop", (e) => {
  const row = e.target.closest(".task-row[draggable]");
  if (row && dragged) {
    e.preventDefault();
    if (row.dataset.id !== dragged) reorder(dragged, row.dataset.id);
    dragged = null;
  }
});
document.addEventListener("dragend", () => {
  dragged = null;
  document
    .querySelectorAll(".dragging")
    .forEach((n) => n.classList.remove("dragging"));
});
document.addEventListener("keydown", (e) => {
  const tag = e.target.tagName;
  if (
    e.key === "n" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(tag) &&
    !document.querySelector("dialog[open]") &&
    !e.ctrlKey &&
    !e.metaKey
  ) {
    e.preventDefault();
    openTask();
  }
  if (
    e.target.matches(".calendar-day") &&
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
  ) {
    e.preventDefault();
    const key = shiftDate(
      e.target.dataset.date,
      { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key],
    );
    ui.selected = key;
    ui.month = new Date(
      fromDate(key).getFullYear(),
      fromDate(key).getMonth(),
      1,
      12,
    );
    render();
    document.querySelector('[data-date="' + key + '"]').focus();
  }
});
// Reconcile a suspended tab or a page restored after its deadline before rendering.
tick();
render();
let currentDay = today();
setInterval(() => {
  if (currentDay !== today()) {
    currentDay = today();
    render();
  }
}, 30000);
