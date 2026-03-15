/* =========================================
   1. GLOBAL SOZLAMALAR VA BAZA
   ========================================= */
const AI_API_KEY = "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"; 

let globalDatabase = {};
const baseFields = ["ID", "FORM", "LEMMA", "FEATS", "XPOS"];

const SUFFIXES = [
    'larimizdan', 'larimizga', 'larimizni', 'larimizda', 'larining',
    'laridan', 'lariga', 'larini', 'larida',
    'imizdan', 'imizga', 'imizni', 'imizda', 'imizning',
    'ingizdan', 'ingizga', 'ingizni', 'ingizda',
    'lardan', 'larga', 'larni', 'larda',
    'ning', 'dan', 'ga', 'ni', 'da', 'ka', 'qa',
    'miz', 'ngiz', 'lari', 'lar',
    'im', 'ng', 'si', 'i', 'm',
    'roq', 'mtir', 'gina', 'dir', 'mi', 'chi', 'oq'
];

// STANDARTLASHTIRILGAN USTUN NOMLARI (AI va Data adashmasligi uchun)
const posCategories = {
    ot: ["Ma'noviy guruhlari", "Tuzilishi", "Yasalishi", "Kelishik", "Egalik", "Son"],
    sifat: ["Belgining xususiyati", "Daraja", "Tuzilishi", "Yasalishi"],
    son: ["Ma'noviy xususiyatlari", "Hisob so'zlar", "Tuzilishiga ko'ra"],
    olmosh: ["Ma'noviy guruhlari", "Tuzilishi", "Yasalishi", "Kelishik", "Son", "Egalik", "Vazifasi"],
    fel: ["Leksik-ma'noviy guruhlari", "Tuzilishi", "Yasalishi", "Bo'lishli/Bo'lishsiz", "Nisbat", "Mayl", "Zamon", "Shaxs-son"],
    ravish: ["Ma'noviy guruhlari", "Tuzilishi", "Yasalishi", "Darajasi"]
};
const posNames = { 'ot': 'Ot', 'sifat': 'Sifat', 'son': 'Son', 'olmosh': 'Olmosh', 'fel': "Fe'l", 'ravish': 'Ravish' };

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle';
    toast.innerHTML = `<i class="fas ${icon}" style="color: ${type === 'error' ? '#ef4444' : 'var(--success)'};"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function getPosTypeFromXpos(xpos, fallbackType) {
    if (!xpos || xpos === '—') return fallbackType || 'ot';
    const upper = String(xpos).toUpperCase().trim();
    if (upper === 'P' || upper === 'PRON') return 'olmosh';
    if (upper === 'JJ' || upper === 'ADJ' || upper.includes('ADJ')) return 'sifat';
    if (upper.includes('NUM')) return 'son';
    if (upper.includes('V')) return 'fel';
    if (upper.includes('ADV') || upper === 'RB' || upper === 'PART') return 'ravish';
    if (upper === 'N' || upper.includes('NOUN')) return 'ot';
    return fallbackType || 'ot';
}

/* =========================================
   2. DATA YUKLASH (EXCEL -> JS MEMORY)
   ========================================= */
async function loadData() {
    const files = [
        { name: 'Shaxinabonu 11mingta  (2).xlsx', type: 'sifat' },
        { name: 'SON  2300 .xlsx', type: 'son' },
        { name: 'Olmosh gaplar (9).xlsx', type: 'olmosh' }
    ];

    let loadedCount = 0;
    for (let fileObj of files) {
        try {
            const response = await fetch(`./data/${fileObj.name}`);
            if (!response.ok) continue;
            
            const arrayBuffer = await response.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            let currentHeaders = [];
            let xposIndex = -1;

            rows.forEach(row => {
                if (!row || row.length === 0) return; 
                if (row[0] === 'ID' && row[1] === 'FORM') {
                    currentHeaders = row.map(h => String(h).trim());
                    xposIndex = currentHeaders.findIndex(h => h.toUpperCase() === 'XPOS');
                    return;
                }
                if (currentHeaders.length > 0 && row[1]) {
                    const form = String(row[1]).toLowerCase().trim();
                    if (form !== 'form' && form !== '—') {
                        let cleanRow = {};
                        currentHeaders.forEach((header, i) => {
                            // Kalitlarni standartlash
                            let key = header;
                            if(key.includes("Sifatning")) key = "Ma'noviy guruhlari";
                            if(key.includes("Olmoshlarning ma’noviy")) key = "Ma'noviy guruhlari";
                            if(key.includes("Ravishlarning ma’noviy")) key = "Ma'noviy guruhlari";
                            if(key.includes("Tuzulishi")) key = "Tuzilishi";
                            
                            cleanRow[key] = (row[i] !== undefined && row[i] !== null && String(row[i]).trim() !== '') ? String(row[i]).trim() : '—';
                        });

                        let xposValue = xposIndex !== -1 ? row[xposIndex] : '—';
                        let actualPosType = getPosTypeFromXpos(xposValue, fileObj.type);

                        globalDatabase[form] = { ...cleanRow, posType: actualPosType, XPOS: xposValue === '—' ? (actualPosType==='sifat'?'JJ':actualPosType==='son'?'Num':actualPosType==='olmosh'?'P':'N') : xposValue };
                        loadedCount++;
                    }
                }
            });
        } catch (e) { console.error(`Xato:`, e); }
    }
    if(loadedCount > 0) showToast(`Baza tayyor: ${loadedCount} ta so'z yuklandi.`, "success");
}

/* =========================================
   3. ICHKI MANTIQ (KENGAYTIRILGAN LUG'AT)
   ========================================= */
function ruleBasedAI(word) {
    let wClean = word.toLowerCase().replace(/[.,!?;:"()«»]/g, '');
    let pos = 'ot', xpos = 'N', extras = {};

    const commonAdjectives = /^(yangi|eski|qari|yosh|sariq|qizil|oq|qora|yashil|ko'k|katta|kichik|yaxshi|yomon|uzun|qisqa|chiroyli|xunuk|shirin|issiq|sovuq)$/;
    // Ravishlar (allaqachon, yana shu yerda!)
    const commonAdverbs = /^(allaqachon|yana|bugun|erta|kecha|hali|hozir|doim|ko'p|oz|juda|sal|ancha|faqat|hatto|darhol|tez|sekin|asta|aslo|mutlaqo)$/;
    const commonPronouns = /^(men|sen|u|biz|siz|ular|shu|bu|o'sha|ushbu|kim|nima|qanday|qachon|qayer|hamma|barcha|har|hech|harna|o'z)$/;

    if (wClean.match(commonPronouns)) { pos = 'olmosh'; xpos = 'P'; }
    else if (wClean.match(commonAdverbs) || wClean.endsWith('larcha') || wClean.endsWith('ona')) { pos = 'ravish'; xpos = 'Adv'; }
    else if (wClean.match(/(di|gan|yap|moqda|yotir|moq|ib|sa|gin|sin|ay)$/)) { pos = 'fel'; xpos = 'VB'; }
    else if (wClean.match(commonAdjectives) || wClean.endsWith('roq') || wClean.endsWith('mtir') || wClean.endsWith('dor') || wClean.endsWith('chan') || wClean.endsWith('li') || wClean.endsWith('siz') || wClean.endsWith('gi')) { pos = 'sifat'; xpos = 'JJ'; }
    else if (wClean.match(/(ta|nchi|inchi)$/) || wClean.match(/\d/)) { pos = 'son'; xpos = 'Num'; }

    // Standart qatorlarni avtomatik to'ldirish (Bo'sh qolmasligi uchun)
    if (pos === 'sifat') {
        extras["Belgining xususiyati"] = "Asliy (Tahminiy)";
        extras["Daraja"] = wClean.endsWith('roq') ? "Qiyosiy" : "Oddiy";
        extras["Tuzilishi"] = "Sodda";
        extras["Yasalishi"] = "Tub";
    } else if (pos === 'ravish') {
        extras["Ma'noviy guruhlari"] = wClean.match(/^(bugun|erta|kecha|hozir|allaqachon|hali)$/) ? "Payt ravishi" : "Holat ravishi";
        extras["Tuzilishi"] = "Sodda";
        extras["Yasalishi"] = "Tub";
        extras["Darajasi"] = "Oddiy";
    }

    return { FORM: word, LEMMA: wClean, FEATS: '∅', XPOS: xpos, posType: pos, source: 'Ichki Lug\'at (Fallback)', extras: extras };
}

/* =========================================
   4. GROQ AI ULANISHI (ANIQ YO'RIQNOMA BILAN)
   ========================================= */
async function callRealAI(word, fullSentence) {
    if (!AI_API_KEY || AI_API_KEY.length < 10) return ruleBasedAI(word);

    const prompt = `Siz o'zbek tilining professional NLP morfologik tahlilchisisiz.
Quyidagi "${word}" so'zini "${fullSentence}" gapi kontekstida tahlil qiling.

DIQQAT: "allaqachon", "yana", "juda", "ko'p" kabi so'zlar qat'iyan RAVISH (Adv), "yangi", "sariq", "katta" kabi so'zlar qat'iyan SIFAT (JJ) hisoblanadi!

Javobingiz qat'iyan bitta JSON obyekti bo'lsin.
{
  "LEMMA": "o'zak so'z",
  "FEATS": "+qo'shimchalar",
  "XPOS": "N, JJ, Num, P, VB, Adv dan biri",
  "posType": "ot, sifat, son, olmosh, fel, ravish dan biri",
  "extras": {
     // Turkumga mos qatorlarni to'ldiring.
     // Sifat uchun: "Belgining xususiyati", "Daraja", "Tuzilishi", "Yasalishi"
     // Ravish uchun: "Ma'noviy guruhlari", "Tuzilishi", "Yasalishi", "Darajasi"
     // Ot uchun: "Ma'noviy guruhlari", "Tuzilishi", "Yasalishi", "Kelishik", "Egalik", "Son"
  }
}`;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${AI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "llama3-8b-8192",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) throw new Error("API Xatoligi");

        const data = await response.json();
        const aiResult = JSON.parse(data.choices[0].message.content);

        return {
            FORM: word,
            LEMMA: aiResult.LEMMA || word,
            FEATS: aiResult.FEATS || '∅',
            XPOS: aiResult.XPOS || 'N',
            posType: (aiResult.posType || 'ot').toLowerCase(),
            source: 'Groq AI',
            extras: aiResult.extras || {}
        };

    } catch (error) {
        return ruleBasedAI(word);
    }
}

/* =========================================
   5. ASOSIY TAHLIL JARAYONI
   ========================================= */
const analyzeBtn = document.getElementById('analyzeBtn');
const resultsGrid = document.getElementById('resultsGrid');

if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async () => {
        const text = document.getElementById('wordInput').value.trim();
        if (!text) return showToast("Matn kiriting!", "error");

        const btnText = document.getElementById('btnText');
        const btnSpinner = document.getElementById('btnSpinner');
        
        btnText.textContent = "Tahlil qilinmoqda...";
        btnSpinner.style.display = "inline-block";
        analyzeBtn.disabled = true;
        document.getElementById('resultSection').style.display = "none";
        resultsGrid.innerHTML = '';

        const words = text.split(/\s+/);
        
        for (let index = 0; index < words.length; index++) {
            let w = words[index];
            let cleanW = w.replace(/[.,!?;:"()«»]/g, '').toLowerCase();
            if(!cleanW) continue;

            let analysis = null;

            // 1. Bazadan qidirish
            if (globalDatabase[cleanW]) {
                analysis = { ...globalDatabase[cleanW], source: 'Data (Excel)' };
            } 
            else {
                // 2. Stemming qidiruvi
                let isStemFound = false;
                for (let s of SUFFIXES) {
                    if (cleanW.endsWith(s)) {
                        let root = cleanW.slice(0, -s.length);
                        if (globalDatabase[root]) {
                            analysis = { ...globalDatabase[root] };
                            analysis.FORM = cleanW; 
                            let oldFeats = analysis.FEATS === '∅' || analysis.FEATS === '—' ? '' : analysis.FEATS;
                            analysis.FEATS = (oldFeats + " +" + s).trim();
                            analysis.source = 'Data (Miya - Stemming)';
                            isStemFound = true;
                            break;
                        }
                    }
                }

                // 3. AI
                if (!isStemFound) {
                    analysis = await callRealAI(cleanW, text);
                }
            }
            
            // HTML Kartochka chizish
            const card = document.createElement('div');
            card.className = 'word-card';
            
            let tableRows = '';
            const id = index + 1;
            const baseValues = [id, w, analysis.LEMMA || cleanW, analysis.FEATS || '∅', analysis.XPOS || 'N'];
            
            baseFields.forEach((field, i) => {
                let val = baseValues[i] !== undefined && baseValues[i] !== "" ? baseValues[i] : "—";
                tableRows += `<tr><th>${field}</th><td style="font-weight: ${i===1||i===2?'700':'500'}">${val}</td></tr>`;
            });

            const turkum = analysis.posType || 'ot';
            const categories = posCategories[turkum] || posCategories['ot'];
            
            // MUKAMMAL MATCHING (Kataklarni aniq to'ldirish)
            categories.forEach(cat => {
                let val = "—";
                if (analysis.extras) {
                    // Katta-kichik harflar, bo'shliqlar va apostroflarni olib tashlab solishtiramiz
                    const safeCat = cat.toLowerCase().replace(/[\s’'_-]/g, '');
                    const matchedKey = Object.keys(analysis.extras).find(k => {
                        const safeKey = k.toLowerCase().replace(/[\s’'_-]/g, '');
                        return safeKey.includes(safeCat) || safeCat.includes(safeKey);
                    });
                    
                    if (matchedKey && analysis.extras[matchedKey] && analysis.extras[matchedKey] !== "—") {
                        val = analysis.extras[matchedKey];
                    }
                }
                
                // Agar baribir bo'sh qolsa va ichki qoidada topilgan bo'lsa (Kafolat)
                if (val === "—" && analysis[cat] && analysis[cat] !== "—") {
                    val = analysis[cat];
                }

                tableRows += `<tr><th>${cat}</th><td>${val}</td></tr>`;
            });

            const badgeClass = analysis.source.includes('Data') ? 'data' : 'ai';
            const icon = analysis.source.includes('Data') ? 'fa-database' : 'fa-brain';

            card.innerHTML = `
                <div class="word-card-header">
                    <span>${id}. ${w}</span>
                    <span class="badge ${badgeClass}" title="${analysis.source}">
                        <i class="fas ${icon}"></i> ${posNames[turkum] || 'Ot'}
                    </span>
                </div>
                <div class="word-card-body">
                    <table>${tableRows}</table>
                </div>
            `;
            resultsGrid.appendChild(card);
        }

        document.getElementById('resultSection').style.display = 'block';
        showToast("Tahlil yakunlandi!", "success");
        
        btnText.textContent = "Tahlil qilish";
        btnSpinner.style.display = "none";
        analyzeBtn.disabled = false;
    });
}

// XLSX Export Funksiyasi
const exportBtn = document.getElementById('exportBtn') || document.getElementById('exportXlsxBtn');
if(exportBtn) {
    exportBtn.addEventListener('click', () => {
        const wb = XLSX.utils.book_new();
        const rows = [];
        document.querySelectorAll('.word-card').forEach(card => {
            const row = {};
            card.querySelectorAll('tr').forEach(tr => {
                row[tr.querySelector('th').innerText] = tr.querySelector('td').innerText;
            });
            rows.push(row);
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, "NLP_Tahlil");
        XLSX.writeFile(wb, "Tahlil_Natijalari_Yakuniy.xlsx");
        showToast("Excel fayli saqlandi!", "success");
    });
}

window.addEventListener('DOMContentLoaded', loadData);