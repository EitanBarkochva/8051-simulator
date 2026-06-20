/* ============================================================
 * builtinExercises.js — תרגילים מובנים עם בדיקה אוטומטית
 * פורמט בדיקה (תואם checker.js):
 *   { desc, input?:{port,bit?,value}, expectPort, expectBit?, expectValue }
 * ============================================================ */
window.BuiltinExercises = [
  {
    id: "all-on",
    title: "הדלקת כל הנוריות",
    difficulty: 1,
    instructions: "כתוב קוד שמדליק את כל 8 הפינים של הפורט P1 (כלומר P1 = 0xFF).",
    starterCode: "void main() {\n  while (1) {\n    // כתוב כאן\n\n  }\n}",
    checks: [{ desc: "P1 שווה ל-0xFF", expectPort: "P1", expectValue: 0xFF }],
  },
  {
    id: "half",
    title: "חצי דלוק חצי כבוי",
    difficulty: 1,
    instructions: "הדלק רק את 4 הפינים התחתונים של P1 (P1.0–P1.3). כלומר P1 = 0x0F.",
    starterCode: "void main() {\n  while (1) {\n    // כתוב כאן\n\n  }\n}",
    checks: [{ desc: "P1 שווה ל-0x0F", expectPort: "P1", expectValue: 0x0F }],
  },
  {
    id: "sum",
    title: "חישוב סכום",
    difficulty: 1,
    instructions: "חשב 15 + 27 ושים את התוצאה בפורט P2. (התוצאה צריכה להיות 42)",
    starterCode: "void main() {\n  // כתוב כאן\n\n}",
    checks: [{ desc: "P2 שווה ל-42", expectPort: "P2", expectValue: 42 }],
  },
  {
    id: "button-led",
    title: "כפתור מדליק נורה",
    difficulty: 2,
    instructions: "קרא כפתור מהפין P2.0. כשהוא לחוץ (1) — הדלק נורה ב-P1.0. כשהוא משוחרר (0) — כבה אותה.",
    starterCode: "void main() {\n  while (1) {\n    // קרא את P2.0 והדלק/כבה את P1.0\n\n  }\n}",
    checks: [
      { desc: "כפתור לחוץ → נורה דולקת", input: { port: "P2", bit: 0, value: 1 }, expectPort: "P1", expectBit: 0, expectValue: 1 },
      { desc: "כפתור משוחרר → נורה כבויה", input: { port: "P2", bit: 0, value: 0 }, expectPort: "P1", expectBit: 0, expectValue: 0 },
    ],
  },
  {
    id: "invert",
    title: "היפוך ביטים (NOT)",
    difficulty: 2,
    instructions: "קרא ערך מהפורט P0 והוצא ל-P1 את ההיפוך הביטי שלו (NOT). למשל אם P0=0x0F אז P1=0xF0.",
    starterCode: "void main() {\n  while (1) {\n    // P1 = הופכי של P0\n\n  }\n}",
    checks: [
      { desc: "P0=0x0F → P1=0xF0", input: { port: "P0", value: 0x0F }, expectPort: "P1", expectValue: 0xF0 },
      { desc: "P0=0xAA → P1=0x55", input: { port: "P0", value: 0xAA }, expectPort: "P1", expectValue: 0x55 },
    ],
  },
  {
    id: "mask",
    title: "מסכה (Bitmask)",
    difficulty: 3,
    instructions: "קרא ערך מ-P0, שמור רק את 4 הביטים התחתונים (השתמש ב-AND עם 0x0F) ושים את התוצאה ב-P1.",
    starterCode: "void main() {\n  while (1) {\n    // P1 = P0 עם מסכה 0x0F\n\n  }\n}",
    checks: [
      { desc: "P0=0xAB → P1=0x0B", input: { port: "P0", value: 0xAB }, expectPort: "P1", expectValue: 0x0B },
      { desc: "P0=0xFF → P1=0x0F", input: { port: "P0", value: 0xFF }, expectPort: "P1", expectValue: 0x0F },
    ],
  },
];
