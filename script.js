/* ================================================================
   script.js — O'zbek POS Tagger v3.0
   Rule + Dataset DB + Statistical Model + Groq AI
   ================================================================ */

// Vercel va local uchun avtomatik URL
// Vercel da: /api/... (relative)
// Local da: uvicorn api.index:app --reload --port 8000
const API = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? "http://localhost:8000"
  : "";

let ALL_TOKENS = [];

const POS_COLOR = {
  P:"#059669", ADV:"#2563eb", ADJ:"#d97706",
  NUM:"#7c3aed", N:"#64748b", V:"#db2777",
  PUNCT:"#94a3b8", UNKNOWN:"#6b7280",
};
const POS_LABEL = {
  P:"Olmosh", ADV:"Ravish", ADJ:"Sifat", NUM:"Son",
  N:"Ot", V:"Fe'l", PUNCT:"Tinish", UNKNOWN:"Noma'lum",
};
const POS_ICON = {
  P:"fas fa-user", ADV:"fas fa-bolt", ADJ:"fas fa-palette",
  NUM:"fas fa-hashtag", N:"fas fa-font", V:"fas fa-running",
  PUNCT:"fas fa-minus", UNKNOWN:"fas fa-question",
};
const RULE_BADGE = {
  pron_kishilik:"Kishilik",pron_korsatish:"Ko'rsatish",
  pron_soroq:"So'roq",pron_belgilash:"Belgilash",
  pron_bolishsizlik:"Bo'lishsizlik",pron_ozlik:"O'zlik",
  pron_gumon:"Gumon",birikma:"Birikma",
  adj_orttirma:"Orttirma",adj_ozaytirma:"Ozaytirma",
  adj_exact:"Sifat",adv_exact:"Ravish",num_exact:"Son",
  num_hisob:"Hisob so'z",digit:"Raqam",
  database:"DB",stat_model:"Stat",groq_ai:"Groq AI",no_rule:"?",
};

/* ── Toast ── */
function toast(msg, type = "info") {
  const box = document.getElementById("toastContainer");
  if (!box) return;
  const el  = document.createElement("div");
  el.className = "toast " + type;
  const ic = {success:"✅",error:"❌",info:"ℹ️",warn:"⚠️"}[type] || "ℹ️";
  el.innerHTML = "<span>" + ic + "</span><span>" + msg + "</span>";
  box.appendChild(el);
  setTimeout(() => { el.classList.add("hide"); setTimeout(() => el.remove(), 300); }, 3500);
}

/* ── API ── */
async function apiFetch(path, method, body) {
  const opts = { method: method || "GET", headers: {"Content-Type":"application/json"} };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "HTTP " + res.status);
  }
  return res.json();
}


/* ── Analyze ── */
async function analyze() {
  const text = (document.getElementById("textInput").value || "").trim();
  if (!text) { toast("Matn kiriting!", "error"); return; }

  const btn     = document.getElementById("analyzeBtn");
  const btnText = document.getElementById("btnText");
  const spinner = document.getElementById("btnSpinner");
  btn.disabled  = true;
  spinner.style.display = "inline-block";
  btnText.textContent   = "Tahlil qilinmoqda...";
  document.getElementById("resultsSection").style.display = "none";
  document.getElementById("detailPanel").style.display    = "none";

  try {
    const data  = await apiFetch("/api/tag", "POST", {text});
    ALL_TOKENS  = data.tokens;
    renderStats(data.stats, data.total);
    renderTable(ALL_TOKENS);
    setFilter("all");
    document.getElementById("resultsSection").style.display = "block";
    document.getElementById("resultsSection").scrollIntoView({behavior:"smooth"});
    toast(data.total + " ta token tahlil qilindi!", "success");
  } catch(e) {
    toast("Xato: " + e.message, "error");
  } finally {
    btn.disabled = false;
    spinner.style.display = "none";
    btnText.textContent   = "Tahlil qilish";
  }
}

/* ── Stats ── */
function renderStats(stats, total) {
  const el = document.getElementById("statChips");
  el.innerHTML = "";

  const all = document.createElement("span");
  all.className   = "chip chip-all";
  all.textContent = "Jami: " + total;
  el.appendChild(all);

  for (const [pos, cnt] of Object.entries(stats)) {
    if (!cnt) continue;
    const chip = document.createElement("span");
    chip.className = "chip";
    const c = POS_COLOR[pos] || "#64748b";
    chip.style.cssText = "background:" + c + "18;color:" + c + ";border:1px solid " + c + "35";
    const icon = POS_ICON[pos] || "fas fa-tag";
    chip.innerHTML = "<i class='" + icon + "'></i> " + (POS_LABEL[pos] || pos) + ": " + cnt;
    el.appendChild(chip);
  }
}

/* ── Table ── */
function renderTable(tokens) {
  const tbody = document.getElementById("posTableBody");
  tbody.innerHTML = "";

  tokens.forEach((t, idx) => {
    const pos   = t.pos  || "UNKNOWN";
    const color = POS_COLOR[pos] || "#64748b";
    const label = POS_LABEL[pos] || pos;
    const conf  = Math.round((t.confidence || 0) * 100);
    const ruleKey = (t.rule || "").split("+")[0];
    const ruleBadge = RULE_BADGE[ruleKey] || t.rule || "—";
    const confCls   = conf >= 90 ? "conf-high" : conf >= 70 ? "conf-mid" : "conf-low";
    const isStatRow = t.rule === "stat_model";
    const hasDb     = t.db && Object.keys(t.db).length > 0;

    const tr = document.createElement("tr");
    tr.setAttribute("data-pos",   pos);
    tr.setAttribute("data-idx",   idx);
    tr.setAttribute("data-stat",  isStatRow ? "1" : "0");
    if (isStatRow) tr.classList.add("stat-row");
    if (hasDb)     tr.style.cursor = "pointer";

    tr.innerHTML =
      "<td class='td-num'>" + (idx + 1) + "</td>" +
      "<td class='td-token'><strong>" + esc(t.token) + "</strong>" +
        (isStatRow ? " <span class='tahminiy-tag'>tahminiy</span>" : "") +
      "</td>" +
      "<td class='td-stem mono'>" + esc(t.stem || "—") + "</td>" +
      "<td class='td-pos'><span class='pos-badge' style='background:" + color + "20;color:" + color + ";border:1px solid " + color + "40'><i class='" + (POS_ICON[pos] || "fas fa-tag") + "'></i> " + pos + "</span></td>" +
      "<td>" + label + "</td>" +
      "<td class='td-sub'>" + esc(t.subtype || "—") + "</td>" +
      "<td><span class='conf " + confCls + "'>" + conf + "%</span></td>" +
      "<td class='td-rule mono'>" + esc(ruleBadge) + (t.rule && t.rule.includes("+") ? " <span class='suf-tag'>+" + t.rule.split("+")[1] + "</span>" : "") + "</td>";

    if (hasDb) {
      tr.addEventListener("click", () => showDetail(t));
    }
    tbody.appendChild(tr);
  });
}

/* ── Detail panel (DB ma'lumotlari) ── */
function showDetail(t) {
  const panel = document.getElementById("detailPanel");
  const body  = document.getElementById("detailBody");
  const title = document.getElementById("detailTitle");
  const color = POS_COLOR[t.pos] || "#64748b";

  title.innerHTML = "<span style='color:" + color + "'>" + esc(t.token) + "</span> — " +
                    (POS_LABEL[t.pos] || t.pos) + " ma'lumotlari";

  let rows = "<table class='detail-table'>";
  rows += "<tr><th>FORM</th><td>" + esc(t.token) + "</td></tr>";
  rows += "<tr><th>O'zak (LEMMA)</th><td>" + esc(t.stem || "—") + "</td></tr>";
  rows += "<tr><th>POS</th><td>" + esc(t.pos) + " — " + esc(POS_LABEL[t.pos] || "") + "</td></tr>";
  rows += "<tr><th>Tur / Daraja</th><td>" + esc(t.subtype || "—") + "</td></tr>";
  rows += "<tr><th>Ishonch</th><td>" + Math.round((t.confidence || 0) * 100) + "%</td></tr>";
  rows += "<tr><th>Qoida</th><td>" + esc(t.rule || "—") + "</td></tr>";

  // Sifat uchun 5 ta lingvistik kategoriya
  if (t.pos === "ADJ" && t.adj_cats) {
    rows += "<tr><td colspan='2' style='padding:6px 8px;font-weight:600;color:#d97706;background:#fef3c720;border-top:2px solid #d9770640'>"
          + "🔶 Sifat lingvistik tahlili</td></tr>";
    const icons = {
      "Belgining xususiyati": "🏷️",
      "Daraja":               "📊",
      "Tuzilishi":            "🧱",
      "Yasalishi":            "⚙️",
      "Sifatning LGM":        "📖",
    };
    for (const [k, v] of Object.entries(t.adj_cats)) {
      rows += "<tr><th>" + (icons[k] || "") + " " + esc(k) + "</th><td><strong>" + esc(v) + "</strong></td></tr>";
    }
  }

  if (t.db) {
    for (const [k, v] of Object.entries(t.db)) {
      if (v && v !== "—" && v !== "∅") {
        rows += "<tr><th>" + esc(k) + "</th><td>" + esc(String(v)) + "</td></tr>";
      }
    }
  }
  rows += "</table>";
  body.innerHTML = rows;
  panel.style.display = "block";
  panel.scrollIntoView({behavior:"smooth", block:"nearest"});
}

/* ── Filter ── */
function setFilter(filter) {
  document.querySelectorAll(".tab").forEach(b => {
    b.classList.toggle("active", b.dataset.filter === filter);
  });
  document.querySelectorAll("#posTableBody tr").forEach(row => {
    const pos  = row.getAttribute("data-pos") || "";
    const stat = row.getAttribute("data-stat") === "1";
    if (filter === "all") {
      row.style.display = "";
    } else if (filter === "UNKNOWN") {
      row.style.display = stat ? "" : "none";
    } else {
      row.style.display = (pos === filter) ? "" : "none";
    }
  });
}

/* ── AI ── */
async function aiAnalyze() {
  const question = (document.getElementById("aiQuestion").value || "").trim();
  const aiBtn    = document.getElementById("aiBtn");
  const aiBtnTxt = document.getElementById("aiBtnText");
  const aiSpinn  = document.getElementById("aiSpinner");
  const respBox  = document.getElementById("aiResponse");
  const answer   = document.getElementById("aiAnswer");

  if (!ALL_TOKENS.length) { toast("Avval matn tahlil qiling!", "error"); return; }

  aiBtn.disabled = true;
  aiSpinn.style.display = "inline-block";
  aiBtnTxt.textContent  = "Javob olinmoqda...";

  try {
    const data = await apiFetch("/api/ai", "POST", {
      text:     document.getElementById("textInput").value.trim(),
      tokens:   ALL_TOKENS,
      question: question,
    });
    answer.innerHTML = formatAI(data.answer);
    respBox.style.display = "block";
  } catch(e) {
    toast("AI xatosi: " + e.message, "error");
  } finally {
    aiBtn.disabled = false;
    aiSpinn.style.display = "none";
    aiBtnTxt.textContent  = "So'rash";
  }
}

function formatAI(text) {
  return text
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

/* ── Export ── */
async function exportExcel() {
  if (!ALL_TOKENS.length) { toast("Avval tahlil qiling!", "error"); return; }

  // 1-usul: Server tomonida xlsx yaratish
  try {
    const res = await fetch(API + "/api/export", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({tokens: ALL_TOKENS, filename: "pos_natijalar"}),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), {href: url, download: "pos_natijalar.xlsx"});
      a.click();
      URL.revokeObjectURL(url);
      toast("Excel fayl yuklandi!", "success");
      return;
    }
  } catch(_) {}

  // 2-usul: SheetJS (CDN dan yuklangan bo'lsa) bilan client-side export
  if (typeof XLSX !== "undefined") {
    const rows = ALL_TOKENS.map((t, i) => ({
      "#":           i + 1,
      "Token":       t.token  || "",
      "O'zak":       t.stem   || "",
      "POS":         t.pos    || "",
      "Turkum":      {"P":"Olmosh","ADV":"Ravish","ADJ":"Sifat","NUM":"Son","N":"Ot","V":"Fe'l","UNKNOWN":"Noma'lum"}[t.pos] || "",
      "Tur":         t.subtype || "",
      "Ishonch %":   Math.round((t.confidence || 0) * 100),
      "Qoida":       t.rule   || "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({wch: 18}));
    XLSX.utils.book_append_sheet(wb, ws, "POS_Tahlil");
    XLSX.writeFile(wb, "pos_natijalar.xlsx");
    toast("Excel fayl saqlandi!", "success");
    return;
  }

  toast("Export ishlamadi — brauzer XLSX kutubxonasini yuklamadi", "error");
}

/* ── Rules Modal ── */
async function showRules() {
  document.getElementById("rulesModal").style.display = "flex";
  const body = document.getElementById("rulesBody");
  body.innerHTML = "<p class='loading-msg'><i class='fas fa-spinner fa-spin'></i> Yuklanmoqda...</p>";
  try {
    const data = await apiFetch("/api/rules");
    body.innerHTML = buildRulesHTML(data.rules);
  } catch(e) {
    body.innerHTML = "<p style='color:red'>Xato: " + e.message + "</p>";
  }
}

function buildRulesHTML(rules) {
  const secs = [
    {key:"olmosh",icon:"fas fa-user",   color:"#059669",title:"Olmosh (P)"},
    {key:"ravish", icon:"fas fa-bolt",  color:"#2563eb",title:"Ravish (ADV)"},
    {key:"sifat",  icon:"fas fa-palette",color:"#d97706",title:"Sifat (ADJ)"},
    {key:"son",    icon:"fas fa-hashtag",color:"#7c3aed",title:"Son (NUM)"},
  ];
  return secs.map(s => {
    const r = rules[s.key];
    if (!r) return "";
    const qHtml = r.qoida
      ? "<div class='rule-qoida'><code>" + esc(r.qoida) + "</code></div>" : "";
    const skip = new Set(["tag","qoida","sufikslar","sufiks_turlari","kelishik_suf",
                           "orttirma","ozaytirma"]);
    const groups = Object.entries(r)
      .filter(([k]) => !skip.has(k))
      .map(([k, v]) => {
        const list = Array.isArray(v) ? v.join(", ") :
                     (typeof v === "object" ? Object.entries(v).map(([a,b]) => a + ": " + (Array.isArray(b) ? b.join(", ") : b)).join(" | ") : String(v));
        return "<div class='rule-group'><span class='rule-key'>" + esc(k) + ":</span> <span class='rule-vals'>" + esc(list) + "</span></div>";
      }).join("");

    const sufs = r.sufikslar || r.sufiks_turlari || r.kelishik_suf;
    const sufHtml = sufs
      ? "<div class='rule-group'><span class='rule-key'>qo'shimchalar:</span> <span class='rule-vals'>" +
        (Array.isArray(sufs) ? sufs.join(", ") :
         Object.entries(sufs).map(([k,v]) => k + ": " + v.join(", ")).join(" | ")) + "</span></div>"
      : "";

    return "<div class='rule-section' style='border-left:4px solid " + s.color + "'>" +
      "<div class='rule-title' style='color:" + s.color + "'><i class='" + s.icon + "'></i> " + s.title + "</div>" +
      qHtml + groups + sufHtml + "</div>";
  }).join("");
}

/* ── Utility ── */
function esc(s) {
  return String(s || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* ── INIT ── */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("analyzeBtn").addEventListener("click", analyze);

  document.getElementById("clearBtn").addEventListener("click", () => {
    document.getElementById("textInput").value = "";
    document.getElementById("resultsSection").style.display = "none";
    document.getElementById("detailPanel").style.display    = "none";
    ALL_TOKENS = [];
  });

  // Example sentences
  document.querySelectorAll(".ex-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("textInput").value = btn.dataset.txt;
      analyze();
    });
  });

  // Filter tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter));
  });

  // Detail close
  document.getElementById("detailClose").addEventListener("click", () => {
    document.getElementById("detailPanel").style.display = "none";
  });

  // Rules modal
  document.getElementById("rulesBtn").addEventListener("click", showRules);
  document.getElementById("rulesClose").addEventListener("click", () => {
    document.getElementById("rulesModal").style.display = "none";
  });
  document.getElementById("rulesModal").addEventListener("click", e => {
    if (e.target === document.getElementById("rulesModal"))
      document.getElementById("rulesModal").style.display = "none";
  });

  // Export
  document.getElementById("exportBtn").addEventListener("click", exportExcel);

  // Ctrl+Enter
  document.getElementById("textInput").addEventListener("keydown", e => {
    if (e.ctrlKey && e.key === "Enter") analyze();
  });
});
