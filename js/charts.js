import { dailyStats, fromDate } from "./store.js";
const weekdayFormat = new Intl.DateTimeFormat("ru", { weekday: "short" });
export function activityChart(days, metric = "completed") {
  const values = days.map((d) => dailyStats(d)[metric]),
    max = Math.max(...values, metric === "focus" ? 30 : 4),
    width = 600,
    height = 164,
    gap = width / days.length;
  const bars = days
    .map((d, i) => {
      const h = (values[i] / max) * 112,
        x = i * gap + gap * 0.2,
        w = gap * 0.6,
        label = weekdayFormat.format(fromDate(d));
      return (
        '<g><rect class="chart-track" x="' +
        x +
        '" y="12" width="' +
        w +
        '" height="112" rx="' +
        Math.min(w / 2, 7) +
        '"/><rect class="chart-bar" x="' +
        x +
        '" y="' +
        (124 - h) +
        '" width="' +
        w +
        '" height="' +
        h +
        '" rx="' +
        Math.min(w / 2, 7) +
        '"><title>' +
        d +
        ": " +
        Math.round(values[i]) +
        (metric === "focus" ? " мин" : " задач") +
        "</title></rect>" +
        (days.length <= 7
          ? '<text x="' +
            (x + w / 2) +
            '" y="149" text-anchor="middle">' +
            label +
            "</text>"
          : i % 5 === 0
            ? '<text x="' +
              (x + w / 2) +
              '" y="149" text-anchor="middle">' +
              fromDate(d).getDate() +
              "</text>"
            : "") +
        "</g>"
      );
    })
    .join("");
  return (
    '<svg class="activity-chart" viewBox="0 0 ' +
    width +
    " " +
    height +
    '" role="img" aria-label="' +
    (metric === "focus" ? "Минуты фокуса" : "Выполненные задачи") +
    " по дням: " +
    days.map((d, i) => d + " — " + Math.round(values[i])).join(", ") +
    '">' +
    bars +
    "</svg>"
  );
}
export function ring(percent, cls = "progress-ring") {
  return (
    '<svg class="' +
    cls +
    '" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="51"/><circle class="ring-value" cx="60" cy="60" r="51" pathLength="100" stroke-dasharray="100" stroke-dashoffset="' +
    (100 - percent) +
    '" transform="rotate(-90 60 60)"/></svg>'
  );
}
