/* ============================================================
 * dragDrop.js — גרירת רכיב מהספרייה (שמאל) אל הקנבס (מרכז)
 * משתמש ב-HTML5 Drag & Drop. בנפילה — יוצר רכיב חדש.
 * ============================================================ */
window.DragDrop = (function () {

  function init(paletteEl, canvasEl) {
    // כל פריט בספרייה ניתן לגרירה
    paletteEl.querySelectorAll(".palette-item").forEach((item) => {
      item.setAttribute("draggable", "true");
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", item.dataset.type);
        e.dataTransfer.effectAllowed = "copy";
      });
    });

    canvasEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      canvasEl.classList.add("drag-over");
    });
    canvasEl.addEventListener("dragleave", () => canvasEl.classList.remove("drag-over"));

    canvasEl.addEventListener("drop", (e) => {
      e.preventDefault();
      canvasEl.classList.remove("drag-over");
      const type = e.dataTransfer.getData("text/plain");
      if (!type) return;

      const rect = canvasEl.getBoundingClientRect();
      const x = e.clientX - rect.left - 60;  // ממורכז סביב הסמן
      const y = e.clientY - rect.top - 20;

      const comp = Components.add(type, Math.max(0, x), Math.max(0, y));
      if (comp) Canvas.renderComponent(comp);
    });
  }

  return { init };
})();
