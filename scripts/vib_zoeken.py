"""Zoekt het VIB van één artikel in Stocky op naam of barcode, en downloadt het.

Gebruik (de sleutel staat in STOCKY_API_KEY):
    python3 scripts/vib_zoeken.py --naam "ontkalker"
    python3 scripts/vib_zoeken.py --barcode 8712345678906
    python3 scripts/vib_zoeken.py --barcode 8712345678906 --lezen    (toont ook rubriek 8.2, 4, 6, 5, 13)
    python3 scripts/vib_zoeken.py --test                              (controleert alleen het inloggen)

De PDF's komen in de map gedownload/ (of de map die je met --map opgeeft).
In GitHub kan dit ook zonder computer: tabblad Actions > "VIB zoeken in Stocky" > Run workflow.
"""

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import stocky  # noqa: E402
from stocky import haal  # noqa: E402

PRODUCT_PAD = os.environ.get("STOCKY_PRODUCT_PAD", "/products/{id}")


def barcode_varianten(code):
    """Een EAN-13, UPC-A (12) en GTIN-14 van hetzelfde artikel verschillen alleen in voorloopnullen."""
    schoon = re.sub(r"\D", "", code or "")
    kern = schoon.lstrip("0")
    return {kern.zfill(n) for n in (8, 12, 13, 14) if len(kern) <= n} | {schoon}


def barcodes_van(product):
    return {g.get("barcode") for g in product.get("GTINs") or [] if g.get("barcode")}


def woorden_passen(zoek, naam):
    naam = (naam or "").lower()
    return all(w in naam for w in zoek.lower().split())


def zoek_op_naam(zoek):
    """Alle VIB's waarvan de naam alle zoekwoorden bevat."""
    q = urllib.parse.quote(zoek)
    gezien, treffers = set(), []
    # Eerst Stocky laten filteren; negeert Stocky het filter, dan controleren we het hieronder zelf.
    for pad in (f"/product_msds?name={q}", "/product_msds"):
        try:
            for vib in stocky.lijst(pad):
                if vib.get("id") in gezien:
                    continue
                gezien.add(vib.get("id"))
                if woorden_passen(zoek, vib.get("name")):
                    treffers.append(vib)
        except urllib.error.HTTPError as fout:
            if fout.code not in (400, 404):
                raise
        if treffers:
            break
    return treffers


def vibs_van_product(product_id):
    for pad in (f"/product_msds?productId={product_id}", f"/product_msds?product={product_id}"):
        try:
            gevonden = [v for v in stocky.lijst(pad) if str(v.get("productId")) == str(product_id)]
        except urllib.error.HTTPError as fout:
            if fout.code in (400, 404):
                continue
            raise
        if gevonden:
            return gevonden
    return []


def zoek_op_barcode(code):
    varianten = barcode_varianten(code)
    # 1. Stocky laten zoeken op barcode (verschillende filternamen proberen).
    for filter_naam in ("GTINs.barcode", "barcode", "gtin", "ean"):
        for v in sorted(varianten):
            try:
                pagina = haal(f"/products?{filter_naam}={v}&itemsPerPage=30")
            except urllib.error.HTTPError as fout:
                if fout.code in (400, 404):
                    break
                raise
            leden = pagina if isinstance(pagina, list) else pagina.get("member", pagina.get("hydra:member", []))
            for p in leden:
                if barcodes_van(p) & varianten:
                    vibs = vibs_van_product(p.get("id"))
                    if vibs:
                        return vibs
    # 2. Werkt geen filter: alle VIB's langs en per product de barcodes bekijken (langzamer).
    print("Stocky kan niet direct op barcode zoeken; alle VIB's worden doorzocht, even geduld...")
    treffers = []
    for vib in stocky.lijst("/product_msds"):
        pid = vib.get("productId")
        if not pid:
            continue
        try:
            p = haal(PRODUCT_PAD.format(id=pid))
        except urllib.error.HTTPError:
            continue
        if barcodes_van(p) & varianten:
            treffers.append(vib)
    return treffers


def bestandsnaam(tekst):
    return re.sub(r"[^\w\-]+", "_", tekst).strip("_")[:80] or "vib"


def download(vib, map_, lezen):
    import ophalen  # pas hier laden: ophalen.py heeft dezelfde helpers voor bijlagen
    bijlage = ophalen.beste_bijlage(vib.get("attachments"))
    naam = vib.get("name") or f"product {vib.get('productId')}"
    if not bijlage:
        print(f"- {naam}: geen VIB (PDF) in Stocky.")
        return None
    pad = bijlage.get("downloadUrl") or f"/product_msds/{vib['id']}/attachments/{bijlage['id']}/download"
    pdf = haal(pad, json_verwacht=False)
    if not pdf.startswith(b"%PDF"):
        print(f"- {naam}: Stocky gaf geen PDF terug.")
        return None
    doel = map_ / f"{bestandsnaam(naam)}_{vib.get('productId') or vib['id']}.pdf"
    doel.write_bytes(pdf)
    datum = ophalen.datum(bijlage.get("MSDSDate") or vib.get("latestMSDSDate"))
    print(f"- {naam} (sku {vib.get('sku') or '?'}), VIB-datum {datum or 'onbekend'}"
          f"{' (VERLOPEN)' if bijlage.get('expired') else ''}: opgeslagen als {doel}")
    if lezen:
        if not shutil.which("pdftotext"):
            print("  (pdftotext ontbreekt; installeer poppler-utils om de tekst te tonen)")
        else:
            import vib_lezer
            gelezen = vib_lezer.lees_vib(str(doel))
            if gelezen["problemen"]:
                print("  Let op, niet betrouwbaar uit te lezen: " + "; ".join(gelezen["problemen"]))
                print("  Gebruik het volledige VIB (de PDF).")
            for r in gelezen["rubrieken"]:
                print(f"\n  == Rubriek {r['rubriek']}: {r['titel']} ==")
                for b in r["blokken"]:
                    if b["soort"] == "tabel":
                        for rij in b["rijen"]:
                            print("   | " + " | ".join(rij))
                    elif b["soort"] == "veld":
                        print(f"   {b['kopje']}: {b['tekst']}")
                    else:
                        print(f"   {b['tekst']}")
    return doel


def main():
    a = argparse.ArgumentParser(description="VIB van een artikel uit Stocky halen op naam of barcode.")
    a.add_argument("--naam", help="(deel van) de artikelnaam zoals in Stocky")
    a.add_argument("--barcode", help="EAN/GTIN-barcode van het artikel")
    a.add_argument("--map", default="gedownload", help="map voor de PDF's (standaard: gedownload)")
    a.add_argument("--lezen", action="store_true", help="toon ook de rubrieken 8.2, 4, 6, 5 en 13")
    a.add_argument("--max", type=int, default=20, help="hoeveel treffers maximaal downloaden (standaard 20)")
    a.add_argument("--test", action="store_true", help="alleen het inloggen bij Stocky controleren")
    args = a.parse_args()

    stocky.vereis_sleutel()
    if args.test:
        print(f"Sleutel: {stocky.sleutelvorm()}\nInlogmanieren proberen:")
        stocky.kies_manier(uitgebreid=True)
        return
    if not (args.naam or args.barcode):
        a.error("geef --naam of --barcode op")

    treffers = zoek_op_barcode(args.barcode) if args.barcode else zoek_op_naam(args.naam)
    if args.barcode and args.naam:
        treffers = [v for v in treffers if woorden_passen(args.naam, v.get("name"))]
    if not treffers:
        sys.exit("Geen VIB gevonden in Stocky voor " + (f"barcode {args.barcode}" if args.barcode else f'"{args.naam}"') + ".")

    print(f"{len(treffers)} VIB('s) gevonden" + (f", de eerste {args.max} worden gedownload" if len(treffers) > args.max else "") + ":")
    map_ = Path(args.map)
    map_.mkdir(parents=True, exist_ok=True)
    gelukt = [d for v in treffers[: args.max] if (d := download(v, map_, args.lezen))]
    (map_ / "overzicht.json").write_text(json.dumps(
        [{"naam": v.get("name"), "sku": v.get("sku"), "productId": v.get("productId")} for v in treffers],
        ensure_ascii=False, indent=1), encoding="utf-8")
    if not gelukt:
        sys.exit("Wel artikelen gevonden, maar geen VIB-PDF kunnen downloaden.")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as fout:
        sys.exit("Stocky weigert het verzoek.\n" + stocky.uitleg(fout))
    except urllib.error.URLError as fout:
        sys.exit(f"Stocky is niet bereikbaar ({fout.reason}).")
