/* ============================================================
   main.js — O'zbek Morfologik Tahlil (YANGILANGAN)
   database.json (siz tashlagan versiya) bilan 100% mos
   - Olmosh / Sifat / Son shablonlari to'g'ri aniqlanadi
   - Qo'shma sonlar va iboralar ("yigirma ikki", "mana bu", "bir nima" va h.k.) bir butun sifatida taniladi
   - "—" va "∅" qiymatli ustunlar tufayli noto'g'ri turkum aniqlanmasligi tuzatildi
   ============================================================ */

let DB = {};

// SHABLONLARGA TO'LIQ MOS USTUNLAR
const POS_COLS = {
  sifat:  ['Belgining xususiyati', 'Daraja', 'Tuzulishi', 'Yasalishi', 'Sifatning LMGlari'],
  son:    [" Ma'noviy xususiyatlari", "Hisob so'zlar", "Bir so'zining ma'nolari", "Tuzalishiga ko'ra"],
  olmosh: ["Olmoshlarning ma'noviy guruhlari", 'Tuzilishi', 'Yasalishi', 'Kelishik', 'Son', 'Egalik', "Olmoshlarning gapda bajaradigan vazifasiga ko\u2018ra turlari"],
};

const POS_LABEL = { sifat: 'Sifat', son: 'Son', olmosh: 'Olmosh', other: 'Boshqa' };
const POS_COLOR = { sifat: '#7c3aed', son: '#0891b2', olmosh: '#059669', other: '#64748b' };
const POS_EMOJI = { sifat: '🎨', son: '🔢', olmosh: '👤', other: '📝' };

function toKey(text) {
  if (!text) return '';
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

/* ── 1. DATABASE YUKLASH + TO'G'RI POS ANIQLASH ── */
async function loadDatabase() {
  const statusEl = document.getElementById('dbStatus');
  const paths = ['./data/database.json', '/data/database.json', './database.json'];

  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (!res.ok) continue;
      
      const rawData = await res.json();
      DB = {};
      let count = 0;

      if (Array.isArray(rawData)) {
        rawData.forEach(item => {
          if (!item.FORM || item.ID === 'ID' || item.ID === "ID") return;

          const key = toKey(item.FORM);

          let posType = 'other';
          if (item["Olmoshlarning ma'noviy guruhlari"] && 
              item["Olmoshlarning ma'noviy guruhlari"] !== "—" && 
              item["Olmoshlarning ma'noviy guruhlari"] !== "∅" && 
              item["Olmoshlarning ma'noviy guruhlari"] !== "") {
            posType = 'olmosh';
          } else if (item["Belgining xususiyati"] && 
                     item["Belgining xususiyati"] !== "—" && 
                     item["Belgining xususiyati"] !== "∅" && 
                     item["Belgining xususiyati"] !== "") {
            posType = 'sifat';
          } else if (item[" Ma'noviy xususiyatlari"] && 
                     item[" Ma'noviy xususiyatlari"] !== "—" && 
                     item[" Ma'noviy xususiyatlari"] !== "∅" && 
                     item[" Ma'noviy xususiyatlari"] !== "") {
            posType = 'son';
          }

          item.posType = posType;
          DB[key] = item;
          count++;
        });
      }

      if (statusEl) {
        statusEl.textContent = `✅ Baza tayyor: ${count} ta so'z`;
        statusEl.style.color = '#16a34a';
      }
      toast(`Baza yuklandi! ${count} ta so'z (qo'shma iboralar qo'llab-quvvatlanadi)`, 'success');
      return;
    } catch (err) {
      console.warn("Fayl o'qishda xatolik:", err);
    }
  }

  if (statusEl) {
    statusEl.textContent = '❌ database.json topilmadi!';
    statusEl.style.color = '#dc2626';
  }
  toast("database.json topilmadi! ./data/ yoki ildizga qo'ying.", 'error');
}

/* ── 2. SO'Z QIDIRISH (suffiks bilan) ── */
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

/* ── SO'Z SON (Num) ekanligini tekshirish ── */
function isNum(word) {
  const found = findWord(word);
  if (!found) return false;
  const xpos = (found.entry.XPOS || '').toLowerCase();
  return xpos === 'num';
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
        <p class="not-found">⚠️ Bu so'z/ibora bazadan topilmadi</p>
      </div>`;
    return card;
  }

  const { entry, stemmed, suffix } = found;
  const pos   = entry.posType || 'other'; 
  const color = POS_COLOR[pos] || '#64748b';
  const label = POS_LABEL[pos] || pos.toUpperCase();
  const emoji = POS_EMOJI[pos] || '📝';

  let feats = (entry.FEATS && entry.FEATS !== '—' && entry.FEATS !== '∅') ? entry.FEATS : '∅';
  if (stemmed && suffix) feats = feats === '∅' ? `+${suffix}` : `${feats} +${suffix}`;

  const lemma = (entry.LEMMA && entry.LEMMA !== '—') ? entry.LEMMA : originalWord;

  const baseRows = [
    ['ID',    String(entry.ID || num)],
    ['FORM',  entry.FORM || originalWord],
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
  if (!Object.keys(DB).length) { toast('Baza yuklanmagan...', 'error'); return; }

  const btn = document.getElementById('analyzeBtn');
  const btnText = document.getElementById('btnText');
  const spinner = document.getElementById('btnSpinner');
  if (btn) btn.disabled = true;
  if (spinner) spinner.style.display = 'inline-block';
  if (btnText) btnText.textContent = 'Tahlil qilinmoqda...';

  const section = document.getElementById('resultSection');
  const grid = document.getElementById('resultsGrid');
  if (section) section.style.display = 'none';
  if (grid) grid.innerHTML = '';

  const originalTokens = text.split(/\s+/).filter(w => w.length > 0);
  const analysisResults = [];
  let i = 0;

  while (i < originalTokens.length) {
    let matched = false;

    // 1-qadam: DB da qo'shma ibora bormi? (4 so'zgacha, eng uzunidan)
    const maxLen = Math.min(4, originalTokens.length - i);
    for (let len = maxLen; len >= 2; len--) {
      const phrase = originalTokens.slice(i, i + len).join(' ');
      const key = toKey(phrase);
      if (DB[key]) {
        analysisResults.push({
          original: phrase,
          found: { entry: { ...DB[key] }, stemmed: false, suffix: '', key }
        });
        i += len;
        matched = true;
        break;
      }
    }

    if (matched) continue;

    // 2-qadam: DB da yo'q — ketma-ket Num+Num bo'lsa birlashtir
    // Masalan: "yigirma ikki" DB da yo'q, lekin ikkalasi ham Num => qo'shma son
    if (i + 1 < originalTokens.length && isNum(originalTokens[i]) && isNum(originalTokens[i + 1])) {
      // Necha Num ketma-ket kelishini topamiz (max 4)
      let numLen = 1;
      while (numLen < 4 && i + numLen < originalTokens.length && isNum(originalTokens[i + numLen])) {
        numLen++;
      }
      const phrase = originalTokens.slice(i, i + numLen).join(' ');
      // Birinchi Num entryni asos qilib olamiz, FORM ni yangilaymiz
      const baseFound = findWord(originalTokens[i]);
      if (baseFound) {
        const mergedEntry = {
          ...baseFound.entry,
          FORM:  phrase,
          LEMMA: phrase,
          FEATS: '∅',
          posType: 'son',
        };
        analysisResults.push({
          original: phrase,
          found: { entry: mergedEntry, stemmed: false, suffix: '' }
        });
        i += numLen;
        matched = true;
      }
    }

    if (matched) continue;

    // 3-qadam: oddiy bitta so'z + suffiks
    const single = originalTokens[i];
    const found = findWord(single);
    analysisResults.push({ original: single, found: found || null });
    i++;
  }

  setTimeout(() => {
    const stats = { sifat: 0, son: 0, olmosh: 0, topilmadi: 0 };

    analysisResults.forEach((res, idx) => {
      const found = res.found;
      grid?.appendChild(buildCard(idx + 1, res.original, found));
      if (found) {
        const p = found.entry.posType || 'other';
        stats[p] = (stats[p] || 0) + 1;
      } else {
        stats.topilmadi++;
      }
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
    toast(`${analysisResults.length} ta so'z/ibora tahlil qilindi!`, 'success');

    if (btn) btn.disabled = false;
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.textContent = '🔍 Tahlil qilish';
  }, 200);
}

/* ── 5. XLSX EXPORT (o'zgarmagan) ── */
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