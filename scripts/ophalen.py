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
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import stocky  # noqa: E402
import vib_lezer  # noqa: E402
from stocky import haal  # noqa: E402

PRODUCT_PAD = os.environ.get("STOCKY_PRODUCT_PAD", "/products/{id}")
MAP = Path(os.environ.get("VIB_MAP", Path(__file__).resolve().parent.parent))


def alle_vibs():
    yield from stocky.lijst("/product_msds")


def datum(waarde):
    if not waarde:
        return ""
    try:
        return datetime.fromisoformat(waarde.replace("Z", "+00:00")).strftime("%d-%m-%Y")
    except ValueError:
        return waarde[:10]


def pdf_bijlagen(bijlagen):
    return [b for b in bijlagen or [] if "pdf" in (b.get("mimeType") or "").lower()
            or (b.get("filename") or "").lower().endswith(".pdf")]


def beste_bijlage(bijlagen):
    pdfs = pdf_bijlagen(bijlagen)
    if not pdfs:
        return None
    # Liefst een niet-verlopen VIB, daarna de nieuwste datum.
    return sorted(pdfs, key=lambda b: (not b.get("expired"), b.get("MSDSDate") or ""))[-1]


def lees(pdf):
    with tempfile.NamedTemporaryFile(suffix=".pdf") as tijdelijk:
        tijdelijk.write(pdf)
        tijdelijk.flush()
        return vib_lezer.lees_vib(tijdelijk.name)


def score(v):
    """Welk VIB tonen we? Het best leesbare; bij gelijke stand Nederlands, niet verlopen, nieuwste."""
    gevonden = sum(1 for r in v["gelezen"]["rubrieken"] if r["blokken"])
    return (gevonden, v["gelezen"]["status"] == "ok", v["gelezen"].get("taal") == "nl",
            not v["verlopen"], v["sorteerdatum"])


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
        "taal": "",
        "vibPdf": "",
        "alleVibs": [],
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

    # Alle VIB-PDF's bewaren, ook verlopen en anderstalige.
    versies = []
    for bijlage in pdf_bijlagen(vib.get("attachments")):
        download = bijlage.get("downloadUrl") or f"/product_msds/{vib['id']}/attachments/{bijlage['id']}/download"
        try:
            pdf = haal(download, json_verwacht=False)
        except Exception as fout:
            uit["problemen"].append(f"VIB {bijlage.get('filename') or bijlage.get('id')} niet te downloaden ({fout})")
            continue
        if not pdf.startswith(b"%PDF"):
            uit["problemen"].append(f"VIB {bijlage.get('filename') or bijlage.get('id')}: geen PDF ontvangen")
            continue
        try:
            gelezen = lees(pdf)
        except Exception as fout:
            gelezen = {"status": "onbetrouwbaar", "taal": "", "problemen": [f"PDF niet te lezen ({fout})"], "rubrieken": []}
        versies.append({"bijlage": bijlage, "pdf": pdf, "gelezen": gelezen,
                        "verlopen": bool(bijlage.get("expired")),
                        "sorteerdatum": bijlage.get("MSDSDate") or ""})
    if not versies:
        uit["status"] = "geen-vib"
        uit["problemen"].append("Geen VIB (PDF) in Stocky")
        return uit

    versies.sort(key=score, reverse=True)
    (MAP / "vib").mkdir(exist_ok=True)
    sleutel = product_id or vib["id"]
    for i, v in enumerate(versies):
        # Het VIB dat getoond wordt heet <product>.pdf, de andere <product>-<bijlage>.pdf
        doel = MAP / "vib" / (f"{sleutel}.pdf" if i == 0 else f"{sleutel}-{v['bijlage'].get('id')}.pdf")
        if not doel.exists() or doel.read_bytes() != v["pdf"]:
            doel.write_bytes(v["pdf"])
        uit["alleVibs"].append({
            "pdf": f"vib/{doel.name}",
            "datum": datum(v["bijlage"].get("MSDSDate")),
            "verlopen": v["verlopen"],
            "taal": v["gelezen"].get("taal", ""),
        })

    beste = versies[0]
    uit["vibPdf"] = uit["alleVibs"][0]["pdf"]
    uit["vibDatum"] = uit["alleVibs"][0]["datum"] or datum(vib.get("latestMSDSDate"))
    uit["verlopen"] = beste["verlopen"]
    uit["taal"] = beste["gelezen"].get("taal", "")
    uit["rubrieken"] = {r["rubriek"]: r["blokken"] for r in beste["gelezen"]["rubrieken"]}
    uit["problemen"] += beste["gelezen"]["problemen"]
    if beste["gelezen"]["status"] != "ok":
        uit["status"] = "onzeker"
    if uit["verlopen"]:
        uit["problemen"].append("VIB is verlopen")
    return uit


def main():
    stocky.vereis_sleutel()
    print(f"Sleutel: {stocky.sleutelvorm()}\nInloggen bij Stocky testen:")
    stocky.kies_manier(uitgebreid=True)
    producten, fouten = [], 0
    for vib in alle_vibs():
        try:
            producten.append(verwerk(vib))
        except Exception as fout:
            fouten += 1
            producten.append({"productId": vib.get("productId"), "naam": vib.get("name") or "", "sku": vib.get("sku") or "",
                              "ean": [], "foto": "", "unNummers": [], "vibDatum": "", "verlopen": False, "taal": "",
                              "vibPdf": "", "alleVibs": [],
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
    in_gebruik = {v["pdf"] for p in producten for v in p.get("alleVibs", [])}
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
        sys.exit("Stocky weigert het verzoek. Er is niets aangepast.\n" + stocky.uitleg(fout))
    except urllib.error.URLError as fout:
        sys.exit(f"Stocky is niet bereikbaar ({fout.reason}). Er is niets aangepast.")
