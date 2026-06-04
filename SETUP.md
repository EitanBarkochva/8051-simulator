# 8051 Simulator — הקמה ופריסה (Supabase)

סימולטור 8051 חינוכי, רב-משתמשים. Frontend סטטי (HTML/JS) + Supabase (PostgreSQL + Auth).

---

## חלק א' — חיבור Supabase (פעם אחת, ~5 דקות)

1. **צור פרויקט** ב-[supabase.com](https://supabase.com) (חינם).
2. **צור את הטבלאות:** Supabase → `SQL Editor` → הדבק את כל התוכן של [`schema.sql`](schema.sql) → `Run`.
3. **העתק את המפתחות:** Supabase → `Project Settings` → `API`:
   - `Project URL`
   - `anon public` key
4. **הדבק** אותם ב-[`js/db/config.js`](js/db/config.js):
   ```js
   window.SUPABASE_URL      = "https://xxxx.supabase.co";
   window.SUPABASE_ANON_KEY = "eyJ...";
   ```
5. **(מומלץ לכיתה)** Supabase → `Authentication` → `Providers` → `Email`:
   כבה את *Confirm email* כדי שתלמידים ייכנסו מיד בלי אימות מייל.
   להשארת אימות מייל — השאר דלוק.

> כל עוד `config.js` לא מולא, האתר רץ במצב **מקומי (localStorage)** לפיתוח —
> הנתונים נשמרים בדפדפן בלבד. ברגע שתמלא מפתחות, הוא עובר אוטומטית ל-Supabase.

### אבטחה
ה-`anon key` מיועד לחשיפה בצד-לקוח. ההגנה האמיתית היא **RLS** (Row-Level Security)
שמוגדר ב-`schema.sql`: כל תלמיד רואה/עורך **רק את הפרויקטים שלו**; תרגילים —
כולם קוראים, רק היוצר עורך. אל תחשוף לעולם את ה-`service_role` key.

---

## חלק א2' — כניסה עם Google (אופציונלי)

מסך הכניסה כולל כפתור **"המשך עם Google"**. כדי שיעבוד, הפעל את ה-provider:

1. **Google Cloud Console** → [console.cloud.google.com](https://console.cloud.google.com) →
   `APIs & Services` → `Credentials` → `Create Credentials` → **OAuth client ID** →
   Application type: **Web application**.
   - תחת **Authorized redirect URIs** הוסף בדיוק:
     ```
     https://zwsugffbnnejonltirkk.supabase.co/auth/v1/callback
     ```
   - שמור והעתק את **Client ID** ואת **Client Secret**.
   - (אם מתבקש "OAuth consent screen" — הגדר אותו: External, שם אפליקציה, אימייל.)
2. **Supabase** → `Authentication` → `Providers` → **Google** → הפעל →
   הדבק את ה-Client ID וה-Client Secret → **Save**.
3. **Supabase** → `Authentication` → `URL Configuration` → תחת **Redirect URLs** הוסף את
   כתובות האתר שלך (לפיתוח: `http://localhost:8080/**`, ובהמשך כתובת הפריסה).

מעתה לחיצה על "המשך עם Google" → מעבירה ל-Google → חוזרת לאתר מחובר. ✅

> כניסת Google **לא דורשת אימות מייל** — היא חלופה נוחה ל-Confirm email.

---

## חלק ב' — הרצה מקומית

האתר סטטי, צריך רק שרת קבצים:
```bash
# מתוך תיקיית הפרויקט:
python -m http.server 8080
#  → פתח http://localhost:8080
```
(או כל שרת סטטי אחר. פותחים מ-`index.html` → מפנה ל-login.)

---

## חלק ג' — פריסה לאוויר (לכל תלמידי הארץ)

ה-Frontend סטטי, אז כל אחסון סטטי חינמי מתאים. בחר אחד:

| שירות | איך |
|---|---|
| **Netlify** | גרור את התיקייה ל-[app.netlify.com/drop](https://app.netlify.com/drop) |
| **Vercel** | `vercel` ב-CLI, או חבר ריפו GitHub |
| **Cloudflare Pages** | חבר ריפו GitHub |
| **GitHub Pages** | העלה ריפו → Settings → Pages |

הנתונים והאימות יושבים ב-Supabase, אז אותו אתר משרת את כל המשתמשים.
חינמי עד אלפי תלמידים (Supabase free tier: 500MB DB, 50K משתמשים פעילים/חודש).

> אחרי פריסה: ב-Supabase → `Authentication` → `URL Configuration`,
> הוסף את כתובת האתר ל-*Site URL* / *Redirect URLs*.

---

## מבנה מסד הנתונים (`schema.sql`)
- `auth.users` — מנוהל ע"י Supabase (אימייל/סיסמה)
- `projects` — `id, user_id, name, data(jsonb), updated_at` — פרטי לכל משתמש (RLS)
- `exercises` — `id, author_id, title, instructions, starter_code, checks(jsonb), updated_at` — קריאה לכולם, עריכה ליוצר

## שכבת הקוד (החלפת backend נקייה)
`js/db/`: `config.js` (מפתחות) · `db.js` (לקוח + בחירת מצב) · `auth.js` ·
`projectService.js` · `exerciseService.js`. כל השירותים אסינכרוניים עם אותו ממשק
בשני המצבים (Supabase / localStorage), כך ששאר האפליקציה לא יודעת מי ה-backend.
