/* ============================================================
 * auth.js — הרשמה / כניסה / יציאה (Supabase Auth)
 * במצב מקומי (ללא מפתחות) מדמה משתמש יחיד כדי שהאתר ירוץ בפיתוח.
 * ============================================================ */
window.Auth = (function () {
  const LOCAL_USER = { id: "local-user", email: "מקומי (פיתוח)" };

  async function signUp(email, password, fullName) {
    if (!DB.isSupabase) return { user: LOCAL_USER, error: null };
    // full_name נשמר ב-user_metadata; הטריגר handle_new_user מעתיק אותו ל-profiles
    const { data, error } = await DB.client.auth.signUp({
      email, password, options: { data: { full_name: (fullName || "").trim() } },
    });
    if (error) return { error: error.message };
    // אם אישור-מייל מופעל, אין session עד אישור
    return { user: data.user, needsConfirm: !data.session };
  }

  async function signIn(email, password) {
    if (!DB.isSupabase) return { user: LOCAL_USER, error: null };
    const { data, error } = await DB.client.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { user: data.user };
  }

  /** כניסה/הרשמה דרך חשבון Google (OAuth). הדפדפן יופנה ל-Google ובחזרה. */
  async function signInWithGoogle() {
    if (!DB.isSupabase) { location.href = "dashboard.html"; return { ok: true }; }
    const redirectTo = new URL("dashboard.html", location.href).href;  // חזרה ישירה לדשבורד אחרי הכניסה
    const { error } = await DB.client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) return { error: error.message };
    return { ok: true };   // הדפדפן עומד לעבור ל-Google
  }

  async function signOut() {
    if (DB.isSupabase) await DB.client.auth.signOut();
    location.href = "login.html";
  }

  /** מחזיר את המשתמש הנוכחי או null */
  async function getUser() {
    if (!DB.isSupabase) return LOCAL_USER;
    const { data } = await DB.client.auth.getUser();
    return data.user || null;
  }

  /** מוודא שיש משתמש מחובר; אחרת מפנה ל-login. מחזיר את המשתמש. */
  async function requireAuth() {
    const user = await getUser();
    if (!user) { location.href = "login.html"; return null; }
    return user;
  }

  return { signUp, signIn, signInWithGoogle, signOut, getUser, requireAuth };
})();
