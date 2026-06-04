/* ============================================================
 * canvas.js — רינדור הקנבס: ציור רכיבים, הזזה, מחיקה, רענון
 * LED מצויר עם טרמינל לחיווט; MCU מצויר עם פיני הפורטים.
 * ============================================================ */
window.Canvas = (function () {

  let canvasEl = null;
  let hintEl = null;
  let onRegisterChange = null;   // hook לעדכון טבלת הרגיסטרים
  let onMove = null;             // hook לחיווט (לצייר מחדש חוטים בזמן גרירה)

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
      comp.type === "mcu"      ? mcuMarkup(comp) :
      comp.type === "button"   ? buttonMarkup(comp) :
      comp.type === "sevenseg" ? sevenSegMarkup(comp) :
      comp.type === "pot"      ? potMarkup(comp) :
      comp.type === "motor"    ? motorMarkup(comp) :
      comp.type === "buzzer"   ? buzzerMarkup(comp) :
                                 ledMarkup(comp);

    el.querySelector(".comp-del").addEventListener("click", () => {
      Components.remove(comp.id);
      el.remove();
      if (onMove) onMove();      // נקה חוטים שהיו מחוברים אליו
      updateHint();
    });

    if (comp.type === "button") enableButton(el, comp);
    if (comp.type === "pot") enablePot(el, comp);

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
      <div class="led-bulb"></div>
      <div class="terminal" data-comp="${comp.id}" title="לחץ לחיבור חוט"></div>`;
  }

  function sevenSegMarkup(comp) {
    // שבע נורות + נקודה עשרונית, כל מקטע עם data-seg
    const seg = (s, d) => `<line class="seg" data-seg="${s}" ${d} />`;
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <svg class="seven-seg" viewBox="0 0 60 100">
        ${seg("a",  'x1="15" y1="10" x2="45" y2="10"')}
        ${seg("b",  'x1="47" y1="12" x2="47" y2="46"')}
        ${seg("c",  'x1="47" y1="54" x2="47" y2="88"')}
        ${seg("d",  'x1="15" y1="90" x2="45" y2="90"')}
        ${seg("e",  'x1="13" y1="54" x2="13" y2="88"')}
        ${seg("f",  'x1="13" y1="12" x2="13" y2="46"')}
        ${seg("g",  'x1="15" y1="50" x2="45" y2="50"')}
        <circle class="seg dp" data-seg="dp" cx="54" cy="89" r="3.5" />
      </svg>
      <div class="terminal" data-comp="${comp.id}" title="חבר לכל פין של הפורט (כל 8 הביטים מניעים את התצוגה)"></div>`;
  }

  function motorMarkup(comp) {
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="motor-gear">⚙️</div>
      <div class="motor-speed">מהירות: <span class="motor-val">0</span></div>
      <div class="terminal" data-comp="${comp.id}" title="חבר לכל פין של הפורט (מהירות 0-255)"></div>`;
  }

  function buzzerMarkup(comp) {
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="buzzer-icon">🔔</div>
      <div class="terminal" data-comp="${comp.id}" title="לחץ לחיבור חוט"></div>`;
  }

  function potMarkup(comp) {
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="pot-value"><span class="pot-num">${comp.value}</span> <small>(0x${comp.value.toString(16).toUpperCase().padStart(2,"0")})</small></div>
      <input class="pot-slider" type="range" min="0" max="255" value="${comp.value}">
      <div class="terminal" data-comp="${comp.id}" title="חבר לכל פין של הפורט (קלט אנלוגי 0-255)"></div>`;
  }

  function buttonMarkup(comp) {
    return `
      <div class="comp-head">
        <span class="comp-title">${comp.def.name} #${comp.id}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="btn-push" title="לחץ והחזק">לחץ</div>
      <div class="terminal" data-comp="${comp.id}" title="לחץ לחיבור חוט"></div>`;
  }

  function mcuMarkup(comp) {
    const rows = Registers.PORTS.map((port) => {
      const pins = [0,1,2,3,4,5,6,7].map((bit) =>
        `<span class="pin" data-port="${port}" data-bit="${bit}" title="${port}.${bit}">${bit}</span>`
      ).join("");
      return `<div class="mcu-port"><span class="mcu-plabel">${port}</span>${pins}</div>`;
    }).join("");
    return `
      <div class="comp-head">
        <span class="comp-title">🔲 ${comp.def.name}</span>
        <button class="comp-del" title="מחק">✕</button>
      </div>
      <div class="mcu-body">${rows}</div>`;
  }

  /** רענון רכיב בודד לפי מצבו */
  function refresh(comp) {
    if (!comp._el) return;
    if (comp.type === "led") {
      comp._el.querySelector(".led-bulb").classList.toggle("on", Components.isActive(comp));
    } else if (comp.type === "button") {
      comp._el.querySelector(".btn-push").classList.toggle("pressed", !!comp.pressed);
    } else if (comp.type === "sevenseg") {
      const val = Components.portValue(comp);
      Components.SEG_ORDER.forEach((seg, bit) => {
        const on = (val >> bit) & 1;
        const node = comp._el.querySelector(`.seg[data-seg="${seg}"]`);
        if (node) node.classList.toggle("on", !!on);
      });
    } else if (comp.type === "pot") {
      const num = comp._el.querySelector(".pot-num");
      const small = comp._el.querySelector(".pot-value small");
      if (num) num.textContent = comp.value;
      if (small) small.textContent = "(0x" + comp.value.toString(16).toUpperCase().padStart(2, "0") + ")";
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

  /** סליידר פוטנציומטר → מזין ערך אנלוגי לפורט */
  function enablePot(el, comp) {
    const slider = el.querySelector(".pot-slider");
    slider.addEventListener("input", () => Components.setPotValue(comp, +slider.value));
  }

  /** גרירת רכיב בתוך הקנבס (לא על פקדים / פינים / טרמינלים) */
  function enableDrag(el, comp) {
    el.addEventListener("mousedown", (e) => {
      if (e.target.closest("button, input, .pin, .terminal, .btn-push")) return;
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
