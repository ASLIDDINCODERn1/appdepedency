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

const posCategories = {
    ot: ["Ma'noviy guruhlari", "Tuzilishi", "Yasalishi", "Kelishik", "Egalik", "Son"],
    sifat: ["Belgining xususiyati", "Daraja", "Tuzulishi", "Yasalishi", "Sifatning LMGlari"],
    son: ["Ma'noviy xususiyatlari", "Hisob so'zlar", "Bir so'zining ma'nolari", "Tuzalishiga ko'ra"],
    olmosh: ["Olmoshlarning ma’noviy guruhlari", "Tuzilishi", "Yasalishi", "Kelishik", "Son", "Egalik", "Olmoshlarning gapda bajaradigan vazifasiga ko‘ra turlari"],
    fel: ["Leksik-ma'noviy guruhlari", "Tuzilishi", "Yasalishi", "Bo'lishli/Bo'lishsiz", "Nisbat", "Mayl", "Zamon", "Shaxs-son"],
    ravish: ["Ravishlarning ma’noviy guruhlari", "Tuzilishi", "Yasalishi", "Darajasi"]
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

// XPOS HARFLARINI O'ZBEKCHA TURKUMGA O'GIRISH (Eng muhim tuzatish!)
function getPosTypeFromXpos(xpos) {
    if (!xpos || xpos === '—') return 'ot';
    const upper = String(xpos).toUpperCase().trim();
    if (upper === 'P' || upper === 'PRON') return 'olmosh';
    if (upper === 'JJ' || upper === 'ADJ') return 'sifat';
    if (upper.includes('NUM')) return 'son';
    if (upper.includes('V')) return 'fel';
    if (upper.includes('ADV') || upper === 'RB') return 'ravish';
    return 'ot'; // Default holda Noun (N)
}

/* =========================================
   2. DATA YUKLASH (EXCEL -> JS MEMORY)
   ========================================= */
async function loadData() {
    const files = [
        { name: 'Shaxinabonu 11mingta  (2).xlsx' },
        { name: 'SON  2300 .xlsx' },
        { name: 'Olmosh gaplar (9).xlsx' }
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
                            cleanRow[header] = row[i] !== undefined ? row[i] : '—';
                        });

                        // Haqiqiy turkumni XPOS ustuniga qarab belgilash
                        let xposValue = xposIndex !== -1 ? row[xposIndex] : 'N';
                        let actualPosType = getPosTypeFromXpos(xposValue);

                        globalDatabase[form] = { ...cleanRow, posType: actualPosType };
                        loadedCount++;
                    }
                }
            });
        } catch (e) {
            console.error(`Xato:`, e);
        }
    }
    
    if(loadedCount > 0) {
        showToast(`Baza tayyor: ${loadedCount} ta so'z yuklandi.`, "success");
    }
}

/* =========================================
   3. ICHKI MANTIQ (SOF QOIDALAR) - FALLBACK
   ========================================= */
function ruleBasedAI(word) {
    let wClean = word.toLowerCase().replace(/[.,!?;:"()«»]/g, '');
    let pos = 'ot', xpos = 'N';

    if (wClean.match(/^(men|sen|u|biz|siz|ular|shu|bu|o'sha|ushbu|kim|nima|qanday|qachon|qayer|hamma|barcha|har|hech|harna)$/)) { 
        pos = 'olmosh'; xpos = 'P'; 
    }
    else if (wClean.match(/^(bugun|erta|kecha|hali|hozir|doim|ko'p|oz|juda|sal|ancha|faqat|hatto)$/) || wClean.endsWith('larcha')) { 
        pos = 'ravish'; xpos = 'Adv'; 
    }
    else if (wClean.match(/(di|gan|yap|moqda|yotir|moq|ib|sa|gin|sin|ay)$/)) { 
        pos = 'fel'; xpos = 'VB'; 
    }
    else if (wClean.endsWith('roq') || wClean.endsWith('mtir') || wClean.endsWith('dor') || wClean.endsWith('chan') || wClean.endsWith('li') || wClean.endsWith('siz') || wClean.endsWith('gi')) { 
        pos = 'sifat'; xpos = 'JJ'; 
    }
    else if (wClean.match(/(ta|nchi|inchi)$/) || wClean.match(/\d/)) { 
        pos = 'son'; xpos = 'Num'; 
    }

    return {
        FORM: word, LEMMA: wClean, FEATS: '∅', XPOS: xpos, posType: pos, source: 'JS Ichki Qoida'
    };
}

/* =========================================
   4. GROQ AI ULANISHI (MUKAMMAL PROMPT)
   ========================================= */
async function callRealAI(word, fullSentence) {
    if (!AI_API_KEY || AI_API_KEY.length < 10) return ruleBasedAI(word);

    // AI ga aniq o'zbek tili qoidalari o'rgatilgan PROMPT
    const prompt = `Siz o'zbek tilining professional morfologik tahlilchisisiz.
Quyidagi "${word}" so'zini "${fullSentence}" gapi kontekstiga qarab tahlil qiling.

O'zbek tili turkumlari bo'yicha qoida (XPOS):
- N (Ot): Narsani, shaxsni bildiradi (masalan: kitob, odam, qiz)
- JJ (Sifat): Belgini bildiradi (masalan: chiroyli, yaxshi, katta)
- Num (Son): Miqdorni bildiradi (masalan: bir, beshta, yuz)
- P (Olmosh): Ism o'rnida qo'llanadi (masalan: ushbu, shu, men, u, hamma, barcha)
- VB (Fe'l): Harakatni bildiradi (masalan: keldi, o'qidi, olmoq)
- Adv (Ravish): Holat, payt, darajani bildiradi (masalan: juda, ko'p, tez, kecha)

Gap kontekstini tahlil qilib, faqat quyidagi JSON formatida javob bering, hech qanday izoh yozmang:
{
  "LEMMA": "o'zak so'z",
  "FEATS": "+qo'shimchalar (masalan: +ni, +lar. Agar yo'q bo'lsa ∅ yozing)",
  "XPOS": "N, JJ, Num, P, VB, Adv dan biri",
  "posType": "ot, sifat, son, olmosh, fel, ravish dan biri",
  "extras": {}
}`;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama3-8b-8192", // Eng tezkor model
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
            source: 'Groq AI (Llama-3)',
            ...aiResult.extras
        };

    } catch (error) {
        console.warn("API xato berdi, ichki algoritm ishga tushdi.");
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

            // 1. Bazadan qidirish (100% Data match)
            if (globalDatabase[cleanW]) {
                analysis = { ...globalDatabase[cleanW], source: 'Data (Excel)' };
            } 
            else {
                // 2. Stemming qidiruvi (Qo'shimchalarni ayirib Data'dan qidirish)
                let isStemFound = false;
                for (let s of SUFFIXES) {
                    if (cleanW.endsWith(s)) {
                        let root = cleanW.slice(0, -s.length);
                        if (globalDatabase[root]) {
                            analysis = { ...globalDatabase[root] };
                            analysis.FORM = cleanW; // Asl so'zni saqlash
                            let oldFeats = analysis.FEATS === '∅' || analysis.FEATS === '—' ? '' : analysis.FEATS;
                            analysis.FEATS = (oldFeats + " +" + s).trim();
                            analysis.source = 'Data (Miya - O\'zak)';
                            isStemFound = true;
                            break;
                        }
                    }
                }

                // 3. Agar Data'da umuman yo'q bo'lsa Groq AI ga yuborish
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
            
            categories.forEach(cat => {
                let val = analysis[cat] || "—";
                tableRows += `<tr><th>${cat}</th><td>${val}</td></tr>`;
            });

            const badgeClass = analysis.source.includes('Data') ? 'data' : 'ai';
            const icon = analysis.source.includes('Data') ? 'fa-database' : 'fa-bolt';

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
        XLSX.writeFile(wb, "Tahlil_Natijalari.xlsx");
        showToast("Excel fayli saqlandi!", "success");
    });
}

window.addEventListener('DOMContentLoaded', loadData);