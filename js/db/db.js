/* ============================================================
 * db.js — אתחול לקוח Supabase + קביעת מצב עבודה
 * mode === "supabase"  → עובדים מול הענן (config.js מולא)
 * mode === "local"     → fallback ל-localStorage (לפיתוח / אם אין מפתחות)
 *
 * תלוי בספריית @supabase/supabase-js שנטענת מ-CDN לפני קובץ זה
 * (חושפת את window.supabase עם createClient).
 * ============================================================ */
window.DB = (function () {
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;

  const configured =
    typeof url === "string" && url.startsWith("http") &&
    typeof key === "string" && key.length > 20 &&
    url !== "YOUR_SUPABASE_URL";

  let client = null;
  let mode = "local";

  if (configured && window.supabase && typeof window.supabase.createClient === "function") {
    client = window.supabase.createClient(url, key);
    mode = "supabase";
  } else if (configured) {
    console.warn("[DB] Supabase מוגדר אך הספרייה לא נטענה (CDN חסום?) — חוזר ל-localStorage");
  } else {
    console.info("[DB] מצב מקומי (localStorage). מלא את js/db/config.js כדי להתחבר ל-Supabase.");
  }

  return { client, mode, isSupabase: mode === "supabase" };
})();
