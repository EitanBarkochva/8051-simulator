/* ============================================================
 * projectService.js — שמירה/טעינה של פרויקטים
 * אסינכרוני. במצב Supabase עובד מול טבלת public.projects (עם RLS,
 * כך שכל משתמש רואה רק את שלו). אחרת — fallback ל-localStorage.
 * רשומה לוגית: { id, name, updatedAt, data:{code,components,wires} }
 * ============================================================ */
window.ProjectService = (function () {
  const KEY = "sim8051.projects";

  /* ---------- localStorage ---------- */
  const local = {
    _all() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    _persist(o) { localStorage.setItem(KEY, JSON.stringify(o)); },
    _id() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    async list() {
      return Object.values(this._all()).sort((a, b) => b.updatedAt - a.updatedAt)
        .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }));
    },
    async get(id) { return this._all()[id] || null; },
    async save(p) {
      const all = this._all();
      const id = p.id || this._id();
      all[id] = { id, name: p.name || "פרויקט ללא שם", data: p.data || {}, updatedAt: Date.now() };
      this._persist(all);
      return id;
    },
    async remove(id) { const all = this._all(); delete all[id]; this._persist(all); },
  };

  /* ---------- Supabase ---------- */
  const cloud = {
    async list() {
      const { data, error } = await DB.client
        .from("projects").select("id,name,updated_at").order("updated_at", { ascending: false });
      if (error) throw error;
      return data.map((r) => ({ id: r.id, name: r.name, updatedAt: new Date(r.updated_at).getTime() }));
    },
    async get(id) {
      const { data, error } = await DB.client
        .from("projects").select("id,name,data,updated_at").eq("id", id).single();
      if (error) return null;
      return { id: data.id, name: data.name, data: data.data, updatedAt: new Date(data.updated_at).getTime() };
    },
    async save(p) {
      const row = { name: p.name || "פרויקט ללא שם", data: p.data || {}, updated_at: new Date().toISOString() };
      if (p.id) {
        const { error } = await DB.client.from("projects").update(row).eq("id", p.id);
        if (error) throw error;
        return p.id;
      }
      const { data, error } = await DB.client.from("projects").insert(row).select("id").single();
      if (error) throw error;
      return data.id;
    },
    async remove(id) {
      const { error } = await DB.client.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
  };

  const impl = () => (DB.isSupabase ? cloud : local);
  return {
    list:   ()  => impl().list(),
    get:    (id) => impl().get(id),
    save:   (p)  => impl().save(p),
    remove: (id) => impl().remove(id),
  };
})();
