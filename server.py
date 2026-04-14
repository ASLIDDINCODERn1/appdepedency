"""
server.py — O'zbek Rule-Based POS Tagger v3.0
Pipeline: Rule Engine → Dataset DB → Stat Model (Stanza-like) → Unknown

Ishga tushirish:
    pip install -r requirements.txt
    set GROQ_API_KEY=gsk_...   (Windows)
    python server.py
"""

import os, re, json, io, logging
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from collections import defaultdict, Counter
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"

# ─── Groq (faqat server muhiti orqali) ───
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")  # Set GROQ_API_KEY env var
groq_client  = None
if GROQ_API_KEY:
    try:
        from groq import Groq
        groq_client = Groq(api_key=GROQ_API_KEY)
        log.info("Groq AI ulandi")
    except Exception as e:
        log.warning(f"Groq ulanmadi: {e}")

POS_UZ = {
    "P":"Olmosh","ADV":"Ravish","ADJ":"Sifat","NUM":"Son",
    "N":"Ot","V":"Fe'l","PUNCT":"Tinish","UNKNOWN":"Noma'lum",
}

# ═══════════════════════════════════════════════════════
# RULE ENGINE  —  PDF lingvistik qoidalari
# ═══════════════════════════════════════════════════════
class UzbekRuleEngine:

    # ── Olmosh turlari ──
    KISHILIK    = frozenset({"men","sen","u","biz","siz","ular"})
    KORSATISH   = frozenset({"u","bu","shu","o'sha","ana","mana","manovi","anovi"})
    KORSATISH_B = frozenset({"mana bu","mana shu","ana bu","ana shu"})
    SOROQ       = frozenset({"kim","nima","qanday","qanaqa","qaysi","qancha",
                             "nechta","qayerda","qachon","nega","qayer","qayda"})
    BELGILASH   = frozenset({"har","hamma","barcha","bari","jami","ba'zi"})
    BELGILASH_B = frozenset({"har kim","har nima","har qaysi","har qancha","har qanaqa"})
    BOLISHSIZLIK   = frozenset({"hech"})
    BOLISHSIZLIK_B = frozenset({"hech kim","hech nima","hech qaysi",
                                "hech qancha","hech qanaqa"})
    OZLIK       = frozenset({"o'z"})
    GUMON       = frozenset({"kimdir","nimadir","qayerdir","qaysidir",
                             "qanchadir","nechtadir","allakim","allanima",
                             "allaqaysi","allaqancha","allanechta","birov","kimsa"})
    GUMON_B     = frozenset({"bir kishi","bir narsa","bir nima"})

    ALL_PRON    = frozenset().union(KISHILIK, KORSATISH, SOROQ, BELGILASH,
                                    BOLISHSIZLIK, OZLIK, GUMON)
    ALL_PRON_B  = frozenset().union(KORSATISH_B, BELGILASH_B, BOLISHSIZLIK_B, GUMON_B)

    PRON_SUF = sorted([
        "larimizdan","larimizga","larimizni","larimizda","larining",
        "laridan","lariga","larini","larida",
        "imizdan","imizga","imizni","imizda","imizning",
        "ingizdan","ingizga","ingizni","ingizda",
        "ning","dan","ga","ni","da","ka","qa",
        "im","ing","i","miz","ngiz","lari","lar",
    ], key=len, reverse=True)

    # ── Ravish turlari ──
    HOLAT_R  = frozenset({"tez","sekin","asta","yayov","piyoda","ohista",
                          "shoshilinch","jim","tinch","baland","past"})
    PAYT_R   = frozenset({"bugun","ertaga","indin","kecha","hozir","erta",
                          "kechqurun","ertalab","tunda","doim","hamisha",
                          "ba'zan","goho","hali","keyin","oldin","avval","so'ng",
                          "beri","buyon","hozirgacha","darhol","zudlik bilan"})
    ORIN_R   = frozenset({"olg'a","ichkarida","tashqarida","uzoqdan","yuqorida",
                          "quyiga","nari","oldinda","olisda","yaqindan","yuqoriga",
                          "pastga","narida","berida","atrofda","tepada",
                          "tagida","ostida","ustida","orqada"})
    MIQDOR_R = frozenset({"sal","picha","xiyol","oz","ko'p","kam","ancha",
                          "xiyla","sal-pal","sira-sira","juda","g'oyat","nihoyatda",
                          "bag'oyat","behad","o'ta","biroz","haddan","ortiqcha"})
    MAQSAD_R = frozenset({"atay","atayin","ataylab","qasddan","o'rtacha",
                          "jo'rttaga","azza-bazza","noiloj","noilojlikdan",
                          "ilojsizlikdan","majburlikdan","albatta","shubhasiz"})
    ALL_ADV  = frozenset().union(HOLAT_R, PAYT_R, ORIN_R, MIQDOR_R, MAQSAD_R)
    ADV_SUF  = sorted(["chasiga","larcha","layin","namo","ona",
                       "cha","lab","dek","day","lay","siz",
                       "an","in","iga","siga"], key=len, reverse=True)

    # ── Sifat turlari ──
    RANG_TUS  = frozenset({"sariq","yashil","ko'k","jigarrang","qizil","oq",
                           "qora","zangori","binafsha","pushti","kulrang",
                           "moviy","to'q","och","qo'ng'ir"})
    MAZA_TAM  = frozenset({"shirin","achchiq","nordon","tursh","sho'r",
                           "bemaza","mazali","totli"})
    HAJM      = frozenset({"katta","kichik","baland","past","uzun","qisqa",
                           "tor","keng","yupqa","qalin","ingichka","yo'g'on",
                           "ulkan","kichkina","ulug'","buyuk","kenja"})
    HID       = frozenset({"xushbo'y","muattar","badbo'y","hidli","hidsiz"})
    XUSUSIYAT = frozenset({"kamtar","odobli","quvnoq","yaxshi","yomon",
                           "chiroyli","aqlli","mehribon","jasur","kuchli",
                           "zaif","qattiq","yumshoq","issiq","sovuq",
                           "yangi","eski","toza","iflos","go'zal",
                           "aziz","sevimli","dono","g'ayratli","ishchan",
                           "shirinso'z","muloyim","qo'rqmas","botir",
                           "kuchsiz","dangasa","qiyin","oson","erkin"})
    ALL_ADJ   = frozenset().union(RANG_TUS, MAZA_TAM, HAJM, HID, XUSUSIYAT)
    ORTTIRMA  = frozenset({"eng","g'oyat","juda","nihoyatda","bag'oyat",
                           "behad","tim","jiqqa","lang","o'ta"})
    OZAYTIRMA = frozenset({"sal","biroz","picha","xiyla","nim","och","xiyol","ozgina"})
    ADJ_SUF   = sorted(["dagi","roq","gi","qi","li","lik",
                        "simon","dor","chan","siz","mand"], key=len, reverse=True)

    # ── Son turlari ──
    BASIC_NUM = frozenset({"bir","ikki","uch","to'rt","besh","olti","yetti",
                           "sakkiz","to'qqiz","o'n","yigirma","o'ttiz","qirq",
                           "ellik","oltmish","yetmish","sakson","to'qson",
                           "yuz","ming","million","milliard"})
    NUM_EXTRA = frozenset({"nol","sifr","yarim","chorak","nimchorak","butun"})
    ALL_NUM   = frozenset().union(BASIC_NUM, NUM_EXTRA)
    HISOB     = frozenset({"nafar","dona","bosh","juft","xil","tur","litr",
                           "kilogram","metr","sm","km","kg","gramm","tonna"})
    NUM_TYPES = {
        "tartib":    sorted(["inchi","nchi","lamchi"], key=len, reverse=True),
        "dona":      ["ta"],
        "chama":     sorted(["tacha","larcha","lab"], key=len, reverse=True),
        "jamlovchi": sorted(["ovlon","ov","ala"], key=len, reverse=True),
        "taqsim":    ["tadan"],
    }

    # ── Normalizatsiya ──
    # Apostrofni saqlaymiz chunki u o'zbek so'zlarining bir qismi (o'n, o'z, to'rt...)
    def norm(self, w: str) -> str:
        w = str(w).lower().strip()
        w = re.sub(r"[.,!?;:()\[\]{}—«»\"`]", "", w)   # tinish belgilari olib tashlash
        w = re.sub(r"[\u2018\u2019\u02bb\u02bc]", "'", w)  # smart quotes → straight apostrophe
        return w

    # ── Yordamchi metodlar ──
    def _pron_stem(self, w):
        for suf in self.PRON_SUF:
            if w.endswith(suf) and len(w) > len(suf) + 1:
                stem = w[:-len(suf)]
                if stem in self.ALL_PRON:
                    return stem, suf
        return None, None

    def _num_stem(self, w):
        for ntype, sufs in self.NUM_TYPES.items():
            for suf in sufs:
                if w.endswith(suf) and len(w) > len(suf):
                    stem = w[:-len(suf)]
                    if stem in self.ALL_NUM or re.match(r"^\d+$", stem):
                        return stem, ntype
        return None, None

    # ── Asosiy teglovchi ──
    def tag(self, word: str, prev: str = "", nxt: str = "") -> dict:
        raw = word
        w   = self.norm(word)
        pv  = self.norm(prev)
        nx  = self.norm(nxt)

        if not w:
            return self._r(raw, w, "PUNCT", "Tinish belgisi", "", 1.0, "punct")

        # Raqam
        if re.match(r"^\d+([.,/]\d+)*$", w):
            return self._r(raw, w, "NUM", "Son", "butun son", 1.0, "digit")

        # ── OLMOSH ──
        if w in self.KISHILIK:
            return self._r(raw, w, "P", "Olmosh", "kishilik olmoshi", 1.0, "pron_kishilik")
        if w in self.KORSATISH and w not in self.KISHILIK:
            return self._r(raw, w, "P", "Olmosh", "ko'rsatish olmoshi", 1.0, "pron_korsatish")
        if w in self.SOROQ:
            return self._r(raw, w, "P", "Olmosh", "so'roq olmoshi", 1.0, "pron_soroq")
        if w in self.BELGILASH:
            return self._r(raw, w, "P", "Olmosh", "belgilash olmoshi", 1.0, "pron_belgilash")
        if w in self.BOLISHSIZLIK:
            return self._r(raw, w, "P", "Olmosh", "bo'lishsizlik olmoshi", 1.0, "pron_bolishsizlik")
        if w in self.OZLIK:
            return self._r(raw, w, "P", "Olmosh", "o'zlik olmoshi", 1.0, "pron_ozlik")
        if w in self.GUMON:
            return self._r(raw, w, "P", "Olmosh", "gumon olmoshi", 1.0, "pron_gumon")

        st, sf = self._pron_stem(w)
        if st:
            return self._r(raw, st, "P", "Olmosh", self._pron_sub(st), 0.95, "pron+" + sf)

        # ── SON ──
        if w in self.ALL_NUM:
            return self._r(raw, w, "NUM", "Son", "sodda son", 1.0, "num_exact")
        if pv in self.ALL_NUM and w in self.HISOB:
            return self._r(raw, w, "NUM", "Son", "hisob so'z", 0.92, "num_hisob")
        stn, nt = self._num_stem(w)
        if stn:
            return self._r(raw, stn, "NUM", "Son", nt + " son", 0.95, "num+" + nt)

        # ── SIFAT ──
        if pv in self.ORTTIRMA and w in self.ALL_ADJ:
            return self._r(raw, w, "ADJ", "Sifat", "orttirma daraja", 1.0, "adj_orttirma")
        if pv in self.OZAYTIRMA and w in self.ALL_ADJ:
            return self._r(raw, w, "ADJ", "Sifat", "ozaytirma daraja", 1.0, "adj_ozaytirma")
        if w in self.ALL_ADJ:
            return self._r(raw, w, "ADJ", "Sifat", self._adj_sub(w), 1.0, "adj_exact")
        for suf in self.ADJ_SUF:
            if w.endswith(suf) and len(w) > len(suf) + 2:
                sub = {"roq":"qiyosiy daraja (-roq)","dagi":"makon-zamon (-dagi)",
                       "gi":"makon-zamon (-gi)","qi":"makon-zamon (-qi)",
                       "li":"xususiyat (-li)","lik":"xususiyat (-lik)",
                       "simon":"o'xshashlik (-simon)","dor":"egalik (-dor)",
                       "chan":"moyillik (-chan)","siz":"yo'qlik (-siz)"}.get(suf, "sifat (-" + suf + ")")
                return self._r(raw, w[:-len(suf)], "ADJ", "Sifat", sub, 0.80, "adj+" + suf)

        # ── RAVISH ──
        if w in self.ALL_ADV:
            return self._r(raw, w, "ADV", "Ravish", self._adv_sub(w), 1.0, "adv_exact")
        for suf in self.ADV_SUF:
            if w.endswith(suf) and len(w) > len(suf) + 2:
                return self._r(raw, w[:-len(suf)], "ADV", "Ravish",
                               "qo'shimchali ravish (-" + suf + ")", 0.75, "adv+" + suf)

        return self._r(raw, w, "UNKNOWN", "Noma'lum", "", 0.0, "no_rule")

    def _r(self, token, stem, pos, pos_uz, subtype, conf, rule):
        return {"token": token, "stem": stem, "pos": pos, "pos_uz": pos_uz,
                "subtype": subtype, "confidence": conf, "rule": rule}

    def _pron_sub(self, st):
        if st in self.KISHILIK:      return "kishilik olmoshi"
        if st in self.KORSATISH:     return "ko'rsatish olmoshi"
        if st in self.SOROQ:         return "so'roq olmoshi"
        if st in self.BELGILASH:     return "belgilash olmoshi"
        if st in self.BOLISHSIZLIK:  return "bo'lishsizlik olmoshi"
        if st in self.OZLIK:         return "o'zlik olmoshi"
        if st in self.GUMON:         return "gumon olmoshi"
        return "olmosh"

    def _adv_sub(self, w):
        if w in self.HOLAT_R:  return "holat ravishi"
        if w in self.PAYT_R:   return "payt ravishi"
        if w in self.ORIN_R:   return "o'rin ravishi"
        if w in self.MIQDOR_R: return "miqdor-daraja ravishi"
        if w in self.MAQSAD_R: return "maqsad-sabab ravishi"
        return "ravish"

    def _adj_sub(self, w):
        if w in self.RANG_TUS:  return "rang-tus sifati"
        if w in self.MAZA_TAM:  return "maza-ta'm sifati"
        if w in self.HAJM:      return "hajm sifati"
        if w in self.HID:       return "hid bildiruvchi sifat"
        if w in self.XUSUSIYAT: return "xususiyat sifati"
        return "sifat"


# ═══════════════════════════════════════════════════════
# STATISTICAL MODEL  —  Stanza kabi dataset'dan o'rganish
# ═══════════════════════════════════════════════════════
class DatasetStatModel:
    """
    Dataset'dagi barcha so'zlardan suffix/prefix statistikasi o'rganadi.
    Rule va DB topmaganida tahminiy POS qaytaradi.
    """
    XPOS_NORM = {
        "P":  "P",   "RR": "ADV", "MD": "ADV",
        "JJ": "ADJ", "Num":"NUM", "NUM":"NUM",
        "N":  "N",   "NER":"N",   "V":  "V",  "VB": "V",
    }

    def __init__(self):
        self.suf_cnt: Dict[str, Counter] = {}
        self.pfx_cnt: Dict[str, Counter] = {}
        self.trained   = False
        self._n_samples = 0

    def train(self, db: Dict[str, list]):
        suf: Dict[str, Counter] = defaultdict(Counter)
        pfx: Dict[str, Counter] = defaultdict(Counter)

        for word, entries in db.items():
            for e in entries:
                norm = self.XPOS_NORM.get(str(e.get("XPOS", "")))
                if not norm:
                    continue
                # Suffix n-gram (1-6 harf) — uzun = og'irroq
                for n in range(1, min(7, len(word) + 1)):
                    suf[word[-n:]][norm] += n * n
                # Prefix n-gram (1-4 harf)
                for n in range(1, min(5, len(word) + 1)):
                    pfx[word[:n]][norm] += n
                self._n_samples += 1

        self.suf_cnt = dict(suf)
        self.pfx_cnt = dict(pfx)
        self.trained  = True
        log.info(f"StatModel: {len(self.suf_cnt)} sufiks naqshi | {self._n_samples} namuna")

    def predict(self, word: str) -> Tuple[str, float]:
        if not self.trained or not word:
            return "N", 0.22

        w = word.lower()
        scores: Counter = Counter()

        for n in range(1, min(7, len(w) + 1)):
            suf = w[-n:]
            if suf in self.suf_cnt:
                wt = n * n
                for pos, cnt in self.suf_cnt[suf].items():
                    scores[pos] += cnt * wt

        for n in range(1, min(5, len(w) + 1)):
            pfx = w[:n]
            if pfx in self.pfx_cnt:
                for pos, cnt in self.pfx_cnt[pfx].items():
                    scores[pos] += cnt

        if not scores:
            return "N", 0.20

        total    = sum(scores.values())
        best_pos, best_cnt = scores.most_common(1)[0]
        conf     = min(0.78, best_cnt / total)
        return best_pos, round(conf, 3)


# ═══════════════════════════════════════════════════════
# DATABASE LOOKUP  —  4 JSON fayl
# ═══════════════════════════════════════════════════════
class DatabaseLookup:
    XPOS_MAP = {
        "P":  ("P",   "Olmosh"),
        "RR": ("ADV", "Ravish"), "MD": ("ADV", "Ravish"),
        "JJ": ("ADJ", "Sifat"),
        "Num":("NUM", "Son"),    "NUM":("NUM", "Son"),
        "N":  ("N",   "Ot"),     "NER":("N",   "Ot"),
        "V":  ("V",   "Fe'l"),   "VB": ("V",   "Fe'l"),
    }
    SUFFIXES = sorted([
        "larimizdan","larimizga","larimizni","larimizda","larining",
        "laridan","lariga","larini","larida",
        "imizdan","imizga","imizni","imizda","imizning",
        "ingizdan","ingizga","ingizni","ingizda",
        "ning","dan","ga","ni","da","ka","qa",
        "miz","ngiz","lari","lar","im","ng","si","i","m",
        "roq","mtir","gina","dir","mi","chi",
    ], key=len, reverse=True)

    def __init__(self):
        self.db:   Dict[str, list]   = {}
        self.stat: DatasetStatModel  = DatasetStatModel()
        self._load()
        self.stat.train(self.db)

    def _norm(self, w):
        w = str(w).lower().strip()
        w = re.sub(r"[.,!?;:()\[\]{}—«»\"`]", "", w)
        w = re.sub(r"[\u2018\u2019\u02bb\u02bc]", "'", w)
        return w.strip()

    def _load(self):
        sources = [
            ("Olmoshvaravish.json", "OlmoshvaRavish"),
            ("Sifat.json",          "Sifat"),
            ("Son.json",            "Son"),
            ("database.json",       None),
        ]
        total = 0
        for fname, key in sources:
            path = DATA_DIR / fname
            if not path.exists():
                log.warning(f"Topilmadi: {fname}")
                continue
            try:
                with open(path, encoding="utf-8") as f:
                    raw = json.load(f)
                arr = raw if isinstance(raw, list) else (
                    raw.get(key) if key and key in raw else
                    next((v for v in raw.values() if isinstance(v, list)), [])
                )
                cnt = 0
                for item in arr:
                    if item is None:
                        continue
                    form = str(item.get("FORM", "")).strip()
                    if not form or form in ("FORM", "—", ""):
                        continue
                    xpos = str(item.get("XPOS", "")).strip()
                    if xpos in ("", "?", "XPOS", "C", "CONJ", "PUNCT"):
                        continue
                    k = self._norm(form)
                    if k:
                        self.db.setdefault(k, []).append(item)
                        cnt += 1
                total += cnt
                log.info(f"  {fname}: {cnt} yozuv")
            except Exception as e:
                log.warning(f"  {fname} xato: {e}")
        log.info(f"Jami DB: {len(self.db)} noyob so'z | {total} yozuv")

    def lookup(self, word: str) -> Optional[dict]:
        k = self._norm(word)
        if k in self.db:
            return self._best(self.db[k])
        for suf in self.SUFFIXES:
            if len(k) > len(suf) + 2 and k.endswith(suf):
                root = k[:-len(suf)]
                if root in self.db:
                    entry = dict(self._best(self.db[root]))
                    entry["_suffix"] = suf
                    return entry
        return None

    def _best(self, entries):
        def score(e):
            s = 0
            if e.get("XPOS", "") in self.XPOS_MAP: s += 4
            if e.get("FEATS", "") not in ("", "∅", "—"): s += 2
            if e.get("LEMMA", "") not in ("", "∅", "—"): s += 1
            return s
        return max(entries, key=score)

    def subtype(self, entry: dict) -> str:
        xpos = entry.get("XPOS", "")
        if xpos == "P":
            v = entry.get("Olmoshlarning ma\u2019noviy guruhlari", "")
            return v if v and v != "—" else "olmosh"
        if xpos == "JJ":
            v = entry.get("Belgining xususiyati", entry.get("Daraja", ""))
            return v if v and v != "—" else "sifat"
        if xpos in ("Num", "NUM"):
            v = entry.get("Ma\u2019noviy xususiyatlari", "")
            return v if v and v != "—" else "son"
        if xpos in ("RR", "MD"):
            return "ravish"
        return ""

    def extra_cols(self, entry: dict) -> dict:
        skip = {"FORM", "LEMMA", "FEATS", "XPOS", "ID", "_suffix"}
        return {k: v for k, v in entry.items()
                if k not in skip and not k.startswith("_") and v not in ("—", "∅", "")}


# ═══════════════════════════════════════════════════════
# POS TAGGER  —  4 bosqichli pipeline
# ═══════════════════════════════════════════════════════
class UzbekPOSTagger:
    def __init__(self, engine: UzbekRuleEngine, db: DatabaseLookup):
        self.e    = engine
        self.db   = db
        self.stat = db.stat

    def tokenize(self, text: str) -> List[str]:
        tokens = re.findall(
            r"\d+[.,/]?\d*|[\w'\u02bb\u02bc\u2018\u2019\-]+|[.,!?;:\u2014\u00ab\u00bb]",
            text, re.UNICODE
        )
        return [t.strip() for t in tokens if t.strip()]

    def tag_sentence(self, text: str) -> List[dict]:
        tokens  = self.tokenize(text)
        results = []
        i = 0

        while i < len(tokens):

            # ── 1. Birikma (2-3 token) ──
            hit = False
            for ln in [3, 2]:
                if i + ln <= len(tokens):
                    phrase = " ".join(tokens[i:i + ln])
                    pn     = self.e.norm(phrase)
                    if pn in self.e.ALL_PRON_B:
                        sub = ("ko'rsatish olmoshi" if pn in self.e.KORSATISH_B else
                               "belgilash olmoshi"  if pn in self.e.BELGILASH_B else
                               "bo'lishsizlik olmoshi" if pn in self.e.BOLISHSIZLIK_B else
                               "gumon olmoshi")
                        results.append({
                            "token": phrase, "stem": pn,
                            "pos": "P", "pos_uz": "Olmosh",
                            "subtype": sub, "confidence": 1.0,
                            "rule": "birikma", "index": i,
                        })
                        i += ln; hit = True; break
            if hit:
                continue

            tok  = tokens[i]
            prev = tokens[i - 1] if i > 0 else ""
            nxt  = tokens[i + 1] if i + 1 < len(tokens) else ""

            # ── 2. Rule Engine (PDF qoidalari) ──
            res = self.e.tag(tok, prev, nxt)
            if res["pos"] != "UNKNOWN":
                res["index"] = i
                results.append(res)
                i += 1
                continue

            # ── 3. Database lookup ──
            entry = self.db.lookup(tok)
            if entry:
                xpos       = entry.get("XPOS", "")
                pos, pos_uz = self.db.XPOS_MAP.get(xpos, ("N", "Ot"))
                suf        = entry.get("_suffix", "")
                lemma      = self.e.norm(entry.get("LEMMA", tok))
                results.append({
                    "token":    tok,
                    "stem":     lemma or self.e.norm(tok),
                    "pos":      pos,
                    "pos_uz":   pos_uz,
                    "subtype":  self.db.subtype(entry),
                    "confidence": 0.90 if not suf else 0.83,
                    "rule":     "database" + ("+" + suf if suf else ""),
                    "index":    i,
                    "db":       self.db.extra_cols(entry),
                })
                i += 1
                continue

            # ── 4. Statistical Model (Stanza-like) ──
            stat_pos, stat_conf = self.stat.predict(tok)
            results.append({
                "token":      tok,
                "stem":       self.e.norm(tok),
                "pos":        stat_pos,
                "pos_uz":     POS_UZ.get(stat_pos, "Noma'lum"),
                "subtype":    "tahminiy (stat)",
                "confidence": stat_conf,
                "rule":       "stat_model",
                "index":      i,
            })
            i += 1

        return results


# ── Global instances ──
engine = UzbekRuleEngine()
db     = DatabaseLookup()
tagger = UzbekPOSTagger(engine, db)


# ═══════════════════════════════════════════════════════
# GROQ — stat_model so'zlarini qayta teglash
# ═══════════════════════════════════════════════════════
def groq_fill_unknowns(tokens: list) -> list:
    """DB da topilmagan (stat_model) so'zlarni Groq bilan to'g'ri teglash."""
    if not groq_client:
        return tokens

    idxs = [i for i, t in enumerate(tokens) if t.get("rule") == "stat_model"]
    if not idxs:
        return tokens

    words = [tokens[i]["token"] for i in idxs]
    prompt = (
        "O'zbek tilida quyidagi so'zlarni morfologik teglang.\n"
        "Faqat JSON array qaytaring (boshqa hech narsa yozma):\n"
        '[{"token":"...","pos":"N|V|ADJ|ADV|NUM|P","stem":"...","subtype":"...","confidence":0.0-1.0}]\n'
        "So'zlar: " + json.dumps(words, ensure_ascii=False)
    )
    try:
        resp = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system",
                 "content": "Sen O'zbek tili morfologiyasi ekspertisan. Faqat JSON array qaytargin."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=800,
        )
        raw = resp.choices[0].message.content.strip()
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if m:
            parsed = json.loads(m.group())
            for idx, res in zip(idxs, parsed):
                if isinstance(res, dict):
                    pos = str(res.get("pos", "N"))
                    tokens[idx].update({
                        "pos":        pos,
                        "pos_uz":     POS_UZ.get(pos, "Noma'lum"),
                        "stem":       str(res.get("stem", tokens[idx]["stem"])),
                        "subtype":    str(res.get("subtype", "")),
                        "confidence": float(res.get("confidence", 0.75)),
                        "rule":       "groq_ai",
                    })
    except Exception as e:
        log.warning("Groq fill xatosi: " + str(e))

    return tokens


# ═══════════════════════════════════════════════════════
# FASTAPI
# ═══════════════════════════════════════════════════════
app = FastAPI(title="O'zbek POS Tagger v3.0", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


class TagRequest(BaseModel):
    text: str

class FilterRequest(BaseModel):
    tokens: List[dict]
    pos_types: List[str] = ["P", "ADV", "ADJ", "NUM"]

class AIRequest(BaseModel):
    text:     str
    tokens:   List[dict] = []
    question: str = ""

class ExportRequest(BaseModel):
    tokens:   List[dict]
    filename: str = "pos_natijalar"


@app.get("/")
async def root():
    return FileResponse(BASE_DIR / "index.html")

@app.get("/style.css")
async def style():
    return FileResponse(BASE_DIR / "style.css")

@app.get("/script.js")
async def script():
    return FileResponse(BASE_DIR / "script.js")


@app.get("/health")
async def health():
    return {
        "status":    "ok",
        "db_words":  len(db.db),
        "stat_sufs": len(db.stat.suf_cnt),
        "groq":      groq_client is not None,
        "version":   "3.0 Rule+DB+Stat+Groq",
    }


@app.post("/api/tag")
async def api_tag(req: TagRequest):
    if not req.text.strip():
        raise HTTPException(400, "Matn bo'sh")
    tokens = tagger.tag_sentence(req.text)
    tokens = groq_fill_unknowns(tokens)   # DB da yo'q so'zlarni Groq teglaydi
    stats: Dict[str, int] = {}
    for t in tokens:
        stats[t["pos"]] = stats.get(t["pos"], 0) + 1
    return {"text": req.text, "tokens": tokens, "stats": stats, "total": len(tokens)}


@app.post("/api/filter")
async def api_filter(req: FilterRequest):
    filtered = [t for t in req.tokens if t.get("pos") in req.pos_types]
    return {"tokens": filtered, "total": len(filtered)}


@app.get("/api/rules")
async def api_rules():
    e = engine
    return {"rules": {
        "olmosh": {
            "tag": "P",
            "qoida": "IF token ∈ olmoshlar → P",
            "kishilik":       sorted(e.KISHILIK),
            "korsatish":      sorted(e.KORSATISH),
            "soroq":          sorted(e.SOROQ),
            "belgilash":      sorted(e.BELGILASH),
            "bolishsizlik":   sorted(e.BOLISHSIZLIK),
            "ozlik":          sorted(e.OZLIK),
            "gumon":          sorted(e.GUMON),
            "kelishik_suf":   e.PRON_SUF[:10],
        },
        "ravish": {
            "tag": "ADV",
            "qoida": "IF token ∈ ravishlar → ADV\nIF token.endswith(suf) → ADV",
            "holat":   sorted(e.HOLAT_R),
            "payt":    sorted(e.PAYT_R),
            "orin":    sorted(e.ORIN_R),
            "miqdor":  sorted(e.MIQDOR_R),
            "maqsad":  sorted(e.MAQSAD_R),
            "sufikslar": e.ADV_SUF,
        },
        "sifat": {
            "tag": "ADJ",
            "qoida": "IF token ∈ sifatlar → ADJ\nIF token+(-roq/-gi/-dagi/-li) → ADJ",
            "rang_tus":  sorted(e.RANG_TUS),
            "maza_tam":  sorted(e.MAZA_TAM),
            "hajm":      sorted(e.HAJM),
            "xususiyat": sorted(e.XUSUSIYAT),
            "orttirma":  sorted(e.ORTTIRMA),
            "ozaytirma": sorted(e.OZAYTIRMA),
            "sufikslar": e.ADJ_SUF,
        },
        "son": {
            "tag": "NUM",
            "qoida": "IF raqam yoki son so'zi → NUM\nIF son+sufiks → NUM",
            "asosiy":   sorted(e.BASIC_NUM),
            "qoshimcha": sorted(e.NUM_EXTRA),
            "hisob_soz": sorted(e.HISOB),
            "sufiks_turlari": {k: v for k, v in e.NUM_TYPES.items()},
        },
    }}


@app.post("/api/ai")
async def api_ai(req: AIRequest):
    if not groq_client:
        raise HTTPException(503, "Groq AI ulangan emas. Server muhitida GROQ_API_KEY o'rnating.")

    pos_groups: Dict[str, List[str]] = {}
    for t in req.tokens:
        label = t.get("pos_uz", "?") + "(" + t.get("subtype", "") + ")"
        pos_groups.setdefault(label, []).append(t.get("token", ""))

    summary   = "\n".join("- " + k + ": " + ", ".join(v) for k, v in pos_groups.items())
    question  = req.question or "Bu gapni morfologik jihatdan tahlil qiling"
    no_tokens = "(hali teglangan so'z yo'q)"

    prompt = (
        "Gap: \"" + req.text + "\"\n\n"
        "Teglangan natijalar:\n" + (summary or no_tokens) + "\n\n"
        "Savol: " + question + "\n\n"
        "O'zbek tilida qisqa va aniq javob bering. "
        "Olmosh, ravish, sifat, son turlarini izohlang."
    )

    try:
        resp = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content":
                 "Siz o'zbek tili morfologiyasi va grammatikasi bo'yicha mutaxassissiz."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=800,
        )
        return {"answer": resp.choices[0].message.content, "model": "llama3-8b-8192"}
    except Exception as e:
        raise HTTPException(500, "Groq xatosi: " + str(e))


@app.post("/api/export")
async def api_export(req: ExportRequest):
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
    except ImportError:
        raise HTTPException(500, "openpyxl o'rnatilmagan")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "POS Natijalar"

    headers = ["#", "Token", "O'zak", "POS", "O'zbekcha", "Tur / Daraja", "Ishonch", "Qoida"]
    hfill = PatternFill("solid", fgColor="1D4ED8")
    hfont = Font(bold=True, color="FFFFFF")
    for col, h in enumerate(headers, 1):
        c = ws.cell(row=1, column=col, value=h)
        c.fill = hfill
        c.font = hfont
        c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 20

    color_map = {
        "P":  "D1FAE5", "ADV": "DBEAFE",
        "ADJ":"FDE68A", "NUM": "FAE8FF",
        "N":  "F1F5F9", "V":   "FEF3C7",
    }
    for row_idx, t in enumerate(req.tokens, 2):
        fgcolor = color_map.get(t.get("pos", ""), "F9FAFB")
        fill    = PatternFill("solid", fgColor=fgcolor)
        conf_pct = int((t.get("confidence", 0) or 0) * 100)
        vals = [
            row_idx - 1,
            t.get("token", ""),
            t.get("stem", ""),
            t.get("pos", ""),
            t.get("pos_uz", ""),
            t.get("subtype", ""),
            str(conf_pct) + "%",
            t.get("rule", ""),
        ]
        for col, v in enumerate(vals, 1):
            c = ws.cell(row=row_idx, column=col, value=v)
            c.fill = fill

    for col, w in enumerate([5, 20, 20, 8, 12, 30, 10, 22], 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(col)].width = w

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = re.sub(r"[^\w\-]", "_", req.filename) + ".xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=" + fname},
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    groq_status = "ulandi" if groq_client else "yo'q (GROQ_API_KEY o'rnating)"
    log.info("=" * 58)
    log.info("O'zbek Rule-Based POS Tagger  v3.0")
    log.info("DB: " + str(len(db.db)) + " so'z | Stat: " + str(len(db.stat.suf_cnt)) + " naqsh | Groq: " + groq_status)
    log.info("Server: http://0.0.0.0:" + str(port))
    log.info("=" * 58)
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
