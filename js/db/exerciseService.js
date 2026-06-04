/* ============================================================
 * exerciseService.js — תרגילי מורה (אסינכרוני)
 * מצב Supabase: טבלת public.exercises — כל מחובר קורא, רק היוצר עורך.
 * אחרת — fallback ל-localStorage.
 * רשומה לוגית: { id, title, instructions, starterCode, checks[], updatedAt }
 * ============================================================ */
window.ExerciseService = (function () {
  const KEY = "sim8051.exercises";

  /* ---------- localStorage ---------- */
  const local = {
    _all() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    _persist(o) { localStorage.setItem(KEY, JSON.stringify(o)); },
    _id() { return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    async list() {
      return Object.values(this._all()).sort((a, b) => b.updatedAt - a.updatedAt)
        .map((e) => ({ id: e.id, title: e.title, updatedAt: e.updatedAt, checks: (e.checks || []).length }));
    },
    async get(id) { return this._all()[id] || null; },
    async save(ex) {
      const all = this._all();
      const id = ex.id || this._id();
      all[id] = {
        id, title: ex.title || "תרגיל ללא שם", instructions: ex.instructions || "",
        starterCode: ex.starterCode || "", checks: ex.checks || [], updatedAt: Date.now(),
      };
      this._persist(all);
      return id;
    },
    async remove(id) { const all = this._all(); delete all[id]; this._persist(all); },
  };

  /* ---------- Supabase ---------- */
  const cloud = {
    async list() {
      const { data, error } = await DB.client
        .from("exercises").select("id,title,updated_at,checks").order("updated_at", { ascending: false });
      if (error) throw error;
      return data.map((r) => ({ id: r.id, title: r.title, updatedAt: new Date(r.updated_at).getTime(), checks: (r.checks || []).length }));
    },
    async get(id) {
      const { data, error } = await DB.client
        .from("exercises").select("*").eq("id", id).single();
      if (error) return null;
      return { id: data.id, title: data.title, instructions: data.instructions, starterCode: data.starter_code, checks: data.checks || [], updatedAt: new Date(data.updated_at).getTime() };
    },
    async save(ex) {
      const row = {
        title: ex.title || "תרגיל ללא שם", instructions: ex.instructions || "",
        starter_code: ex.starterCode || "", checks: ex.checks || [], updated_at: new Date().toISOString(),
      };
      if (ex.id) {
        const { error } = await DB.client.from("exercises").update(row).eq("id", ex.id);
        if (error) throw error;
        return ex.id;
      }
      const { data, error } = await DB.client.from("exercises").insert(row).select("id").single();
      if (error) throw error;
      return data.id;
    },
    async remove(id) {
      const { error } = await DB.client.from("exercises").delete().eq("id", id);
      if (error) throw error;
    },
  };

  const impl = () => (DB.isSupabase ? cloud : local);
  return {
    list:   ()  => impl().list(),
    get:    (id) => impl().get(id),
    save:   (ex) => impl().save(ex),
    remove: (id) => impl().remove(id),
  };
})();
