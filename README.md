# vib-scanner

Webtool (GitHub Pages) waarmee je de veiligheidsinformatiebladen (VIB's) van een artikel uit Stocky opzoekt.
Zoeken kan op **barcode** (scannen of intypen) of op **artikelnaam** zoals die in Stocky staat. Per artikel kun je:

- de belangrijkste rubrieken (8.2, 4, 6, 5, 13) letterlijk lezen;
- het volledige VIB openen (**VIB lezen**) of opslaan (**VIB downloaden**).

## Hoe de VIB's uit Stocky komen

De API-sleutel van Stocky staat alleen in het GitHub-kluisje (`STOCKY_API_KEY`) en nooit in de website zelf.
Elke nacht haalt `scripts/ophalen.py` alle VIB's op (workflow *VIB's ophalen uit Stocky*), zet de PDF's in `vib/`
en maakt `vib-data.js` voor de website.

## Eén VIB zoeken en downloaden (op naam of barcode)

- **Zonder computer:** tabblad *Actions* > *VIB zoeken in Stocky* > *Run workflow*. Vul een naam of barcode in.
  De PDF's staan na afloop onderaan de run onder *Artifacts*.
- **Op de opdrachtregel:**

  ```bash
  export STOCKY_API_KEY=<API_KEY>
  python3 scripts/vib_zoeken.py --naam "ontkalker"
  python3 scripts/vib_zoeken.py --barcode 8712345678906 --lezen
  ```

## Inloggen bij Stocky

Het script probeert zelf de gangbare manieren om de sleutel mee te sturen en zet in het logboek welke werkt.
Test dit met *VIB zoeken in Stocky* > vinkje *Alleen het inloggen testen*, of `python3 scripts/vib_zoeken.py --test`.
Zet de manier die werkt daarna vast als variabele `STOCKY_AUTH` (Settings > Secrets and variables > Actions > Variables).

Stocky accepteert alleen een inlogtoken (`Authorization: Bearer <JWT>`). Werkt de API-sleutel niet, dan kan het ook
met een (service)account: zet dan de secrets `STOCKY_GEBRUIKER` en `STOCKY_WACHTWOORD`. Het script haalt daarmee
zelf een token op bij `/api/v2/jwt_token`.
