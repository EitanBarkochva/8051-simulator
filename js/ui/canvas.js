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
      comp.type === "slideswitch"? slideSwitchMarkup(comp) :
      comp.type === "sevenseg"   ? sevenSegMarkup(comp) :
      comp.type === "rgbled"     ? rgbLedMarkup(comp) :
      comp.type === "display"    ? displayMarkup(comp) :
      comp.type === "resistor"   ? resistorMarkup(comp) :
      comp.type === "pot"        ? potMarkup(comp) :
      comp.type === "lightsensor"? lightSensorMarkup(comp) :
      comp.type === "motor"      ? motorMarkup(comp) :
      comp.type === "buzzer"     ? buzzerMarkup(comp) :
      comp.type === "breadboard" ? breadboardMarkup(comp) :
      (comp.type === "battery15" || comp.type === "battery9") ? batteryMarkup(comp) :
                                   ledMarkup(comp);

    el.style.transform = `rotate(${comp.rotation || 0}deg)`;

    el.querySelector(".comp-del").addEventListener("click", () => {
      Components.remove(comp.id);
      el.remove();
      if (window.Wiring && Wiring.removeWiresForComp) Wiring.removeWiresForComp(comp.id);
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
    if (comp.type === "slideswitch") enableSlide(el, comp);
    if (comp.type === "pot") enablePot(el, comp);
    if (comp.type === "lightsensor") enableLight(el, comp);
    if (comp.type === "led") enableLedColors(el, comp);
    if (comp.type === "resistor") enableResistor(el, comp);

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

  function rgbLedMarkup(comp) {
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="led-wrap" style="width:72px;">
        <svg class="led-svg" viewBox="0 0 72 100" width="72" height="100">
          <path class="led-leg" d="M20 56 L14 92"/>
          <path class="led-leg" d="M30 56 L28 94"/>
          <path class="led-leg" d="M42 56 L44 94"/>
          <path class="led-leg" d="M52 56 L58 92"/>
          <rect class="led-flange" x="18" y="50" width="36" height="7" rx="2.5"/>
          <path class="led-dome rgb-dome" d="M22 53 L22 24 A14 14 0 0 1 50 24 L50 53 Z"/>
          <ellipse class="led-shine" cx="29" cy="20" rx="3" ry="7"/>
          <circle class="lead" data-comp="${comp.id}" data-leg="0" cx="14" cy="92" r="6"><title>R — אדום</title></circle>
          <circle class="lead" data-comp="${comp.id}" data-leg="1" cx="28" cy="94" r="6"><title>G — ירוק</title></circle>
          <circle class="lead" data-comp="${comp.id}" data-leg="2" cx="44" cy="94" r="6"><title>B — כחול</title></circle>
          <circle class="lead" data-comp="${comp.id}" data-leg="3" cx="58" cy="92" r="6"><title>משותף (−)</title></circle>
        </svg>
      </div>
      <div class="rgb-label">R · G · B</div>`;
  }

  function displayMarkup(comp) {
    // צג טקסט הנשלט מהקוד (printf/textSize/cursor) — ללא חיווט
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="lcd-bezel">
        <canvas class="lcd-canvas" width="176" height="112"></canvas>
      </div>`;
  }

  /* ---------- צג טקסט: printf / textSize / cursor / clear ---------- */
  function firstDisplay() { return Components.items.find((c) => c.type === "display"); }
  function dispState(comp) { return comp._disp || (comp._disp = { cx: 0, cy: 0, size: 1 }); }
  function dispCtx(comp) {
    const cv = comp && comp._el && comp._el.querySelector(".lcd-canvas");
    return cv ? cv.getContext("2d") : null;
  }
  function dispClear(comp) {
    const ctx = dispCtx(comp); if (!ctx) return;
    ctx.fillStyle = "#06140a";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const st = dispState(comp); st.cx = 0; st.cy = 0;
  }
  function dispPrint(comp, text) {
    const ctx = dispCtx(comp); if (!ctx) return;
    const st = dispState(comp);
    const fs = 8 * st.size, lh = fs + 2;
    ctx.textBaseline = "top";
    ctx.font = `${fs}px "Consolas","Courier New",monospace`;
    ctx.fillStyle = "#8CFFA0";
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const str = String(text);
    for (let k = 0; k < str.length; k++) {
      const ch = str[k];
      if (ch === "\n") { st.cx = 0; st.cy += lh; continue; }
      const w = ctx.measureText(ch).width;
      if (st.cx + w > W) { st.cx = 0; st.cy += lh; }      // גלישת שורה
      if (st.cy + fs > H) {                                // גלילה כשמגיעים לתחתית
        const img = ctx.getImageData(0, lh, W, H - lh);
        ctx.fillStyle = "#06140a"; ctx.fillRect(0, 0, W, H);
        ctx.putImageData(img, 0, 0);
        st.cy -= lh;
        ctx.fillStyle = "#8CFFA0";
      }
      ctx.fillText(ch, st.cx, st.cy);
      st.cx += w;
    }
  }
  // API פומבי לשימוש מהסימולטור (פועל על הצג הראשון שעל המשטח)
  function displayPrint(text)  { const c = firstDisplay(); if (c) dispPrint(c, text); }
  function displayTextSize(n)  { const c = firstDisplay(); if (c) dispState(c).size = Math.max(1, n | 0); }
  function displayCursor(x, y) { const c = firstDisplay(); if (c) { const s = dispState(c); s.cx = x | 0; s.cy = y | 0; } }
  function displayClear()      { const c = firstDisplay(); if (c) dispClear(c); }
  function displayResetAll()   { Components.items.forEach((c) => { if (c.type === "display") { c._disp = { cx: 0, cy: 0, size: 1 }; dispClear(c); } }); }

  function resistorMarkup(comp) {
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="res-row">
        <span class="lead" data-comp="${comp.id}" data-leg="0"></span>
        <div class="res-body" title="לחץ להחלפת ערך (גלגל = הבא/קודם)">
          <span class="res-mark" title="טבעת ראשונה — קוראים מכאן">▸</span>
          <span class="res-band b1"></span>
          <span class="res-band b2"></span>
          <span class="res-band b3"></span>
        </div>
        <span class="lead" data-comp="${comp.id}" data-leg="1"></span>
      </div>
      <div class="res-label">1kΩ</div>`;
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

  function slideSwitchMarkup(comp) {
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="slide-body">
        <div class="slide-track" title="לחץ כדי להזיז את המתג">
          <div class="slide-knob"></div>
        </div>
      </div>
      <div class="slide-legs">
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
        <span class="btn-leg lead ll" data-comp="${comp.id}" data-leg="0" title="רגל שמאלית"></span>
        <span class="btn-leg lead lr" data-comp="${comp.id}" data-leg="1" title="רגל ימנית"></span>
        <div class="btn-push" title="לחץ והחזק"></div>
      </div>`;
  }

  function batteryMarkup(comp) {
    const volts = comp.type === "battery9" ? "9V" : "1.5V";
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="batt-wrap">
        <svg class="batt-svg" viewBox="0 0 72 56" width="68" height="52">
          <line class="batt-term-wire" x1="16" y1="14" x2="16" y2="4"/>
          <line class="batt-term-wire" x1="56" y1="14" x2="56" y2="4"/>
          <rect class="batt-body" x="6" y="14" width="60" height="34" rx="4"/>
          <rect class="batt-stripe" x="6" y="14" width="14" height="34" rx="4"/>
          <text class="batt-label" x="40" y="35">${volts}</text>
          <text class="batt-sign plus"  x="12" y="35">+</text>
          <text class="batt-sign minus" x="58" y="34">−</text>
          <circle class="pin batt-term plus"  data-port="VCC" data-bit="0" cx="16" cy="4" r="5"><title>+ (5V)</title></circle>
          <circle class="pin batt-term minus" data-port="GND" data-bit="0" cx="56" cy="4" r="5"><title>− (GND)</title></circle>
        </svg>
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
    // pinout TQFP-48 (C8051F38x). port/bit = פין ניתן לחיווט; אחרת תצוגה בלבד
    const TOP = [
      {n:48,name:"P0.6",port:"P0",bit:6},{n:47,name:"P0.7",port:"P0",bit:7},
      {n:46,name:"P1.0",port:"P1",bit:0},{n:45,name:"P1.1",port:"P1",bit:1},
      {n:44,name:"P1.2",port:"P1",bit:2},{n:43,name:"P1.3",port:"P1",bit:3},
      {n:42,name:"P1.4",port:"P1",bit:4},{n:41,name:"P1.5",port:"P1",bit:5},
      {n:40,name:"P1.6",port:"P1",bit:6},{n:39,name:"P1.7",port:"P1",bit:7},
      {n:38,name:"P2.0",port:"P2",bit:0},{n:37,name:"P2.1",port:"P2",bit:1},
    ];
    const LEFT = [
      {n:1,name:"P0.5",port:"P0",bit:5},{n:2,name:"P0.4",port:"P0",bit:4},
      {n:3,name:"P0.3",port:"P0",bit:3},{n:4,name:"P0.2",port:"P0",bit:2},
      {n:5,name:"P0.1",port:"P0",bit:1},{n:6,name:"P0.0",port:"P0",bit:0},
      {n:7,name:"GND",port:"GND",bit:0},{n:8,name:"D+"},{n:9,name:"D-"},
      {n:10,name:"VDD",port:"VCC",bit:0},{n:11,name:"REGIN"},{n:12,name:"VBUS"},
    ];
    const BOTTOM = [
      {n:13,name:"RST/C2CK"},{n:14,name:"C2D"},
      {n:15,name:"P4.7"},{n:16,name:"P4.6"},{n:17,name:"P4.5"},{n:18,name:"P4.4"},
      {n:19,name:"P4.3"},{n:20,name:"P4.2"},{n:21,name:"P4.1"},{n:22,name:"P4.0"},
      {n:23,name:"P3.7",port:"P3",bit:7},{n:24,name:"P3.6",port:"P3",bit:6},
    ];
    const RIGHT = [
      {n:36,name:"P2.2",port:"P2",bit:2},{n:35,name:"P2.3",port:"P2",bit:3},
      {n:34,name:"P2.4",port:"P2",bit:4},{n:33,name:"P2.5",port:"P2",bit:5},
      {n:32,name:"P2.6",port:"P2",bit:6},{n:31,name:"P2.7",port:"P2",bit:7},
      {n:30,name:"P3.0",port:"P3",bit:0},{n:29,name:"P3.1",port:"P3",bit:1},
      {n:28,name:"P3.2",port:"P3",bit:2},{n:27,name:"P3.3",port:"P3",bit:3},
      {n:26,name:"P3.4",port:"P3",bit:4},{n:25,name:"P3.5",port:"P3",bit:5},
    ];
    const leg = (p, side) => {
      const conn = !!p.port;
      const cls = conn ? "pin leg-numbox" : "leg-numbox nc";
      const attrs = conn ? `data-port="${p.port}" data-bit="${p.bit}"` : "";
      const num = `<span class="${cls}" ${attrs} title="${p.name} (pin ${p.n})">${p.n}</span>`;
      const name = `<span class="leg-name${conn ? "" : " nc"}">${p.name}</span>`;
      const lead = `<span class="leg-lead"></span>`;
      const inner = (side === "top" || side === "left") ? name + lead + num : num + lead + name;
      return `<div class="leg ${side}">${inner}</div>`;
    };
    const sideHtml = (arr, side) => `<div class="mcu-side ${side}">${arr.map((p) => leg(p, side)).join("")}</div>`;
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="mcu-chip">
        ${sideHtml(TOP, "top")}
        ${sideHtml(LEFT, "left")}
        <div class="mcu-body">
          <span class="mcu-dot"></span>
          <span class="mcu-name">8051</span>
        </div>
        ${sideHtml(RIGHT, "right")}
        ${sideHtml(BOTTOM, "bottom")}
      </div>`;
  }

  /** רענון רכיב בודד לפי מצבו */
  function refresh(comp) {
    if (!comp._el) return;
    if (comp.type === "led") {
      comp._el.querySelector(".led-bulb").classList.toggle("on", Components.isActive(comp));
    } else if (comp.type === "rgbled") {
      const on = (leg) => { const c = comp.conns[leg]; return !!c && Registers.getBit(c.port, c.bit) === 1; };
      const r = on(0), g = on(1), b = on(2);
      const dome = comp._el.querySelector(".rgb-dome");
      if (r || g || b) {
        const col = `rgb(${r ? 255 : 0},${g ? 255 : 0},${b ? 255 : 0})`;
        dome.style.fill = col;
        dome.style.filter = `brightness(1.12) drop-shadow(0 0 5px ${col}) drop-shadow(0 0 11px ${col})`;
      } else {
        dome.style.fill = "#e2e6ea";
        dome.style.filter = "brightness(.72) saturate(.6)";
      }
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
    } else if (comp.type === "slideswitch") {
      comp._el.querySelector(".slide-track").classList.toggle("on", comp.value === 1);
    } else if (comp.type === "display") {
      if (!comp._dispInit) { dispClear(comp); comp._dispInit = true; }   // אתחול הצג פעם אחת (רקע כהה)
    } else if (comp.type === "resistor") {
      const [d1, d2, m] = Components.resistorBands(comp.value);
      const cols = Components.RES_COLORS;
      comp._el.querySelector(".res-band.b1").style.background = cols[d1];
      comp._el.querySelector(".res-band.b2").style.background = cols[d2];
      comp._el.querySelector(".res-band.b3").style.background = cols[m];
      comp._el.querySelector(".res-label").textContent = Components.resistorLabel(comp.value);
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

  /** מפסק הזזה — לחיצה מזיזה את המתג ומחליפה 0/1 */
  function enableSlide(el, comp) {
    el.querySelector(".slide-track").addEventListener("click", (e) => {
      e.stopPropagation();
      comp.value = comp.value ? 0 : 1;
      Components.assertInput(comp);
      refresh(comp);
    });
  }

  /** נגד — לחיצה על הגוף מחליפה ערך; גלגל מעלה/מוריד בערכים הסטנדרטיים */
  function enableResistor(el, comp) {
    const body = el.querySelector(".res-body");
    body.addEventListener("click", (e) => {
      e.stopPropagation();
      Components.cycleResistor(comp, 1);
      refresh(comp);
    });
    body.addEventListener("wheel", (e) => {
      e.preventDefault(); e.stopPropagation();   // שלא יסובב את הרכיב
      Components.cycleResistor(comp, e.deltaY > 0 ? 1 : -1);
      refresh(comp);
    }, { passive: false });
  }

  /** סליידר חיישן אור (רמת אור 0-255) → מזין ערך אנלוגי לפורט */
  function enableLight(el, comp) {
    const slider = el.querySelector(".ls-slider");
    slider.addEventListener("input", () => Components.setPotValue(comp, +slider.value));
  }

  /** גרירת רכיב בתוך הקנבס.
   * אפשר לגרור מכל מקום על הרכיב חוץ מנקודות חיווט (.pin/.lead/.hole),
   * סליידרים, כפתור הלחיצה וכפתורי הכותרת. גרירה אמיתית (מעבר סף תזוזה)
   * "בולעת" את ה-click שאחריה כדי שטוגלים/בחירת-ערך לא יופעלו אחרי הזזה. */
  function enableDrag(el, comp) {
    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".pin, .lead, .hole, .btn-push, input, .comp-del, .comp-rotate")) return;

      const startX = e.clientX, startY = e.clientY;
      const offX = e.clientX - el.offsetLeft;
      const offY = e.clientY - el.offsetTop;
      let moved = false;

      function move(ev) {
        if (!moved) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;  // סף תזוזה
          moved = true;
          selectOnly(el);
          el.classList.add("dragging");
        }
        ev.preventDefault();
        comp.x = Math.max(0, ev.clientX - offX);
        comp.y = Math.max(0, ev.clientY - offY);
        el.style.left = comp.x + "px";
        el.style.top = comp.y + "px";
        if (onMove) onMove();        // צייר מחדש את החוטים
      }
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        el.classList.remove("dragging");
        if (moved) {
          // בלע את ה-click הבא (אם יירה) כדי שלא יפעיל פקד אחרי גרירה
          const swallow = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
          el.addEventListener("click", swallow, { capture: true, once: true });
          setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 0);
        }
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
    displayPrint, displayTextSize, displayCursor, displayClear, displayResetAll,
    get el() { return canvasEl; },
  };
})();
