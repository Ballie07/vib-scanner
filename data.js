// Regels voor de VIB-teksten in deze tool:
// 1. Volg het VIB, altijd. Niets toevoegen, ook niet als het goed bedoeld is.
// 2. Zegt het VIB ergens niets over, dan: "Gebruik je gezonde verstand en doe wat jou het veiligst lijkt."
//
// De producten en VIB-teksten staan in vib-data.js. Dat bestand wordt elke nacht
// automatisch gemaakt uit Stocky (scripts/ophalen.py). De tekst komt letterlijk uit
// rubriek 8.2, 4, 6, 5 en 13 van het VIB. Kan een VIB niet betrouwbaar worden
// uitgelezen, dan geeft de tool geen advies en verwijst hij naar het originele VIB.
//
// Zolang de site openbaar is: alleen verzonnen namen en nummers invullen.
const BHV_LIJST = [
  { naam: "Voorbeeld Een", rol: "BHV", telefoon: "06 00 00 00 01" },
  { naam: "Voorbeeld Twee", rol: "BHV", telefoon: "06 00 00 00 02" },
  { naam: "Voorbeeld Drie", rol: "Veiligheidsverantwoordelijke", telefoon: "06 00 00 00 03" }
];
