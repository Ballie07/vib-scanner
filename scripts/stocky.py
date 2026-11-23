"""Verbinding met de Stocky-API, gedeeld door ophalen.py en vib_zoeken.py.

De sleutel komt uit de omgeving (STOCKY_API_KEY) en wordt nooit afgedrukt of opgeslagen.

Inloggen: Stocky antwoordde eerder met "Invalid JWT Token" toen de sleutel in de kop
"Authorization" stond. Daarom probeert dit script zelf een paar gangbare manieren om een
API-sleutel mee te sturen en onthoudt het welke werkt. Weet je de juiste manier al, zet
dan STOCKY_AUTH, bijvoorbeeld:
    STOCKY_AUTH="X-API-KEY"            (sleutel in die kop)
    STOCKY_AUTH="Authorization:Bearer" (Authorization: Bearer <sleutel>)
    STOCKY_AUTH="?apiKey"              (sleutel als ?apiKey=... in het adres)
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASIS = os.environ.get("STOCKY_URL", "https://oms.oftomorrow.eu/api/v2").rstrip("/")
SLEUTEL = os.environ.get("STOCKY_API_KEY", "").strip()
if SLEUTEL.lower().startswith("bearer "):
    SLEUTEL = SLEUTEL[7:].strip()
ORIGIN = "{0.scheme}://{0.netloc}".format(urllib.parse.urlsplit(BASIS))
AGENT = "Toppy-VIB-scanner/1.1"

# Volgorde waarin manieren van inloggen geprobeerd worden.
MANIEREN = [
    "Authorization:Bearer",
    "X-API-KEY",
    "X-Api-Token",
    "X-AUTH-TOKEN",
    "Api-Key",
    "Authorization:ApiKey",
    "Authorization:Token",
    "Authorization:",
    "?apiKey",
    "?api_key",
    "?token",
]

_gekozen = {"manier": os.environ.get("STOCKY_AUTH", "").strip() or None}


def vereis_sleutel():
    if not SLEUTEL:
        sys.exit("STOCKY_API_KEY ontbreekt. Zet de sleutel in GitHub: Settings > Secrets and variables > Actions.")


def adres(pad):
    if pad.startswith("http"):
        return pad
    if pad.startswith("/api/"):
        return ORIGIN + pad
    return BASIS + pad


def _verzoek(pad, manier, json_verwacht=True):
    url = adres(pad)
    koppen = {
        "Accept": "application/ld+json, application/json" if json_verwacht else "*/*",
        "User-Agent": AGENT,
    }
    if manier.startswith("?"):
        delen = urllib.parse.urlsplit(url)
        query = urllib.parse.parse_qsl(delen.query) + [(manier[1:], SLEUTEL)]
        url = urllib.parse.urlunsplit(delen._replace(query=urllib.parse.urlencode(query)))
    elif manier.startswith("Authorization:"):
        voor = manier.split(":", 1)[1].strip()
        koppen["Authorization"] = (voor + " " + SLEUTEL) if voor else SLEUTEL
    else:
        koppen[manier] = SLEUTEL
    with urllib.request.urlopen(urllib.request.Request(url, headers=koppen), timeout=60) as antwoord:
        data = antwoord.read()
    return json.loads(data) if json_verwacht else data


def kies_manier(test_pad="/product_msds?itemsPerPage=1", uitgebreid=False):
    """Zoekt uit welke manier van inloggen werkt. Geeft de manier terug, of gooit de laatste fout."""
    if _gekozen["manier"]:
        return _gekozen["manier"]
    laatste = None
    for manier in MANIEREN:
        try:
            _verzoek(test_pad, manier)
        except urllib.error.HTTPError as fout:
            if uitgebreid:
                print(f"  {manier:<22} -> {fout.code} {kort_antwoord(fout)}")
            laatste = fout
            if fout.code in (401, 403):
                continue
            raise
        if uitgebreid:
            print(f"  {manier:<22} -> werkt")
        _gekozen["manier"] = manier
        print(f"Inloggen bij Stocky werkt met: {manier}  (vastzetten kan met STOCKY_AUTH={manier})")
        return manier
    raise laatste


def haal(pad, json_verwacht=True):
    vereis_sleutel()
    return _verzoek(pad, kies_manier(), json_verwacht)


def lijst(pad):
    """Loopt alle pagina's van een lijst (API Platform / Hydra) af."""
    while pad:
        pagina = haal(pad)
        if isinstance(pagina, list):
            yield from pagina
            return
        yield from pagina.get("member", pagina.get("hydra:member", []))
        view = pagina.get("view", pagina.get("hydra:view", {})) or {}
        pad = view.get("next", view.get("hydra:next"))


def kort_antwoord(fout):
    try:
        if not hasattr(fout, "_tekst"):
            fout._tekst = fout.read(2000).decode("utf-8", "replace")
        return " ".join(fout._tekst.split())[:160]
    except Exception:
        return ""


def sleutelvorm():
    """Beschrijft de vorm van de sleutel zonder hem te tonen."""
    if not SLEUTEL:
        return "geen sleutel"
    delen = SLEUTEL.count(".") + 1
    vorm = "JWT-vorm (3 delen, begint met eyJ)" if delen == 3 and SLEUTEL.startswith("eyJ") else f"{delen} deel/delen"
    rare = any(c.isspace() or ord(c) > 126 for c in SLEUTEL)
    return f"{len(SLEUTEL)} tekens, {vorm}" + (", BEVAT SPATIES OF VREEMDE TEKENS" if rare else "")


def uitleg(fout):
    """Vertelt in gewone taal wat een weigering van Stocky waarschijnlijk betekent."""
    inhoud = kort_antwoord(fout)
    koppen = {k.lower(): v for k, v in (fout.headers or {}).items()}
    regels = [f"Adres: {fout.url.split('?')[0]}", f"Foutcode: {fout.code}", f"Sleutel: {sleutelvorm()}"]
    uitdaging = "Just a moment" in inhoud or "cf-mitigated" in koppen or "challenge" in inhoud.lower()
    if uitdaging:
        regels.append("Oorzaak: de beveiliging (Cloudflare) van Stocky houdt verzoeken van GitHub tegen. "
                      "De beheerder van Stocky moet verzoeken met deze sleutel van buitenaf toestaan.")
    elif "jwt" in inhoud.lower():
        regels.append("Oorzaak: Stocky verwacht een geldig inlogtoken (JWT) en herkent de sleutel niet als zodanig. "
                      "Alle gangbare manieren om een API-sleutel mee te sturen zijn geprobeerd. Vraag de beheerder "
                      "van Stocky welke kop (header) of welk inlogadres bij deze sleutel hoort, of maak een nieuwe "
                      "sleutel aan en zet die in het kluisje.")
    elif fout.code == 401:
        regels.append("Oorzaak: de sleutel wordt niet herkend. Controleer of hij volledig en zonder spaties in het kluisje staat.")
    elif fout.code == 403:
        regels.append("Oorzaak: de sleutel wordt herkend maar heeft geen rechten voor dit onderdeel. Vraag de "
                      "beheerder van Stocky om leesrechten voor product_msds en products.")
    if inhoud:
        regels.append("Antwoord van Stocky (begin): " + inhoud[:300])
    return "\n".join(regels)
