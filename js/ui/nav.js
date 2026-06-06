/* ============================================================
 * nav.js — תפריט ראשי משותף לכל עמודי האתר
 * מוסיף סרגל ניווט עליון ומסמן את העמוד הפעיל.
 * שימוש: <div id="site-nav"></div> או פשוט טען את הקובץ —
 * הוא יזריק את הסרגל לראש ה-<body>.
 * ============================================================ */
(function () {
  const LINKS = [
    { href: "home.html",      label: "דף ראשי" },
    { href: "simulator.html", label: "סימולציה" },
    { href: "learn.html",     label: "חומר לימודי" },
    { href: "clang.html",     label: "שפת C" },
    { href: "registers.html", label: "רגיסטרים" },
    { href: "exercises.html", label: "תרגילים" },
    { href: "classes.html",   label: "כיתות (מורה)" },
    { href: "login.html",     label: "התחברות", cta: true },
  ];

  const current = (location.pathname.split("/").pop() || "home.html").toLowerCase();

  const menu = LINKS.map((l) => {
    const cls = [];
    if (l.href.toLowerCase() === current) cls.push("active");
    else if (l.cta) cls.push("cta");
    return `<a href="${l.href}"${cls.length ? ` class="${cls.join(" ")}"` : ""}>${l.label}</a>`;
  }).join("");

  const nav = document.createElement("header");
  nav.className = "site-nav";
  nav.innerHTML =
    `<a class="site-brand" href="home.html"><span class="bolt">⚡</span><span>סימולטור 8051</span></a>` +
    `<nav class="site-menu">${menu}</nav>`;

  // מזריק לתוך אלמנט #site-nav אם קיים, אחרת לראש ה-body
  const mount = document.getElementById("site-nav");
  if (mount) mount.replaceWith(nav);
  else document.body.insertBefore(nav, document.body.firstChild);
})();
