"""Haalt alle VIB's en productgegevens uit Stocky en maakt vib-data.js voor de tool.

Draait elke nacht via GitHub (.github/workflows/vib-ophalen.yml).
De sleutel komt uit het versleutelde kluisje van GitHub (STOCKY_API_KEY) en
staat nooit in de code of in de gemaakte bestanden.

Wat het doet, per VIB in Stocky:
1. het product opzoeken: naam zoals in Stocky, artikelnummer, barcodes, foto;
2. de nieuwste PDF downloaden en bewaren in de map vib/;
3. de PDF door vib_lezer.py halen (rubriek 8.2, 4, 6, 5, 13 letterlijk + controles).

Contactgegevens van leveranciers (namen, e-mail, telefoon) worden niet bewaard.
"""

import json
import os
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import vib_lezer  # noqa: E402

BASIS = os.environ.get("STOCKY_URL", "https://oms.oftomorrow.eu/api/v2").rstrip("/")
SLEUTEL = os.environ.get("STOCKY_API_KEY", "").strip()
PRODUCT_PAD = os.environ.get("STOCKY_PRODUCT_PAD", "/products/{id}")
MAP = Path(os.environ.get("VIB_MAP", Path(__file__).resolve().parent.parent))
ORIGIN = "{0.scheme}://{0.netloc}".format(urllib.parse.urlsplit(BASIS))

if not SLEUTEL:
    sys.exit("STOCKY_API_KEY ontbreekt. Zet de sleutel in GitHub: Settings > Secrets and variables > Actions.")

kopregel = {"waarde": SLEUTEL}


def adres(pad):
    if pad.startswith("http"):
        return pad
    if pad.startswith("/api/"):
        return ORIGIN + pad
    return BASIS + pad


def haal(pad, json_verwacht=True):
    def doe(waarde):
        verzoek = urllib.request.Request(adres(pad), headers={
            "Authorization": waarde,
            "Accept": "application/ld+json" if json_verwacht else "*/*",
            "User-Agent": "Toppy-VIB-scanner/1.0 (GitHub Actions)",
        })
        with urllib.request.urlopen(verzoek, timeout=60) as antwoord:
            data = antwoord.read()
        return json.loads(data) if json_verwacht else data

    try:
        return doe(kopregel["waarde"])
    except urllib.error.HTTPError as fout:
        if fout.code not in (401, 403) or kopregel.get("geprobeerd"):
            raise
        # Andere schrijfwijze van de sleutel proberen (met of zonder "Bearer "), en onthouden wat werkt.
        kopregel["geprobeerd"] = True
        andere = SLEUTEL[7:] if SLEUTEL.lower().startswith("bearer ") else "Bearer " + SLEUTEL
        resultaat = doe(andere)
        kopregel["waarde"] = andere
        return resultaat


def uitleg(fout):
    """Vertelt in gewone taal wat een weigering van Stocky waarschijnlijk betekent."""
    try:
        inhoud = fout.read(2000).decode("utf-8", "replace")
    except Exception:
        inhoud = ""
    koppen = {k.lower(): v for k, v in (fout.headers or {}).items()}
    regels = [f"Adres: {fout.url}", f"Foutcode: {fout.code}"]
    if "cf-ray" in koppen or "cloudflare" in koppen.get("server", "").lower() or "Just a moment" in inhoud:
        regels.append("Oorzaak: de beveiliging (Cloudflare) van Stocky houdt verzoeken van GitHub tegen. "
                      "De beheerder van Stocky moet verzoeken met deze sleutel van buitenaf toestaan.")
    elif fout.code == 401:
        regels.append("Oorzaak: de sleutel wordt niet herkend. Controleer of hij volledig en zonder spaties in het kluisje staat.")
    else:
        regels.append("Oorzaak: de sleutel wordt herkend maar heeft geen rechten voor dit onderdeel, "
                      "of Stocky laat verzoeken van buitenaf niet toe. Vraag de beheerder van Stocky om "
                      "leesrechten voor product_msds en products, en of verzoeken vanaf GitHub zijn toegestaan.")
    if inhoud.strip():
        regels.append("Antwoord van Stocky (begin): " + " ".join(inhoud.split())[:300])
    return "\n".join(regels)


def alle_vibs():
    pad = "/product_msds"
    while pad:
        pagina = haal(pad)
        yield from pagina.get("member", pagina.get("hydra:member", []))
        view = pagina.get("view", pagina.get("hydra:view", {})) or {}
        pad = view.get("next", view.get("hydra:next"))


def datum(waarde):
    if not waarde:
        return ""
    try:
        return datetime.fromisoformat(waarde.replace("Z", "+00:00")).strftime("%d-%m-%Y")
    except ValueError:
        return waarde[:10]


def beste_bijlage(bijlagen):
    pdfs = [b for b in bijlagen or [] if "pdf" in (b.get("mimeType") or "").lower()
            or (b.get("filename") or "").lower().endswith(".pdf")]
    if not pdfs:
        return None
    # Liefst een niet-verlopen VIB, daarna de nieuwste datum.
    return sorted(pdfs, key=lambda b: (not b.get("expired"), b.get("MSDSDate") or ""))[-1]


def verwerk(vib):
    product_id = vib.get("productId")
    uit = {
        "productId": product_id,
        "naam": vib.get("name") or "",
        "sku": vib.get("sku") or "",
        "ean": [],
        "foto": "",
        "unNummers": vib.get("UNCodes") or [],
        "vibDatum": "",
        "verlopen": False,
        "vibPdf": "",
        "status": "ok",
        "problemen": [],
        "rubrieken": {},
    }
    if product_id:
        try:
            p = haal(PRODUCT_PAD.format(id=product_id))
            uit["naam"] = p.get("name") or uit["naam"]
            uit["sku"] = p.get("sku") or uit["sku"]
            uit["ean"] = sorted({g.get("barcode") for g in p.get("GTINs") or [] if g.get("barcode")})
            uit["foto"] = p.get("imageUrl") or p.get("image") or ""
        except Exception as fout:  # product niet op te halen: VIB wel tonen, maar zonder barcode
            uit["problemen"].append(f"Productgegevens niet opgehaald ({fout})")

    bijlage = beste_bijlage(vib.get("attachments"))
    if not bijlage:
        uit["status"] = "geen-vib"
        uit["problemen"].append("Geen VIB (PDF) in Stocky")
        return uit

    uit["vibDatum"] = datum(bijlage.get("MSDSDate") or vib.get("latestMSDSDate"))
    uit["verlopen"] = bool(bijlage.get("expired"))
    download = bijlage.get("downloadUrl") or f"/product_msds/{vib['id']}/attachments/{bijlage['id']}/download"
    pdf = haal(download, json_verwacht=False)

    doel = MAP / "vib" / f"{product_id or vib['id']}.pdf"
    doel.parent.mkdir(exist_ok=True)
    if not doel.exists() or doel.read_bytes() != pdf:
        doel.write_bytes(pdf)
    uit["vibPdf"] = f"vib/{doel.name}"

    with tempfile.NamedTemporaryFile(suffix=".pdf") as tijdelijk:
        tijdelijk.write(pdf)
        tijdelijk.flush()
        gelezen = vib_lezer.lees_vib(tijdelijk.name)
    uit["rubrieken"] = {r["rubriek"]: r["blokken"] for r in gelezen["rubrieken"]}
    uit["problemen"] += gelezen["problemen"]
    if gelezen["status"] != "ok":
        uit["status"] = "onbetrouwbaar"
    if uit["verlopen"]:
        uit["problemen"].append("VIB is verlopen")
    return uit


def main():
    producten, fouten = [], 0
    for vib in alle_vibs():
        try:
            producten.append(verwerk(vib))
        except Exception as fout:
            fouten += 1
            producten.append({"productId": vib.get("productId"), "naam": vib.get("name") or "", "sku": vib.get("sku") or "",
                              "ean": [], "foto": "", "unNummers": [], "vibDatum": "", "verlopen": False, "vibPdf": "",
                              "status": "fout", "problemen": [f"Ophalen mislukt ({fout})"], "rubrieken": {}})
    producten.sort(key=lambda p: (p["naam"].lower(), str(p["productId"])))

    # Eerst controleren, dan pas iets wegschrijven of weghalen.
    if producten and fouten == len(producten):
        sys.exit("Alles mislukte. Controleer de sleutel en het adres van Stocky. Er is niets aangepast.")
    vorig_bestand = MAP / "vib-data.js"
    if vorig_bestand.exists():
        vorig_aantal = vorig_bestand.read_text(encoding="utf-8").count('"productId":')
        if vorig_aantal and len(producten) < vorig_aantal / 2:
            sys.exit(f"Stocky gaf {len(producten)} producten, vorige keer {vorig_aantal}. "
                     "Dat lijkt op een storing; de bestaande gegevens blijven staan.")

    # PDF's van producten die niet meer in Stocky staan, weghalen.
    in_gebruik = {p["vibPdf"] for p in producten if p["vibPdf"]}
    for oud in (MAP / "vib").glob("*.pdf"):
        if f"vib/{oud.name}" not in in_gebruik:
            oud.unlink()

    tekst = ("// Automatisch gemaakt door scripts/ophalen.py. Niet met de hand aanpassen.\n"
             "const VIB_PRODUCTEN = " + json.dumps(producten, ensure_ascii=False, indent=1) + ";\n")
    vorig_bestand.write_text(tekst, encoding="utf-8")

    telling = {}
    for p in producten:
        telling[p["status"]] = telling.get(p["status"], 0) + 1
    print(f"{len(producten)} producten verwerkt: " + ", ".join(f"{n} {s}" for s, n in sorted(telling.items())))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as fout:
        sys.exit("Stocky weigert het verzoek. Er is niets aangepast.\n" + uitleg(fout))
    except urllib.error.URLError as fout:
        sys.exit(f"Stocky is niet bereikbaar ({fout.reason}). Er is niets aangepast.")
