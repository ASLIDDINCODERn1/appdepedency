/* ================================================================
   script.js — Morphological POS tagging v3.0
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
  P:"#059669", RR:"#2563eb", JJ:"#d97706",
  NUM:"#7c3aed", N:"#64748b", V:"#db2777",
  PUNCT:"#94a3b8", UNKNOWN:"#6b7280",
};
const POS_LABEL = {
  P:"Olmosh", RR:"Ravish", JJ:"Sifat", NUM:"Son",
  N:"Ot", V:"Fe'l", PUNCT:"Tinish", UNKNOWN:"Noma'lum",
};
const POS_ICON = {
  P:"fas fa-user", RR:"fas fa-bolt", JJ:"fas fa-palette",
  NUM:"fas fa-hashtag", N:"fas fa-font", V:"fas fa-running",
  PUNCT:"fas fa-minus", UNKNOWN:"fas fa-question",
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
    const isStatRow = t.rule === "stat_model";
    const hasDb     = t.db && Object.keys(t.db).length > 0;
    const hasCats   = t.cats && Object.keys(t.cats).length > 0;
    const clickable = hasDb || hasCats;

    const tr = document.createElement("tr");
    tr.setAttribute("data-pos",   pos);
    tr.setAttribute("data-idx",   idx);
    tr.setAttribute("data-stat",  isStatRow ? "1" : "0");
    if (isStatRow)  tr.classList.add("stat-row");
    if (clickable)  tr.style.cursor = "pointer";

    tr.innerHTML =
      "<td class='td-num'>" + (idx + 1) + "</td>" +
      "<td class='td-token'><strong>" + esc(t.token) + "</strong>" +
        (isStatRow ? " <span class='tahminiy-tag'>tahminiy</span>" : "") +
      "</td>" +
      "<td class='td-stem mono'>" + esc(t.stem || "—") + "</td>" +
      "<td class='td-pos'><span class='pos-badge' style='background:" + color + "20;color:" + color + ";border:1px solid " + color + "40'><i class='" + (POS_ICON[pos] || "fas fa-tag") + "'></i> " + pos + "</span></td>" +
      "<td>" + label + "</td>" +
      "<td class='td-sub'>" + esc(t.subtype || "—") + "</td>";

    if (clickable) {
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
  rows += "<tr><th>LEMMA</th><td>" + esc(t.stem || "—") + "</td></tr>";
  rows += "<tr><th>XPOS</th><td><strong>" + esc(t.pos) + "</strong> — " + esc(POS_LABEL[t.pos] || "") + "</td></tr>";

  // Datasetdagi lingvistik tahlilni (DB yoki rule cats) ko'rsatish
  const headerMap = {
    "P":   { color: "#059669", label: "Olmosh lingvistik tahlili"  },
    "RR":  { color: "#2563eb", label: "Ravish lingvistik tahlili"  },
    "JJ":  { color: "#d97706", label: "Sifat lingvistik tahlili"   },
    "NUM": { color: "#7c3aed", label: "Son lingvistik tahlili"     },
    "V":   { color: "#db2777", label: "Fe'l lingvistik tahlili"    },
    "N":   { color: "#64748b", label: "Ot lingvistik tahlili"      },
  };
  const h = headerMap[t.pos] || { color: "#64748b", label: "Lingvistik tahlil" };

  // DB dan kelgan ma'lumotlar (datasetning aynan o'zining maydonlari)
  if (t.db && Object.keys(t.db).length) {
    rows += "<tr><td colspan='2' style='padding:6px 8px;font-weight:600;color:" +
            h.color + ";background:" + h.color + "14;border-top:2px solid " + h.color + "40'>" +
            h.label + " (dataset)</td></tr>";
    for (const [k, v] of Object.entries(t.db)) {
      if (v && v !== "—" && v !== "∅") {
        rows += "<tr><th>" + esc(k) + "</th><td><strong>" + esc(String(v)) + "</strong></td></tr>";
      }
    }
  }

  // Rule-engine tomonidan sintezlangan kategoriyalar (DB topilmaganda)
  if (t.cats && Object.keys(t.cats).length && !(t.db && Object.keys(t.db).length)) {
    rows += "<tr><td colspan='2' style='padding:6px 8px;font-weight:600;color:" +
            h.color + ";background:" + h.color + "14;border-top:2px solid " + h.color + "40'>" +
            h.label + "</td></tr>";
    for (const [k, v] of Object.entries(t.cats)) {
      if (!v || v === "—") continue;
      rows += "<tr><th>" + esc(k) + "</th><td><strong>" + esc(String(v)) + "</strong></td></tr>";
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
      "Lemma":       t.stem   || "",
      "XPOS":        t.pos    || "",
      "Turkum":      POS_LABEL[t.pos] || "",
      "Tur":         t.subtype || "",
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
