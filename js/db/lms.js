/* ============================================================
 * lms.js — שירותי מערכת ניהול הלמידה (Supabase בלבד)
 * כיתות, מטלות, הגשות, ציונים, פרופילים. כל הפונקציות אסינכרוניות.
 * דורש DB.isSupabase === true (במצב מקומי הפיצ'רים הללו אינם פעילים).
 * ============================================================ */
window.LMS = (function () {
  const sb = () => DB.client;
  async function uid() { const { data } = await sb().auth.getUser(); return data.user ? data.user.id : null; }
  function guard() { if (!DB.isSupabase) throw new Error("פיצ'רי הכיתות דורשים חיבור ל-Supabase"); }

  /* ---------- פרופילים ---------- */
  const Profiles = {
    async me() {
      guard();
      const id = await uid(); if (!id) return null;
      const { data, error } = await sb().from("profiles").select("*").eq("id", id).single();
      if (error) return null;
      return data;
    },
    async updateName(full_name) {
      guard();
      const { error } = await sb().from("profiles").update({ full_name }).eq("id", await uid());
      if (error) throw error;
    },
    async isTeacher() { const p = await this.me(); return !!p && (p.role === "teacher" || p.role === "admin"); },
    async isAdmin()   { const p = await this.me(); return !!p && p.role === "admin"; },

    /* --- ניהול אדמין --- */
    async listAll() {
      guard();
      const { data, error } = await sb().from("profiles")
        .select("id, full_name, email, role, created_at").order("role").order("full_name");
      if (error) throw error;
      return data;
    },
    async setRole(userId, role) {
      guard();
      const { error } = await sb().from("profiles").update({ role }).eq("id", userId);
      if (error) throw error;
    },
  };

  /* ---------- כיתות ---------- */
  const Classes = {
    async create(name) {
      guard();
      const { data, error } = await sb().from("classes")
        .insert({ name, teacher_id: await uid() }).select("*").single();
      if (error) throw error;
      return data;
    },
    async listMine() {
      guard();
      const { data, error } = await sb().from("classes")
        .select("*").eq("teacher_id", await uid()).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    async members(classId) {
      guard();
      const { data, error } = await sb().from("class_members")
        .select("student_id, joined_at, profiles:student_id (full_name)").eq("class_id", classId);
      if (error) throw error;
      return data.map((m) => ({ id: m.student_id, name: (m.profiles && m.profiles.full_name) || "(ללא שם)", joinedAt: m.joined_at }));
    },
    async myEnrolled() {   // לכיתות שהתלמיד חבר בהן
      guard();
      const { data, error } = await sb().from("class_members")
        .select("class_id, classes:class_id (id, name, teacher_id)").eq("student_id", await uid());
      if (error) throw error;
      return data.map((r) => r.classes).filter(Boolean);
    },
    async join(code) {
      guard();
      const { data, error } = await sb().rpc("join_class", { p_code: code });
      if (error) throw error;
      return data;   // class id
    },
    /** המורה מוסיף תלמיד לכיתתו לפי אימייל (דרך RPC מאובטח) */
    async addStudent(classId, email) {
      guard();
      const { data, error } = await sb().rpc("add_student_to_class", { p_class_id: classId, p_email: email });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? { id: row.id, name: row.full_name || "(ללא שם)", email: row.email } : null;
    },
    /** המורה מסיר תלמיד מהכיתה */
    async removeStudent(classId, studentId) {
      guard();
      const { error } = await sb().from("class_members")
        .delete().eq("class_id", classId).eq("student_id", studentId);
      if (error) throw error;
    },
  };

  /* ---------- מטלות ---------- */
  const Assignments = {
    async create({ classId, exerciseId, title, dueAt, maxScore }) {
      guard();
      const { data, error } = await sb().from("assignments").insert({
        class_id: classId, exercise_id: exerciseId, title: title || "",
        due_at: dueAt || null, max_score: maxScore || 100, created_by: await uid(),
      }).select("*").single();
      if (error) throw error;
      return data;
    },
    async listForClass(classId) {
      guard();
      const { data, error } = await sb().from("assignments")
        .select("*, exercises:exercise_id (title)").eq("class_id", classId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    async listForStudent() {
      guard();
      const { data, error } = await sb().from("assignments")
        .select("*, classes:class_id (name), exercises:exercise_id (title)").order("due_at", { ascending: true });
      if (error) throw error;
      return data;   // RLS מחזיר רק מטלות של כיתות שהתלמיד בהן
    },
    async get(id) {
      guard();
      const { data, error } = await sb().from("assignments")
        .select("*, exercises:exercise_id (*)").eq("id", id).single();
      if (error) return null;
      return data;
    },
  };

  /* ---------- הגשות ---------- */
  const Submissions = {
    async submit(assignmentId, { code, circuit, passed, total }) {
      guard();
      const auto = total > 0 ? Math.round((passed / total) * 100) : 0;
      const { data, error } = await sb().from("submissions").upsert({
        assignment_id: assignmentId, student_id: await uid(),
        code, circuit: circuit || {}, passed_checks: passed, total_checks: total,
        auto_score: auto, status: "submitted", submitted_at: new Date().toISOString(),
      }, { onConflict: "assignment_id,student_id" }).select("*").single();
      if (error) throw error;
      return data;
    },
    async listForAssignment(assignmentId) {
      guard();
      const { data, error } = await sb().from("submissions")
        .select("*, profiles:student_id (full_name)").eq("assignment_id", assignmentId);
      if (error) throw error;
      return data.map((s) => ({
        studentId: s.student_id, name: (s.profiles && s.profiles.full_name) || "(ללא שם)",
        passed: s.passed_checks, total: s.total_checks, autoScore: s.auto_score,
        status: s.status, submittedAt: s.submitted_at,
      }));
    },
    async mine(assignmentId) {
      guard();
      const { data } = await sb().from("submissions")
        .select("*").eq("assignment_id", assignmentId).eq("student_id", await uid()).maybeSingle();
      return data || null;
    },
  };

  /* ---------- ציונים (לוח ציונים מלא) ---------- */
  const Grades = {
    // מאחד הגשות + ציונים רשמיים לשורה אחת לכל תלמיד
    async gradebook(assignmentId) {
      guard();
      const subs = await sb().from("submissions")
        .select("id, student_id, passed_checks, total_checks, auto_score, submitted_at, profiles:student_id (full_name)")
        .eq("assignment_id", assignmentId);
      if (subs.error) throw subs.error;
      const grd = await sb().from("grades")
        .select("submission_id, score, feedback").eq("assignment_id", assignmentId);
      const gmap = {};
      (grd.data || []).forEach((g) => { gmap[g.submission_id] = g; });
      return (subs.data || []).map((s) => {
        const g = gmap[s.id] || {};
        return {
          submissionId: s.id, studentId: s.student_id,
          name: (s.profiles && s.profiles.full_name) || "(ללא שם)",
          passed: s.passed_checks, total: s.total_checks, autoScore: s.auto_score,
          score: g.score != null ? Number(g.score) : null, feedback: g.feedback || "",
          submittedAt: s.submitted_at,
        };
      });
    },
    async save({ submissionId, assignmentId, studentId, score, feedback }) {
      guard();
      const { error } = await sb().from("grades").upsert({
        submission_id: submissionId, assignment_id: assignmentId, student_id: studentId,
        score: score === "" || score == null ? null : Number(score), feedback: feedback || "",
        graded_by: await uid(), graded_at: new Date().toISOString(),
      }, { onConflict: "submission_id" });
      if (error) throw error;
    },
  };

  /* ---------- עוזרים טהורים (לסטטיסטיקה / ייצוא — ניתנים לבדיקה) ---------- */
  function gradebookStats(rows) {
    const submitted = rows.length;
    const effective = rows.map((r) => (r.score != null ? r.score : r.autoScore) || 0);
    const avg = effective.length ? Math.round(effective.reduce((a, b) => a + (+b || 0), 0) / effective.length) : 0;
    const fullPass = rows.filter((r) => r.total > 0 && r.passed === r.total).length;
    return { submitted, avg, fullPass };
  }
  function csvCell(s) {
    s = String(s == null ? "" : s);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function gradebookCsv(rows) {
    const head = ["שם", "בדיקות", "ציון אוטומטי", "ציון רשמי", "משוב", "הוגש"];
    const lines = [head.join(",")].concat(rows.map((r) => [
      csvCell(r.name), `${r.passed}/${r.total}`, r.autoScore,
      r.score != null ? r.score : "", csvCell(r.feedback),
      r.submittedAt ? new Date(r.submittedAt).toLocaleString("he-IL") : "",
    ].join(",")));
    return "﻿" + lines.join("\n");   // BOM כדי ש-Excel יציג עברית נכון
  }

  return { Profiles, Classes, Assignments, Submissions, Grades, gradebookStats, gradebookCsv };
})();

