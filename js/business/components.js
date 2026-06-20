/* ============================================================
 * components.js — הגדרת הרכיבים האלקטרוניים ומצבם
 * כל רגל יכולה להתחבר בנפרד: comp.conns = { legIndex: {port,bit} }.
 * (מתעדכן ע"י wiring.js). כך ל-7-seg כל מקטע נשלט מהפין שמחובר לרגל שלו.
 * ============================================================ */
window.Components = (function () {

  // קטלוג סוגי הרכיבים
  const CATALOG = {
    led:      { name: "LED",        icon: "💡", color: "#ffcc00" },
    rgbled:   { name: "LED RGB",    icon: "🌈" },   // 3 ערוצים R/G/B + משותף
    buzzer:   { name: "זמזם",       icon: "🔔" },   // פלט דיגיטלי
    button:   { name: "כפתור",      icon: "🔘" },   // קלט דיגיטלי
    slideswitch: { name: "מפסק הזזה", icon: "🎚️", input: true }, // מתג נעילה (0/1)
    sevenseg: { name: "7-Seg",      icon: "🔢" },   // 8 רגליים = 8 מקטעים
    display:  { name: "מסך צבעוני", icon: "🖥️" },   // LCD — מציג ערך פורט + צבע
    resistor: { name: "נגד",        icon: "🟫" },   // 3 טבעות צבע = קוד הנגד
    motor:    { name: "מנוע",       icon: "⚙️" },   // פלט אנלוגי 0-255
    pot:      { name: "פוטנציומטר", icon: "🎛️", input: true }, // קלט אנלוגי 0-255
    lightsensor: { name: "חיישן אור", icon: "🔆", input: true }, // קלט אנלוגי 0-255 (LDR)
    breadboard: { name: "לוח ניסויים", icon: "🧰" }, // ברידבורד — בונים עליו מעגל
    battery15: { name: "סוללה 1.5V", icon: "🔋" },   // מקור מתח (+ גבוה, − נמוך)
    battery9:  { name: "סוללה 9V",   icon: "🔋" },
    mcu:      { name: "8051",       icon: "🔲" },   // נוצר אוטומטית
  };

  // מיפוי אינדקס-רגל → מקטע ב-7-segment: רגל0=a ... רגל6=g, רגל7=dp
  const SEG_ORDER = ["a", "b", "c", "d", "e", "f", "g", "dp"];

  // ---- קוד צבעי נגדים ----
  // לכל ספרה 0-9 צבע. הסדר: טבעת1=ספרה ראשונה, טבעת2=ספרה שנייה, טבעת3=מכפיל (10^n)
  const RES_COLORS = ["#000000", "#7B3F00", "#FF0000", "#FF7A00", "#FFD400", "#1FA60A", "#0A4DFF", "#9B30FF", "#9C9C9C", "#FFFFFF"];
  const RES_COLOR_NAMES = ["שחור", "חום", "אדום", "כתום", "צהוב", "ירוק", "כחול", "סגול", "אפור", "לבן"];
  // כל ערכי הנגדים הסטנדרטיים (סדרת E12) מ-10Ω עד 1MΩ
  const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
  const RES_VALUES = (() => {
    const a = [];
    for (let d = 0; d < 5; d++) E12.forEach((b) => a.push(b * Math.pow(10, d)));
    a.push(1000000);
    return a;
  })();

  /** ohms → [ספרה1, ספרה2, מכפיל] (אינדקסים 0-9 לתוך RES_COLORS) */
  function resistorBands(ohms) {
    let m = 0, v = ohms;
    while (v >= 100) { v /= 10; m++; }
    const d1 = Math.floor(v / 10);
    const d2 = Math.round(v - d1 * 10);
    return [d1, d2, m];
  }
  /** ohms → טקסט קריא (220Ω / 4.7kΩ / 1MΩ) */
  function resistorLabel(ohms) {
    if (ohms >= 1e6) return +(ohms / 1e6).toFixed(2) + "MΩ";
    if (ohms >= 1e3) return +(ohms / 1e3).toFixed(2) + "kΩ";
    return ohms + "Ω";
  }
  /** מעבר לערך הסטנדרטי הבא/קודם */
  function cycleResistor(comp, dir) {
    let i = RES_VALUES.indexOf(comp.value);
    if (i < 0) i = 0;
    i = (i + (dir || 1) + RES_VALUES.length) % RES_VALUES.length;
    comp.value = RES_VALUES[i];
  }

  const items = [];   // כל הרכיבים שעל הקנבס
  let seq = 0;

  function add(type, x, y) {
    const def = CATALOG[type];
    if (!def) return null;
    const comp = {
      id: ++seq, type, x, y,
      rotation: 0,                     // 0/90/180/270
      conns: {},                       // legIndex → { port, bit }
      value: (type === "pot" || type === "lightsensor") ? 128 : (type === "resistor" ? 1000 : 0), // pot/ls=0-255, resistor=אוהם
      color: def.color, def,
    };
    items.push(comp);
    return comp;
  }

  function remove(id) {
    const i = items.findIndex((c) => c.id === id);
    if (i >= 0) items.splice(i, 1);
  }
  function get(id) { return items.find((c) => c.id === id); }

  /** ---- שמירה/טעינה ---- */
  function serialize() {
    return items.map((c) => ({ id: c.id, type: c.type, x: c.x, y: c.y, rotation: c.rotation || 0, conns: c.conns || {}, value: c.value || 0, color: c.color }));
  }
  function clear() { items.length = 0; seq = 0; }
  function addRestored(d) {
    const def = CATALOG[d.type];
    if (!def) return null;
    // תאימות לאחור: שמירות ישנות עם source יחיד → רגל 0
    const conns = d.conns || (d.source ? { 0: d.source } : {});
    const comp = {
      id: d.id, type: d.type, x: d.x, y: d.y,
      rotation: d.rotation || 0,
      conns,
      value: d.value != null ? d.value : (d.type === "pot" ? 128 : (d.type === "resistor" ? 1000 : 0)),
      color: d.color || def.color, def,
    };
    items.push(comp);
    if (d.id > seq) seq = d.id;
    return comp;
  }

  function firstConn(comp) {
    const k = Object.keys(comp.conns);
    return k.length ? comp.conns[k[0]] : null;
  }

  /** האם הרכיב פעיל? led/buzzer = איזושהי רגל מחוברת לפין גבוה */
  function isActive(comp) {
    if (comp.type === "led" || comp.type === "buzzer") {
      return Object.values(comp.conns).some((c) => Registers.getBit(c.port, c.bit) === 1);
    }
    if (comp.type === "button") return !!comp.pressed;
    return false;
  }

  /** מקטע מסוים ב-7-seg דולק? (לפי הפין המחובר לרגל של אותו מקטע) */
  function segmentOn(comp, legIndex) {
    const c = comp.conns[legIndex];
    return !!c && Registers.getBit(c.port, c.bit) === 1;
  }

  /** מהירות מנוע = הבייט של הפורט שמחובר לרגל הראשונה. 0 אם לא מחובר. */
  function portValue(comp) {
    const c = firstConn(comp);
    return c ? Registers.get(c.port) : 0;
  }

  /** קריאת קלט אנלוגי ל-ADC: מחזיר ערך 0-255 של רכיב אנלוגי (פוטנציומטר/חיישן אור).
   *  channel — אם יש כמה רכיבים אנלוגיים, בוחר לפי אינדקס; אחרת הראשון. */
  function adcRead(channel) {
    const ins = items.filter((c) => c.type === "pot" || c.type === "lightsensor");
    if (!ins.length) return 0;
    const c = (channel != null && ins[channel]) ? ins[channel] : ins[0];
    return c.value & 0xFF;
  }

  /** לחיצה/שחרור כפתור — מזין את כל הפינים שמחוברים לרגליו */
  function press(comp, down) {
    if (comp.type !== "button") return;
    comp.pressed = down;
    Object.values(comp.conns).forEach((c) => Registers.setBit(c.port, c.bit, down));
  }

  /** עדכון ערך קלט אנלוגי (פוטנציומטר / חיישן אור) → מזין את הפורטים המחוברים */
  function setPotValue(comp, v) {
    if (comp.type !== "pot" && comp.type !== "lightsensor") return;
    comp.value = Math.max(0, Math.min(255, v | 0));
    assertInput(comp);
  }

  /** מזין רכיב-קלט אל הפינים שמחוברים אליו */
  function assertInput(comp) {
    if (comp.type === "pot" || comp.type === "lightsensor") {
      Object.values(comp.conns).forEach((c) => Registers.setPort(c.port, comp.value & 0xFF));
    } else if (comp.type === "slideswitch") {
      Object.values(comp.conns).forEach((c) => Registers.setBit(c.port, c.bit, comp.value === 1));
    } else if (comp.type === "button" && comp.pressed) {
      Object.values(comp.conns).forEach((c) => Registers.setBit(c.port, c.bit, true));
    }
  }
  function assertAllInputs() { items.forEach(assertInput); }

  return { CATALOG, SEG_ORDER, RES_COLORS, RES_COLOR_NAMES, RES_VALUES, resistorBands, resistorLabel, cycleResistor, items, add, remove, get, isActive, segmentOn, press, setPotValue, assertInput, assertAllInputs, portValue, adcRead, serialize, clear, addRestored };
})();
