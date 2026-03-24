/* ============================================================
   script.js — O'ZBEK MORFOLOGIK TAHLIL
   3 ta JSON: Son.json, Sifat.json, OlmoshvaRavish.json
   Har bir POS uchun alohida DB — hech narsa yo'qolmaydi
   ============================================================ */

/* ==================== KONFIGURATSIYA ==================== */
const POS_LABEL = { ot: 'Ot', fel: "Fe'l", sifat: 'Sifat', son: 'Son', ravish: 'Ravish', olmosh: 'Olmosh' };
const POS_COLOR = { ot: '#8b5cf6', fel: '#ec4899', sifat: '#7c3aed', son: '#0891b2', ravish: '#14b8a6', olmosh: '#059669' };
const POS_EMOJI = { ot: '📕', fel: '🏃', sifat: '🎨', son: '🔢', ravish: '⚡', olmosh: '👤' };

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

/* XPOS -> posType */
const XPOS_MAP = {
  'P':'olmosh','p':'olmosh',
  'JJ':'sifat','Adj':'sifat','J':'sifat',
  'Num':'son','NUM':'son',
  'V':'fel','VB':'fel','v':'fel',' V':'fel',
  'RR':'ravish','MD':'ravish','R':'ravish',
  'N':'ot','NER':'ot','C':'ot','II':'ot','II ':'ot',
  'Prt':'ot','UH':'ot','IM':'ot','IB':'ot','PP':'ot','U':'ot',
};

/* ── Alohida DB har bir POS uchun ──
   DBs.son['bir'] = {...}, DBs.olmosh['men'] = {...}
   Shunday qilib bir xil FORM turli POS da yo'qolmaydi */
const DBs = { son:{}, sifat:{}, olmosh:{}, ravish:{}, fel:{}, ot:{} };

/* Fayl variantlari — Vercel case-sensitive */
const FILE_VARIANTS = {
  'Son':            ['Son','son','SON'],
  'Sifat':          ['Sifat','sifat','SIFAT'],
  'OlmoshvaRavish': ['OlmoshvaRavish','OlmoshVaRavish','Olmoshvaravish',
                     'olmoshvaravish','olmosh_va_ravish','Olmosh_va_Ravish'],
};
const FILE_DATASET_KEY = {
  'Son':'Son', 'Sifat':'Sifat', 'OlmoshvaRavish':'OlmoshvaRavish'
};

/* Fayl uchun qaysi POS bo'lishi ehtimoli ko'proq */
const FILE_HINT = {
  'Son':'son', 'Sifat':'sifat', 'OlmoshvaRavish':'olmosh'
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

/* ==================== YORDAMCHI ==================== */
function toKey(text) {
  if (!text) return '';
  return String(text).toLowerCase()
    .replace(/[\u2018\u2019\u02bb\u02bc'`"]/g,'')
    .replace(/[.,!?;:()«»\[\]{}]/g,'')
    .trim();
}

/* Entry to'liqlik balli — qiymati bor ustunlar ko'proq bo'lsa yuqori */
function entryScore(item) {
  let s = 0;
  for (const v of Object.values(item)) {
    if (v && typeof v === 'string' && !['—','∅',''].includes(v.trim())) s++;
  }
  return s;
}

function toast(msg, type='info') {
  const box = document.getElementById('toastContainer');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${{success:'✅',error:'❌',info:'ℹ️'}[type]||'ℹ️'}</span><span>${msg}</span>`;
  box.appendChild(el);
  setTimeout(()=>{el.classList.add('hide');setTimeout(()=>el.remove(),300);},3500);
}

/* ==================== POS ANIQLASH ==================== */
function detectPos(item, fileHint) {
  const xpos = item.XPOS || '';

  /* 1. XPOS aniq bo'lsa */
  const fromXpos = XPOS_MAP[xpos];
  if (fromXpos && fromXpos !== 'ot') return fromXpos;

  /* 2. Ustun qiymatidan */
  if (COL_SIFAT_BELGI in item && !['—',''].includes(String(item[COL_SIFAT_BELGI]).trim())) return 'sifat';
  if (COL_SON_MANOV   in item && !['—',''].includes(String(item[COL_SON_MANOV]).trim()))   return 'son';
  if (COL_OLMOSH_GRUPLAR in item && !['—',''].includes(String(item[COL_OLMOSH_GRUPLAR]).trim())) return 'olmosh';

  /* 3. XPOS=N/ot/... -> fayl hint bilan */
  if (fromXpos) return fromXpos;

  /* 4. Fayl hint */
  if (fileHint === 'olmosh') {
    if (xpos === 'RR' || xpos === 'MD') return 'ravish';
    return 'olmosh';
  }
  return fileHint || 'ot';
}

/* ==================== DATABASE YUKLASH ==================== */
async function loadDatabase() {
  const statusEl = document.getElementById('dbStatus');
  /* DBs ni tozalash */
  for (const pos of Object.keys(DBs)) DBs[pos] = {};

  let totalEntries = 0;
  let loadedFiles  = 0;
  const basePaths  = ['./data/','/data/','./'];

  for (const fileName of ['Son','Sifat','OlmoshvaRavish']) {
    let loaded = false;
    const variants = FILE_VARIANTS[fileName];

    for (const base of basePaths) {
      if (loaded) break;
      for (const variant of variants) {
        try {
          const res = await fetch(`${base}${variant}.json`);
          if (!res.ok) continue;

          const raw   = await res.json();
          const dsKey = FILE_DATASET_KEY[fileName];
          const hint  = FILE_HINT[fileName];

          /* JSON ichidagi array ni topamiz */
          const arr = raw[dsKey] || raw[variant] || raw[fileName]
            || (Array.isArray(raw) ? raw : Object.values(raw)[0] || []);

          let count = 0;
          arr.forEach(item => {
            if (!item || !item.FORM || item.ID === 'ID') return;
            const formStr = String(item.FORM).trim();
            if (!formStr || formStr === 'FORM') return;

            const key = toKey(formStr);
            if (!key) return;

            const pos      = detectPos(item, hint);
            item.posType   = pos;
            item._file     = fileName;

            /* Alohida DB ga yoz — to'liqroq entry ustunlik qiladi */
            const db = DBs[pos] || DBs.ot;
            if (!(key in db) || entryScore(item) > entryScore(db[key])) {
              db[key] = item;
            }
            count++;
          });

          totalEntries += count;
          loadedFiles++;
          console.log(`✅ ${variant}.json: ${count} yozuv`);
          loaded = true;
          break;
        } catch (e) { /* keyingi variant */ }
      }
    }
    if (!loaded) toast(`${fileName}.json topilmadi!`, 'error');
  }

  const uniqueTotal = Object.values(DBs).reduce((s,db)=>s+Object.keys(db).length, 0);
  if (statusEl) {
    statusEl.textContent = `✅ ${loadedFiles}/3 fayl, ${uniqueTotal} ta so'z`;
    statusEl.style.color = loadedFiles === 3 ? '#16a34a' : '#d97706';
  }
  toast(`${loadedFiles} ta fayl yuklandi! ${uniqueTotal} ta unikal so'z`, loadedFiles===3?'success':'info');
}

/* ==================== QIDIRUV ==================== */

/* POS bo'yicha DBdan qidirish */
function findInDB(key, preferPos) {
  /* Avval preferred POS da qidiramiz */
  if (preferPos && DBs[preferPos]?.[key]) return DBs[preferPos][key];
  /* Keyin barcha DBlardan */
  for (const [pos, db] of Object.entries(DBs)) {
    if (db[key]) return db[key];
  }
  return null;
}

function findWord(raw) {
  const key = toKey(raw);

  /* Direct hit */
  const direct = findInDB(key, null);
  if (direct && direct.XPOS) return { entry: {...direct}, stemmed: false, suffix: '' };

  /* Suffix loop */
  for (const suf of [...SUFFIXES, ...SON_SUFFIXES]) {
    const sk = toKey(suf);
    if (key.length > sk.length + 1 && key.endsWith(sk)) {
      const root = key.slice(0, -sk.length);
      if (root.length >= 2) {
        const rootEntry = findInDB(root, null);
        if (rootEntry && rootEntry.XPOS) {
          const entry = {...rootEntry};
          if (SON_SUFFIXES.includes(suf)) entry.posType = 'son';
          return { entry, stemmed: true, suffix: suf };
        }
      }
    }
  }

  /* XPOS bo'lmasa ham direct hit qaytaramiz */
  if (direct) return { entry: {...direct}, stemmed: false, suffix: '' };
  return null;
}

/* Kontekst bo'yicha to'g'ri entry topish
   Masalan: "a'lo" so'zi son faylida ham, sifat faylida ham bor
   Sifat kontekstida sifat DB dan olish kerak */
function findWordForContext(raw, expectedPos) {
  const key = toKey(raw);
  if (expectedPos && DBs[expectedPos]?.[key]) {
    return { entry: {...DBs[expectedPos][key]}, stemmed: false, suffix: '' };
  }
  return findWord(raw);
}

function isNum(word) {
  if (/^\d+$/.test(word)) return true;
  const found = findWord(word);
  if (found && ['Num','NUM','num'].includes(found.entry.XPOS)) return true;
  const k = toKey(word);
  return /yigirma|ottiz|qirq|ellik|oltmish|yetmish|sakson|toqson|yuz|ming|million|milliard/.test(k)
      || /birinchi|ikkinchi|uchinchi|tortinchi|beshinchi|oltinchi|yettinchi|sakkizinchi|toqqizinchi/.test(k);
}

function isOlmosh(word) {
  const olmoshlar=['u','biz','siz','men','sen','nima','qaysi','harna','hu','shu','qayer','kimsa'];
  if (olmoshlar.includes(word.toLowerCase())) return true;
  const found = findWord(word);
  return !!(found && found.entry.XPOS === 'P');
}

function isSifat(word) {
  const found = findWord(word);
  return !!(found && found.entry[COL_SIFAT_BELGI] && found.entry[COL_SIFAT_BELGI] !== '—');
}

/* ==================== KARTA ==================== */
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

  const rawFeats = (entry.FEATS && !['—','∅'].includes(entry.FEATS.trim()))
    ? entry.FEATS.trim() : '∅';
  let feats = rawFeats;
  if (stemmed && suffix) feats = rawFeats === '∅' ? `+${suffix}` : `${rawFeats} +${suffix}`;

  const lemma = (entry.LEMMA && entry.LEMMA.trim() && entry.LEMMA.trim() !== '—')
    ? entry.LEMMA.trim() : displayWord;

  const BASE_KEYS = new Set(['ID','FORM','LEMMA','FEATS','XPOS','posType','_file','_source']);
  let tRows = '';
  tRows += `<tr><th>ID</th><td class="strong">${entry.ID || num}</td></tr>`;
  tRows += `<tr><th>FORM</th><td class="strong">${(entry.FORM||displayWord).trim()}</td></tr>`;
  tRows += `<tr><th>LEMMA</th><td class="strong">${lemma}</td></tr>`;
  tRows += `<tr><th>FEATS</th><td>${feats}</td></tr>`;
  tRows += `<tr><th>XPOS</th><td>${entry.XPOS||'—'}</td></tr>`;

  (POS_COLS[pos]||[]).forEach(col => {
    const v = (entry[col] && String(entry[col]).trim() !== '—') ? entry[col] : '—';
    tRows += `<tr><th>${col}</th><td class="${v==='—'?'dim':''}">${v}</td></tr>`;
  });

  const skipCols = new Set([...BASE_KEYS, ...ALL_POS_COLS]);
  Object.keys(entry)
    .filter(k => !skipCols.has(k) && !/^Column\d+$/i.test(k))
    .sort()
    .forEach(k => {
      const v = (entry[k] !== undefined && String(entry[k]).trim() !== '') ? entry[k] : '—';
      tRows += `<tr><th>${k}</th><td class="${v==='—'?'dim':''}">${v}</td></tr>`;
    });

  card.innerHTML = `
    <div class="word-card-header" style="border-left:4px solid ${color};background:${color}15">
      <span class="word-num">${num}.</span>
      <span class="word-title">${displayWord}</span>
      <div class="badges">
        ${suffix?`<span class="badge stem">~o'zak (+${suffix})</span>`:''}
        <span class="badge" style="background:${color}">${emoji} ${label}</span>
      </div>
    </div>
    <div class="word-card-body"><table>${tRows}</table></div>`;
  return card;
}

/* ==================== TAHLIL ==================== */
function analyze() {
  const text = (document.getElementById('wordInput')?.value||'').trim();
  if (!text) return toast('Matn kiriting!','error');
  const totalDB = Object.values(DBs).reduce((s,db)=>s+Object.keys(db).length,0);
  if (!totalDB) return toast('Baza yuklanmagan...','error');

  const btn=document.getElementById('analyzeBtn');
  const btnText=document.getElementById('btnText');
  const spinner=document.getElementById('btnSpinner');
  if(btn) btn.disabled=true;
  if(spinner) spinner.style.display='inline-block';
  if(btnText) btnText.textContent='Tahlil qilinmoqda...';

  const section=document.getElementById('resultSection');
  const grid=document.getElementById('resultsGrid');
  if(section) section.style.display='none';
  if(grid) grid.innerHTML='';

  const tokens=text.split(/\s+/).filter(w=>w.length>0);
  const results=[];
  let i=0;

  while (i < tokens.length) {
    let matched = false;

    /* 1. DB da to'liq ibora */
    for (let len=Math.min(4,tokens.length-i); len>=2; len--) {
      const phrase=tokens.slice(i,i+len).join(' ');
      const pKey=toKey(phrase);
      const pEntry=findInDB(pKey,null);
      if (pEntry && pEntry.XPOS) {
        results.push({ display:phrase, found:{ entry:{...pEntry}, stemmed:false, suffix:'' } });
        i+=len; matched=true; break;
      }
    }
    if (matched) continue;

    /* 2. Qo'shma son */
    if (isNum(tokens[i])) {
      let numLen=1;
      while (numLen<6 && i+numLen<tokens.length && isNum(tokens[i+numLen])) numLen++;

      if (numLen > 1) {
        const phrase=tokens.slice(i,i+numLen).join(' ');
        const baseFound=findWord(tokens[i]);
        const lastFound=findWord(tokens[i+numLen-1]);

        const lastFeats=lastFound
          ? (lastFound.stemmed && lastFound.suffix
              ? '+'+lastFound.suffix
              : (lastFound.entry.FEATS && !['∅','—'].includes(lastFound.entry.FEATS)
                  ? lastFound.entry.FEATS.trim() : ''))
          : '';

        const allLemmas=tokens.slice(i,i+numLen).map((tok,idx)=>{
          const fw=idx===0?baseFound:(idx===numLen-1?lastFound:findWord(tok));
          return fw?(fw.entry.LEMMA||tok):tok;
        });

        const sonCols=[COL_SON_MANOV,"Hisob so'zlar","Bir so'zining ma'nolari","Tuzalishiga ko'ra"];
        const sonColVals={};
        const allEntries=[baseFound,lastFound].filter(Boolean).map(f=>f.entry);
        sonCols.forEach(col=>{
          sonColVals[col]=allEntries.map(e=>e[col]).find(v=>v&&v!=='—')||'—';
        });

        const suf=lastFeats?lastFeats.replace(/^\+/,'').split('+')[0]:'';
        results.push({ display:phrase, found:{ entry:{
          ...(baseFound?baseFound.entry:{}),
          FORM:phrase, LEMMA:allLemmas.join(' '),
          FEATS:lastFeats||'∅', XPOS:'Num', posType:'son',
          ...sonColVals
        }, stemmed:!!suf, suffix:suf }});
        i+=numLen; matched=true;
      }
    }
    if (matched) continue;

    /* 3. Bitta so'z */
    const single=tokens[i];
    let found=findWord(single);

    if (!found) {
      if (isOlmosh(single))
        found={ entry:{ posType:'olmosh',FORM:single,LEMMA:single,FEATS:'∅',XPOS:'P' }, stemmed:false, suffix:'' };
      else if (isSifat(single))
        found={ entry:{ posType:'sifat',FORM:single,LEMMA:single,FEATS:'∅',XPOS:'JJ' }, stemmed:false, suffix:'' };
      else if (isNum(single))
        found={ entry:{ posType:'son',FORM:single,LEMMA:single,FEATS:'∅',XPOS:'Num' }, stemmed:false, suffix:'' };
    }

    results.push({ display:single, found:found||null });
    i++;
  }

  setTimeout(()=>{
    const stats={ ot:0,fel:0,sifat:0,son:0,ravish:0,olmosh:0,topilmadi:0 };
    results.forEach((res,idx)=>{
      grid.appendChild(buildCard(idx+1,res.display,res.found));
      if(res.found) stats[res.found.entry.posType||'ot']=(stats[res.found.entry.posType||'ot']||0)+1;
      else stats.topilmadi++;
    });

    const statsEl=document.getElementById('resultStats');
    if(statsEl) statsEl.innerHTML=Object.keys(stats).filter(k=>stats[k]>0).map(k=>
      k==='topilmadi'
        ?`<span class="chip other">❓ Topilmadi: ${stats.topilmadi}</span>`
        :`<span class="chip ${k}">${POS_EMOJI[k]||'📝'} ${POS_LABEL[k]||k}: ${stats[k]}</span>`
    ).join('');

    if(section){section.style.display='block';section.scrollIntoView({behavior:'smooth'});}
    toast(`${results.length} ta so'z tahlil qilindi!`,'success');
    if(btn) btn.disabled=false;
    if(spinner) spinner.style.display='none';
    if(btnText) btnText.textContent='🔍 Tahlil qilish';
  },200);
}

/* ==================== XLSX EXPORT ==================== */
function exportXlsx() {
  const cards=document.querySelectorAll('.word-card');
  if(!cards.length) return toast('Avval tahlil qiling!','error');
  const wb=XLSX.utils.book_new(),rows=[];
  cards.forEach(card=>{
    const row={};
    card.querySelectorAll('tr').forEach(tr=>{
      const th=tr.querySelector('th'),td=tr.querySelector('td');
      if(th&&td) row[th.innerText.trim()]=td.innerText.trim();
    });
    if(Object.keys(row).length) rows.push(row);
  });
  const ws=XLSX.utils.json_to_sheet(rows);
  ws['!cols']=Object.keys(rows[0]||{}).map(()=>({wch:24}));
  XLSX.utils.book_append_sheet(wb,ws,'Morfologik_Tahlil');
  XLSX.writeFile(wb,'Morfologik_Tahlil_Natijalari.xlsx');
  toast('Excel saqlandi!','success');
}

/* ==================== INIT ==================== */
document.addEventListener('DOMContentLoaded',()=>{
  loadDatabase();
  document.getElementById('analyzeBtn')?.addEventListener('click',analyze);
  (document.getElementById('exportBtn')||document.getElementById('exportXlsxBtn'))
    ?.addEventListener('click',exportXlsx);
  document.getElementById('wordInput')
    ?.addEventListener('keydown',e=>{ if(e.ctrlKey&&e.key==='Enter') analyze(); });
});
