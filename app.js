const app = document.getElementById("app");
let product = null;
let scanner = null;

const NAMEN = { ogen: "Ogen", huid: "Huid", ingeademd: "Ingeademd", ingeslikt: "Ingeslikt" };
const ICONEN = { ogen: "👁️", huid: "✋", ingeademd: "💨", ingeslikt: "👄" };

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

function miniFoto(p) {
  return p.foto
    ? `<img class="mini" src="${esc(p.foto)}" alt="" onerror="this.style.display='none'">`
    : '<span class="mini leeg">📦</span>';
}

function kop(groot) {
  const klasse = groot ? " groot" : "";
  const foto = product.foto
    ? `<img class="foto${klasse}" src="${esc(product.foto)}" alt="${esc(product.naam)}" onerror="this.style.display='none'">`
    : `<div class="foto leeg${klasse}">📦</div>`;
  return `<div class="productkaart${groot ? " gestapeld" : ""}">${foto}<div><h1>${esc(product.naam)}</h1><p class="klein">VIB-datum: ${esc(product.vibDatum)}</p></div></div>`;
}

function gevaarBlok() {
  return '<section class="blok gevaar"><h2>⚠️ Gevaar</h2><p>' + esc(product.gevaar) + "</p></section>";
}

function bhvBlok() {
  if (typeof BHV_LIJST === "undefined" || !BHV_LIJST.length) return "";
  const regels = BHV_LIJST.map((p) => p.naam + (p.rol ? " (" + p.rol + ")" : "") + ": " + p.telefoon);
  return blok("BHV'ers en nummers", regels, "contact");
}

function bhvScherm() {
  app.innerHTML =
    kop() +
    "<h2 class='scherm'>BHV'ers en telefoonnummers</h2>" +
    (bhvBlok() || "<p>Nog geen BHV'ers ingevuld.</p>");
  onderbalk([{ tekst: "Terug", fn: menuScherm }]);
  window.scrollTo(0, 0);
}

function onderbalk(knoppen) {
  const nav = document.createElement("nav");
  nav.className = "onder";
  knoppen.forEach((k) => {
    const b = document.createElement("button");
    b.className = k.klasse || "knop";
    b.textContent = k.tekst;
    b.onclick = () => k.fn();
    nav.appendChild(b);
  });
  app.appendChild(nav);
}

function standaardKnoppen() {
  return [
    { tekst: "Er is ook iets anders aan de hand", fn: menuScherm },
    { tekst: "Ander product scannen", fn: startScherm, klasse: "knop licht" },
  ];
}

function startScherm(melding) {
  stopScanner();
  product = null;
  app.innerHTML =
    "<h1>Scan de barcode</h1>" +
    '<button class="situatie" id="scanknop"><span class="ic">📷</span><span>Scan met de camera</span></button>' +
    '<div id="lezer"></div>' +
    '<label for="ean">Of typ de code in, of scan met de handscanner:</label>' +
    '<div class="rij"><input id="ean" inputmode="numeric" autocomplete="off"><button id="zoek">Zoek</button></div>' +
    '<p class="melding">' + esc(melding || "") + "</p>" +
    "<h2>Proef: kies een voorbeeldproduct</h2>" +
    PRODUCTEN.map((p, i) => '<button class="kaartknop" data-i="' + i + '">' + miniFoto(p) + "<span>" + esc(p.naam) + "</span></button>").join("");

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
    kop(true) +
    gevaarBlok() +
    "<h2 class='scherm'>Klopt dit product?</h2>" +
    '<button class="situatie" id="ja"><span class="ic">✅</span><span>Ja, dit is het product</span></button>' +
    '<button class="situatie grijs" id="nee"><span class="ic">🔄</span><span>Nee, opnieuw scannen</span></button>';
  document.getElementById("ja").onclick = () => menuScherm();
  document.getElementById("nee").onclick = () => startScherm();
  window.scrollTo(0, 0);
}

function menuScherm() {
  app.innerHTML =
    kop() +
    gevaarBlok() +
    "<h2 class='scherm'>Wat is er aan de hand?</h2>" +
    '<button class="situatie rood" data-s="gewond"><span class="ic">🚑</span><span>Iemand is gewond of onwel</span></button>' +
    '<button class="situatie" data-s="gemorst"><span class="ic">💧</span><span>Product is gemorst of gelekt<br><small>met opruimen en afvoeren</small></span></button>' +
    '<button class="situatie oranje" data-s="brand"><span class="ic">🔥</span><span>Brand</span><span class="ic">🔥</span></button>' +
    '<button class="situatie grijs" data-s="alles"><span class="ic">❓</span><span>Ik weet het niet</span></button>';
  document.querySelectorAll("[data-s]").forEach((b) => {
    b.onclick = () => kies(b.dataset.s);
  });
  onderbalk([
    { tekst: "BHV'ers en telefoonnummers", fn: bhvScherm },
    { tekst: "Ander product scannen", fn: startScherm, klasse: "knop licht" },
  ]);
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
  if (s === "gewond") return gewondVraag();
  if (s === "gemorst") {
    return toon("Gemorst of gelekt", [
      blok("1. Bescherm jezelf eerst", product.bescherming),
      blok("2. Aanpak bij lekkage", product.aanpak),
      blok("3. Opruimen en afvoeren", product.afvoer),
    ]);
  }
  if (s === "brand") return toon("Brand", [blok("Blussen en gevaren", product.brand)]);
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
    kop() +
    "<h2 class='scherm'>Waar zit het letsel?</h2>" +
    Object.keys(NAMEN)
      .map((k) => '<button class="situatie rood" data-w="' + k + '"><span class="ic">' + ICONEN[k] + "</span><span>" + NAMEN[k] + "</span></button>")
      .join("") +
    '<button class="situatie grijs" data-w="alles"><span class="ic">❓</span><span>Ik weet het niet</span></button>';
  document.querySelectorAll("[data-w]").forEach((b) => {
    b.onclick = () =>
      toon("Eerste hulp", eersteHulpBlokken(b.dataset.w), [{ tekst: "Ander letsel", fn: gewondVraag }, ...standaardKnoppen()]);
  });
  onderbalk([{ tekst: "Terug", fn: menuScherm }]);
  window.scrollTo(0, 0);
}

function toon(titel, blokken, knoppen) {
  const link = product.vib
    ? '<a href="' + esc(product.vib) + '" target="_blank" rel="noopener">Open het volledige VIB</a>'
    : "Het volledige VIB staat in Stocky.";
  app.innerHTML =
    kop() +
    "<h2 class='scherm'>" + esc(titel) + "</h2>" +
    blokken.join("") +
    bhvBlok() +
    blok("Voor de beoordelaar (alleen in de proefversie)", product.proef, "proef") +
    '<p class="klein">' + link + "</p>";
  onderbalk(knoppen || standaardKnoppen());
  window.scrollTo(0, 0);
}

startScherm();
