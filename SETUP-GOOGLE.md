# הפעלת כניסה עם Google (OAuth)

הכפתור "המשך עם Google" כבר ממומש בקוד. אם מופיעה השגיאה
**`Unsupported provider: provider is not enabled`** — זו בעיית הגדרות בלבד:
צריך להפעיל את Google ב-Supabase ולחבר אותו ל-Google Cloud.

> כתובת הפרויקט שלך ב-Supabase: `https://zwsugffbnnejonltirkk.supabase.co`
> **כתובת ה-callback להעתקה:**
> ```
> https://zwsugffbnnejonltirkk.supabase.co/auth/v1/callback
> ```

---

## 1️⃣ Google Cloud — יצירת אישורי OAuth

1. היכנס ל-[console.cloud.google.com](https://console.cloud.google.com)
2. למעלה — צור/בחר **פרויקט** (Project)
3. **APIs & Services → OAuth consent screen**:
   - **User Type**: External → Create
   - מלא: שם האפליקציה (למשל "סימולטור 8051"), אימייל תמיכה, אימייל מפתח → שמור עד הסוף
   - אם זה במצב **Testing** — הוסף את האימייל שלך תחת **Test users**, או לחץ **Publish app**
     (אחרת רק משתמשי-בדיקה יוכלו להתחבר)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - **Application type**: Web application
   - **Authorized JavaScript origins** — הכתובות שמהן רץ האתר, למשל:
     - `http://localhost:8083` (פיתוח)
     - הדומיין של האתר כשתעלה אותו (Netlify / Vercel וכו')
   - **Authorized redirect URIs** — הדבק בדיוק:
     ```
     https://zwsugffbnnejonltirkk.supabase.co/auth/v1/callback
     ```
   - **Create** → העתק את ה-**Client ID** ואת ה-**Client Secret**

---

## 2️⃣ Supabase — הפעלת ספק Google

1. [supabase.com](https://supabase.com) → הפרויקט שלך
2. **Authentication → Providers → Google**
3. הפעל את **Enable Sign in with Google**
4. הדבק את ה-**Client ID** וה-**Client Secret** מ-Google
5. **Save**

*(זה בדיוק מה שמתקן את השגיאה "provider is not enabled")*

---

## 3️⃣ Supabase — כתובות חזרה (Redirect)

1. **Authentication → URL Configuration**
2. **Site URL**: הכתובת הראשית של האתר
   (בפיתוח: `http://localhost:8083`, ובהמשך הדומיין האמיתי)
3. **Redirect URLs** — הוסף:
   ```
   http://localhost:*/**
   ```
   וכן את הדומיין שלך כשתעלה, למשל `https://your-site.netlify.app/**`

> הקוד מחזיר את המשתמש אחרי הכניסה אל `dashboard.html`, ולכן הכתובת הזו
> חייבת להיות מכוסה ע"י ה-Redirect URLs (התבנית `http://localhost:*/**` מכסה כל פורט).

---

## ✅ בדיקה

אחרי שמירת כל ההגדרות — רענן את דף הכניסה (Ctrl+Shift+R) ולחץ **"המשך עם Google"**.
אתה אמור להגיע למסך הבחירה של גוגל ולחזור מחובר ישירות לדשבורד.

### פתרון תקלות

| הודעה | הסיבה והפתרון |
|---|---|
| `provider is not enabled` | שלב 2 לא נשמר — Google לא מופעל ב-Supabase |
| `redirect_uri_mismatch` (אצל גוגל) | ה-callback בשלב 1 לא תואם — ודא `https://zwsugffbnnejonltirkk.supabase.co/auth/v1/callback` |
| חוזר ל-login בלי להתחבר | הכתובת חסרה ב-Redirect URLs (שלב 3) |
| `Access blocked` / `app not verified` | האפליקציה ב-Testing — הוסף את עצמך כ-Test user או Publish (שלב 1.3) |

---

## הערה על אבטחה

ה-**anon / publishable key** שב-`js/db/config.js` מיועד לחשיפה בצד-לקוח — האבטחה
מתבצעת דרך ה-RLS שב-`schema.sql`. אין צורך להסתיר אותו. את ה-**Client Secret** של
Google מזינים רק ב-Supabase (שלב 2) — הוא לא נשמר בקוד הצד-לקוח.
