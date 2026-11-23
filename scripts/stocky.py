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

import base64
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
# Stocky laat alleen verzoeken met de afgesproken User-Agent door (GitHub-secret STOCKY_USER_AGENT).
AGENT = os.environ.get("STOCKY_USER_AGENT", "").strip() or "Toppy-VIB-scanner/1.1"

# Volgorde waarin manieren van inloggen geprobeerd worden.
# "PAT" is de manier die Stocky nu gebruikt; eind 2026 wordt dat "Bearer".
MANIEREN = [
    "Authorization:PAT",
    "Authorization:Bearer",
    "X-API-KEY",
    "X-Api-Token",
    "X-AUTH-TOKEN",
    "Api-Key",
    "Authorization:ApiKey",
    "Authorization:Token",
    "Authorization:",
    "Basic",
    "Basic:leeg",
    "?apiKey",
    "?api_key",
    "?token",
]

_gekozen = {"manier": os.environ.get("STOCKY_AUTH", "").strip() or None, "token": None}

# Inwisselen van de API-sleutel voor een inlogtoken (JWT). Stocky gaf met
# "Authorization: Bearer <sleutel>" de melding "Invalid JWT Token": de sleutel zelf is
# dus geen token. Weet je het inlogadres, zet dan bijvoorbeeld:
#   STOCKY_TOKEN_PAD="/api/v2/token"   en   STOCKY_TOKEN_VELD="apiKey"
TOKEN_PAD = os.environ.get("STOCKY_TOKEN_PAD", "").strip()
TOKEN_VELD = os.environ.get("STOCKY_TOKEN_VELD", "").strip()
# Plan B: inloggen met een (service)account van Stocky, via POST /jwt_token.
GEBRUIKER = os.environ.get("STOCKY_GEBRUIKER", "").strip()
WACHTWOORD = os.environ.get("STOCKY_WACHTWOORD", "")
TOKEN_WOORDEN = ("token", "login", "auth", "apikey", "api_key", "api-key", "session")


def vereis_sleutel():
    if not SLEUTEL and not GEBRUIKER:
        sys.exit("STOCKY_API_KEY ontbreekt. Zet de sleutel in GitHub: Settings > Secrets and variables > Actions.")


def adres(pad):
    if pad.startswith("http"):
        # De sleutel gaat nooit naar een ander adres dan Stocky: alleen het pad overnemen.
        link = urllib.parse.urlsplit(pad)
        return ORIGIN + link.path + ("?" + link.query if link.query else "")
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
    elif manier.startswith("Basic"):
        # sleutel als "gebruiker:geheim", of als gebruiker zonder wachtwoord
        paar = SLEUTEL if manier == "Basic" else SLEUTEL + ":"
        koppen["Authorization"] = "Basic " + base64.b64encode(paar.encode()).decode()
    elif manier == "jwt":
        koppen["Authorization"] = "Bearer " + _gekozen["token"]
    elif manier.startswith("Authorization:"):
        voor = manier.split(":", 1)[1].strip()
        koppen["Authorization"] = (voor + " " + SLEUTEL) if voor else SLEUTEL
    else:
        koppen[manier] = SLEUTEL
    with urllib.request.urlopen(urllib.request.Request(url, headers=koppen), timeout=60) as antwoord:
        data = antwoord.read()
    return json.loads(data) if json_verwacht else data


def _post_json(pad, inhoud):
    verzoek = urllib.request.Request(adres(pad), data=json.dumps(inhoud).encode(), method="POST", headers={
        "Content-Type": "application/json", "Accept": "application/json", "User-Agent": AGENT})
    with urllib.request.urlopen(verzoek, timeout=60) as antwoord:
        return json.loads(antwoord.read() or b"{}")


def _token_uit(antwoord):
    if isinstance(antwoord, dict):
        for k in ("token", "access_token", "accessToken", "jwt", "id_token", "bearer"):
            if isinstance(antwoord.get(k), str) and antwoord[k].count(".") == 2:
                return antwoord[k]
        for v in antwoord.values():
            t = _token_uit(v)
            if t:
                return t
    return None


def wissel_in(pad, veld, uitgebreid=False):
    """Probeert de API-sleutel bij `pad` in te wisselen voor een JWT. Geeft True als het lukt."""
    try:
        t = _token_uit(_post_json(pad, {veld: SLEUTEL}))
    except urllib.error.HTTPError as fout:
        if uitgebreid:
            print(f"  POST {pad} {{{veld}}} -> {fout.code} {kort_antwoord(fout)}")
        return False
    except (urllib.error.URLError, ValueError) as fout:
        if uitgebreid:
            print(f"  POST {pad} {{{veld}}} -> {fout}")
        return False
    if not t:
        if uitgebreid:
            print(f"  POST {pad} {{{veld}}} -> antwoord zonder token")
        return False
    _gekozen["token"] = t
    if uitgebreid:
        print(f"  POST {pad} {{{veld}}} -> token ontvangen")
    return True


def docs():
    """Haalt de (openbare) API-beschrijving van Stocky op, als die er is."""
    for pad in ("/docs.json", "/docs.jsonopenapi", "/docs?format=json", ORIGIN + "/api/docs.json"):
        try:
            verzoek = urllib.request.Request(adres(pad), headers={
                "Accept": "application/vnd.openapi+json, application/json", "User-Agent": AGENT})
            with urllib.request.urlopen(verzoek, timeout=60) as antwoord:
                d = json.loads(antwoord.read())
            if isinstance(d, dict) and d.get("paths"):
                return d
        except Exception:
            continue
    return None


def _velden(schema, d, diepte=0):
    if not isinstance(schema, dict) or diepte > 5:
        return []
    if "$ref" in schema:
        deel = d
        for stuk in schema["$ref"].lstrip("#/").split("/"):
            deel = deel.get(stuk, {}) if isinstance(deel, dict) else {}
        return _velden(deel, d, diepte + 1)
    return list((schema.get("properties") or {}).keys())


def verken(uitgebreid=True):
    """Leest de API-beschrijving en zoekt inlogadressen. Geeft [(pad, [velden])] terug."""
    d = docs()
    if not d:
        if uitgebreid:
            print("Geen openbare API-beschrijving van Stocky gevonden (docs.json).")
        return []
    print("API-beschrijving van Stocky gevonden.")
    schemes = (d.get("components") or {}).get("securitySchemes") or {}
    for naam, sch in schemes.items():
        if sch.get("type") == "oauth2":
            continue
        print(f"  Beveiliging '{naam}': " + ", ".join(f"{k}={v}" for k, v in sch.items() if k != "description"))
        if sch.get("description"):
            print("    uitleg: " + " ".join(str(sch["description"]).split())[:400])
    kandidaten = []
    for pad, methoden in (d.get("paths") or {}).items():
        if not any(w in pad.lower() for w in TOKEN_WOORDEN):
            continue
        for methode, info in methoden.items():
            if not isinstance(info, dict):
                continue
            body = (((info.get("requestBody") or {}).get("content") or {}).get("application/json") or {}).get("schema")
            velden = _velden(body, d)
            print(f"  Inlogadres? {methode.upper()} {pad}  velden: {', '.join(velden) or '-'}  ({info.get('summary') or ''})")
            if methode.lower() == "post":
                kandidaten.append((pad, velden))
    for pad in ("/products", "/product_msds"):
        for p2, methoden in (d.get("paths") or {}).items():
            if p2.rstrip("/").endswith(pad) and "get" in methoden:
                namen = [x.get("name") for x in methoden["get"].get("parameters") or [] if isinstance(x, dict)]
                print(f"  Zoekfilters {p2}: {', '.join(n for n in namen if n)}")
    return kandidaten


def login_met_account(uitgebreid=False):
    try:
        t = _token_uit(_post_json(os.environ.get("STOCKY_LOGIN_PAD", "/jwt_token"),
                                  {"username": GEBRUIKER, "password": WACHTWOORD}))
    except urllib.error.HTTPError as fout:
        print(f"Inloggen met account STOCKY_GEBRUIKER mislukt: {fout.code} {kort_antwoord(fout)}")
        return False
    if t:
        _gekozen["token"] = t
        print("Inloggen bij Stocky werkt met het account (STOCKY_GEBRUIKER / STOCKY_WACHTWOORD).")
        return True
    print("Inloggen met account: antwoord zonder token.")
    return False


def probeer_jwt(uitgebreid=False):
    """Probeert de API-sleutel in te wisselen voor een JWT: eerst het ingestelde adres, anders uit de docs."""
    if GEBRUIKER and login_met_account(uitgebreid):
        return True
    if not SLEUTEL:
        return False
    pogingen = []
    if TOKEN_PAD:
        pogingen.append((TOKEN_PAD, [TOKEN_VELD or "apiKey"]))
    else:
        for pad, velden in verken(uitgebreid):
            sleutelvelden = [v for v in velden if "key" in v.lower() or "token" in v.lower()]
            pogingen.append((pad, sleutelvelden or (["apiKey", "api_key", "key"] if not velden else [])))
    for pad, velden in pogingen:
        for veld in velden:
            if wissel_in(pad if pad.startswith(("/api/", "http")) else pad, veld, uitgebreid):
                print(f"Inloggen werkt door de sleutel in te wisselen bij {pad} (veld '{veld}'). "
                      f"Vastzetten kan met STOCKY_TOKEN_PAD={pad} en STOCKY_TOKEN_VELD={veld}")
                return True
    return False


def kies_manier(test_pad="/product_msds?itemsPerPage=1", uitgebreid=False):
    """Zoekt uit welke manier van inloggen werkt. Geeft de manier terug, of gooit de laatste fout."""
    if _gekozen["manier"]:
        return _gekozen["manier"]
    if TOKEN_PAD or GEBRUIKER or _gekozen["token"]:
        if _gekozen["token"] or probeer_jwt(uitgebreid):
            _gekozen["manier"] = "jwt"
            return "jwt"
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
    # Geen enkele manier werkt met de sleutel zelf: proberen hem in te wisselen voor een token.
    if uitgebreid:
        print("De sleutel zelf wordt niet geaccepteerd. Inlogadres zoeken in de API-beschrijving:")
    if probeer_jwt(uitgebreid):
        try:
            _verzoek(test_pad, "jwt")
            _gekozen["manier"] = "jwt"
            return "jwt"
        except urllib.error.HTTPError as fout:
            if uitgebreid:
                print(f"  token ontvangen, maar Stocky weigert alsnog: {fout.code} {kort_antwoord(fout)}")
            laatste = fout
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
    soort = "alleen hex-tekens" if all(c in "0123456789abcdefABCDEF" for c in SLEUTEL) else "letters/cijfers/tekens"
    extra = ", bevat een dubbele punt" if ":" in SLEUTEL else ""
    return f"{len(SLEUTEL)} tekens, {vorm}, {soort}{extra}" + (", BEVAT SPATIES OF VREEMDE TEKENS" if rare else "")


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
