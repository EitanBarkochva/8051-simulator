/* ============================================================
 * registers.js — מצב הרגיסטרים של ה-8051
 * מחזיק P0-P3, ACC, B... ומשדר אירוע בכל שינוי.
 * (טעון כ-script רגיל, נחשף ב-window.Registers)
 * ============================================================ */
window.Registers = (function () {
  // כל הפורטים הם 8-bit. ערך התחלתי 0x00.
  const state = {
    P0: 0x00, P1: 0x00, P2: 0x00, P3: 0x00,
    ACC: 0x00, B: 0x00, PSW: 0x00, SP: 0x07,
  };

  const PORTS = ["P0", "P1", "P2", "P3"];
  const listeners = [];

  /** קבע ערך שלם (0-255) לפורט/רגיסטר */
  function setPort(name, value) {
    if (!(name in state)) return false;
    state[name] = value & 0xFF;
    emit(name, state[name]);
    return true;
  }

  /** קבע ביט בודד (0/1) בתוך פורט */
  function setBit(name, bit, on) {
    if (!(name in state)) return false;
    const mask = 1 << bit;
    state[name] = on ? (state[name] | mask) : (state[name] & ~mask);
    emit(name, state[name]);
    return true;
  }

  function get(name)         { return state[name]; }
  function getBit(name, bit) { return (state[name] >> bit) & 1; }

  /** הירשם לשינויים: fn(name, value) */
  function onChange(fn) { listeners.push(fn); }
  function emit(name, value) { listeners.forEach((fn) => fn(name, value)); }

  function reset() {
    Object.keys(state).forEach((k) => (state[k] = k === "SP" ? 0x07 : 0x00));
    PORTS.forEach((p) => emit(p, state[p]));
  }

  return { state, PORTS, setPort, setBit, get, getBit, onChange, reset };
})();
