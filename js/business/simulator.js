/* ============================================================
 * simulator.js — מנוע ריצה + פסיקות
 * מריץ את ה-main, מטפל בביטויים/משתנים/SFR, ומשגר ISR-ים:
 *   • פסיקה חיצונית INT0 (P3.2) / INT1 (P3.3) — בעליית פין
 *   • פסיקת טיימר Timer0/Timer1 — תקופתית (פרק זמן ב-ms, מודל מפושט)
 * תנאי שיגור: EA=1 וגם הביט המתאים (EX0/ET0/EX1/ET1).
 * המנוע מפנה מקום (yield) בלולאות ללא delay כדי לא להקפיא את הדף
 * ולאפשר לפסיקות לפעול.
 * ============================================================ */
window.Simulator = (function () {

  const VEC = { INT0: 0, TIMER0: 1, INT1: 2, TIMER1: 3 };
  const ENABLE_BIT = { 0: "EX0", 1: "ET0", 2: "EX1", 3: "ET1" };

  let program = [];
  let isrPrograms = {};
  let functions = {};           // פונקציות בנות-קריאה (שם → {params, code})
  let callDepth = 0;
  let pc = 0;
  let running = false;
  let timer = null;             // setTimeout של ה-main
  let timerIntervals = {};      // setInterval של טיימרים
  let scope = { vars: {} };
  let sfr = {};                 // EA, EX0, TR0, TH0 ...
  let inISR = false;
  let prevP3 = 0;
  let statusCb = null;

  const STEP_BUDGET = 100000;   // פעולות לפני yield (שמירה על תגובתיות)

  /* ---------- הערכת ביטויים ---------- */
  function evalExpr(n) {
    switch (n.type) {
      case "num": return n.value;
      case "var":
        if (!(n.name in scope.vars)) throw new Error(`משתנה לא מוגדר "${n.name}"`);
        return scope.vars[n.name];
      case "index": {
        const arr = scope.vars[n.name];
        if (!Array.isArray(arr)) throw new Error(`"${n.name}" אינו מערך`);
        const i = evalExpr(n.index) | 0;
        if (i < 0 || i >= arr.length) throw new Error(`אינדקס ${i} מחוץ לתחום של "${n.name}"`);
        return arr[i];
      }
      case "port":    return Registers.get(n.port);
      case "portbit": return Registers.getBit(n.port, n.bit);
      case "sfr":     return sfr[n.name] || 0;
      case "call":    return callFunction(n.name, n.args.map(evalExpr));
      case "unary": {
        const a = evalExpr(n.arg);
        if (n.op === "-") return -a;
        if (n.op === "!") return a ? 0 : 1;
        if (n.op === "~") return ~a;
        break;
      }
      case "binary": {
        const a = evalExpr(n.left), b = evalExpr(n.right);
        switch (n.op) {
          case "+": return a + b;   case "-": return a - b;   case "*": return a * b;
          case "/": if (b === 0) throw new Error("חלוקה באפס"); return Math.trunc(a / b);
          case "%": if (b === 0) throw new Error("חלוקה באפס"); return a % b;
          case "==": return a === b ? 1 : 0;  case "!=": return a !== b ? 1 : 0;
          case "<": return a < b ? 1 : 0;     case ">": return a > b ? 1 : 0;
          case "<=": return a <= b ? 1 : 0;   case ">=": return a >= b ? 1 : 0;
          case "&&": return (a && b) ? 1 : 0; case "||": return (a || b) ? 1 : 0;
          case "&": return a & b;   case "|": return a | b;   case "^": return a ^ b;
          case "<<": return a << b; case ">>": return a >> b;
        }
        break;
      }
    }
    throw new Error("ביטוי לא חוקי");
  }

  /* ---------- ביצוע הוראות לא-בקרתיות ---------- */
  function execNonControl(ins) {
    if (ins.op === "decl") { execDecl(ins); return; }
    // assign
    const val = evalExpr(ins.expr);
    const t = ins.target;
    if (t.kind === "index") {
      const arr = scope.vars[t.name];
      if (!Array.isArray(arr)) throw new Error(`"${t.name}" אינו מערך`);
      const idx = evalExpr(t.index) | 0;
      if (idx < 0 || idx >= arr.length) throw new Error(`אינדקס ${idx} מחוץ לתחום של "${t.name}"`);
      arr[idx] = val;
    } else {
      execAssign(t, val);
    }
  }

  function execAssign(t, value) {
    switch (t.kind) {
      case "var":     scope.vars[t.name] = value; break;
      case "port":    Registers.setPort(t.port, value & 0xFF); break;
      case "portbit": Registers.setBit(t.port, t.bit, value !== 0); break;
      case "sfr":
        sfr[t.name] = CodeParser.SFR_BITS.has(t.name) ? (value ? 1 : 0) : (value & 0xFF);
        reconfigureTimers();
        break;
    }
  }

  function execDecl(ins) {
    if (ins.isArray) {
      if (ins.initList) scope.vars[ins.name] = ins.initList.map((e) => evalExpr(e));
      else scope.vars[ins.name] = new Array(Math.max(0, ins.size ? (evalExpr(ins.size) | 0) : 0)).fill(0);
    } else {
      scope.vars[ins.name] = ins.init ? evalExpr(ins.init) : 0;
    }
  }

  /* ---------- מנוע ה-main ---------- */
  function run(code, onStatus) {
    stop();
    statusCb = onStatus || statusCb;
    const compiled = CodeParser.compile(code);
    if (compiled.errors.length) { emit("error", compiled.errors); return { errors: compiled.errors, running: false }; }
    program = compiled.instructions;
    isrPrograms = compiled.isrs || {};
    functions = compiled.functions || {};
    callDepth = 0;
    pc = 0;
    scope = { vars: {} };
    sfr = {};
    inISR = false;
    prevP3 = Registers.get("P3");
    running = true;
    emit("running");
    step();
    return { errors: [], running: true };
  }

  function stop() {
    if (timer) { clearTimeout(timer); timer = null; }
    clearTimers();
    inISR = false;
    if (running) { running = false; emit("stopped"); }
  }

  function step() {
    if (!running) return;
    let budget = STEP_BUDGET;

    try {
      while (pc < program.length) {
        if (--budget <= 0) { timer = setTimeout(step, 0); return; }  // yield — נשאר תגובתי
        const ins = program[pc];
        switch (ins.op) {
          case "decl":
          case "assign": execNonControl(ins); pc++; break;
          case "callStmt": evalExpr(ins.call); pc++; break;
          case "return": Canvas.refreshAll(); running = false; emit("done"); return;
          case "jump": pc = ins.target; break;
          case "jumpIfFalse": pc = evalExpr(ins.expr) ? pc + 1 : ins.target; break;
          case "delay": {
            const ms = Math.max(0, evalExpr(ins.expr) | 0);
            pc++;
            Canvas.refreshAll();
            timer = setTimeout(step, ms);
            return;
          }
          default: pc++;
        }
      }
    } catch (e) {
      const ins = program[pc];
      fail((ins && ins.line ? `שורה ${ins.line}: ` : "") + e.message);
      return;
    }

    Canvas.refreshAll();
    running = false;
    emit("done");
  }

  /* ---------- פסיקות ---------- */
  function fireISR(no) {
    if (!running || inISR) return;
    const prog = isrPrograms[no];
    if (!prog || !sfr.EA || !sfr[ENABLE_BIT[no]]) return;
    inISR = true;
    try { runISR(prog); }
    catch (e) {
      inISR = false;
      const here = prog[0];
      fail((here && here.line ? `שורה ${here.line} (ISR): ` : "ISR: ") + e.message);
      return;
    }
    inISR = false;
    Canvas.refreshAll();
  }

  // הרצת ISR סינכרונית (delay בתוך ISR מתעלמים ממנו)
  function runISR(prog) {
    runSync(prog, "ISR ארוך מדי (לולאה אינסופית?)");
  }

  // הרצה סינכרונית של רצף הוראות (ISR או גוף פונקציה). מחזיר ערך return.
  function runSync(prog, budgetMsg) {
    let p = 0, budget = 200000;
    while (p < prog.length) {
      if (--budget <= 0) throw new Error(budgetMsg);
      const ins = prog[p];
      switch (ins.op) {
        case "decl":
        case "assign": execNonControl(ins); p++; break;
        case "callStmt": evalExpr(ins.call); p++; break;
        case "return": return ins.expr ? evalExpr(ins.expr) : 0;
        case "jump": p = ins.target; break;
        case "jumpIfFalse": p = evalExpr(ins.expr) ? p + 1 : ins.target; break;
        case "delay": p++; break;   // אין השהיות בתוך ISR/פונקציה
        default: p++;
      }
    }
    return 0;
  }

  // קריאת פונקציה: scope מקומי (פרמטרים+משתנים), הרצה סינכרונית, החזרת ערך
  function callFunction(name, args) {
    const fn = functions[name];
    if (!fn) throw new Error(`פונקציה לא מוכרת "${name}"`);
    if (++callDepth > 200) { callDepth--; throw new Error("רקורסיה עמוקה מדי"); }
    const frame = {};
    fn.params.forEach((pname, i) => { frame[pname] = args[i] != null ? args[i] : 0; });
    const saved = scope;
    scope = { vars: frame };
    try { return runSync(fn.code, `הפונקציה "${name}" ארוכה מדי (לולאה אינסופית?)`); }
    finally { scope = saved; callDepth--; }
  }

  function reconfigureTimers() {
    clearTimers();
    if (!running) return;
    if (sfr.EA && sfr.ET0 && sfr.TR0 && isrPrograms[VEC.TIMER0])
      timerIntervals[0] = setInterval(() => fireISR(VEC.TIMER0), sfr.TH0 > 0 ? sfr.TH0 : 500);
    if (sfr.EA && sfr.ET1 && sfr.TR1 && isrPrograms[VEC.TIMER1])
      timerIntervals[1] = setInterval(() => fireISR(VEC.TIMER1), sfr.TH1 > 0 ? sfr.TH1 : 500);
  }
  function clearTimers() { Object.values(timerIntervals).forEach(clearInterval); timerIntervals = {}; }

  // זיהוי עליית פין לפסיקות חיצוניות (INT0=P3.2, INT1=P3.3)
  Registers.onChange((name) => {
    if (name !== "P3") return;
    const v = Registers.get("P3");
    const old2 = (prevP3 >> 2) & 1, old3 = (prevP3 >> 3) & 1;
    prevP3 = v;
    if (!running || inISR) return;
    if (old2 === 0 && ((v >> 2) & 1) === 1) fireISR(VEC.INT0);
    if (old3 === 0 && ((v >> 3) & 1) === 1) fireISR(VEC.INT1);
  });

  function fail(message) { stop(); emit("error", [message]); }
  function emit(state, info) { if (statusCb) statusCb(state, info); }

  return { run, stop, get running() { return running; } };
})();
