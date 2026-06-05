/* ============================================================
 * components.js — הגדרת הרכיבים האלקטרוניים ומצבם
 * כל רגל יכולה להתחבר בנפרד: comp.conns = { legIndex: {port,bit} }.
 * (מתעדכן ע"י wiring.js). כך ל-7-seg כל מקטע נשלט מהפין שמחובר לרגל שלו.
 * ============================================================ */
window.Components = (function () {

  // קטלוג סוגי הרכיבים
  const CATALOG = {
    led:      { name: "LED",        icon: "💡", color: "#ffcc00" },
    buzzer:   { name: "זמזם",       icon: "🔔" },   // פלט דיגיטלי
    button:   { name: "כפתור",      icon: "🔘" },   // קלט דיגיטלי
    sevenseg: { name: "7-Seg",      icon: "🔢" },   // 8 רגליים = 8 מקטעים
    motor:    { name: "מנוע",       icon: "⚙️" },   // פלט אנלוגי 0-255
    pot:      { name: "פוטנציומטר", icon: "🎛️", input: true }, // קלט אנלוגי 0-255
    lightsensor: { name: "חיישן אור", icon: "🔆", input: true }, // קלט אנלוגי 0-255 (LDR)
    breadboard: { name: "לוח ניסויים", icon: "🧰" }, // ברידבורד — בונים עליו מעגל
    mcu:      { name: "8051",       icon: "🔲" },   // נוצר אוטומטית
  };

  // מיפוי אינדקס-רגל → מקטע ב-7-segment: רגל0=a ... רגל6=g, רגל7=dp
  const SEG_ORDER = ["a", "b", "c", "d", "e", "f", "g", "dp"];

  const items = [];   // כל הרכיבים שעל הקנבס
  let seq = 0;

  function add(type, x, y) {
    const def = CATALOG[type];
    if (!def) return null;
    const comp = {
      id: ++seq, type, x, y,
      rotation: 0,                     // 0/90/180/270
      conns: {},                       // legIndex → { port, bit }
      value: (type === "pot" || type === "lightsensor") ? 128 : 0, // ערך קלט אנלוגי (0-255)
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
      value: d.value != null ? d.value : (d.type === "pot" ? 128 : 0),
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
    } else if (comp.type === "button" && comp.pressed) {
      Object.values(comp.conns).forEach((c) => Registers.setBit(c.port, c.bit, true));
    }
  }
  function assertAllInputs() { items.forEach(assertInput); }

  return { CATALOG, SEG_ORDER, items, add, remove, get, isActive, segmentOn, press, setPotValue, assertInput, assertAllInputs, portValue, serialize, clear, addRestored };
})();
