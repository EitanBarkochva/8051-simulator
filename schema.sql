-- ============================================================
-- schema.sql — מסד נתונים מלא ל-8051 Simulator (Supabase / PostgreSQL)
-- מערכת ניהול למידה (LMS) ארצית: תלמידים, מורים, כיתות, מטלות, הגשות, ציונים.
-- הרצה: Supabase → SQL Editor → הדבק הכל → Run.  (בטוח להרצה חוזרת / idempotent)
--
-- מודל: המשתמשים יושבים ב-auth.users של Supabase; profiles מרחיב אותם עם role.
-- אבטחה: RLS על כל הטבלאות + פונקציות עזר SECURITY DEFINER (מונע רקורסיה).
-- ============================================================

-- ---------- תפקידים ----------
do $$ begin
  create type public.user_role as enum ('student','teacher','admin');
exception when duplicate_object then null; end $$;

-- ============================================================
--  טבלאות בסיס
-- ============================================================

-- בתי ספר / מוסדות
create table if not exists public.schools (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- פרופיל לכל משתמש (מורחב מ-auth.users) — מחזיק את התפקיד
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text default '',
  email      text,
  role       public.user_role not null default 'student',
  school_id  uuid references public.schools (id) on delete set null,
  created_at timestamptz not null default now()
);
-- למסדים שכבר נוצרו ללא העמודה:
alter table public.profiles add column if not exists email text;

-- כיתות / קבוצות לימוד (בניהול מורה)
create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  school_id  uuid references public.schools (id) on delete set null,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  join_code  text unique default substr(md5(random()::text), 1, 6),  -- קוד הצטרפות לכיתה
  created_at timestamptz not null default now()
);

-- שיוך תלמידים לכיתות (רבים-לרבים)
create table if not exists public.class_members (
  class_id   uuid references public.classes (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (class_id, student_id)
);

-- פרויקטים אישיים (ארגז חול של התלמיד) — בשימוש האפליקציה
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name       text not null default 'פרויקט ללא שם',
  data       jsonb not null default '{}'::jsonb,   -- { code, components, wires }
  updated_at timestamptz not null default now()
);

-- תרגילים (בנק התרגילים, נכתבים ע"י מורים) — בשימוש האפליקציה
create table if not exists public.exercises (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title        text not null default 'תרגיל ללא שם',
  instructions text default '',
  starter_code text default '',
  checks       jsonb not null default '[]'::jsonb,
  difficulty   smallint default 1,                 -- 1=קל .. 5=קשה
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- מטלות: תרגיל שהוקצה לכיתה עם דדליין
create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  title       text not null default '',
  due_at      timestamptz,
  max_score   int not null default 100,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- הגשות: פתרון תלמיד למטלה (כולל תוצאת הבדיקה האוטומטית)
create table if not exists public.submissions (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments (id) on delete cascade,
  student_id     uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  code           text default '',
  circuit        jsonb default '{}'::jsonb,   -- { components, wires }
  passed_checks  int default 0,
  total_checks   int default 0,
  auto_score     int default 0,               -- ציון אוטומטי 0-100
  status         text not null default 'submitted',  -- submitted | graded
  submitted_at   timestamptz not null default now(),
  unique (assignment_id, student_id)          -- הגשה אחת לכל תלמיד למטלה (upsert)
);

-- ציונים: ציון רשמי (אוטומטי או ידני ע"י מורה, עם משוב)
create table if not exists public.grades (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid unique references public.submissions (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  score         numeric(5,2),
  feedback      text default '',
  graded_by     uuid references public.profiles (id) on delete set null,
  graded_at     timestamptz not null default now()
);

-- אינדקסים לביצועים
create index if not exists idx_projects_user      on public.projects (user_id, updated_at desc);
create index if not exists idx_exercises_author   on public.exercises (author_id, updated_at desc);
create index if not exists idx_classmembers_stud  on public.class_members (student_id);
create index if not exists idx_assignments_class  on public.assignments (class_id, due_at);
create index if not exists idx_submissions_assign on public.submissions (assignment_id);
create index if not exists idx_grades_student     on public.grades (student_id);

-- ============================================================
--  פונקציות עזר ל-RLS (SECURITY DEFINER — מונע רקורסיית מדיניות)
-- ============================================================
create or replace function public.is_teacher() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher','admin'));
$$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.teaches_class(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes where id = cid and teacher_id = auth.uid());
$$;

create or replace function public.is_enrolled(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_members where class_id = cid and student_id = auth.uid());
$$;

create or replace function public.teaches_assignment(aid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assignments a join public.classes c on c.id = a.class_id
    where a.id = aid and c.teacher_id = auth.uid());
$$;

-- מי רשאי לראות פרופיל מסוים: הוא עצמו / אדמין / מורה שמלמד כיתה שהתלמיד חבר בה
create or replace function public.can_view_profile(target uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select
    target = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.class_members cm
      join public.classes c on c.id = cm.class_id
      where cm.student_id = target and c.teacher_id = auth.uid()
    );
$$;

-- ============================================================
--  טריגרים: יצירת פרופיל אוטומטית + נעילת שינוי תפקיד
-- ============================================================
-- כל הרשמה ב-Auth → יוצרת שורת profiles
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email, 'student')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- מונע מתלמיד לשנות לעצמו role (רק admin רשאי)
create or replace function public.lock_role_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.role <> old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end $$;

drop trigger if exists profiles_lock_role on public.profiles;
create trigger profiles_lock_role
  before update on public.profiles for each row execute function public.lock_role_change();

-- ============================================================
--  הפעלת RLS
-- ============================================================
alter table public.schools       enable row level security;
alter table public.profiles      enable row level security;
alter table public.classes       enable row level security;
alter table public.class_members enable row level security;
alter table public.projects      enable row level security;
alter table public.exercises     enable row level security;
alter table public.assignments   enable row level security;
alter table public.submissions   enable row level security;
alter table public.grades        enable row level security;

-- מנקה מדיניות קודמת (idempotent) ויוצר מחדש
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ---- schools: כולם המחוברים קוראים; אדמין כותב ----
create policy schools_read   on public.schools for select using (auth.role() = 'authenticated');
create policy schools_admin  on public.schools for all using (public.is_admin()) with check (public.is_admin());

-- ---- profiles: קריאה מוגבלת (פרטיות) — עצמך / מורה-של-התלמיד / אדמין ----
create policy profiles_read        on public.profiles for select using (public.can_view_profile(id));
create policy profiles_update_own  on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert_own  on public.profiles for insert with check (id = auth.uid());
create policy profiles_admin_all   on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- ---- projects: כל אחד רק את שלו ----
create policy projects_owner on public.projects for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- exercises: כל מחובר קורא; רק היוצר עורך ----
create policy exercises_read       on public.exercises for select using (auth.role() = 'authenticated');
create policy exercises_author_ins on public.exercises for insert with check (auth.uid() = author_id and public.is_teacher());
create policy exercises_author_upd on public.exercises for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy exercises_author_del on public.exercises for delete using (auth.uid() = author_id);

-- ---- classes: מורה מנהל את שלו; תלמיד רואה כיתות שהוא בהן ----
create policy classes_view   on public.classes for select
  using (teacher_id = auth.uid() or public.is_enrolled(id) or public.is_admin());
create policy classes_manage on public.classes for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid() and public.is_teacher());

-- ---- class_members: תלמיד רואה את שלו; מורה הכיתה מנהל ----
create policy cm_view   on public.class_members for select
  using (student_id = auth.uid() or public.teaches_class(class_id) or public.is_admin());
create policy cm_manage on public.class_members for all
  using (public.teaches_class(class_id)) with check (public.teaches_class(class_id));

-- ---- assignments: מורה הכיתה מנהל; תלמידי הכיתה קוראים ----
create policy assign_view   on public.assignments for select
  using (public.teaches_class(class_id) or public.is_enrolled(class_id));
create policy assign_manage on public.assignments for all
  using (public.teaches_class(class_id)) with check (public.teaches_class(class_id));

-- ---- submissions: תלמיד מנהל את שלו; מורה המטלה קורא ----
create policy sub_student on public.submissions for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy sub_teacher_read on public.submissions for select
  using (public.teaches_assignment(assignment_id));

-- ---- grades: תלמיד קורא את שלו; מורה המטלה כותב/קורא ----
create policy grades_student_read on public.grades for select
  using (student_id = auth.uid() or public.teaches_assignment(assignment_id));
create policy grades_teacher_manage on public.grades for all
  using (public.teaches_assignment(assignment_id)) with check (public.teaches_assignment(assignment_id));

-- ============================================================
--  RPC: הצטרפות תלמיד לכיתה דרך קוד (SECURITY DEFINER — עוקף RLS בבטחה)
-- ============================================================
create or replace function public.join_class(p_code text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select id into cid from public.classes where join_code = lower(trim(p_code));
  if cid is null then raise exception 'קוד כיתה לא קיים'; end if;
  insert into public.class_members (class_id, student_id)
    values (cid, auth.uid()) on conflict do nothing;
  return cid;
end $$;

-- ============================================================
--  VIEWS נוחות: "טבלת תלמידים" ו"טבלת מורים"
--  (security_invoker → ה-RLS של profiles חל גם דרך ה-view)
-- ============================================================
create or replace view public.students with (security_invoker = true) as
  select id, full_name, school_id, created_at from public.profiles where role = 'student';

create or replace view public.teachers with (security_invoker = true) as
  select id, full_name, school_id, created_at from public.profiles where role = 'teacher';

-- מילוי אימייל לפרופילים קיימים (משתמשים שנרשמו לפני הוספת העמודה)
update public.profiles p set email = u.email
  from auth.users u where u.id = p.id and p.email is null;

-- ============================================================
--  סיום. (כדי להפוך משתמש למורה, ראה הוראות ב-SETUP / בהודעה)
-- ============================================================
