/* ============================================================
 * wiring.js — חיווט בגרירה + פותר-רשת (כולל ברידבורד)
 * נקודות חיבור: .pin (8051), .lead (רגל רכיב), .hole (חור בברידבורד).
 * חורים באותה עמודה-חצי חולקים node (מחוברים חשמלית).
 * פותר: פין שמחובר ל-node "מאכלס" אותו; רגל שמחוברת לאותו node מקבלת
 * את האות. כך בונים מעגל על הלוח.
 * ============================================================ */
window.Wiring = (function () {

  const SVGNS = "http://www.w3.org/2000/svg";
  let canvasEl = null, svg = null, preview = null, drag = null;
  const wires = [];      // { id, a, b, color }  — כל קצה: {t,...}
  let seq = 0;
  let activeColor = "#e23a3a";   // צבע החוט הנוכחי (שהמשתמש בחר)

  function setColor(c) {
    activeColor = c;
    if (preview) preview.setAttribute("stroke", c);
  }
  function getColor() { return activeColor; }

  /** מסלול חוט רציף ומעוגל (עקומת בזייה עם נפילה קלה כמו חוט אמיתי) */
  function pathD(A, B) {
    const dx = B.x - A.x, dy = B.y - A.y;
    const dist = Math.hypot(dx, dy);
    const sag = Math.min(dist * 0.18, 38);   // שקיעה עדינה
    const c1x = A.x + dx * 0.4, c1y = A.y + sag;
    const c2x = B.x - dx * 0.4, c2y = B.y + sag;
    return `M ${A.x} ${A.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${B.x} ${B.y}`;
  }

  function init(el) {
    canvasEl = el;
    svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "wires");
    canvasEl.appendChild(svg);
    canvasEl.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cancelDrag(); });
  }

  /* ---------- זיהוי קצה ---------- */
  function endpointFrom(target) {
    if (!target || !target.closest) return null;
    const pin = target.closest(".pin");
    if (pin) return { t: "pin", port: pin.dataset.port, bit: +pin.dataset.bit, el: pin };
    const hole = target.closest(".hole");
    if (hole) return { t: "hole", node: hole.dataset.node, holeKey: hole.dataset.hole, el: hole };
    const lead = target.closest(".lead");
    if (lead) return { t: "lead", compId: +lead.dataset.comp, leg: +lead.dataset.leg || 0, el: lead };
    return null;
  }
  const strip = (ep) =>
    ep.t === "pin"  ? { t: "pin", port: ep.port, bit: ep.bit } :
    ep.t === "hole" ? { t: "hole", node: ep.node, holeKey: ep.holeKey } :
                      { t: "lead", compId: ep.compId, leg: ep.leg };

  /* ---------- גרירה ---------- */
  function onMouseDown(e) {
    const ep = endpointFrom(e.target);
    if (!ep) return;
    e.preventDefault();
    drag = ep; ep.el.classList.add("wiring-active");
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragUp);
  }
  function onDragMove(e) {
    if (!drag) return;
    const c = canvasEl.getBoundingClientRect(), a = center(drag.el);
    if (!preview) {
      preview = document.createElementNS(SVGNS, "path");
      preview.setAttribute("class", "wire preview");
      preview.setAttribute("stroke", activeColor);
      svg.appendChild(preview);
    }
    preview.setAttribute("d", pathD(a, { x: e.clientX - c.left, y: e.clientY - c.top }));
  }
  function onDragUp(e) {
    if (!drag) return;
    const other = endpointFrom(document.elementFromPoint(e.clientX, e.clientY));
    if (other && other.el !== drag.el) {
      wires.push({ id: ++seq, a: strip(drag), b: strip(other), color: activeColor });
      resolve(); redraw();
    }
    cancelDrag();
  }
  function cancelDrag() {
    if (drag) drag.el.classList.remove("wiring-active");
    drag = null;
    if (preview) { preview.remove(); preview = null; }
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragUp);
  }

  /* ---------- פותר-רשת: בונה מחדש את comp.conns מכל החוטים ---------- */
  function resolve() {
    Components.items.forEach((c) => { if (c.conns) c.conns = {}; });
    const nodeSignal = {};   // nodeId → {port,bit}
    // שלב 1: פין↔חור קובע את אות ה-node
    wires.forEach((w) => {
      const pin = pick(w, "pin"), hole = pick(w, "hole");
      if (pin && hole) nodeSignal[hole.node] = { port: pin.port, bit: pin.bit };
    });
    // שלב 2: רגל↔פין (ישיר) או רגל↔חור (דרך ה-node)
    wires.forEach((w) => {
      const lead = pick(w, "lead"); if (!lead) return;
      const other = w.a.t === "lead" ? w.b : w.a;
      let sig = null;
      if (other.t === "pin") sig = { port: other.port, bit: other.bit };
      else if (other.t === "hole") sig = nodeSignal[other.node] || null;
      if (sig) { const c = Components.get(lead.compId); if (c) c.conns[lead.leg] = sig; }
    });
    Components.assertAllInputs();
    if (window.Canvas && Canvas.refreshAll) Canvas.refreshAll();
  }
  const pick = (w, t) => (w.a.t === t ? w.a : w.b.t === t ? w.b : null);

  /* ---------- שמירה/טעינה ---------- */
  function serialize() { return wires.map((w) => ({ a: w.a, b: w.b, color: w.color })); }
  function clear() {
    wires.length = 0;
    if (svg) [...svg.querySelectorAll(".wire:not(.preview)")].forEach((l) => l.remove());
  }
  /** טעינה: תומך בפורמט החדש {a,b,color} ובישן {port,bit,compId,leg} */
  function load(arr) {
    (arr || []).forEach((w) => {
      if (w.a && w.b) wires.push({ id: ++seq, a: w.a, b: w.b, color: w.color || activeColor });
      else if (w.port != null && w.compId != null)
        wires.push({ id: ++seq, a: { t: "pin", port: w.port, bit: w.bit }, b: { t: "lead", compId: w.compId, leg: w.leg || 0 }, color: activeColor });
    });
    resolve();
  }
  /** הסרת כל החוטים הקשורים לרכיב (במחיקתו) — לפי רגל או חורי-לוח */
  function removeWiresForComp(compId) {
    for (let i = wires.length - 1; i >= 0; i--) {
      const w = wires[i];
      const touches = (ep) => (ep.t === "lead" && ep.compId === compId) ||
                              (ep.t === "hole" && String(ep.node).split(":")[0] === String(compId));
      if (touches(w.a) || touches(w.b)) wires.splice(i, 1);
    }
    resolve();
  }

  /* ---------- ציור ---------- */
  function center(el) { const r = el.getBoundingClientRect(), c = canvasEl.getBoundingClientRect(); return { x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height / 2 }; }
  function elFor(ep) {
    if (ep.t === "pin")  return canvasEl.querySelector(`.pin[data-port="${ep.port}"][data-bit="${ep.bit}"]`);
    if (ep.t === "lead") return canvasEl.querySelector(`.lead[data-comp="${ep.compId}"][data-leg="${ep.leg}"]`);
    if (ep.t === "hole") return canvasEl.querySelector(`.hole[data-hole="${ep.holeKey}"]`);
  }
  function wireHot(w) {
    const sig = directSignal(w);
    return sig ? Registers.getBit(sig.port, sig.bit) === 1 : false;
  }
  function directSignal(w) {
    const pin = pick(w, "pin");
    if (pin) return { port: pin.port, bit: pin.bit };
    const lead = pick(w, "lead");
    if (lead) { const c = Components.get(lead.compId); return c && c.conns[lead.leg]; }
    return null;
  }

  /** צובע רגל/פין/חור בצבע החוט המחובר אליו, כדי שיהיה ברור לאן חיברת */
  function colorEndpoint(el, color) {
    if (!el) return;
    el.classList.add("wire-connected");
    if (el.tagName.toLowerCase() === "circle") {        // רגלי SVG (LED/7seg/זמזם) + טרמינלי סוללה
      el.style.fill = color; el.style.stroke = color;
    } else if (el.classList.contains("pin")) {          // פיני ה-8051 (מכילים מספר) — מסגרת+זוהר
      el.style.outline = "2px solid " + color;
      el.style.boxShadow = "0 0 6px " + color;
    } else {                                             // רגלי div/span (כפתור/מנוע/פוט') + חורי ברידבורד
      el.style.background = color;
      el.style.boxShadow = "0 0 5px " + color;
    }
  }
  function clearEndpointColors() {
    if (!canvasEl) return;
    canvasEl.querySelectorAll(".wire-connected").forEach((el) => {
      el.classList.remove("wire-connected");
      ["background", "box-shadow", "fill", "stroke", "outline"].forEach((p) => el.style.removeProperty(p));
    });
  }

  function redraw() {
    if (!svg) return;
    [...svg.querySelectorAll(".wire:not(.preview)")].forEach((l) => l.remove());
    clearEndpointColors();                  // אפס צבעי רגליים לפני צביעה מחדש
    // הסר חוטים שאיבדו קצה
    for (let i = wires.length - 1; i >= 0; i--) { if (!elFor(wires[i].a) || !elFor(wires[i].b)) wires.splice(i, 1); }

    wires.forEach((w) => {
      const ea = elFor(w.a), eb = elFor(w.b);
      if (!ea || !eb) return;
      const A = center(ea), B = center(eb);
      const color = w.color || activeColor;
      colorEndpoint(ea, color); colorEndpoint(eb, color);   // צבע את שתי הרגליים בצבע החוט
      const path = document.createElementNS(SVGNS, "path");
      path.setAttribute("class", "wire");
      path.setAttribute("d", pathD(A, B));
      path.style.stroke = color;          // inline → צבע המשתמש תמיד גובר
      path.style.color = color;           // לזוהר ה-hot (currentColor)
      path.classList.toggle("hot", wireHot(w));
      path.setAttribute("title", "קליק: צביעה בצבע הנבחר · קליק ימני: מחיקה");
      // קליק שמאלי — צביעה מחדש בצבע הפעיל
      path.addEventListener("click", (e) => {
        e.stopPropagation();
        w.color = activeColor;
        redraw();
      });
      // קליק ימני — מחיקת החוט
      path.addEventListener("contextmenu", (e) => {
        e.preventDefault(); e.stopPropagation();
        const idx = wires.indexOf(w);
        if (idx >= 0) wires.splice(idx, 1);
        resolve(); redraw();
      });
      svg.appendChild(path);
    });
  }

  return { init, redraw, resolve, wires, serialize, clear, load, removeWiresForComp, setColor, getColor };
})();
