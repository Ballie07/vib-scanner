const app = document.getElementById("app");
let product = null;
let scanner = null;

const NAMEN = { ogen: "Ogen", huid: "Huid", ingeademd: "Ingeademd", ingeslikt: "Ingeslikt" };

function esc(t) {
  return String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function blok(titel, items, klasse) {
  if (!items || !items.length) return "";
  const punten = items.map((i) => "<li>" + esc(i) + "</li>").join("");
  return '<section class="blok ' + (klasse || "") + '"><h2>' + esc(titel) + "</h2><ul>" + punten + "</ul></section>";
}

function stopScanner() {
  if (!scanner) return;
  const s = scanner;
  scanner = null;
  s.stop().catch(() => {});
}

function startScherm(melding) {
  stopScanner();
  product = null;
  app.innerHTML =
    "<h1>Scan de barcode van het product</h1>" +
    '<button class="groot" id="scanknop">Scan met de camera</button>' +
    '<div id="lezer"></div>' +
    '<label for="ean">Of typ de code in (of scan met de handscanner):</label>' +
    '<div class="rij"><input id="ean" inputmode="numeric" autocomplete="off"><button id="zoek">Zoek</button></div>' +
    '<p class="melding">' + esc(melding || "") + "</p>" +
    "<h2>Proef: kies een voorbeeldproduct</h2>" +
    PRODUCTEN.map((p, i) => '<button class="knop" data-i="' + i + '">' + esc(p.naam) + "</button>").join("");

  document.getElementById("scanknop").onclick = startCamera;
  document.getElementById("zoek").onclick = () => zoek(document.getElementById("ean").value);
  document.getElementById("ean").onkeydown = (e) => {
    if (e.key === "Enter") zoek(e.target.value);
  };
  document.querySelectorAll("[data-i]").forEach((b) => {
    b.onclick = () => {
      product = PRODUCTEN[Number(b.dataset.i)];
      bevestigScherm();
    };
  });
}

function startCamera() {
  if (typeof Html5Qrcode === "undefined") {
    startScherm("De camera-scanner kon niet laden. Typ de code in of kies een voorbeeldproduct.");
    return;
  }
  stopScanner();
  scanner = new Html5Qrcode("lezer", {
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.CODE_128,
    ],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    verbose: false,
  });
  scanner
    .start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 280, height: 120 } }, (tekst) => zoek(tekst), () => {})
    .catch(() => startScherm("Geen toegang tot de camera. Geef de browser toestemming of typ de code in."));
}

function zoek(code) {
  const schoon = String(code || "").replace(/\D/g, "");
  if (!schoon) return startScherm("Vul eerst een code in.");
  const gevonden = PRODUCTEN.find((p) => p.ean.includes(schoon));
  if (!gevonden) return startScherm("Geen product gevonden voor code " + schoon + ". Controleer de code of kies een voorbeeldproduct.");
  product = gevonden;
  bevestigScherm();
}

function bevestigScherm() {
  stopScanner();
  app.innerHTML =
    "<h1>" + esc(product.naam) + "</h1>" +
    '<p class="klein">VIB-datum: ' + esc(product.vibDatum) + "</p>" +
    '<section class="blok gevaar"><h2>Gevaar</h2><p>' + esc(product.gevaar) + "</p></section>" +
    "<h2>Klopt dit product?</h2>" +
    '<button class="groot" id="ja">Ja, dit is het product</button>' +
    '<button class="knop" id="nee">Nee, opnieuw scannen</button>';
  document.getElementById("ja").onclick = () => menuScherm();
  document.getElementById("nee").onclick = () => startScherm();
  window.scrollTo(0, 0);
}

function menuScherm() {
  app.innerHTML =
    "<h1>" + esc(product.naam) + "</h1>" +
    "<h2>Wat is er aan de hand?</h2>" +
    '<button class="groot rood" data-s="gewond">Iemand is gewond of onwel</button>' +
    '<button class="groot" data-s="gemorst">Product is gemorst of gelekt</button>' +
    '<button class="groot" data-s="brand">Brand</button>' +
    '<button class="groot" data-s="afvoer">Opruimen en afvoeren</button>' +
    '<button class="knop" data-s="alles">Ik weet het niet</button>' +
    '<button class="knop licht" data-s="ander">Ander product scannen</button>';
  document.querySelectorAll("[data-s]").forEach((b) => {
    b.onclick = () => kies(b.dataset.s);
  });
  window.scrollTo(0, 0);
}

function eersteHulpBlokken(welke, voorvoegsel) {
  const h = product.eersteHulp;
  const soorten = welke === "alles" ? Object.keys(NAMEN) : [welke];
  const pre = voorvoegsel ? voorvoegsel + ": " : "";
  return [
    blok(voorvoegsel ? pre + "algemeen" : "Eerst", h.algemeen, "eerst"),
    ...soorten.map((s) => blok(pre + NAMEN[s], h[s])),
    blok("Let op", h.letOp, "let-op"),
  ];
}

function kies(s) {
  if (s === "ander") return startScherm();
  if (s === "gewond") return gewondVraag();
  if (s === "gemorst") {
    return toon("Gemorst of gelekt", [
      blok("1. Bescherm jezelf eerst", product.bescherming),
      blok("2. Aanpak bij lekkage", product.aanpak),
    ]);
  }
  if (s === "brand") return toon("Brand", [blok("Blussen en gevaren", product.brand)]);
  if (s === "afvoer") {
    return toon("Opruimen en afvoeren", [
      blok("1. Bescherm jezelf eerst", product.bescherming),
      blok("2. Afvoer", product.afvoer),
    ]);
  }
  return toon("Alles in volgorde", [
    blok("1. Bescherming", product.bescherming),
    ...eersteHulpBlokken("alles", "2. Eerste hulp"),
    blok("3. Lekkage", product.aanpak),
    blok("4. Brand", product.brand),
    blok("5. Afvoer", product.afvoer),
  ]);
}

function gewondVraag() {
  app.innerHTML =
    "<h1>Waar zit het letsel?</h1>" +
    '<button class="groot" data-w="ogen">Ogen</button>' +
    '<button class="groot" data-w="huid">Huid</button>' +
    '<button class="groot" data-w="ingeademd">Ingeademd</button>' +
    '<button class="groot" data-w="ingeslikt">Ingeslikt</button>' +
    '<button class="knop" data-w="alles">Ik weet het niet</button>' +
    '<button class="knop licht" id="terug">Terug</button>';
  document.querySelectorAll("[data-w]").forEach((b) => {
    b.onclick = () => toon("Eerste hulp", eersteHulpBlokken(b.dataset.w));
  });
  document.getElementById("terug").onclick = () => menuScherm();
  window.scrollTo(0, 0);
}

function toon(titel, blokken) {
  app.innerHTML =
    "<h1>" + esc(titel) + "</h1>" +
    '<p class="klein">' + esc(product.naam) + " · VIB-datum " + esc(product.vibDatum) + "</p>" +
    blokken.join("") +
    blok("Voor de beoordelaar (alleen in de proefversie)", product.proef, "proef") +
    '<p class="klein">' + (product.vib ? '<a href="' + esc(product.vib) + '" target="_blank" rel="noopener">Open het volledige VIB</a>' : "Het volledige VIB staat in Stocky.") + "</p>" +
    '<button class="knop" id="terug">Er is ook iets anders aan de hand</button>' +
    '<button class="knop licht" id="nieuw">Ander product scannen</button>';
  document.getElementById("terug").onclick = () => menuScherm();
  document.getElementById("nieuw").onclick = () => startScherm();
  window.scrollTo(0, 0);
}

startScherm();
