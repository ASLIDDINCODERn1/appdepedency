/* ============================================================
   script.js — O'ZBEK MORFOLOGIK TAHLIL
   ============================================================ */

let DB = {};

/* ==================== TURKUM KONFIGURATSIYASI ==================== */
const POS_LABEL = { ot: 'Ot', fel: "Fe'l", sifat: 'Sifat', son: 'Son', ravish: 'Ravish', olmosh: 'Olmosh' };
const POS_COLOR = { ot: '#8b5cf6', fel: '#ec4899', sifat: '#7c3aed', son: '#0891b2', ravish: '#14b8a6', olmosh: '#059669' };
const POS_EMOJI = { ot: '📕', fel: '🏃', sifat: '🎨', son: '🔢', ravish: '⚡', olmosh: '👤' };

const COL_OLMOSH_GRUPLAR = 'Olmoshlarning ma\u2019noviy guruhlari';
const COL_OLMOSH_VAZIFA  = 'Olmoshlarning gapda bajaradigan vazifasiga ko\u2018ra turlari';
const COL_SON_MANOV      = " Ma'noviy xususiyatlari";

const POS_COLS = {
  sifat:  ['Belgining xususiyati', 'Daraja', 'Tuzulishi', 'Yasalishi', 'Sifatning LMGlari'],
  olmosh: [COL_OLMOSH_GRUPLAR, 'Tuzilishi', 'Yasalishi', 'Kelishik', 'Son', 'Egalik', COL_OLMOSH_VAZIFA],
  son:    [COL_SON_MANOV, "Hisob so'zlar", "Bir so'zining ma'nolari", "Tuzalishiga ko'ra"],
  ot: [], fel: [], ravish: []
};

/* Barcha POS_COLS kalitlari — buildCard da "keraksiz ustun" filtrash uchun */
const ALL_POS_COLS = new Set(Object.values(POS_COLS).flat());

const SON_SUFFIXES = [
  'ta','tasi','tadan','taga','tani','tada','taning',
  'inchi','nchi','inchisi','nchisi','inchidan','nchidan',
  'inchiga','nchiga','inchini','nchini','inchining','nchining'
];
const SUFFIXES = [
  'larimizdan','larimizga','larimizni','larimizda','larining','laridan','lariga','larini','larida',
  'imizdan','imizga','imizni','imizda','imizning','ingizdan','ingizga','ingizni','ingizda',
  'lardan','larga','larni','larda','ning','dan','ga','ni','da','ka','qa',
  'miz','ngiz','lari','lar','im','ng','si','i','m',
  'roq','mtir','gina','dir','mi','chi','oq'
];

/* ==================== NORMALIZATSIYA ==================== */
function toKey(text) {
  if (!text) return '';
  return String(text).toLowerCase()
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

/* ==================== DATABASE YUKLASH ==================== */
async function loadDatabase() {
  const paths = ['./data/database.json', '/data/database.json', './database.json'];
  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (!res.ok) continue;
      const rawData = await res.json();
      DB = {};
      let count = 0;

      const arr = Array.isArray(rawData)
        ? rawData
        : (rawData.Dataset2 || rawData.dataset2 || []);

      arr.forEach(item => {
        if (!item || !item.FORM || item.ID === 'ID') return;
        const formStr = String(item.FORM).trim();
        if (!formStr || formStr === 'FORM') return;

        const key = toKey(formStr);
        if (!key) return;

        /* POS aniqlash — ustun MAVJUDLIGI bo'yicha */
        let posType = 'ot';
        if (COL_OLMOSH_GRUPLAR in item) {
          posType = 'olmosh';
        } else if ('Belgining xususiyati' in item) {
          posType = 'sifat';
        } else if (COL_SON_MANOV in item) {
          posType = 'son';
        } else if (item["Fe'lning ma'noviy guruhlari"] || item.Zamon || item.Shaxs || item.XPOS === 'V' || item.XPOS === 'VB') {
          posType = 'fel';
        } else if (item["Ravishning ma'noviy guruhlari"] || item.XPOS === 'RR' || item.XPOS === 'MD') {
          posType = 'ravish';
        }

        item.posType = posType;

        if (!(key in DB) || (DB[key].posType === 'ot' && posType !== 'ot')) {
          DB[key] = item;
        }
        count++;
      });

      toast(`Database yuklandi! ${count} ta so'z`, 'success');
      return;
    } catch (e) {
      console.warn('DB load error:', e);
    }
  }
  toast("database.json topilmadi!", 'error');
}

/* ==================== QIDIRUV ==================== */
function findWord(raw) {
  const key = toKey(raw);
  if (DB[key]) return { entry: { ...DB[key] }, stemmed: false, suffix: '' };

  for (const suf of [...SUFFIXES, ...SON_SUFFIXES]) {
    const sk = toKey(suf);
    if (key.length > sk.length + 1 && key.endsWith(sk)) {
      const root = key.slice(0, -sk.length);
      if (root.length >= 2 && DB[root]) {
        const entry = { ...DB[root] };
        if (SON_SUFFIXES.includes(suf)) entry.posType = 'son';
        return { entry, stemmed: true, suffix: suf };
      }
    }
  }
  return null;
}

function isNum(word) {
  if (/^\d+$/.test(word)) return true;
  const found = findWord(word);
  if (found && (found.entry.XPOS || '').toLowerCase() === 'num') return true;
  return /yigirma|o'ttiz|qirq|ellik|oltmish|yetmish|sakson|to'qson|yuz|ming|million|milliard/i.test(word);
}

function isOlmosh(word) {
  const olmoshlar = ['u','biz','siz','men','sen','bizni','senga','nima','qaysi','harna','hu','shu','qayer','kimsa'];
  if (olmoshlar.some(o => word.toLowerCase() === o)) return true;
  const found = findWord(word);
  return !!(found && found.entry.XPOS === 'P');
}

function isSifat(word) {
  const found = findWord(word);
  return !!(found && found.entry['Belgining xususiyati'] && found.entry['Belgining xususiyati'] !== '—');
}

/* ==================== KARTA ==================== */
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
  const pos   = entry.posType || 'ot';
  const color = POS_COLOR[pos] || '#64748b';
  const label = POS_LABEL[pos] || pos;
  const emoji = POS_EMOJI[pos] || '📝';

  const rawFeats = (entry.FEATS && entry.FEATS !== '—' && entry.FEATS !== '∅')
    ? entry.FEATS.trim() : '∅';
  let feats = rawFeats;
  if (stemmed && suffix && rawFeats === '∅') feats = `+${suffix}`;
  else if (stemmed && suffix && !rawFeats.includes(suffix)) feats = `${rawFeats} +${suffix}`;

  const lemma = (entry.LEMMA && entry.LEMMA !== '—') ? entry.LEMMA : originalWord;

  /* Asosiy 5 ta satr */
  const BASE_KEYS = ['ID', 'FORM', 'LEMMA', 'FEATS', 'XPOS'];
  let tRows = '';
  tRows += `<tr><th>ID</th><td class="strong">${entry.ID || num}</td></tr>`;
  tRows += `<tr><th>FORM</th><td class="strong">${entry.FORM || originalWord}</td></tr>`;
  tRows += `<tr><th>LEMMA</th><td class="strong">${lemma}</td></tr>`;
  tRows += `<tr><th>FEATS</th><td>${feats}</td></tr>`;
  tRows += `<tr><th>XPOS</th><td>${entry.XPOS || '—'}</td></tr>`;

  /* Faqat shu POS ga xos ustunlar */
  (POS_COLS[pos] || []).forEach(col => {
    const v = (entry[col] && entry[col] !== '—') ? entry[col] : '—';
    tRows += `<tr><th>${col}</th><td class="${v === '—' ? 'dim' : ''}">${v}</td></tr>`;
  });

  /* ✅ Qolgan ustunlar — FAQAT BASE va POS_COLS da yo'q, va Column* emas,
     va barcha POS_COLS (boshqa turlarniki ham) da yo'q ustunlar */
  const skipCols = new Set([...BASE_KEYS, 'posType', ...ALL_POS_COLS]);
  Object.keys(entry)
    .filter(k => {
      if (skipCols.has(k)) return false;
      if (/^Column\d+$/i.test(k)) return false;   // Column13, Column14... o'tkazib yuborish
      return true;
    })
    .sort()
    .forEach(k => {
      const v = (entry[k] !== undefined && String(entry[k]).trim() !== '') ? entry[k] : '—';
      tRows += `<tr><th>${k}</th><td class="${v === '—' ? 'dim' : ''}">${v}</td></tr>`;
    });

  card.innerHTML = `
    <div class="word-card-header" style="border-left:4px solid ${color};background:${color}15">
      <span class="word-num">${num}.</span>
      <span class="word-title">${originalWord}</span>
      <div class="badges">
        ${suffix ? `<span class="badge stem">~o'zak (+${suffix})</span>` : ''}
        <span class="badge" style="background:${color}">${emoji} ${label}</span>
      </div>
    </div>
    <div class="word-card-body"><table>${tRows}</table></div>`;
  return card;
}

/* ==================== TAHLIL ==================== */
function analyze() {
  const text = (document.getElementById('wordInput')?.value || '').trim();
  if (!text) return toast('Matn kiriting!', 'error');
  if (!Object.keys(DB).length) return toast('Baza yuklanmagan...', 'error');

  const btn     = document.getElementById('analyzeBtn');
  const btnText = document.getElementById('btnText');
  const spinner = document.getElementById('btnSpinner');
  if (btn)     btn.disabled          = true;
  if (spinner) spinner.style.display = 'inline-block';
  if (btnText) btnText.textContent   = 'Tahlil qilinmoqda...';

  const section = document.getElementById('resultSection');
  const grid    = document.getElementById('resultsGrid');
  if (section) section.style.display = 'none';
  if (grid)    grid.innerHTML        = '';

  const tokens = text.split(/\s+/).filter(w => w.length > 0);
  const results = [];
  let i = 0;

  while (i < tokens.length) {
    let matched = false;

    /* 1. DB da to'liq ibora */
    for (let len = Math.min(4, tokens.length - i); len >= 2; len--) {
      const phrase    = tokens.slice(i, i + len).join(' ');
      const phraseKey = toKey(phrase);
      if (DB[phraseKey]) {
        results.push({ original: phrase, found: { entry: { ...DB[phraseKey] }, stemmed: false, suffix: '' } });
        i += len; matched = true; break;
      }
    }
    if (matched) continue;

    /* 2. Qo'shma son: Num + Num */
    if (isNum(tokens[i])) {
      let numLen = 1;
      while (numLen < 6 && i + numLen < tokens.length && isNum(tokens[i + numLen])) numLen++;

      if (numLen > 1) {
        const phrase    = tokens.slice(i, i + numLen).join(' ');
        const baseFound = findWord(tokens[i]);
        const lastFound = findWord(tokens[i + numLen - 1]);

        /* FEATS: lastFound.entry.FEATS dan olamiz */
        const lastFeats = lastFound
          ? (lastFound.entry.FEATS && lastFound.entry.FEATS !== '∅' && lastFound.entry.FEATS !== '—'
              ? lastFound.entry.FEATS.trim()
              : '')
          : '';

        /* LEMMA: barcha tokenlar uchun LEMMA larini birlashtir
           Masalan: tokens=["ellik","uchinchi"] -> lemmas=["ellik","uch"] -> "ellik uch" */
        const allLemmas = tokens.slice(i, i + numLen).map((tok, idx) => {
          const fw = idx === 0 ? baseFound : (idx === numLen - 1 ? lastFound : findWord(tok));
          return fw ? (fw.entry.LEMMA || tok) : tok;
        });
        const mergedLemma = allLemmas.join(' ');

        /* Son ustunlarini - base yoki last - qaysi birida son dataset bo'lsa o'sha dan olamiz
           Masalan: "ellik uchinchi" da ellik son dataset da, uchinchi sifat dataset da.
           Shuning uchun faqat lastFound emas, ikkalasini tekshiramiz. */
        const sonCols = [COL_SON_MANOV, "Hisob so'zlar", "Bir so'zining ma'nolari", "Tuzalishiga ko'ra"];
        const sonColValues = {};
        const allEntries = [baseFound, lastFound].filter(Boolean).map(f => f.entry);
        sonCols.forEach(col => {
          let found_val = '—';
          for (const ent of allEntries) {
            const v = ent[col];
            if (v && v !== '—') { found_val = v; break; }
          }
          sonColValues[col] = found_val;
        });

        const merged = {
          ...(baseFound ? baseFound.entry : {}),
          FORM:    phrase,
          LEMMA:   mergedLemma,
          FEATS:   lastFeats || '∅',
          XPOS:    'Num',
          posType: 'son',
          ...sonColValues,   /* son ustunlarini ustiga yozamiz */
        };

        const suf = lastFeats ? lastFeats.replace(/^\+/, '').split('+')[0] : '';
        results.push({ original: phrase, found: { entry: merged, stemmed: !!suf, suffix: suf } });
        i += numLen; matched = true;
      }
    }
    if (matched) continue;

    /* 3. Bitta so'z */
    const single = tokens[i];
    let found = findWord(single);

    if (!found) {
      if (isOlmosh(single)) {
        found = { entry: { posType: 'olmosh', FORM: single, LEMMA: single, FEATS: '∅', XPOS: 'P' }, stemmed: false, suffix: '' };
      } else if (isSifat(single)) {
        found = { entry: { posType: 'sifat', FORM: single, LEMMA: single, FEATS: '∅', XPOS: 'JJ' }, stemmed: false, suffix: '' };
      } else if (isNum(single)) {
        found = { entry: { posType: 'son', FORM: single, LEMMA: single, FEATS: '∅', XPOS: 'Num' }, stemmed: false, suffix: '' };
      }
    }

    results.push({ original: single, found: found || null });
    i++;
  }

  setTimeout(() => {
    const stats = { ot: 0, fel: 0, sifat: 0, son: 0, ravish: 0, olmosh: 0, topilmadi: 0 };
    results.forEach((res, idx) => {
      grid.appendChild(buildCard(idx + 1, res.original, res.found));
      if (res.found) {
        const p = res.found.entry.posType || 'ot';
        stats[p] = (stats[p] || 0) + 1;
      } else {
        stats.topilmadi++;
      }
    });

    const statsEl = document.getElementById('resultStats');
    if (statsEl) {
      statsEl.innerHTML = Object.keys(stats)
        .filter(k => stats[k] > 0)
        .map(k => {
          if (k === 'topilmadi') return `<span class="chip other">❓ Topilmadi: ${stats.topilmadi}</span>`;
          return `<span class="chip ${k}">${POS_EMOJI[k] || '📝'} ${POS_LABEL[k] || k}: ${stats[k]}</span>`;
        }).join('');
    }

    if (section) { section.style.display = 'block'; section.scrollIntoView({ behavior: 'smooth' }); }
    toast(`${results.length} ta so'z/ibora tahlil qilindi!`, 'success');

    if (btn)     btn.disabled          = false;
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.textContent   = '🔍 Tahlil qilish';
  }, 200);
}

/* ==================== EXPORT ==================== */
function exportXlsx() {
  const cards = document.querySelectorAll('.word-card');
  if (!cards.length) return toast('Avval tahlil qiling!', 'error');
  const wb   = XLSX.utils.book_new();
  const rows = [];
  cards.forEach(card => {
    const row = {};
    card.querySelectorAll('tr').forEach(tr => {
      const th = tr.querySelector('th'), td = tr.querySelector('td');
      if (th && td) row[th.innerText.trim()] = td.innerText.trim();
    });
    if (Object.keys(row).length) rows.push(row);
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Morfologik_Tahlil');
  XLSX.writeFile(wb, 'Morfologik_Tahlil_Natijalari.xlsx');
  toast('Excel saqlandi!', 'success');
}

/* ==================== INIT ==================== */
document.addEventListener('DOMContentLoaded', () => {
  loadDatabase();
  document.getElementById('analyzeBtn')?.addEventListener('click', analyze);
  (document.getElementById('exportBtn') || document.getElementById('exportXlsxBtn'))?.addEventListener('click', exportXlsx);
  document.getElementById('wordInput')?.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'Enter') analyze();
  });
});
