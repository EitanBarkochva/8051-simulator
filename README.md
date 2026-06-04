# ⚡ 8051 Simulator

סביבת לימוד מקוונת למיקרו-בקר **8051** — לתלמידי אלקטרוניקה.
בונים מעגל, כותבים קוד דמוי-C, ורואים אותו רץ בזמן אמת. כולל מערכת כיתות,
מטלות ובדיקה אוטומטית למורים.

## מה יש בפנים

**סימולטור**
- קנבס גרירה-ושחרור עם חיווט אמיתי בין פיני השבב לרכיבים
- רכיבים: LED, זמזם, כפתור, תצוגת 7-segment, מנוע, פוטנציומטר
- שפה דמוית-C: משתנים, מערכים, `if/else`, `for`, `while`, **פונקציות עם פרמטרים**, ביטויים
- **פסיקות חומרה**: INT0/INT1 חיצוניות + טיימרים, בתחביר Keil (`void f() interrupt N`)
- מנוע ריצה מתמשך עם `delay()` והבהובים בזמן אמת

**פלטפורמה (Supabase)**
- התחברות (אימייל/סיסמה + Google)
- פרויקטים אישיים (שמירה/טעינה)
- **מצב מורה**: בנק תרגילים עם בדיקה אוטומטית, כיתות, מטלות, לוח ציונים + ייצוא CSV
- **דף אדמין**: ניהול משתמשים ותפקידים
- אבטחת שורות (RLS) — כל משתמש רואה רק את שלו

## הרצה מהירה

```bash
python -m http.server 8080
# פתח http://localhost:8080
```

ללא Supabase האתר רץ במצב מקומי (localStorage). לחיבור ענן ראה **[SETUP.md](SETUP.md)**.

## מבנה

```
index.html            כניסה → login
pages/                login, dashboard, simulator, teacher, classes, admin
css/                  עיצוב
js/ui/                canvas, wiring, dragDrop
js/business/          simulator (מנוע), codeParser (מפרש), components, checker, registers
js/db/                config, db, auth, projectService, exerciseService, lms
schema.sql            סכמת מסד הנתונים + RLS (להרצה ב-Supabase)
SETUP.md              הקמת Supabase + פריסה
```

## טכנולוגיה
HTML/CSS/JavaScript טהור (ללא build) · Supabase (PostgreSQL + Auth) · אירוח סטטי.
