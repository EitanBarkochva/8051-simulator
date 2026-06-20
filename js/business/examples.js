/* ============================================================
 * examples.js — דוגמאות קוד מוכנות לטעינה לעורך
 * כל דוגמה: { name, hint (אילו רכיבים לגרור), code }
 * ============================================================ */
window.Examples = [
  {
    name: "הבהוב נורה (Blink)",
    hint: "גרור LED, חבר רגל אחת ל-P1.0 ורגל שנייה ל-GND",
    code: `void main() {
  while (1) {
    P1_0 = 1;       // נורית דולקת
    delay(500);     // המתן חצי שנייה
    P1_0 = 0;       // נורית כבויה
    delay(500);
  }
}`
  },
  {
    name: "כפתור מדליק נורה",
    hint: "גרור כפתור (רגל ל-P2.0 ול-5V) ו-LED (ל-P1.0)",
    code: `void main() {
  while (1) {
    if (P2_0 == 1)  // כפתור לחוץ?
      P1_0 = 1;     // הדלק
    else
      P1_0 = 0;     // כבה
  }
}`
  },
  {
    name: "רץ אורות (Running lights)",
    hint: "גרור כמה נוריות, חבר ל-P1.0 עד P1.7",
    code: `void main() {
  unsigned char i;
  while (1) {
    for (i = 0; i < 8; i++) {
      P1 = (1 << i);   // נורה אחת דולקת, נעה
      delay(120);
    }
  }
}`
  },
  {
    name: "מונה 0-9 (7-Segment)",
    hint: "גרור תצוגת 7-Seg וחבר את הרגליים ל-P1",
    code: `// טבלת הספרות 0-9 לתצוגת 7-segment
void main() {
  unsigned char seg[10] = {0x3F,0x06,0x5B,0x4F,0x66,0x6D,0x7D,0x07,0x7F,0x6F};
  unsigned char d;
  while (1) {
    for (d = 0; d < 10; d++) {
      P1 = seg[d];
      delay(700);
    }
  }
}`
  },
  {
    name: "קריאת פוטנציומטר (ADC)",
    hint: "גרור פוטנציומטר ומסך צבעוני",
    code: `// קורא ערך אנלוגי מהפוטנציומטר ומציג אותו
void main() {
  unsigned int v;
  textSize(2);
  while (1) {
    AD0EN = 1;
    AD0INT = 0;
    AD0BUSY = 1;
    while (AD0INT == 0);          // המתן לסיום ההמרה
    v = (ADC0H << 8) | ADC0L;     // ערך 0-1023

    clear();
    cursor(8, 8);
    printf("ADC=%d", v);
    delay(150);
  }
}`
  },
  {
    name: "מסך טקסט (printf)",
    hint: "גרור מסך צבעוני (אין צורך לחבר חוטים)",
    code: `void main() {
  unsigned char i;
  i = 0;
  while (1) {
    clear();
    textSize(2);
    cursor(6, 4);
    printf("8051\\n");
    textSize(1);
    printf("counter = %d\\n", i);
    printf("hex = %02X", i);
    i++;
    delay(500);
  }
}`
  },
  {
    name: "הד UART (Echo)",
    hint: "השתמש בחלון 'טרמינל (UART)' — הקלד ולחץ שלח",
    code: `void tx(unsigned char c) {
  SBUF = c;
  while (TI == 0);
  TI = 0;
}
void main() {
  tx('R'); tx('e'); tx('a'); tx('d'); tx('y'); tx('>');
  while (1) {
    while (RI == 0);   // המתן לקלט מהטרמינל
    tx(SBUF);          // החזר (הד) את מה שהתקבל
  }
}`
  },
  {
    name: "בורר מצבים (switch)",
    hint: "גרור LED ל-P1.0 ומסך צבעוני",
    code: `// מחליף בין 3 מצבים בלולאה
void main() {
  unsigned char mode;
  mode = 0;
  while (1) {
    switch (mode) {
      case 0: P1 = 0x0F; break;
      case 1: P1 = 0xF0; break;
      case 2: P1 = 0xFF; break;
      default: P1 = 0x00;
    }
    mode++;
    if (mode > 2) mode = 0;
    delay(400);
  }
}`
  },
  {
    name: "פסיקת טיימר (Interrupt)",
    hint: "גרור LED ל-P1.0",
    code: `// הטיימר מהבהב את הנורית אוטומטית דרך פסיקה
void main() {
  TMOD = 0x01;     // טיימר 0, מצב 16 ביט
  ET0 = 1;         // אפשר פסיקת טיימר 0
  TR0 = 1;         // הפעל טיימר
  EA = 1;          // אישור פסיקות כללי
  while (1) {
    // התוכנית הראשית פנויה
  }
}

void timer0() interrupt 1 {
  P1_0 = ~P1_0;    // הפוך את מצב הנורית בכל גלישה
}`
  }
];
