/* ============================================================
 * canvas.js — רינדור הקנבס: ציור רכיבים, הזזה, מחיקה, רענון
 * LED מצויר עם טרמינל לחיווט; MCU מצויר עם פיני הפורטים.
 * ============================================================ */
window.Canvas = (function () {

  let canvasEl = null;
  let hintEl = null;
  let onRegisterChange = null;   // hook לעדכון טבלת הרגיסטרים
  let onMove = null;             // hook לחיווט (לצייר מחדש חוטים בזמן גרירה)

  // צבעי LED לבחירה
  const LED_COLORS = ["#ff3b3b", "#22c55e", "#4d8cff", "#ffcc00", "#ffffff"];

  function init(el, opts = {}) {
    canvasEl = el;
    hintEl = el.querySelector(".canvas-hint");
    onRegisterChange = opts.onRegisterChange || null;
    onMove = opts.onMove || null;
    // שינויי רגיסטר → רענון מקובץ (frame אחד), כדי שלולאות צפופות לא יציפו את ה-DOM
    Registers.onChange(scheduleRefresh);
  }

  let refreshScheduled = false;
  function scheduleRefresh() {
    if (refreshScheduled) return;
    refreshScheduled = true;
    requestAnimationFrame(() => { refreshScheduled = false; refreshAll(); });
  }

  /** בונה אלמנט DOM לרכיב ומוסיף לקנבס */
  function renderComponent(comp) {
    const el = document.createElement("div");
    el.className = "comp comp-" + comp.type;
    el.style.left = comp.x + "px";
    el.style.top = comp.y + "px";
    el.dataset.id = comp.id;
    el.style.setProperty("--led-color", comp.color);
    el.innerHTML =
      comp.type === "mcu"        ? mcuMarkup(comp) :
      comp.type === "button"     ? buttonMarkup(comp) :
      comp.type === "sevenseg"   ? sevenSegMarkup(comp) :
      comp.type === "pot"        ? potMarkup(comp) :
      comp.type === "lightsensor"? lightSensorMarkup(comp) :
      comp.type === "motor"      ? motorMarkup(comp) :
      comp.type === "buzzer"     ? buzzerMarkup(comp) :
      comp.type === "breadboard" ? breadboardMarkup(comp) :
                                   ledMarkup(comp);

    el.style.transform = `rotate(${comp.rotation || 0}deg)`;

    el.querySelector(".comp-del").addEventListener("click", () => {
      Components.remove(comp.id);
      el.remove();
      if (onMove) onMove();      // נקה חוטים שהיו מחוברים אליו
      updateHint();
    });

    // סיבוב ב-10° (כפתור או גלגל עכבר) — החוטים עוקבים אחרי הרגליים
    const applyRotation = (delta) => {
      comp.rotation = (((comp.rotation || 0) + delta) % 360 + 360) % 360;
      el.style.transform = `rotate(${comp.rotation}deg)`;
      if (onMove) onMove();
    };
    const rotBtn = document.createElement("button");
    rotBtn.className = "comp-rotate";
    rotBtn.title = "סובב 10° (או גלגל עכבר מעל הרכיב)";
    rotBtn.textContent = "↻";
    rotBtn.addEventListener("click", (e) => { e.stopPropagation(); applyRotation(10); });
    el.appendChild(rotBtn);
    el.addEventListener("wheel", (e) => { e.preventDefault(); applyRotation(e.deltaY > 0 ? 10 : -10); }, { passive: false });

    if (comp.type === "button") enableButton(el, comp);
    if (comp.type === "pot") enablePot(el, comp);
    if (comp.type === "lightsensor") enableLight(el, comp);
    if (comp.type === "led") enableLedColors(el, comp);

    enableDrag(el, comp);
    canvasEl.appendChild(el);
    comp._el = el;
    refresh(comp);
    updateHint();
    return el;
  }

  function ledMarkup(comp) {
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="led-wrap">
        <svg class="led-svg" viewBox="0 0 60 94" width="60" height="94">
          <!-- רגליים מפושקות: שמאל=קתודה, ימין=אנודה (כפופה) -->
          <path class="led-leg" d="M25 54 L21 90"/>
          <path class="led-leg" d="M35 54 L39 78 L41 88"/>
          <!-- אוגן (rim) -->
          <rect class="led-flange" x="15" y="48" width="30" height="7" rx="2.5"/>
          <!-- גוף הנורה (כיפה מעוגלת) -->
          <path class="led-dome led-bulb" d="M18 51 L18 23 A12 12 0 0 1 42 23 L42 51 Z"/>
          <!-- נצנוץ -->
          <ellipse class="led-shine" cx="24" cy="19" rx="3" ry="7"/>
          <!-- נקודות חיבור בקצות הרגליים -->
          <circle class="lead" data-comp="${comp.id}" data-leg="1" cx="21" cy="90" r="6"><title>קתודה</title></circle>
          <circle class="lead" data-comp="${comp.id}" data-leg="0" cx="41" cy="88" r="6"><title>אנודה (+)</title></circle>
        </svg>
      </div>
      <div class="led-colors">
        ${LED_COLORS.map((c) => `<span class="swatch" data-color="${c}" style="background:${c}" title="${c}"></span>`).join("")}
      </div>`;
  }

  function sevenSegMarkup(comp) {
    // מקטעים משופעים (פוליגון הקסגון): H=אופקי, V=אנכי
    const t = 3.4;
    const H = (l, r, y) => `${l},${y} ${l+t},${y-t} ${r-t},${y-t} ${r},${y} ${r-t},${y+t} ${l+t},${y+t}`;
    const V = (tp, bt, x) => `${x},${tp} ${x+t},${tp+t} ${x+t},${bt-t} ${x},${bt} ${x-t},${bt-t} ${x-t},${tp+t}`;
    const seg = (s, pts) => `<polygon class="seg" data-seg="${s}" points="${pts}"/>`;
    const dot = (leg, x, y) => `<circle class="lead" data-comp="${comp.id}" data-leg="${leg}" cx="${x}" cy="${y}" r="4"/>`;
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <svg class="seven-seg" viewBox="0 0 62 108" width="64" height="112">
        <rect class="seg-pkg" x="1" y="1" width="60" height="106" rx="7"/>
        ${seg("a", H(20, 42, 22))}
        ${seg("f", V(25, 51, 18))}
        ${seg("b", V(25, 51, 44))}
        ${seg("g", H(20, 42, 54))}
        ${seg("e", V(57, 83, 18))}
        ${seg("c", V(57, 83, 44))}
        ${seg("d", H(20, 42, 86))}
        <circle class="seg dp" data-seg="dp" cx="50" cy="86" r="3.6"/>
        ${[0,1,2,3].map((i) => dot(i, 12 + i * 13, 8)).join("")}
        ${[4,5,6,7].map((i) => dot(i, 12 + (i - 4) * 13, 100)).join("")}
      </svg>`;
  }

  function motorMarkup(comp) {
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="motor-wrap">
        <div class="motor-can"></div>
        <div class="motor-gear">
          <svg viewBox="0 0 40 40" width="40" height="40">
            <circle cx="20" cy="20" r="18" fill="#2b333d" stroke="#1a2026"/>
            <g fill="#cfd6dd">
              <rect x="18" y="2"  width="4" height="16" rx="2"/>
              <rect x="18" y="22" width="4" height="16" rx="2"/>
              <rect x="2"  y="18" width="16" height="4" rx="2"/>
              <rect x="22" y="18" width="16" height="4" rx="2"/>
            </g>
            <circle cx="20" cy="20" r="4" fill="#8a929b" stroke="#1a2026"/>
          </svg>
        </div>
        <span class="motor-lead lead l" data-comp="${comp.id}" data-leg="0"></span><span class="motor-lead lead r" data-comp="${comp.id}" data-leg="1"></span>
      </div>
      <div class="motor-speed">מהירות: <span class="motor-val">0</span></div>`;
  }

  function buzzerMarkup(comp) {
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="buzzer-wrap">
        <svg class="buzzer-icon" viewBox="0 0 56 70" width="50" height="62">
          <line class="bz-leg" x1="22" y1="46" x2="22" y2="66"/>
          <line class="bz-leg" x1="34" y1="46" x2="34" y2="66"/>
          <circle class="bz-body" cx="28" cy="26" r="22"/>
          <circle class="bz-hole" cx="28" cy="22" r="3"/>
          <text class="bz-plus" x="12" y="22">+</text>
          <circle class="lead" data-comp="${comp.id}" data-leg="0" cx="22" cy="66" r="6"/>
          <circle class="lead" data-comp="${comp.id}" data-leg="1" cx="34" cy="66" r="6"/>
        </svg>
      </div>`;
  }

  function lightSensorMarkup(comp) {
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="ls-wrap">
        <svg class="ls-svg" viewBox="0 0 60 66" width="54" height="60">
          <line class="ls-leg" x1="22" y1="46" x2="22" y2="62"/>
          <line class="ls-leg" x1="38" y1="46" x2="38" y2="62"/>
          <circle class="ls-body" cx="30" cy="26" r="20"/>
          <path class="ls-squiggle" d="M16 30 h5 l3 -8 l4 14 l4 -14 l4 14 l3 -8 h5"/>
          <path class="ls-ray" d="M48 6 l-7 7 M55 14 l-8 5"/>
          <circle class="lead" data-comp="${comp.id}" data-leg="0" cx="22" cy="62" r="6"/>
          <circle class="lead" data-comp="${comp.id}" data-leg="1" cx="38" cy="62" r="6"/>
        </svg>
      </div>
      <div class="ls-value">☀ <span class="ls-num">${comp.value}</span></div>
      <input class="ls-slider" type="range" min="0" max="255" value="${comp.value}">`;
  }

  function potMarkup(comp) {
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="pot-value"><span class="pot-num">${comp.value}</span> <small>(0x${comp.value.toString(16).toUpperCase().padStart(2,"0")})</small></div>
      <input class="pot-slider" type="range" min="0" max="255" value="${comp.value}">
      <div class="pot-legs">
        <span class="lead" data-comp="${comp.id}" data-leg="0"></span>
        <span class="lead" data-comp="${comp.id}" data-leg="1"></span>
        <span class="lead" data-comp="${comp.id}" data-leg="2"></span>
      </div>`;
  }

  function buttonMarkup(comp) {
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="btn-body">
        <span class="btn-leg lead l" data-comp="${comp.id}" data-leg="0"></span>
        <span class="btn-leg lead r" data-comp="${comp.id}" data-leg="1"></span>
        <div class="btn-push" title="לחץ והחזק"></div>
      </div>`;
  }

  function breadboardMarkup(comp) {
    const COLS = 12, ROWS = 5;
    const hole = (col, half, row) =>
      `<span class="hole" data-board="${comp.id}" data-hole="${comp.id}:${col}:${half}:${row}" data-node="${comp.id}:${col}:${half}" title="עמודה ${col + 1}"></span>`;
    const rowHtml = (half, row) => `<div class="bb-row">${Array.from({ length: COLS }, (_, c) => hole(c, half, row)).join("")}</div>`;
    const half = (h) => Array.from({ length: ROWS }, (_, r) => rowHtml(h, r)).join("");
    // פס מתח = node אחד ארוך לכל הרוחב
    const railHole = (name, col) => `<span class="hole" data-board="${comp.id}" data-hole="${comp.id}:rail:${name}:${col}" data-node="${comp.id}:rail:${name}"></span>`;
    const rail = (name, label, cls) =>
      `<div class="bb-rail ${cls}"><span class="bb-rail-mark">${label}</span><div class="bb-row">${Array.from({ length: COLS }, (_, c) => railHole(name, c)).join("")}</div></div>`;
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="bb-body">
        ${rail("vt", "+", "plus")}
        ${rail("gt", "−", "minus")}
        <div class="bb-rail-sep"></div>
        <div class="bb-half">${half("t")}</div>
        <div class="bb-gap"></div>
        <div class="bb-half">${half("b")}</div>
        <div class="bb-rail-sep"></div>
        ${rail("vb", "+", "plus")}
        ${rail("gb", "−", "minus")}
      </div>`;
  }

  function mcuMarkup(comp) {
    const side = (port) => [0,1,2,3,4,5,6,7].map((bit) =>
      `<span class="pin" data-port="${port}" data-bit="${bit}" title="${port}.${bit}">${bit}</span>`
    ).join("");
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="mcu-chip">
        <div class="mcu-side top">${side("P0")}</div>
        <div class="mcu-side left">${side("P3")}</div>
        <div class="mcu-body">
          <span class="mcu-notch"></span>
          <span class="mcu-name">8051</span>
          <span class="mcu-lbl t">P0</span><span class="mcu-lbl r">P1</span>
          <span class="mcu-lbl b">P2</span><span class="mcu-lbl l">P3</span>
        </div>
        <div class="mcu-side right">${side("P1")}</div>
        <div class="mcu-side bottom">${side("P2")}</div>
      </div>`;
  }

  /** רענון רכיב בודד לפי מצבו */
  function refresh(comp) {
    if (!comp._el) return;
    if (comp.type === "led") {
      comp._el.querySelector(".led-bulb").classList.toggle("on", Components.isActive(comp));
    } else if (comp.type === "button") {
      comp._el.querySelector(".btn-push").classList.toggle("pressed", !!comp.pressed);
    } else if (comp.type === "sevenseg") {
      // כל מקטע נשלט מהפין שמחובר לרגל שלו (רגל i → מקטע SEG_ORDER[i])
      Components.SEG_ORDER.forEach((seg, legIndex) => {
        const node = comp._el.querySelector(`.seg[data-seg="${seg}"]`);
        if (node) node.classList.toggle("on", Components.segmentOn(comp, legIndex));
      });
    } else if (comp.type === "pot") {
      const num = comp._el.querySelector(".pot-num");
      const small = comp._el.querySelector(".pot-value small");
      if (num) num.textContent = comp.value;
      if (small) small.textContent = "(0x" + comp.value.toString(16).toUpperCase().padStart(2, "0") + ")";
    } else if (comp.type === "lightsensor") {
      const num = comp._el.querySelector(".ls-num");
      if (num) num.textContent = comp.value;
    } else if (comp.type === "buzzer") {
      comp._el.querySelector(".buzzer-icon").classList.toggle("ringing", Components.isActive(comp));
    } else if (comp.type === "motor") {
      const speed = Components.portValue(comp);             // 0-255 מהפורט
      const gear = comp._el.querySelector(".motor-gear");
      comp._el.querySelector(".motor-val").textContent = speed;
      if (speed > 0) {
        gear.style.animationDuration = Math.max(120, 4000 - speed * 15) + "ms";
        gear.classList.add("spinning");
      } else {
        gear.classList.remove("spinning");
      }
    }
  }

  /** רענון כל הרכיבים + טבלת הרגיסטרים */
  function refreshAll() {
    Components.items.forEach(refresh);
    if (onRegisterChange) onRegisterChange();
  }

  /** לחיצה והחזקה על כפתור → מזין אות לפין; שחרור → מנתק */
  function enableButton(el, comp) {
    const push = el.querySelector(".btn-push");
    function down(e) {
      e.preventDefault();
      Components.press(comp, true);
      refresh(comp);
    }
    function up() {
      if (!comp.pressed) return;
      Components.press(comp, false);
      refresh(comp);
    }
    push.addEventListener("mousedown", down);
    document.addEventListener("mouseup", up);   // תופס שחרור גם מחוץ לכפתור
  }

  /** בחירת צבע ל-LED מתוך שורת הגוונים */
  function enableLedColors(el, comp) {
    const swatches = el.querySelectorAll(".swatch");
    const mark = () => swatches.forEach((s) => s.classList.toggle("sel", s.dataset.color === comp.color));
    mark();
    swatches.forEach((sw) => sw.addEventListener("click", (e) => {
      e.stopPropagation();
      comp.color = sw.dataset.color;
      el.style.setProperty("--led-color", comp.color);
      mark();
      refresh(comp);
    }));
  }

  /** סליידר פוטנציומטר → מזין ערך אנלוגי לפורט */
  function enablePot(el, comp) {
    const slider = el.querySelector(".pot-slider");
    slider.addEventListener("input", () => Components.setPotValue(comp, +slider.value));
  }

  /** סליידר חיישן אור (רמת אור 0-255) → מזין ערך אנלוגי לפורט */
  function enableLight(el, comp) {
    const slider = el.querySelector(".ls-slider");
    slider.addEventListener("input", () => Components.setPotValue(comp, +slider.value));
  }

  /** גרירת רכיב בתוך הקנבס (לא על פקדים / פינים / טרמינלים) */
  function enableDrag(el, comp) {
    el.addEventListener("mousedown", (e) => {
      if (e.target.closest("button, input, .pin, .lead, .hole, .btn-push, .swatch, .comp-rotate")) return;
      e.preventDefault();
      selectOnly(el);
      const offX = e.clientX - el.offsetLeft;
      const offY = e.clientY - el.offsetTop;

      function move(ev) {
        comp.x = Math.max(0, ev.clientX - offX);
        comp.y = Math.max(0, ev.clientY - offY);
        el.style.left = comp.x + "px";
        el.style.top = comp.y + "px";
        if (onMove) onMove();        // צייר מחדש את החוטים
      }
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  function selectOnly(el) {
    canvasEl.querySelectorAll(".comp.selected").forEach((c) => c.classList.remove("selected"));
    el.classList.add("selected");
  }

  function updateHint() {
    if (!hintEl) return;
    const onlyMcu = Components.items.every((c) => c.type === "mcu");
    hintEl.style.display = onlyMcu ? "block" : "none";
  }

  /** הסר את כל אלמנטי הרכיבים מה-DOM (לקראת טעינת פרויקט) */
  function clearComponents() {
    if (canvasEl) canvasEl.querySelectorAll(".comp").forEach((e) => e.remove());
  }

  return {
    init, renderComponent, refresh, refreshAll, clearComponents,
    get el() { return canvasEl; },
  };
})();
