"""Haalt rubriek 8 (alleen 8.2), 4, 6, 5 en 13 letterlijk uit een VIB-PDF.

Er wordt niets herschreven of toegevoegd. De lezer:
- haalt de tekst uit de PDF met pdftotext (kolommen blijven bewaard);
- verwijdert kop- en voetteksten die op elke pagina terugkomen;
- knipt de rubrieken uit op de wettelijke kopjes "RUBRIEK 1" t/m "RUBRIEK 16";
- zet kolommen ("Kopje : tekst") om naar leesbare regels;
- controleert of het resultaat bruikbaar is. Zo niet, dan krijgt het VIB
  status "onbetrouwbaar" met de reden, en toont de tool geen advies.

Gebruik: python vib_lezer.py bestand.pdf [meer.pdf ...]
"""

import json
import re
import subprocess
import sys
from collections import Counter

VOLGORDE = ["8", "4", "6", "5", "13"]
TITELS = {
    "8": "Persoonlijke bescherming",
    "4": "Eerste hulp",
    "6": "Maatregelen bij lekkage",
    "5": "Brand",
    "13": "Afvoeren",
}
# "RUBRIEK 4", ook in andere talen ("SECTION 4", "ABSCHNITT 4", ...) en met een nummer ervoor ("4 RUBRIEK 4:").
KOPWOORDEN = r"(?:RUBRIEK|SECTIE|SECTION|ABSCHNITT|RUBRIQUE|SECCI[OÓ]N|SEZIONE|SEC[CÇ][AÃ]O|AFSNIT|AVSNITT|PUNKT|SEKCJA|ODD[IÍ]L|KOHTA|OSA)"
# Tekens die soms vóór een kop staan: een sterretje (gewijzigd), "|>", een opsommingsteken.
VOORTEKEN = r"[*!•·▪|>#\-–]*\s*"
RUBRIEK_KOP = re.compile(r"^\s*" + VOORTEKEN + r"(?:\d{1,2}\.?\s+)?" + KOPWOORDEN + r"\s+(\d{1,2})\b\s*[:.\-–—]?\s*(.*)$", re.IGNORECASE)
# Koppen zonder kopwoord, zoals "4 Eerstehulpmaatregelen" of "5. Brandbestrijdingsmaatregelen".
GENUMMERDE_KOP = re.compile(r"^\s{0,12}" + VOORTEKEN + r"(\d{1,2})\.?\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ /,\-–()'’]{6,})$")
TALEN = {
    "nl": {"de", "het", "een", "en", "van", "niet", "met", "bij", "voor", "worden", "is", "op", "in"},
    "en": {"the", "and", "of", "with", "not", "for", "be", "is", "on", "in", "if", "use"},
    "de": {"der", "die", "und", "das", "mit", "nicht", "von", "für", "ist", "bei", "zu", "werden"},
    "fr": {"le", "la", "les", "et", "des", "du", "avec", "pas", "pour", "en", "est", "une"},
    "es": {"el", "la", "los", "las", "y", "de", "con", "no", "para", "por", "una", "en"},
}
TAALNAAM = {"nl": "Nederlands", "en": "Engels", "de": "Duits", "fr": "Frans", "es": "Spaans"}
SUBKOP = re.compile(r"^\s*[·•▪]?\s*(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\.?\s+(\S.*)$")
OPSOMMING = re.compile(r"^\s*[·•▪]\s+\S")
VELD = re.compile(r"^(\s*)(\S[^:]{0,60}?)\s*:\s+(\S.*)$")


def pdf_naar_paginas(pad):
    uit = subprocess.run(
        ["pdftotext", "-layout", "-enc", "UTF-8", pad, "-"],
        capture_output=True, text=True, check=True,
    ).stdout
    return uit.split("\f")


def normaliseer(regel):
    return re.sub(r"\d+", "#", re.sub(r"\s+", " ", regel.strip())).lower()


def kop_en_voet(paginas):
    """Regels die op minstens de helft van de pagina's staan, zijn kop- of voettekst."""
    teller = Counter()
    for p in paginas:
        teller.update({normaliseer(r) for r in p.splitlines() if r.strip()})
    grens = max(3, len(paginas) // 2)
    return {r for r, n in teller.items() if n >= grens and not RUBRIEK_KOP.match(r)}


def is_paginanummer(regel):
    r = regel.strip().lower()
    return bool(re.fullmatch(r"(pagina:?\s*)?\d+\s*(/|van)\s*\d+", r) or re.fullmatch(r"pagina:?\s*\d+", r))


def schone_regels(paginas):
    weg = kop_en_voet(paginas)
    regels = []
    for p in paginas:
        for r in p.splitlines():
            if r.strip() and (normaliseer(r) in weg or is_paginanummer(r)):
                continue
            regels.append(r.rstrip())
    return regels


def _genummerde_koppen(regels):
    """Zoekt koppen als "4 Eerstehulpmaatregelen" of "4. EERSTEHULPMAATREGELEN".
    Alleen bruikbaar als ze oplopen (1, 2, 3, ...; een overgeslagen nummer mag) en er genoeg zijn."""
    gevonden, laatst = {}, 0
    for i, r in enumerate(regels):
        m = GENUMMERDE_KOP.match(r)
        if not m or re.search(r"\s{3,}\S", r.strip()):
            continue
        nr = int(m.group(1))
        if laatst < nr <= laatst + 3 and nr <= 16:
            gevonden[i] = str(nr)
            laatst = nr
    nummers = set(gevonden.values())
    return gevonden if len(nummers) >= 10 and {"4", "5", "13"} <= nummers else {}


def knip_rubrieken(regels):
    rubrieken, huidig = {}, None
    koppen = {i: m.group(1).lstrip("0") for i, r in enumerate(regels) if (m := RUBRIEK_KOP.match(r))}
    if len(set(koppen.values())) < 8:
        koppen = _genummerde_koppen(regels) or koppen
    for i, r in enumerate(regels):
        if i in koppen:
            huidig = koppen[i]
            rubrieken.setdefault(huidig, [])
            continue
        if huidig:
            rubrieken[huidig].append(r)
    return rubrieken


def alleen_8_2(regels):
    for i, r in enumerate(regels):
        m = SUBKOP.match(r)
        if m and m.group(1) in ("8.2",):
            return regels[i:], True
    return regels, False


def plak(tekst, extra):
    if not tekst:
        return extra
    if re.search(r"[a-zà-ÿ)]-$", tekst) and re.match(r"[a-zà-ÿ]", extra):
        if re.match(r"(en|of|tot|noch)\b", extra):
            return tekst + " " + extra  # "oog- en huidcontact": streepje en spatie laten staan
        return tekst + extra  # afgebroken woord: streepje laten staan, zo raakt er niets kwijt
    return tekst + " " + extra


def inspring(r):
    return len(r) - len(r.lstrip())


def gecentreerd(groep):
    """W'eau-stijl: kopje verticaal in het midden naast de tekst.
    Herkenbaar aan een tekstregel (ver ingesprongen, zonder punt aan het eind)
    direct gevolgd door een regel met een kopje."""
    for i in range(1, len(groep)):
        vorige, r = groep[i - 1], groep[i]
        eerste_van_alinea = i == 1 or not groep[i - 2].strip()
        if (eerste_van_alinea and vorige.strip() and inspring(vorige) >= 15
                and not re.search(r"[.:;)]$", vorige.strip()) and r.strip() and inspring(r) < 12):
            return True
    return False


def ontleed_gecentreerd(groep, twijfel):
    regels = [(i, r) for i, r in enumerate(groep) if r.strip()]
    x = min(inspring(r) for _, r in regels if inspring(r) >= 15)
    kopjes, tekstregels, bezig = [], [], None
    for i, r in regels:
        links, rechts = re.sub(r"\s+", " ", r[:x]).strip(), re.sub(r"\s+", " ", r[x:]).strip()
        if links and r[x - 1:x] not in (" ", ""):
            twijfel.append("regel loopt door de kolomgrens: " + r.strip()[:50])
        if links:
            if bezig is None:
                bezig = {"kopje": links, "regels": [i]}
                kopjes.append(bezig)
            else:
                bezig["kopje"] = plak(bezig["kopje"], links)
                bezig["regels"].append(i)
            if links.endswith(":"):
                bezig = None
        if rechts:
            tekstregels.append((i, rechts))
    blokken, losse = [], []
    for k in kopjes:
        k["tekst"] = ""
    for i, t in tekstregels:
        if not kopjes:
            losse.append(t)
            continue
        afstanden = [max(min(k["regels"]) - i, i - max(k["regels"]), 0) for k in kopjes]
        beste = min(afstanden)
        if afstanden.count(beste) > 1:
            twijfel.append("tekst staat even ver van twee kopjes: " + t[:50])
        k = kopjes[afstanden.index(beste)]
        k["tekst"] = plak(k["tekst"], t)
    if losse:
        blokken.append({"soort": "alinea", "tekst": " ".join(losse)})
    for k in kopjes:
        blokken.append({"soort": "veld", "kopje": k["kopje"].rstrip(":").strip(), "tekst": k["tekst"]})
    return blokken


def tabelcellen(r):
    """Geeft [(kolom, tekst), ...] als de regel een tabelrij is (3 of meer kolommen)."""
    cellen = [(m.start(), m.group()) for m in re.finditer(r"\S+(?: {1,2}\S+)*", r)]
    if len(cellen) >= 3 and not any(t == ":" or t.endswith(" :") for _, t in cellen):
        return cellen
    return None


def ontleed_bovenaan(groep, twijfel):
    blokken = []
    veld = None  # (kolom waar de tekst begint, kolom van de dubbele punt)
    for r in groep:
        cellen = tabelcellen(r)
        if cellen:
            if not (blokken and blokken[-1]["soort"] == "tabel"):
                blokken.append({"soort": "tabel", "rijen": [], "kolommen": [k for k, _ in cellen]})
            tabel = blokken[-1]
            rij = [""] * len(tabel["kolommen"])
            for k, t in cellen:
                rij[min(range(len(rij)), key=lambda j: abs(tabel["kolommen"][j] - k))] = t
            tabel["rijen"].append(rij)
            veld = None
            continue
        if blokken and blokken[-1]["soort"] == "tabel" and r.strip() and inspring(r) >= 15:
            # vervolgregel van een tabelcel: bij de cel met de dichtstbijzijnde kolom voegen
            tabel = blokken[-1]
            j = min(range(len(tabel["kolommen"])), key=lambda j: abs(tabel["kolommen"][j] - inspring(r)))
            tabel["rijen"][-1][j] = plak(tabel["rijen"][-1][j], r.strip())
            continue
        if not r.strip():
            veld = None
            if blokken and blokken[-1]["soort"] == "alinea":
                blokken[-1]["open"] = False
            continue
        m = VELD.match(r)
        if m and len(m.group(2)) <= 60 and inspring(r) < 15:
            blokken.append({"soort": "veld", "kopje": re.sub(r"\s+", " ", m.group(2)),
                            "tekst": re.sub(r"\s+", " ", m.group(3))})
            veld = (r.index(m.group(3), m.end(2)), r.index(":", m.end(2) - 1))
            continue
        if veld and blokken and blokken[-1]["soort"] == "veld":
            start, dp = veld
            links, rechts = r[:dp].strip(), r[dp:].strip().lstrip(":").strip()
            # Zin die doorloopt op een minder ver ingesprongen regel ("..., in" / "halfzittende houding."):
            # de vorige tekst eindigt niet met een leesteken en deze regel begint met een kleine letter.
            vorig = blokken[-1]["tekst"].rstrip()
            # Niet bij een kopje dat in de linkerkolom doorloopt ("Bescherming van de" / "ademhalingswegen"):
            # dan eindigt de tekst links vóór de kolom met de dubbele punt.
            # Een losse regel links die met een punt eindigt ("raadplegen.") is ook doorlopende tekst: een kopje eindigt niet zo.
            loopt_door = len(r[:dp].rstrip()) > dp - 2 or (not rechts and re.search(r"[.!?)]$", links or ""))
            if vorig and not re.search(r"[.!?:;]$", vorig) and re.match(r"\s*[a-zà-ÿ(]", r) and not VELD.match(r) and loopt_door:
                blokken[-1]["tekst"] = plak(vorig, re.sub(r"\s+", " ", r.strip()))
                continue
            if inspring(r) >= start - 2:
                blokken[-1]["tekst"] = plak(blokken[-1]["tekst"], re.sub(r"\s+", " ", r.strip()))
                continue
            twee_kolommen = links and rechts and len(r[:dp].rstrip()) <= dp - 2
            kort_kopje = links and not rechts and len(links) <= 25 and not links.endswith(".")
            if twee_kolommen or kort_kopje:
                blokken[-1]["kopje"] = plak(blokken[-1]["kopje"], re.sub(r"\s+", " ", links))
                if rechts:
                    blokken[-1]["tekst"] = plak(blokken[-1]["tekst"], re.sub(r"\s+", " ", rechts))
                continue
            veld = None
        tekst = re.sub(r"\s+", " ", r.strip())
        # Een regel die met een opsommingsteken begint ("· After inhalation") start een nieuw stuk tekst.
        if OPSOMMING.match(r):
            tekst = re.sub(r"^[·•▪]\s*", "", tekst)
            kopje = len(tekst) < 70 and not re.search(r"[.!?:;]$", tekst)
            blokken.append({"soort": "alinea", "tekst": tekst, "open": not kopje})  # een kopje staat op zichzelf
            continue
        if blokken and blokken[-1]["soort"] == "alinea" and blokken[-1].get("open"):
            blokken[-1]["tekst"] = plak(blokken[-1]["tekst"], tekst)
        else:
            blokken.append({"soort": "alinea", "tekst": tekst, "open": True})
    for b in blokken:
        b.pop("open", None)
        b.pop("kolommen", None)
    return blokken


def naar_blokken(regels, twijfel):
    """Zet de ruwe regels om naar blokken: kop, veld (kopje + tekst) of alinea.
    Elk onderdeel (4.1, 4.2, ...) wordt apart bekeken, omdat de opmaak kan verschillen."""
    blokken, groep = [], []

    def klaar():
        if any(r.strip() for r in groep):
            gelezen = None
            if gecentreerd(groep):
                eigen_twijfel = []
                gelezen = ontleed_gecentreerd(groep, eigen_twijfel)
                if eigen_twijfel:
                    gelezen = None  # bij twijfel geen kopjes koppelen, maar gewone alinea's
            blokken.extend(gelezen if gelezen is not None else ontleed_bovenaan(groep, twijfel))
        groep.clear()

    for r in regels:
        sub = SUBKOP.match(r)
        if sub:
            klaar()
            blokken.append({"soort": "kop", "tekst": sub.group(1) + " " + re.sub(r"\s+", " ", sub.group(2)).rstrip(":")})
        else:
            groep.append(r)
    klaar()
    return blokken


NL = {"de", "het", "een", "en", "van", "niet", "met", "bij", "voor", "worden", "is", "op", "in"}
EN = {"the", "and", "of", "with", "not", "for", "be", "is", "on", "in", "if", "use"}


def lijkt_nederlands(tekst):
    woorden = re.findall(r"[a-zà-ÿ]+", tekst.lower())
    nl = sum(w in NL for w in woorden)
    en = sum(w in EN for w in woorden)
    return nl >= 10 and nl > 2 * en


def taal_van(tekst):
    woorden = re.findall(r"[a-zà-ÿ]+", tekst.lower())
    score = {t: sum(w in s for w in woorden) for t, s in TALEN.items()}
    beste = max(score, key=score.get)
    return beste if score[beste] >= 10 else ""


def leesbaar(tekst):
    if "(cid:" in tekst or "\ufffd" in tekst:
        return False
    letters = sum(c.isalpha() for c in tekst)
    return letters / max(1, len(tekst)) > 0.6


def tekens(tekst):
    """Alle letters en cijfers, voor de controle dat er niets wegvalt of bijkomt."""
    from collections import Counter as C
    return C(c for c in tekst.lower() if c.isalnum())


def blok_tekst(blokken):
    delen = []
    for b in blokken:
        if b["soort"] == "tabel":
            delen += [c for rij in b["rijen"] for c in rij]
        else:
            delen += [b.get("kopje", ""), b.get("tekst", "")]
    return " ".join(delen)


def lees_vib(pad):
    paginas = pdf_naar_paginas(pad)
    regels = schone_regels(paginas)
    rubrieken = knip_rubrieken(regels)
    problemen, uit = [], []
    alle_tekst = ""
    for nr in VOLGORDE:
        r = rubrieken.get(nr)
        if r is None:
            problemen.append(f"Rubriek {nr} niet gevonden")
            continue
        if nr == "8":
            r, gevonden = alleen_8_2(r)
            if not gevonden:
                problemen.append("Onderdeel 8.2 niet gevonden")
        twijfel = []
        blokken = naar_blokken(r, twijfel)
        verschil = (tekens(" ".join(r)) - tekens(blok_tekst(blokken))) + (tekens(blok_tekst(blokken)) - tekens(" ".join(r)))
        if verschil:
            twijfel.append("tekst wijkt af van het origineel: " + "".join(sorted(verschil.elements()))[:40])
        problemen += [f"Rubriek {nr}: {t}" for t in twijfel]
        platte = " ".join(b.get("kopje", "") + " " + b.get("tekst", " ".join(" ".join(r) for r in b.get("rijen", []))) for b in blokken)
        alle_tekst += " " + platte
        if len(platte.strip()) < 30:
            problemen.append(f"Rubriek {nr} is (bijna) leeg")
        uit.append({"rubriek": nr, "titel": TITELS[nr], "blokken": blokken})
    if not regels or not leesbaar(alle_tekst):
        problemen.append("Tekst niet goed leesbaar")
    taal = "nl" if lijkt_nederlands(alle_tekst) else taal_van(alle_tekst)
    if taal != "nl":
        problemen.append("VIB lijkt niet Nederlands" + (f" ({TAALNAAM[taal]})" if taal else ""))
    return {
        "taal": taal,
        "bestand": pad.split("/")[-1],
        "status": "onbetrouwbaar" if problemen else "ok",
        "problemen": problemen,
        "rubrieken": uit,
    }


if __name__ == "__main__":
    print(json.dumps([lees_vib(p) for p in sys.argv[1:]], ensure_ascii=False, indent=1))
