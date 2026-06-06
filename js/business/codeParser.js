/* ============================================================
 * codeParser.js — מפרש דמוי-C: Lexer → Parser → Compiler
 * מקמפל קוד לרשימת הוראות שטוחה עם קפיצות, שאותה מריץ simulator.js.
 *
 * נתמך:
 *   int x;            int x = 5;          הצהרת משתנה
 *   int t[] = {..};   t[i] = expr;        מערכים
 *   x = expr;  x++;  x += expr;           השמות
 *   P1 = expr;  P1.0 = expr;              כתיבה לפורט/ביט
 *   if (c) {..} else {..}
 *   while (c) {..}     for (init; c; inc) {..}
 *   delay(expr);
 *   ביטויים: + - * / %  ==!=<><=>=  && ||  & | ^ << >>  ! ~ unary-
 *            מספרים (dec/0x/0b), משתנים, t[i], P0-P3, P1.0 / P1_0
 * ============================================================ */
window.CodeParser = (function () {

  /* ---------------- Lexer ---------------- */
  const PUNC = new Set(["(", ")", "{", "}", "[", "]", ";", ",", "."]);
  const OPS3 = ["<<=", ">>="];
  const OPS2 = ["==","!=","<=",">=","&&","||","<<",">>","++","--","+=","-=","*=","/=","%=","&=","|=","^="];

  // רגיסטרים מיוחדים (SFR) שהמפרש מזהה כשמות
  const SFR_BITS  = new Set(["EA","EX0","ET0","EX1","ET1","ES","ES0","TR0","TR1","IT0","IT1","TF0","TF1","IE0","IE1",
                             "AD0EN","AD0BUSY","AD0INT","AD0WINT","AD0TM",                   // ביטי ADC
                             "TI","RI","REN","TB8","RB8","SM0","SM1","TI0","RI0","REN0"]);   // ביטי UART
  const SFR_BYTES = new Set(["TH0","TL0","TH1","TL1","TMOD","TCON","IE","IP",
                             "ADC0CN","ADC0H","ADC0L","ADC0CF","AMX0P",                      // בתי ADC
                             "SCON","SBUF","SCON0","SBUF0"]);                                // בתי UART
  const SFR = new Set([...SFR_BITS, ...SFR_BYTES]);

  function lex(src) {
    const toks = [];
    let i = 0, line = 1;
    const peek = (k = 0) => src[i + k];

    while (i < src.length) {
      const c = src[i];

      if (c === "\n") { line++; i++; continue; }
      if (c === " " || c === "\t" || c === "\r") { i++; continue; }

      // הערות
      if (c === "/" && peek(1) === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === "/" && peek(1) === "*") {
        i += 2;
        while (i < src.length && !(src[i] === "*" && peek(1) === "/")) { if (src[i] === "\n") line++; i++; }
        i += 2; continue;
      }

      // מספרים
      if (c >= "0" && c <= "9") {
        let j = i + 1;
        if (c === "0" && (peek(1) === "x" || peek(1) === "X")) { j = i + 2; while (/[0-9a-fA-F]/.test(src[j])) j++; }
        else if (c === "0" && (peek(1) === "b" || peek(1) === "B")) { j = i + 2; while (/[01]/.test(src[j])) j++; }
        else { while (/[0-9]/.test(src[j])) j++; }
        toks.push({ t: "num", v: parseNum(src.slice(i, j)), line });
        i = j; continue;
      }

      // תו בודד: 'A' → קוד ASCII (כולל escapes כמו '\n')
      if (c === "'") {
        let j = i + 1, code;
        if (src[j] === "\\") {
          const map = { n: 10, t: 9, r: 13, "0": 0, "\\": 92, "'": 39, '"': 34, b: 8, f: 12 };
          const e = src[j + 1];
          code = (e in map) ? map[e] : (e || "").charCodeAt(0);
          j += 2;
        } else { code = src.charCodeAt(j); j += 1; }
        if (src[j] !== "'") throw err(line, "תו לא תקין — חסר גרש סוגר '");
        j += 1;
        toks.push({ t: "num", v: code & 0xFF, line });
        i = j; continue;
      }

      // מחרוזת: "..." → טוקן str (כולל escapes)
      if (c === '"') {
        let j = i + 1, s = "";
        const map = { n: "\n", t: "\t", r: "\r", "0": "\0", "\\": "\\", '"': '"', "'": "'" };
        while (j < src.length && src[j] !== '"') {
          if (src[j] === "\n") line++;
          if (src[j] === "\\") { const e = src[j + 1]; s += (e in map) ? map[e] : (e || ""); j += 2; }
          else { s += src[j]; j++; }
        }
        if (src[j] !== '"') throw err(line, 'מחרוזת לא נסגרה — חסר גרשיים "');
        j++;
        toks.push({ t: "str", v: s, line });
        i = j; continue;
      }

      // מזהים / מילות מפתח
      if (/[A-Za-z_]/.test(c)) {
        let j = i + 1;
        while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
        toks.push({ t: "ident", v: src.slice(i, j), line });
        i = j; continue;
      }

      // אופרטורים רב-תוויים
      const three = src.substr(i, 3);
      if (OPS3.includes(three)) { toks.push({ t: "op", v: three, line }); i += 3; continue; }
      const two = src.substr(i, 2);
      if (OPS2.includes(two)) { toks.push({ t: "op", v: two, line }); i += 2; continue; }

      // תו בודד
      if (PUNC.has(c)) { toks.push({ t: "punc", v: c, line }); i++; continue; }
      if ("+-*/%<>=!&|^~".includes(c)) { toks.push({ t: "op", v: c, line }); i++; continue; }

      throw err(line, `תו לא צפוי "${c}"`);
    }
    toks.push({ t: "eof", v: "", line });
    return toks;
  }

  function parseNum(s) {
    if (/^0x/i.test(s)) return parseInt(s.slice(2), 16);
    if (/^0b/i.test(s)) return parseInt(s.slice(2), 2);
    return parseInt(s, 10);
  }
  function err(line, msg) { const e = new Error(msg); e.line = line; return e; }

  /* ---------------- Parser (→ AST של פקודות) ---------------- */
  function parseProgram(toks) {
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const atEnd = () => peek().t === "eof";
    const isOp = (v) => peek().t === "op" && peek().v === v;
    const isPunc = (v) => peek().t === "punc" && peek().v === v;
    const isKw = (v) => peek().t === "ident" && peek().v === v;
    // מילות-טיפוס נתמכות (כולל צירופים כמו "unsigned int" / "unsigned char")
    const TYPE_KW = new Set(["int", "char", "unsigned", "signed", "long", "short", "float", "double", "bit"]);
    const isTypeKw = () => peek().t === "ident" && TYPE_KW.has(peek().v);
    const isRetType = (tok) => tok && tok.t === "ident" && (tok.v === "void" || TYPE_KW.has(tok.v));

    function expectPunc(v) { if (!isPunc(v)) throw err(peek().line, `ציפיתי ל-"${v}"`); next(); }
    function expectOp(v)   { if (!isOp(v))   throw err(peek().line, `ציפיתי ל-"${v}"`); next(); }

    // -- statements --
    function parseBlock() {
      expectPunc("{");
      const body = [];
      while (!isPunc("}") && !atEnd()) body.push(parseStatement());
      expectPunc("}");
      return { type: "block", body };
    }

    function parseStatement() {
      if (isPunc(";")) { next(); return { type: "block", body: [] }; }   // פקודה ריקה: while(cond);
      if (isPunc("{")) return parseBlock();
      if (isTypeKw()) return parseDecl();
      if (isKw("if")) return parseIf();
      if (isKw("while")) return parseWhile();
      if (isKw("for")) return parseFor();
      if (isKw("return")) {
        const line = next().line;
        const expr = isPunc(";") ? null : parseExpr();
        expectPunc(";");
        return { type: "return", expr, line };
      }
      return parseSimpleStatement(true);
    }

    function parseDecl() {
      const line = peek().line;
      while (isTypeKw()) next();            // צרוך מילות-טיפוס: int / unsigned int / unsigned char / long ...
      if (peek().t !== "ident") throw err(peek().line, "ציפיתי לשם משתנה");
      const name = next().v;
      // מערך: int t[] = {..}  /  int t[5];
      if (isPunc("[")) {
        next();
        let size = null;
        if (!isPunc("]")) size = parseExpr();
        expectPunc("]");
        let initList = null;
        if (isOp("=")) {
          next(); expectPunc("{");
          initList = [];
          if (!isPunc("}")) { initList.push(parseExpr()); while (isPunc(",")) { next(); if (isPunc("}")) break; initList.push(parseExpr()); } }
          expectPunc("}");
        }
        expectPunc(";");
        return { type: "decl", name, isArray: true, size, initList, line };
      }
      let init = null;
      if (isOp("=")) { next(); init = parseExpr(); }
      expectPunc(";");
      return { type: "decl", name, init, line };
    }

    function parseIf() {
      const line = next().line;            // 'if'
      expectPunc("("); const cond = parseExpr(); expectPunc(")");
      const then = parseStatement();
      let els = null;
      if (isKw("else")) { next(); els = parseStatement(); }
      return { type: "if", cond, then, els, line };
    }

    function parseWhile() {
      const line = next().line;
      expectPunc("("); const cond = parseExpr(); expectPunc(")");
      return { type: "while", cond, body: parseStatement(), line };
    }

    function parseFor() {
      const line = next().line;
      expectPunc("(");
      const init = isPunc(";") ? null : parseSimpleStatement(false);
      expectPunc(";");
      const cond = isPunc(";") ? null : parseExpr();
      expectPunc(";");
      const incr = isPunc(")") ? null : parseSimpleStatement(false);
      expectPunc(")");
      return { type: "for", init, cond, incr, body: parseStatement(), line };
    }

    // השמה / קריאה / ++ / += ; eatSemi=false עבור חלקי for
    function parseSimpleStatement(eatSemi) {
      const line = peek().line;

      // קריאה לפונקציה: delay(expr) או foo(a,b) כפקודה
      if (peek().t === "ident" && toks[p + 1] && toks[p + 1].t === "punc" && toks[p + 1].v === "(") {
        const name = next().v; next();            // name (
        const args = [];
        if (!isPunc(")")) { args.push(parseExpr()); while (isPunc(",")) { next(); args.push(parseExpr()); } }
        expectPunc(")");
        if (eatSemi) expectPunc(";");
        if (name === "delay") return { type: "delay", expr: args[0] || { type: "num", value: 0 }, line };
        return { type: "callStmt", call: { type: "call", name, args }, line };
      }

      const target = parseTarget();

      // x++ / x--
      if (isOp("++") || isOp("--")) {
        const op = next().v === "++" ? "+" : "-";
        if (eatSemi) expectPunc(";");
        return { type: "assign", target, expr: { type: "binary", op, left: targetAsExpr(target), right: { type: "num", value: 1 } }, line };
      }
      // x += expr וכו'
      if (peek().t === "op" && /^[-+*/%&|^]=$/.test(peek().v)) {
        const op = next().v[0];
        const rhs = parseExpr();
        if (eatSemi) expectPunc(";");
        return { type: "assign", target, expr: { type: "binary", op, left: targetAsExpr(target), right: rhs }, line };
      }
      // x = expr
      expectOp("=");
      const expr = parseExpr();
      if (eatSemi) expectPunc(";");
      return { type: "assign", target, expr, line };
    }

    // יעד השמה: var / arr[i] / Px / Px.b
    function parseTarget() {
      if (peek().t !== "ident") throw err(peek().line, "ציפיתי ליעד השמה");
      const name = next().v;
      const pb = portBit(name);
      if (pb) return pb;
      if (isPunc(".")) { next(); const b = next(); return { kind: "portbit", port: name, bit: b.v }; }
      if (portName(name)) return { kind: "port", port: name };
      if (SFR.has(name)) return { kind: "sfr", name };
      if (isPunc("[")) { next(); const index = parseExpr(); expectPunc("]"); return { kind: "index", name, index }; }
      return { kind: "var", name };
    }
    function targetAsExpr(t) {
      if (t.kind === "var")     return { type: "var", name: t.name };
      if (t.kind === "index")   return { type: "index", name: t.name, index: t.index };
      if (t.kind === "port")    return { type: "port", port: t.port };
      if (t.kind === "portbit") return { type: "portbit", port: t.port, bit: t.bit };
      if (t.kind === "sfr")     return { type: "sfr", name: t.name };
    }

    /* -- expressions (precedence climbing) -- */
    const BIN = [
      ["||"], ["&&"], ["|"], ["^"], ["&"],
      ["==", "!="], ["<", ">", "<=", ">="], ["<<", ">>"],
      ["+", "-"], ["*", "/", "%"],
    ];
    function parseExpr() { return parseBin(0); }
    function parseBin(level) {
      if (level >= BIN.length) return parseUnary();
      let left = parseBin(level + 1);
      while (peek().t === "op" && BIN[level].includes(peek().v)) {
        const op = next().v;
        const right = parseBin(level + 1);
        left = { type: "binary", op, left, right };
      }
      return left;
    }
    function parseUnary() {
      if (peek().t === "op" && ["-", "!", "~"].includes(peek().v)) {
        const op = next().v;
        return { type: "unary", op, arg: parseUnary() };
      }
      return parsePrimary();
    }
    function parsePrimary() {
      const tk = peek();
      if (tk.t === "num") { next(); return { type: "num", value: tk.v }; }
      if (tk.t === "str") { next(); return { type: "str", value: tk.v }; }
      if (isPunc("(")) { next(); const e = parseExpr(); expectPunc(")"); return e; }
      if (tk.t === "ident") {
        const name = next().v;
        // קריאת פונקציה בתוך ביטוי: foo(a,b)
        if (isPunc("(")) {
          next();
          const args = [];
          if (!isPunc(")")) { args.push(parseExpr()); while (isPunc(",")) { next(); args.push(parseExpr()); } }
          expectPunc(")");
          return { type: "call", name, args };
        }
        const pb = portBit(name);
        if (pb) return { type: "portbit", port: pb.port, bit: pb.bit };
        if (isPunc(".")) { next(); const b = next(); return { type: "portbit", port: name, bit: +b.v }; }
        if (portName(name)) return { type: "port", port: name };
        if (SFR.has(name)) return { type: "sfr", name };
        if (isPunc("[")) { next(); const index = parseExpr(); expectPunc("]"); return { type: "index", name, index }; }
        return { type: "var", name };
      }
      throw err(tk.line, `ביטוי לא צפוי "${tk.v}"`);
    }

    // הגדרת פונקציה: TYPE NAME ( ... ) [interrupt N] { ... }   (TYPE = void / int / unsigned char ...)
    function looksLikeFunc() {
      if (!isRetType(toks[p])) return false;
      let i = p;
      while (isRetType(toks[i])) i++;       // דלג על מילות טיפוס ההחזרה (ייתכנו כמה)
      return toks[i] && toks[i].t === "ident" && toks[i + 1] && toks[i + 1].t === "punc" && toks[i + 1].v === "(";
    }
    function parseFunction() {
      const line = peek().line;
      while (isRetType(peek())) next();      // צרוך את טיפוס ההחזרה (void / unsigned char ...)
      const name = next().v;                 // שם הפונקציה
      expectPunc("(");
      const params = [];                     // שמות פרמטרים: (unsigned char a, int b)
      while (!isPunc(")") && !atEnd()) {
        while (isTypeKw() || isKw("void")) next();   // טיפוס הפרמטר (ייתכנו כמה מילים)
        if (peek().t === "ident") params.push(next().v);
        if (isPunc(",")) next();
        else break;
      }
      expectPunc(")");
      let interruptNo = null;
      if (isKw("interrupt")) {
        next();
        if (peek().t !== "num") throw err(peek().line, "ציפיתי למספר אחרי interrupt");
        interruptNo = next().v;
        if (isKw("using")) { next(); next(); }   // interrupt N using M
      }
      return { name, interruptNo, params, body: parseBlock(), line };
    }

    const main = { type: "block", body: [] };
    const isrs = [];
    const funcs = [];                    // פונקציות רגילות (לא main, לא ISR)
    while (!atEnd()) {
      if (looksLikeFunc()) {
        const f = parseFunction();
        if (f.interruptNo != null) isrs.push({ no: f.interruptNo, body: f.body });
        else if (f.name === "main") main.body.push(...f.body.body);
        else funcs.push({ name: f.name, params: f.params, body: f.body });
      } else {
        main.body.push(parseStatement());
      }
    }
    return { main, isrs, funcs };
  }

  // עזרי פורט
  function portName(s) { return /^P[0-3]$/.test(s); }
  function portBit(s) {
    const m = s.match(/^P([0-3])_([0-7])$/);   // צורת P1_0
    return m ? { kind: "portbit", port: "P" + m[1], bit: +m[2] } : null;
  }

  /* ---------------- Compiler (AST → הוראות שטוחות) ---------------- */
  function compileProgram(ast) {
    const code = [];
    const emit = (ins) => { code.push(ins); return code.length - 1; };
    const here = () => code.length;
    const patch = (idx) => { code[idx].target = here(); };

    function normTarget(t) {
      if (t.kind === "portbit") return { ...t, bit: +t.bit };
      return t;
    }

    function comp(node) {
      switch (node.type) {
        case "block": node.body.forEach(comp); break;
        case "decl":  emit({ op: "decl", name: node.name, isArray: !!node.isArray, size: node.size || null, initList: node.initList || null, init: node.init || null, line: node.line }); break;
        case "assign": emit({ op: "assign", target: normTarget(node.target), expr: node.expr, line: node.line }); break;
        case "delay": emit({ op: "delay", expr: node.expr, line: node.line }); break;
        case "callStmt": emit({ op: "callStmt", call: node.call, line: node.line }); break;
        case "return": emit({ op: "return", expr: node.expr || null, line: node.line }); break;

        case "if": {
          const jf = emit({ op: "jumpIfFalse", expr: node.cond, line: node.line });
          comp(node.then);
          if (node.els) {
            const jmp = emit({ op: "jump" });
            patch(jf);
            comp(node.els);
            patch(jmp);
          } else {
            patch(jf);
          }
          break;
        }
        case "while": {
          const start = here();
          const jf = emit({ op: "jumpIfFalse", expr: node.cond, line: node.line });
          comp(node.body);
          emit({ op: "jump", target: start });
          patch(jf);
          break;
        }
        case "for": {
          if (node.init) comp(node.init);
          const start = here();
          let jf = null;
          if (node.cond) jf = emit({ op: "jumpIfFalse", expr: node.cond, line: node.line });
          comp(node.body);
          if (node.incr) comp(node.incr);
          emit({ op: "jump", target: start });
          if (jf !== null) patch(jf);
          break;
        }
      }
    }

    comp(ast);
    return code;
  }

  /* ---------------- API ---------------- */
  function compile(code) {
    try {
      const parsed = parseProgram(lex(code));          // { main, isrs, funcs }
      const isrs = {};
      parsed.isrs.forEach((it) => { isrs[it.no] = compileProgram(it.body); });
      const functions = {};
      (parsed.funcs || []).forEach((f) => { functions[f.name] = { params: f.params, code: compileProgram(f.body) }; });
      return { instructions: compileProgram(parsed.main), isrs, functions, errors: [] };
    } catch (e) {
      const where = e.line ? `שורה ${e.line}: ` : "";
      return { instructions: [], isrs: {}, functions: {}, errors: [where + e.message] };
    }
  }

  return { compile, lex, parseProgram, SFR_BITS, SFR_BYTES };
})();
