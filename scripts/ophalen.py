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
        regels.append("Antwoord van Stocky (begin): "
