/* ============================================================
 * theme.js — בחירת צבע רקע ע"י המשתמש (נשמר ב-localStorage)
 * מחשב אוטומטית צבעי טקסט/פאנלים מתאימים מתוך צבע הרקע שנבחר,
 * כך שכל צבע (כהה או בהיר) נראה קוהרנטי. מזריק כפתור 🎨 צף.
 * נטען בכל עמוד. ============================================================ */
(function () {
  const KEY = "sim8051-bg";
  const root = document.documentElement;
  const VARS = ["--bg", "--panel", "--panel-2", "--border", "--text", "--text-dim"];

  // ---- עזרי צבע ----
  function toRgb(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function toHex(r, g, b) {
    return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
  }
  function mix(c1, c2, t) {
    const a = toRgb(c1), b = toRgb(c2);
    return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  }
  function lum(hex) { const [r, g, b] = toRgb(hex); return 0.299 * r + 0.587 * g + 0.114 * b; }

  // ---- גזירת ערכת צבעים קוהרנטית מצבע רקע יחיד ----
  function derive(bg) {
    const dark = lum(bg) < 140;
    if (dark) return {
      "--bg": bg,
      "--panel": mix(bg, "#ffffff", 0.08),
      "--panel-2": mix(bg, "#ffffff", 0.14),
      "--border": mix(bg, "#ffffff", 0.24),
      "--text": "#e9eef4",
      "--text-dim": mix(bg, "#ffffff", 0.55),
    };
    return {
      "--bg": bg,
      "--panel": mix(bg, "#ffffff", 0.62),
      "--panel-2": mix(bg, "#ffffff", 0.40),
      "--border": mix(bg, "#000000", 0.18),
      "--text": "#16202b",
      "--text-dim": mix(bg, "#000000", 0.45),
    };
  }
  function applyBg(bg) { const t = derive(bg); for (const k in t) root.style.setProperty(k, t[k]); }
  function setBg(bg) { localStorage.setItem(KEY, bg); applyBg(bg); }
  function reset() { localStorage.removeItem(KEY); VARS.forEach((v) => root.style.removeProperty(v)); }

  const saved = localStorage.getItem(KEY);
  if (saved) applyBg(saved);   // מוחל מיד כדי למנוע הבזק

  // ---- כפתור צף + חלונית בחירה ----
  const PRESETS = [
    ["#0f1620", "כהה (ברירת מחדל)"],
    ["#1b2430", "אפור-כחול"],
    ["#22201c", "חום כהה רך"],
    ["#16201a", "ירוק כהה"],
    ["#1d1a26", "סגול כהה"],
    ["#eef1f5", "בהיר"],
    ["#f5efe3", "קרם"],
  ];

  function build() {
    if (document.querySelector(".theme-fab")) return;
    const btn = document.createElement("button");
    btn.className = "theme-fab"; btn.type = "button"; btn.textContent = "🎨"; btn.title = "צבע רקע";

    const pop = document.createElement("div");
    pop.className = "theme-pop"; pop.style.display = "none";
    pop.innerHTML =
      `<div class="theme-title">בחר צבע רקע</div>
       <div class="theme-swatches">${PRESETS.map(([c, t]) =>
        `<button type="button" class="theme-sw" style="background:${c}" data-c="${c}" title="${t}"></button>`).join("")}</div>
       <label class="theme-custom">צבע חופשי<input type="color" id="theme-color" value="${saved || "#0f1620"}"></label>
       <button type="button" class="theme-reset">↺ איפוס לברירת מחדל</button>`;

    document.body.appendChild(btn);
    document.body.appendChild(pop);

    btn.addEventListener("click", (e) => { e.stopPropagation(); pop.style.display = pop.style.display === "none" ? "block" : "none"; });
    pop.addEventListener("click", (e) => e.stopPropagation());
    pop.querySelectorAll(".theme-sw").forEach((s) => s.addEventListener("click", () => setBg(s.dataset.c)));
    pop.querySelector("#theme-color").addEventListener("input", (e) => setBg(e.target.value));
    pop.querySelector(".theme-reset").addEventListener("click", () => { reset(); pop.style.display = "none"; });
    document.addEventListener("click", () => { pop.style.display = "none"; });
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);

  window.Theme = { set: setBg, reset };
})();
