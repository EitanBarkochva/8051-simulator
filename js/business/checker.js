/* ============================================================
 * checker.js — מנוע בדיקה אוטומטית של תרגילים
 * לכל בדיקה: מאפס רגיסטרים → מריץ את קוד התלמיד → (אופציונלי) מזריק
 * קלט → דוגם את הפלט הצפוי → משווה. עובד גם לקוד חד-פעמי וגם ללולאות.
 * ============================================================ */
window.Checker = (function () {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const hex = (v) => "0x" + (v & 0xFF).toString(16).toUpperCase().padStart(2, "0");

  function fmtTarget(port, bit) { return bit != null ? `${port}.${bit}` : port; }

  /** מריץ את כל הבדיקות על הקוד. מחזיר Promise<[{desc, pass, actual, expected, error?}]> */
  async function run(code, checks) {
    const results = [];

    for (const c of checks) {
      Registers.reset();
      const res = Simulator.run(code, () => {});
      if (res.errors && res.errors.length) {
        results.push({ desc: c.desc, pass: false, error: res.errors[0] });
        Simulator.stop();
        continue;
      }

      await wait(40);                       // תן לקוד להתחיל / איטרציה ראשונה
      if (c.input) {
        if (c.input.bit != null) Registers.setBit(c.input.port, c.input.bit, c.input.value ? true : false);
        else Registers.setPort(c.input.port, c.input.value & 0xFF);
      }
      await wait(80);                       // תן לקוד להגיב

      const actual = c.expectBit != null
        ? Registers.getBit(c.expectPort, c.expectBit)
        : Registers.get(c.expectPort);
      Simulator.stop();

      const pass = actual === c.expectValue;
      results.push({
        desc: c.desc,
        pass,
        actual: c.expectBit != null ? String(actual) : hex(actual),
        expected: c.expectBit != null ? String(c.expectValue) : hex(c.expectValue),
        target: fmtTarget(c.expectPort, c.expectBit),
      });
    }

    Registers.reset();
    return results;
  }

  return { run };
})();
