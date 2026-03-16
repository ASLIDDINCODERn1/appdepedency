/* ============================================================
   main.js — O'zbek Morfologik Tahlil
   database.json dan o'qiydi (Python bilan yaratilgan)
   ============================================================ */

let DB = {};

const POS_COLS = {
  sifat:  ['Belgining xususiyati', 'Daraja', 'Tuzilishi', 'Yasalishi', "Sifatning LMGlari"],
  son:    ["Ma'noviy xususiyatlari", "Hisob so'zlar", "Bir so'zining ma'nolari", "Tuzilishiga ko'ra"],
  olmosh: ["Ma'noviy guruhlari", 'Tuzilishi', 'Yasalishi', 'Kelishik', 'Son', 'Egalik', 'Vazifasi'],
};

const POS_LABEL = { sifat: 'Sifat', son: 'Son', olmosh: 'Olmosh' };
const POS_COLOR = { sifat: '#7c3aed', son: '#0891b2', olmosh: '#059669' };
const POS_EMOJI = { sifat: '🎨', son: '🔢', olmosh: '👤' };

function toKey(text) {
  return String(text)
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bb\u02bc'`"]/g, '')
    .replace(/[.,!?;:()«»\[\]{}]/g, '')
    .trim();
}

function toast(msg, type = 'info') {
  const box = document.getElementById('toastContainer');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${{ success:'✅', error:'❌', info:'ℹ️' }[type] || 'ℹ️'}</span><span>${msg}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 300); }, 3500);
}

/* ── 1. database.json YUKLASH ── */
async function loadDatabase() {
  const statusEl = document.getElementById('dbStatus');
  const paths = ['./data/database.json', '/data/database.json', './database.json'];

  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (!res.ok) continue;
      DB = await res.json();
      const count = Object.keys(DB).length;
      if (statusEl) {
        statusEl.textContent = `✅ Baza tayyor: ${count} ta so'z`;
        statusEl.style.color = '#16a34a';
      }
      toast(`Baza yuklandi! ${count} ta so'z`, 'success');
      return;
    } catch (_) {}
  }

  if (statusEl) {
    statusEl.textContent = '❌ database.json topilmadi!';
    statusEl.style.color = '#dc2626';
  }
  toast("database.json topilmadi! ./data/ papkasiga qo'ying.", 'error');
}

/* ── 2. SO'Z QIDIRISH ── */
const SUFFIXES = [
  'larimizdan','larimizga','larimizni','larimizda','larining',
  'laridan','lariga','larini','larida',
  'imizdan','imizga','imizni','imizda','imizning',
  'ingizdan','ingizga','ingizni','ingizda',
  'lardan','larga','larni','larda',
  'ning','dan','ga','ni','da','ka','qa',
  'miz','ngiz','lari','lar',
  'im','ng','si','i','m',
  'roq','mtir','gina','dir','mi','chi','oq',
];

function findWord(raw) {
  const key = toKey(raw);
  if (DB[key]) return { entry: { ...DB[key] }, stemmed: false, suffix: '', key };

  for (const suf of SUFFIXES) {
    const sk = toKey(suf);
    if (key.length > sk.length + 1 && key.endsWith(sk)) {
      const root = key.slice(0, -sk.length);
      if (root.length >= 2 && DB[root]) {
        return { entry: { ...DB[root] }, stemmed: true, suffix: suf, key: root };
      }
    }
  }
  return null;
}

/* ── 3. KARTA YARATISH ── */
function buildCard(num, originalWord, found) {
  const card = document.createElement('div');
  card.className = 'word-card';

  if (!found) {
    card.innerHTML = `
      <div class="word-card-header other">
        <span class="word-num">${num}.</span>
        <span class="word-title">${originalWord}</span>
        <span class="badge other">❓ Topilmadi</span>
      </div>
      <div class="word-card-body">
        <table>
          <tr><th>ID</th><td>${num}</td></tr>
          <tr><th>FORM</th><td>${originalWord}</td></tr>
          <tr><th>LEMMA</th><td class="dim">—</td></tr>
          <tr><th>FEATS</th><td class="dim">—</td></tr>
          <tr><th>XPOS</th><td class="dim">—</td></tr>
        </table>
        <p class="not-found">⚠️ Bu so'z bazadan topilmadi</p>
      </div>`;
    return card;
  }

  const { entry, stemmed, suffix } = found;
  const pos   = entry.posType;
  const color = POS_COLOR[pos] || '#64748b';
  const label = POS_LABEL[pos] || pos;
  const emoji = POS_EMOJI[pos] || '📚';

  let feats = (entry.FEATS && entry.FEATS !== '—') ? entry.FEATS : '∅';
  if (stemmed && suffix) feats = feats === '∅' ? `+${suffix}` : `${feats} +${suffix}`;

  const lemma = (entry.LEMMA && entry.LEMMA !== '—') ? entry.LEMMA : (entry.ORIGINAL_FORM || originalWord);

  const baseRows = [
    ['ID',    String(num)],
    ['FORM',  originalWord],
    ['LEMMA', lemma],
    ['FEATS', feats],
    ['XPOS',  entry.XPOS || '—'],
  ];

  let tRows = baseRows.map(([k, v], i) =>
    `<tr><th>${k}</th><td class="${i < 3 ? 'strong' : ''}">${v || '—'}</td></tr>`
  ).join('');

  (POS_COLS[pos] || []).forEach(col => {
    const v = entry[col] && entry[col] !== '—' ? entry[col] : '—';
    tRows += `<tr><th>${col}</th><td class="${v === '—' ? 'dim' : ''}">${v}</td></tr>`;
  });

  const stemBadge = stemmed ? `<span class="badge stem">~o'zak (+${suffix})</span>` : '';

  card.innerHTML = `
    <div class="word-card-header" style="border-left:4px solid ${color}; background:${color}15">
      <span class="word-num">${num}.</span>
      <span class="word-title">${originalWord}</span>
      <div class="badges">
        ${stemBadge}
        <span class="badge" style="background:${color}">${emoji} ${label}</span>
      </div>
    </div>
    <div class="word-card-body">
      <table>${tRows}</table>
    </div>`;

  return card;
}

/* ── 4. TAHLIL ── */
function analyze() {
  const text = (document.getElementById('wordInput')?.value || '').trim();
  if (!text) { toast('Matn kiriting!', 'error'); return; }
  if (!Object.keys(DB).length) { toast('Baza yuklanmagan, biroz kuting...', 'error'); return; }

  const btn     = document.getElementById('analyzeBtn');
  const btnText = document.getElementById('btnText');
  const spinner = document.getElementById('btnSpinner');
  if (btn)     btn.disabled         = true;
  if (spinner) spinner.style.display = 'inline-block';
  if (btnText) btnText.textContent   = 'Tahlil qilinmoqda...';

  const section = document.getElementById('resultSection');
  const grid    = document.getElementById('resultsGrid');
  if (section) section.style.display = 'none';
  if (grid)    grid.innerHTML        = '';

  const words = text.split(/\s+/).filter(w => w.length > 0);

  setTimeout(() => {
    const stats = { sifat: 0, son: 0, olmosh: 0, topilmadi: 0 };

    words.forEach((word, i) => {
      const found = findWord(word);
      grid?.appendChild(buildCard(i + 1, word, found));
      if (found) stats[found.entry.posType] = (stats[found.entry.posType] || 0) + 1;
      else       stats.topilmadi++;
    });

    const statsEl = document.getElementById('resultStats');
    if (statsEl) {
      statsEl.innerHTML = [
        stats.sifat     ? `<span class="chip sifat">🎨 Sifat: ${stats.sifat}</span>`       : '',
        stats.son       ? `<span class="chip son">🔢 Son: ${stats.son}</span>`               : '',
        stats.olmosh    ? `<span class="chip olmosh">👤 Olmosh: ${stats.olmosh}</span>`      : '',
        stats.topilmadi ? `<span class="chip other">❓ Topilmadi: ${stats.topilmadi}</span>` : '',
      ].filter(Boolean).join('');
    }

    if (section) section.style.display = 'block';
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`${words.length} ta so'z tahlil qilindi!`, 'success');

    if (btn)     btn.disabled         = false;
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.textContent   = '🔍 Tahlil qilish';
  }, 200);
}

/* ── 5. XLSX EXPORT ── */
function exportXlsx() {
  const cards = document.querySelectorAll('.word-card');
  if (!cards.length) { toast('Avval tahlil qiling!', 'error'); return; }

  const wb = XLSX.utils.book_new();
  const rows = [];
  cards.forEach(card => {
    const row = {};
    card.querySelectorAll('tr').forEach(tr => {
      const th = tr.querySelector('th');
      const td = tr.querySelector('td');
      if (th && td) row[th.innerText.trim()] = td.innerText.trim();
    });
    if (Object.keys(row).length) rows.push(row);
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Morfologik_Tahlil');
  XLSX.writeFile(wb, 'Morfologik_Tahlil_Natijalari.xlsx');
  toast('Excel fayli saqlandi!', 'success');
}

/* ── 6. EVENT LISTENERS ── */
document.addEventListener('DOMContentLoaded', () => {
  loadDatabase();

  document.getElementById('analyzeBtn')
    ?.addEventListener('click', analyze);

  (document.getElementById('exportBtn') || document.getElementById('exportXlsxBtn'))
    ?.addEventListener('click', exportXlsx);

  document.getElementById('wordInput')
    ?.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') analyze(); });

  const sw = document.getElementById('checkbox');
  if (sw) {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      sw.checked = true;
    }
    sw.addEventListener('change', e => {
      const t = e.target.checked ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('theme', t);
    });
  }
});