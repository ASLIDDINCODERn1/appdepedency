from flask import Flask, request, jsonify, render_template
import pandas as pd
import os
import re

app = Flask(__name__)

# --- BAZANI XOTIRAGA YUKLASH ---
database = {}
pos_map = {
    'adj': 'sifat', 'jj': 'sifat', 
    'p': 'olmosh', 'prn': 'olmosh', 
    'num': 'son', 
    'n': 'ot', 
    'v': 'fel', 'vb': 'fel', 
    'rb': 'ravish', 'adv': 'ravish'
}

def load_databases():
    data_dir = 'data'
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
        print("Data papkasi yaratildi. Iltimos, XLSX yoki CSV fayllarni shu papkaga tashlang.")
        return

    files = [f for f in os.listdir(data_dir) if f.endswith(('.csv', '.xlsx', '.xls'))]
    loaded_words = 0
    
    for file in files:
        path = os.path.join(data_dir, file)
        try:
            # Fayl turiga qarab o'qish
            if file.endswith('.csv'):
                df = pd.read_csv(path, on_bad_lines='skip', dtype=str).fillna("—")
            else:
                df = pd.read_excel(path, dtype=str).fillna("—")
            
            for index, row in df.iterrows():
                # Ustunlar kamida 5 ta bo'lishi va bo'sh bo'lmasligi kerak
                if len(row) >= 5 and str(row[1]).strip() != '—' and str(row[1]).strip().lower() != 'form':
                    form = str(row[1]).lower().strip()
                    xpos = str(row[4]).lower().strip()
                    
                    if xpos in pos_map:
                        turkum = pos_map[xpos]
                        if turkum not in database:
                            database[turkum] = {}
                        
                        base_data = [str(row[0]), str(row[1]), str(row[2]), str(row[3]), str(row[4])]
                        extras_data = [str(item) for item in row[5:]]
                        
                        database[turkum][form] = {"base": base_data, "extras": extras_data}
                        loaded_words += 1
        except Exception as e:
            print(f"Xatolik {file} faylini o'qishda: {e}")
            
    print(f"Baza muvaffaqiyatli yuklandi! Jami {loaded_words} ta so'z xotirada tayyor.")

# --- 10% AI (QOIDALAR ASOSIDA AVTOMATIK ANIQLASH) ---
def analyze_ai(word):
    w = word.lower()
    w_clean = re.sub(r"[.,!?\"';:()—]", "", w)
    
    if re.match(r'^(men|sen|u|biz|siz|ular|kim|nima|qayer|qanday|qachon|shu|bu|o\'sha|o\'z|barcha|hamma|hech|harna)$', w_clean):
        return "olmosh", {"base": ["AI", word, w_clean, "∅", "P"], "extras": ["Kishilik/So'roq/Ko'rsatish", "Sodda", "Tub", "Bosh", "Birlik/Ko'plik", "Yo'q", "Gap bo'lagi"]}
    
    if re.match(r'\d+', w_clean) or re.search(r'(nchi|inchi)$', w_clean) or re.match(r'^(bir|ikki|uch|to\'rt|besh|olti|yetti|sakkiz|to\'qqiz|o\'n|yuz|ming|million)$', w_clean):
        return "son", {"base": ["AI", word, w_clean, "∅", "Num"], "extras": ["Sanoq/Tartib", "Mavjud emas", "—", "Sodda"]}
    
    if re.search(r'(di|gan|pti|moqda|yotir|moq|yap|ajak|ar|mas|sin|gin|ib|sh)$', w_clean):
        return "fel", {"base": ["AI", word, w_clean, "∅", "VB"], "extras": ["Harakat/Holat", "Sodda", "Tub/Yasama", "Bo'lishli", "Aniq nisbat", "Xabar/Buyruq mayli", "Zamon", "Shaxs-son"]}
    
    if re.search(r'(roq|mtir|ish|dor|chan|simon|li|siz|gi)$', w_clean):
        return "sifat", {"base": ["AI", word, w_clean, "∅", "JJ"], "extras": ["Asliy/Nisbiy", "Oddiy/Qiyosiy", "Sodda", "Yasama/Tub", "Matnga qarang"]}
    
    if re.match(r'^(bugun|erta|kecha|hali|hozir|doim|ko\'p|oz|juda|sal|ancha)$', w_clean) or w_clean.endswith('larcha'):
        return "ravish", {"base": ["AI", word, w_clean, "∅", "Adv"], "extras": ["Payt/Holat ravishi", "Sodda", "Tub", "Oddiy daraja"]}
    
    kelishik = "Bosh"
    if w_clean.endswith('ning'): kelishik = "Qaratqich"
    elif w_clean.endswith('ni'): kelishik = "Tushum"
    elif w_clean.endswith('ga') or w_clean.endswith('ka') or w_clean.endswith('qa'): kelishik = "Jo'nalish"
    elif w_clean.endswith('da'): kelishik = "O'rin-payt"
    elif w_clean.endswith('dan'): kelishik = "Chiqish"
    
    son = "Ko'plik" if "lar" in w_clean else "Birlik"
    egalik = "Bor" if re.search(r'(m|im|ng|ing|si|i|miz|ngiz)$', w_clean) and not w_clean.endswith('dan') else "Yo'q"
    
    return "ot", {"base": ["AI", word, w_clean, "∅", "N"], "extras": ["Turdosh/Atoqli", "Sodda", "Tub/Yasama", kelishik, egalik, son]}

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze_text():
    data = request.json
    text = data.get('text', '')
    words = text.split()
    
    results = []
    
    for index, word in enumerate(words):
        clean_word = re.sub(r"[.,!?\"';:()—]", "", word).lower()
        if not clean_word:
            continue
            
        found = False
        res_data = None
        detected_pos = None
        
        for pos_key, words_dict in database.items():
            if clean_word in words_dict:
                detected_pos = pos_key
                res_data = words_dict[clean_word]
                found = True
                break
                
        if not found:
            detected_pos, res_data = analyze_ai(word)
        
        res_copy = {
            "pos": detected_pos,
            "is_data": found,
            "base": res_data["base"].copy(),
            "extras": res_data["extras"].copy()
        }
        res_copy["base"][0] = str(index + 1)
        res_copy["base"][1] = word
        
        results.append(res_copy)
        
    return jsonify({"results": results})

if __name__ == '__main__':
    load_databases()
    app.run(debug=True, port=5000)