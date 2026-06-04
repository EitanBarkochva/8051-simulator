/* ============================================================
 * components.js — הגדרת הרכיבים האלקטרוניים ומצבם
 * מצב הרכיב נקבע לפי החוט שמחבר אותו לפין (ראה wiring.js).
 * comp.source = { port, bit } מתעדכן ע"י החיווט; null = לא מחובר.
 * ============================================================ */
window.Components = (function () {

  // קטלוג סוגי הרכיבים
  const CATALOG = {
    led:      { name: "LED",        icon: "💡", color: "#ffcc00", terminals: 1 },
    buzzer:   { name: "זמזם",       icon: "🔔", terminals: 1 },   // פלט דיגיטלי (ביט)
    button:   { name: "כפתור",      icon: "🔘", terminals: 1 },   // קלט דיגיטלי (ביט)
    sevenseg: { name: "7-Seg",      icon: "🔢", bus: true },      // פלט: פורט שלם
    motor:    { name: "מנוע",       icon: "⚙️", bus: true },      // פלט אנלוגי: מהירות 0-255
    pot:      { name: "פוטנציומטר", icon: "🎛️", bus: true, input: true }, // קלט אנלוגי 0-255
    mcu:      { name: "8051",       icon: "🔲" },                 // נוצר אוטומטית
  };

  // מיפוי ביט → מקטע בתצוגת 7-segment (common cathode): bit0=a ... bit6=g, bit7=dp
  const SEG_ORDER = ["a", "b", "c", "d", "e", "f", "g", "dp"];

  const items = [];   // כל הרכיבים שעל הקנבס
  let seq = 0;

  /** הוסף רכיב חדש מסוג type במיקום x,y */
  function add(type, x, y) {
    const def = CATALOG[type];
    if (!def) return null;
    const comp = {
      id: ++seq,
      type, x, y,
      source: null,        // { port, bit } — מתמלא ע"י חוט
      value: type === "pot" ? 128 : 0,   // ערך פוטנציומטר (0-255)
      color: def.color,
      def,
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
    return items.map((c) => ({ id: c.id, type: c.type, x: c.x, y: c.y, source: c.source || null, value: c.value || 0 }));
  }
  function clear() { items.length = 0; seq = 0; }
  /** שחזור רכיב מנתונים שמורים (שומר על ה-id המקורי) */
  function addRestored(d) {
    const def = CATALOG[d.type];
    if (!def) return null;
    const comp = {
      id: d.id, type: d.type, x: d.x, y: d.y,
      source: d.source || null,
      value: d.value != null ? d.value : (d.type === "pot" ? 128 : 0),
      color: def.color, def,
    };
    items.push(comp);
    if (d.id > seq) seq = d.id;
    return comp;
  }

  /** האם הרכיב פעיל לפי הפין שאליו הוא מחובר בחוט? */
  function isActive(comp) {
    if (comp.type === "led" || comp.type === "buzzer") {
      if (!comp.source) return false;                 // לא מחובר → כבוי
      return Registers.getBit(comp.source.port, comp.source.bit) === 1;
    }
    if (comp.type === "button") return !!comp.pressed;
    return false;
  }

  /** הבייט המלא של הפורט שאליו מחובר רכיב-באס (7-seg). 0 אם לא מחובר. */
  function portValue(comp) {
    return comp.source ? Registers.get(comp.source.port) : 0;
  }

  /** לחיצה/שחרור של כפתור — מזין את הפין שאליו הוא מחובר */
  function press(comp, down) {
    if (comp.type !== "button") return;
    comp.pressed = down;
    if (comp.source) Registers.setBit(comp.source.port, comp.source.bit, down);
  }

  /** עדכון ערך פוטנציומטר (0-255) → מזין את הפורט המחובר */
  function setPotValue(comp, v) {
    if (comp.type !== "pot") return;
    comp.value = Math.max(0, Math.min(255, v | 0));
    assertInput(comp);
  }

  /** מזין רכיב-קלט (פוטנציומטר/כפתור לחוץ) אל הפורט/פין שלו */
  function assertInput(comp) {
    if (!comp.source) return;
    if (comp.type === "pot") Registers.setPort(comp.source.port, comp.value & 0xFF);
    else if (comp.type === "button" && comp.pressed) Registers.setBit(comp.source.port, comp.source.bit, true);
  }

  /** מזין מחדש את כל רכיבי הקלט (אחרי reset/טעינה) */
  function assertAllInputs() { items.forEach(assertInput); }

  return { CATALOG, SEG_ORDER, items, add, remove, get, isActive, press, setPotValue, assertInput, assertAllInputs, portValue, serialize, clear, addRestored };
})();
