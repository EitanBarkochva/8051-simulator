/* ============================================================
 * wiring.js — ציור חוטים בין פיני ה-MCU לטרמינלים של רכיבים
 * אינטראקציה: לוחצים על פין → לוחצים על טרמינל (או הפוך) → נוצר חוט.
 * החוט קובע את comp.source, ולכן את מצב הרכיב. Esc / לחיצה בריק = ביטול.
 * לחיצה על חוט קיים מוחקת אותו.
 * ============================================================ */
window.Wiring = (function () {

  const SVGNS = "http://www.w3.org/2000/svg";
  let canvasEl = null;
  let svg = null;
  let preview = null;        // קו תצוגה מקדימה בזמן חיבור
  let pending = null;        // הקצה הראשון שנבחר: { kind, port, bit, compId, el }
  const wires = [];          // { id, port, bit, compId }
  let seq = 0;

  function init(el) {
    canvasEl = el;

    svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "wires");
    canvasEl.appendChild(svg);

    // האזנה מרוכזת ללחיצות על פינים / טרמינלים
    canvasEl.addEventListener("click", onCanvasClick);
    canvasEl.addEventListener("mousemove", onMouseMove);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cancel(); });
  }

  function onCanvasClick(e) {
    const pin = e.target.closest(".pin");
    const term = e.target.closest(".terminal");

    if (pin) {
      handleEndpoint({ kind: "pin", port: pin.dataset.port, bit: +pin.dataset.bit, el: pin });
      return;
    }
    if (term) {
      handleEndpoint({ kind: "terminal", compId: +term.dataset.comp, el: term });
      return;
    }
    // לחיצה בריק → ביטול חיבור פעיל
    if (pending) cancel();
  }

  /** בחירת קצה: צריך פין אחד + טרמינל אחד כדי לסגור חוט */
  function handleEndpoint(ep) {
    if (!pending) { startPending(ep); return; }
    if (pending.kind === ep.kind) { startPending(ep); return; }  // אותו סוג → החלף בחירה

    const pinSide  = pending.kind === "pin" ? pending : ep;
    const termSide = pending.kind === "terminal" ? pending : ep;
    connect(pinSide, termSide);
    cancel();
  }

  function startPending(ep) {
    cancel();
    pending = ep;
    ep.el.classList.add("wiring-active");
  }

  function cancel() {
    if (pending) pending.el.classList.remove("wiring-active");
    pending = null;
    if (preview) { preview.remove(); preview = null; }
  }

  /** יצירת חוט בין פין לטרמינל */
  function connect(pinSide, termSide) {
    const comp = Components.get(termSide.compId);
    if (!comp) return;

    // טרמינל של LED מחזיק חוט אחד — החלף אם כבר קיים
    removeWiresForComp(comp.id);

    comp.source = { port: pinSide.port, bit: pinSide.bit };
    wires.push({ id: ++seq, port: pinSide.port, bit: pinSide.bit, compId: comp.id });

    Components.assertInput(comp);   // רכיב-קלט (פוטנציומטר) מזין מיד את הפורט
    redraw();
    Canvas.refresh(comp);
  }

  /** ---- שמירה/טעינה ---- */
  function serialize() {
    return wires.map((w) => ({ port: w.port, bit: w.bit, compId: w.compId }));
  }
  function clear() {
    wires.length = 0;
    if (svg) [...svg.querySelectorAll("line.wire")].forEach((l) => l.remove());
  }
  /** הוספת חוט מנתונים שמורים (קושר פין↔רכיב לפי id) */
  function addWire(port, bit, compId) {
    const comp = Components.get(compId);
    if (!comp) return;
    removeWiresForComp(compId);
    comp.source = { port, bit };
    wires.push({ id: ++seq, port, bit, compId });
  }

  function removeWiresForComp(compId) {
    for (let i = wires.length - 1; i >= 0; i--) {
      if (wires[i].compId === compId) wires.splice(i, 1);
    }
    const comp = Components.get(compId);
    if (comp) comp.source = null;
  }

  /** מרכז אלמנט יחסית לקנבס */
  function center(el) {
    const r = el.getBoundingClientRect();
    const c = canvasEl.getBoundingClientRect();
    return { x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height / 2 };
  }

  function pinEl(port, bit) {
    return canvasEl.querySelector(`.pin[data-port="${port}"][data-bit="${bit}"]`);
  }
  function termEl(compId) {
    return canvasEl.querySelector(`.terminal[data-comp="${compId}"]`);
  }

  /** ציור מחדש של כל החוטים (גם אחרי הזזת רכיב) */
  function redraw() {
    if (!svg) return;
    // נקה הכל פרט לקו התצוגה המקדימה
    [...svg.querySelectorAll("line.wire")].forEach((l) => l.remove());

    // הסר חוטים שאיבדו קצה (רכיב נמחק)
    for (let i = wires.length - 1; i >= 0; i--) {
      if (!Components.get(wires[i].compId)) wires.splice(i, 1);
    }

    wires.forEach((w) => {
      const p = pinEl(w.port, w.bit);
      const t = termEl(w.compId);
      if (!p || !t) return;
      const a = center(p), b = center(t);
      const line = document.createElementNS(SVGNS, "line");
      line.setAttribute("class", "wire");
      line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
      const on = Registers.getBit(w.port, w.bit) === 1;
      line.classList.toggle("hot", on);
      line.addEventListener("click", (e) => {
        e.stopPropagation();
        removeWiresForComp(w.compId);
        redraw();
        const comp = Components.get(w.compId);
        if (comp) Canvas.refresh(comp);
      });
      svg.appendChild(line);
    });
  }

  function onMouseMove(e) {
    if (!pending) return;
    const c = canvasEl.getBoundingClientRect();
    const a = center(pending.el);
    if (!preview) {
      preview = document.createElementNS(SVGNS, "line");
      preview.setAttribute("class", "wire preview");
      svg.appendChild(preview);
    }
    preview.setAttribute("x1", a.x); preview.setAttribute("y1", a.y);
    preview.setAttribute("x2", e.clientX - c.left);
    preview.setAttribute("y2", e.clientY - c.top);
  }

  return { init, redraw, wires, serialize, clear, addWire };
})();
