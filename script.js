/* ============================================================
   script.js — O'ZBEK MORFOLOGIK TAHLIL
   3 ta JSON fayl: Son.json, Sifat.json, OlmoshvaRavish.json
   ============================================================ */

let DB = {};  // { key: entry } — barcha so'zlar birga

/* ==================== KONFIGURATSIYA ==================== */
const POS_LABEL = { ot: 'Ot', fel: "Fe'l", sifat: 'Sifat', son: 'Son', ravish: 'Ravish', olmosh: 'Olmosh' };
const POS_COLOR = { ot: '#8b5cf6', fel: '#ec4899', sifat: '#7c3aed', son: '#0891b2', ravish: '#14b8a6', olmosh: '#059669' };
const POS_EMOJI = { ot: '📕', fel: '🏃', sifat: '🎨', son: '🔢', ravish: '⚡', olmosh: '👤' };

/* Har bir fayl uchun aniq ustun kalitlari */
const COL_OLMOSH_GRUPLAR = "Olmoshlarning ma'noviy guruhlari";
const COL_OLMOSH_VAZIFA  = "Olmoshlarning gapda bajaradigan vazifasiga ko'ra turlari";
const COL_SON_MANOV      = " Ma'noviy xususiyatlari";
const COL_SIFAT_BELGI    = 'Belgining xususiyati';

const POS_COLS = {
  sifat:  [COL_SIFAT_BELGI, 'Daraja', 'Tuzulishi', 'Yasalishi', 'Sifatning LMGlari'],
  olmosh: [COL_OLMOSH_GRUPLAR, 'Tuzilishi', 'Yasalishi', 'Kelishik', 'Son', 'Egalik', COL_OLMOSH_VAZIFA],
  son:    [COL_SON_MANOV, "Hisob so'zlar", "Bir so'zining ma'nolari", "Tuzalishiga ko'ra"],
  ot: [], fel: [], ravish: []
};
const ALL_POS_COLS = new Set(Object.values(POS_COLS).flat());

/* XPOS -> posType mapping */
const XPOS_MAP = {
  'P': 'olmosh', 'p': 'olmosh',
  'JJ': 'sifat', 'Adj': 'sifat', 'J': 'sifat',
  'Num': 'son',  'NUM': 'son',
  'V':  'fel',   'VB': 'fel',  'v': 'fel',
  'RR': 'ravish','MD': 'ravish','R': 'ravish',
  'N':  'ot',    'NER': 'ot',   'C': 'ot',
  'II': 'ot',    'Prt': 'ot',   'UH': 'ot',
};

/* Fayl nomi -> dataset ustun kaliti -> posType */
const FILE_CONFIG = {
  'Son':           { key: 'Son',           posHint: 'son' },
  'Sifat':         { key: 'Sifat',         posHint: 'sifat' },
  'OlmoshvaRavish':{ key: 'OlmoshvaRavish',posHint: 'olmosh' },
};

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

/* ==================== POS ANIQLASH ==================== */
function detectPosType(item, fileHint) {
  const xpos = item.XPOS || '';

  /* 1. XPOS dan aniq aniqlash */
  const fromXpos = XPOS_MAP[xpos];

  /* 2. Ustun mavjudligidan aniqlash */
  let fromCol = null;
  if (COL_SIFAT_BELGI in item && item[COL_SIFAT_BELGI] !== '—' && item[COL_SIFAT_BELGI] !== '') {
    fromCol = 'sifat';
  } else if (COL_SON_MANOV in item && item[COL_SON_MANOV] !== '—' && item[COL_SON_MANOV] !== '') {
    fromCol = 'son';
  } else if (COL_OLMOSH_GRUPLAR in item && item[COL_OLMOSH_GRUPLAR] !== '—' && item[COL_OLMOSH_GRUPLAR] !== '') {
    fromCol = 'olmosh';
  }

  /* 3. Prioritet: XPOS aniq bo'lsa ustunlik qiladi
        XPOS=JJ/Adj/P/Num -> aniq
        XPOS=N/V/... -> fayl hint ishlaydi */
  if (fromXpos && ['olmosh','sifat','son','ravish','fel'].includes(fromXpos)) {
    return fromXpos;
  }
  if (fromCol) return fromCol;
  if (fromXpos) return fromXpos;

  /* 4. Fayl dan hint */
  if (fileHint === 'olmosh') {
    if (xpos === 'RR' || xpos === 'MD') return 'ravish';
    return 'olmosh';
  }
  if (fileHint === 'son') return 'son';
  if (fileHint === 'sifat') return 'sifat';

  return 'ot';
}

/* ==================== DATABASE YUKLASH ==================== */
async function loadDatabase() {
  const statusEl = document.getElementById('dbStatus');
  DB = {};
  let totalCount = 0;
  let loadedFiles = 0;

  const POS_PRIORITY = { son: 4, olmosh: 3, sifat: 2, ravish: 2, fel: 1, ot: 0 };

  /* Har 3 faylni parallel yuklaymiz */
  /* Har fayl uchun mumkin bo'lgan barcha nom variantlari
     Vercel case-sensitive, shuning uchun ko'p variant sinash kerak */
  const FILE_VARIANTS = {
    'Son':            ['Son', 'son', 'SON'],
    'Sifat':          ['Sifat', 'sifat', 'SIFAT'],
    'OlmoshvaRavish': ['OlmoshvaRavish', 'Olmosh_va_Ravish', 'OlmoshVaRavish',
                       'olmoshvaravish', 'Olmoshvaravish', 'olmosh_va_ravish'],
  };
  const fileNames = ['Son', 'Sifat', 'OlmoshvaRavish'];
  const basePaths = ['./data/', '/data/', './'];

  for (const fileName of fileNames) {
    let loaded = false;
    const nameVariants = FILE_VARIANTS[fileName] || [fileName];

    for (const base of basePaths) {
      if (loaded) break;
      for (const variant of nameVariants) {
        try {
          const res = await fetch(`${base}${variant}.json`);
          if (!res.ok) continue;

          const rawData = await res.json();
          const config  = FILE_CONFIG[fileName];
          /* Fayl ichidagi key ham variant bo'lishi mumkin */
          const arr = rawData[config.key]
            || rawData[fileName]
            || rawData[variant]
            || rawData[variant.charAt(0).toUpperCase() + variant.slice(1)]
            || (Array.isArray(rawData) ? rawData : Object.values(rawData)[0] || []);
          let fileCount = 0;

        arr.forEach(item => {
          if (!item || !item.FORM || item.ID === 'ID') return;
          const formStr = String(item.FORM).trim();
          if (!formStr || formStr === 'FORM') return;

          const key = toKey(formStr);
          if (!key) return;

          /* posType aniqlash */
          const posType = detectPosType(item, config.posHint);
          item.posType  = posType;
          item._source  = fileName; /* qaysi fayldan ekanini eslab qolamiz */

          /* Priority: son > olmosh/ravish > sifat > ot */
          const existing = POS_PRIORITY[DB[key]?.posType] ?? -1;
          const incoming = POS_PRIORITY[posType] ?? 0;
          if (incoming > existing || !(key in DB)) {
            DB[key] = item;
          }
          fileCount++;
        });

        totalCount += fileCount;
        loadedFiles++;
          console.log(`✅ ${variant}.json: ${fileCount} ta yozuv`);
          loaded = true;
          break;
        } catch (e) {
          /* silent — keyingi variant sinab ko'ramiz */
        }
      }
    }
    if (!loaded) {
      console.warn(`❌ ${fileName}.json topilmadi`);
      toast(`${fileName}.json topilmadi!`, 'error');
    }
  }

  const uniqueCount = Object.keys(DB).length;
  if (statusEl) {
    statusEl.textContent = loadedFiles === 3
      ? `✅ Baza tayyor: ${uniqueCount} ta so'z`
      : `⚠️ ${loadedFiles}/3 fayl yuklandi: ${uniqueCount} ta so'z`;
    statusEl.style.color = loadedFiles === 3 ? '#16a34a' : '#d97706';
  }
  toast(`${loadedFiles} ta fayl yuklandi! ${uniqueCount} ta so'z`, loadedFiles === 3 ? 'success' : 'info');
}

/* ==================== QIDIRUV ==================== */
function findWord(raw) {
  const key = toKey(raw);

  /* Direct hit — lekin XPOS bo'sh bo'lsa suffix loop sinash */
  if (DB[key] && DB[key].XPOS) {
    return { entry: { ...DB[key] }, stemmed: false, suffix: '' };
  }

  /* Suffix loop */
  for (const suf of [...SUFFIXES, ...SON_SUFFIXES]) {
    const sk = toKey(suf);
    if (key.length > sk.length + 1 && key.endsWith(sk)) {
      const root = key.slice(0, -sk.length);
      if (root.length >= 2 && DB[root] && DB[root].XPOS) {
        const entry = { ...DB[root] };
        if (SON_SUFFIXES.includes(suf)) entry.posType = 'son';
        return { entry, stemmed: true, suffix: suf };
      }
    }
  }

  /* XPOS bo'lmasa ham direct hit qaytaramiz */
  if (DB[key]) return { entry: { ...DB[key] }, stemmed: false, suffix: '' };

  return null;
}

function isNum(word) {
  if (/^\d+$/.test(word)) return true;
  const found = findWord(word);
  if (found && ['num', 'NUM', 'Num'].includes(found.entry.XPOS)) return true;
  /* Son so'zlari regex */
  const k = toKey(word);
  return /yigirma|ottiz|qirq|ellik|oltmish|yetmish|sakson|toqson|yuz|ming|million|milliard/.test(k)
      || /birinchi|ikkinchi|uchinchi|tortinchi|beshinchi|oltinchi|yettinchi|sakkizinchi|toqqizinchi/.test(k);
}

function isOlmosh(word) {
  const olmoshlar = ['u','biz','siz','men','sen','bizni','senga','nima','qaysi','harna','hu','shu','qayer','kimsa'];
  if (olmoshlar.includes(word.toLowerCase())) return true;
  const found = findWord(word);
  return !!(found && found.entry.XPOS === 'P');
}

function isSifat(word) {
  const found = findWord(word);
  return !!(found && found.entry[COL_SIFAT_BELGI] && found.entry[COL_SIFAT_BELGI] !== '—');
}

/* ==================== KARTA YARATISH ==================== */
function buildCard(num, displayWord, found) {
  const card = document.createElement('div');
  card.className = 'word-card';

  if (!found) {
    card.innerHTML = `
      <div class="word-card-header other">
        <span class="word-num">${num}.</span>
        <span class="word-title">${displayWord}</span>
        <span class="badge other">❓ Topilmadi</span>
      </div>
      <div class="word-card-body">
        <table>
          <tr><th>ID</th><td>${num}</td></tr>
          <tr><th>FORM</th><td>${displayWord}</td></tr>
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

  /* FEATS */
  const rawFeats = (entry.FEATS && entry.FEATS.trim() !== '—' && entry.FEATS.trim() !== '∅')
    ? entry.FEATS.trim() : '∅';
  let feats = rawFeats;
  if (stemmed && suffix) {
    feats = rawFeats === '∅' ? `+${suffix}` : `${rawFeats} +${suffix}`;
  }

  /* LEMMA */
  const lemma = (entry.LEMMA && entry.LEMMA.trim() && entry.LEMMA.trim() !== '—')
    ? entry.LEMMA.trim() : displayWord;

  /* Jadval satrlari */
  const BASE_KEYS = new Set(['ID','FORM','LEMMA','FEATS','XPOS','posType','_source']);
  let tRows = '';
  tRows += `<tr><th>ID</th><td class="strong">${entry.ID || num}</td></tr>`;
  tRows += `<tr><th>FORM</th><td class="strong">${(entry.FORM || displayWord).trim()}</td></tr>`;
  tRows += `<tr><th>LEMMA</th><td class="strong">${lemma}</td></tr>`;
  tRows += `<tr><th>FEATS</th><td>${feats}</td></tr>`;
  tRows += `<tr><th>XPOS</th><td>${entry.XPOS || '—'}</td></tr>`;

  /* POS ga xos ustunlar */
  (POS_COLS[pos] || []).forEach(col => {
    const v = (entry[col] && String(entry[col]).trim() !== '—' && String(entry[col]).trim() !== '')
      ? entry[col] : '—';
    tRows += `<tr><th>${col}</th><td class="${v === '—' ? 'dim' : ''}">${v}</td></tr>`;
  });

  /* Qolgan ustunlar (Column*, posType, BASE ni o'tkazib) */
  const skipCols = new Set([...BASE_KEYS, ...ALL_POS_COLS]);
  Object.keys(entry)
    .filter(k => !skipCols.has(k) && !/^Column\d+$/i.test(k))
    .sort()
    .forEach(k => {
      const v = (entry[k] !== undefined && String(entry[k]).trim() !== '') ? entry[k] : '—';
      tRows += `<tr><th>${k}</th><td class="${v === '—' ? 'dim' : ''}">${v}</td></tr>`;
    });

  card.innerHTML = `
    <div class="word-card-header" style="border-left:4px solid ${color};background:${color}15">
      <span class="word-num">${num}.</span>
      <span class="word-title">${displayWord}</span>
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

  const tokens  = text.split(/\s+/).filter(w => w.length > 0);
  const results = [];
  let i = 0;

  while (i < tokens.length) {
    let matched = false;

    /* 1. DB da to'liq ibora (4 so'zgacha) */
    for (let len = Math.min(4, tokens.length - i); len >= 2; len--) {
      const phrase    = tokens.slice(i, i + len).join(' ');
      const phraseKey = toKey(phrase);
      if (DB[phraseKey] && DB[phraseKey].XPOS) {
        results.push({ display: phrase, found: { entry: { ...DB[phraseKey] }, stemmed: false, suffix: '' } });
        i += len; matched = true; break;
      }
    }
    if (matched) continue;

    /* 2. Qo'shma son: Num + Num (max 6 token) */
    if (isNum(tokens[i])) {
      let numLen = 1;
      while (numLen < 6 && i + numLen < tokens.length && isNum(tokens[i + numLen])) numLen++;

      if (numLen > 1) {
        const phrase    = tokens.slice(i, i + numLen).join(' ');
        const baseFound = findWord(tokens[i]);
        const lastFound = findWord(tokens[i + numLen - 1]);

        /* FEATS: stemmed bo'lsa suffix, aks holda entry.FEATS */
        const lastFeats = lastFound
          ? (lastFound.stemmed && lastFound.suffix
              ? '+' + lastFound.suffix
              : (lastFound.entry.FEATS && lastFound.entry.FEATS !== '∅' && lastFound.entry.FEATS !== '—'
                  ? lastFound.entry.FEATS.trim() : ''))
          : '';

        /* LEMMA: barcha tokenlar LEMMA larini birlashtir */
        const allLemmas = tokens.slice(i, i + numLen).map((tok, idx) => {
          const fw = idx === 0 ? baseFound : (idx === numLen - 1 ? lastFound : findWord(tok));
          return fw ? (fw.entry.LEMMA || tok) : tok;
        });

        /* Son ustunlarini — qaysi entry da bor bo'lsa o'shandan ol */
        const sonCols = [COL_SON_MANOV, "Hisob so'zlar", "Bir so'zining ma'nolari", "Tuzalishiga ko'ra"];
        const sonColValues = {};
        const allEntries   = [baseFound, lastFound].filter(Boolean).map(f => f.entry);
        sonCols.forEach(col => {
          const v = allEntries.map(e => e[col]).find(v => v && v !== '—') || '—';
          sonColValues[col] = v;
        });

        const suf    = lastFeats ? lastFeats.replace(/^\+/, '').split('+')[0] : '';
        const merged = {
          ...(baseFound ? baseFound.entry : {}),
          FORM:    phrase,
          LEMMA:   allLemmas.join(' '),
          FEATS:   lastFeats || '∅',
          XPOS:    'Num',
          posType: 'son',
          ...sonColValues,
        };

        results.push({ display: phrase, found: { entry: merged, stemmed: !!suf, suffix: suf } });
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

    results.push({ display: single, found: found || null });
    i++;
  }

  setTimeout(() => {
    const stats = { ot: 0, fel: 0, sifat: 0, son: 0, ravish: 0, olmosh: 0, topilmadi: 0 };

    results.forEach((res, idx) => {
      grid.appendChild(buildCard(idx + 1, res.display, res.found));
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
        .map(k => k === 'topilmadi'
          ? `<span class="chip other">❓ Topilmadi: ${stats.topilmadi}</span>`
          : `<span class="chip ${k}">${POS_EMOJI[k] || '📝'} ${POS_LABEL[k] || k}: ${stats[k]}</span>`
        ).join('');
    }

    if (section) { section.style.display = 'block'; section.scrollIntoView({ behavior: 'smooth' }); }
    toast(`${results.length} ta so'z/ibora tahlil qilindi!`, 'success');

    if (btn)     btn.disabled          = false;
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.textContent   = '🔍 Tahlil qilish';
  }, 200);
}

/* ==================== XLSX EXPORT ==================== */
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
  (document.getElementById('exportBtn') || document.getElementById('exportXlsxBtn'))
    ?.addEventListener('click', exportXlsx);
  document.getElementById('wordInput')
    ?.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') analyze(); });
});
