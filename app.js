const app = document.getElementById("app");
let product = null;
let scanner = null;

// De producten en VIB-teksten komen uit vib-data.js. Dat bestand wordt elke nacht
// automatisch gemaakt uit Stocky (zie scripts/ophalen.py). Niet met de hand aanpassen.
const PRODUCTEN = typeof VIB_PRODUCTEN !== "undefined" ? VIB_PRODUCTEN : [];

const RUBRIEK_TITEL = {
  "8": "Bescherm jezelf",
  "4": "Eerste hulp",
  "6": "Aanpak bij lekkage",
  "5": "Brand",
  "13": "Afvoeren",
};

function esc(t) {
  return String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const NIETS_IN_VIB = "Het VIB zegt hier niets over. Gebruik je gezonde verstand en doe wat jou het veiligst lijkt.";
const NIET_GELEZEN = "Deze rubriek kon niet uit het VIB worden gelezen. Open het VIB (PDF) hieronder en lees rubriek ";
const TAAL = { nl: "Nederlands", en: "Engels", de: "Duits", fr: "Frans", es: "Spaans" };
// Vaste volgorde van de rubrieken, overal in de tool.
const VOLGORDE = ["8", "4", "6", "5", "13"];

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

function toonNaam(p) {
  return p.naam;
}

function zoekOpNaam(tekst) {
  const woorden = String(tekst || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!woorden.length) return [];
  return PRODUCTEN.filter((p) => {
    const naam = String(p.naam || "").toLowerCase();
    return naam && woorden.every((w) => naam.includes(w));
  });
}

function trefferKnoppen(lijst) {
  return lijst
    .map((p) => '<button class="kaartknop" data-p="' + PRODUCTEN.indexOf(p) + '">' + miniFoto(p) + "<span>" + esc(toonNaam(p)) + "</span></button>")
    .join("");
}

function koppelKnoppen() {
  document.querySelectorAll("[data-p]").forEach((b) => {
    b.onclick = () => {
      product = PRODUCTEN[Number(b.dataset.p)];
      bevestigScherm();
    };
  });
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
  return `<div class="productkaart${groot ? " gestapeld" : ""}">${foto}<div><h1>${esc(toonNaam(product))}</h1><p class="klein">VIB-datum: ${esc(product.vibDatum || "onbekend")}${product.verlopen ? " (verlopen)" : ""}${product.taal && product.taal !== "nl" ? " · taal: " + esc(TAAL[product.taal] || product.taal) : ""}</p></div></div>`;
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
    bhvBlok() +
    "<h1>Scan de barcode</h1>" +
    '<button class="situatie" id="scanknop"><span class="ic">📷</span><span>Scan met de camera</span></button>' +
    '<button class="situatie grijs" id="fotoknop"><span class="ic">📸</span><span>Lukt scannen niet? Maak een foto van de barcode</span></button>' +
    '<input id="foto" type="file" accept="image/*" capture="environment" hidden>' +
    '<div id="lezer"></div>' +
    '<label for="ean">Of zoek op barcode of op de naam zoals in Stocky:</label>' +
    '<div class="rij"><input id="ean" type="search" enterkeyhint="search" autocomplete="off" placeholder="Barcode of naam"><button id="zoek">Zoek</button></div>' +
    '<p class="melding">' + esc(melding || "") + "</p>" +
    '<div id="treffers"></div>' +
    '<p class="klein">' + (PRODUCTEN.length ? PRODUCTEN.length + " producten met een VIB." : "Er zijn nog geen VIB's opgehaald uit Stocky.") + "</p>";

  document.getElementById("scanknop").onclick = startCamera;
  document.getElementById("fotoknop").onclick = () => {
    stopScanner();
    document.getElementById("foto").click();
  };
  document.getElementById("foto").onchange = (e) => leesFoto(e.target.files[0]);
  document.getElementById("zoek").onclick = () => zoek(document.getElementById("ean").value);
  document.getElementById("ean").onkeydown = (e) => {
    if (e.key === "Enter") zoek(e.target.value);
  };
  document.getElementById("ean").oninput = (e) => {
    const t = e.target.value.trim();
    const vak = document.getElementById("treffers");
    if (/^\d*$/.test(t) || t.length < 2) {
      vak.innerHTML = "";
      return;
    }
    const lijst = zoekOpNaam(t);
    vak.innerHTML = lijst.length ? trefferKnoppen(lijst) : '<p class="klein">Nog geen artikel gevonden.</p>';
    koppelKnoppen();
  };
  koppelKnoppen();
}

let camNummer = -1;

// De barcodelezer vindt een code soms alleen als die een bepaalde grootte in pixels heeft.
// Daarom proberen we het hele beeld en uitsneden van het midden, op verschillende formaten.
const UITSNEDEN = [
  [1, 1280], [0.6, 1000], [0.4, 800], [1, 1920], [0.6, 1600], [0.3, 600], [1, 960], [0.4, 1200], [0.8, 1400],
  [0.3, 1200], [0.2, 1000],
];
const doek = document.createElement("canvas");
const pen = doek.getContext("2d", { willReadFrequently: true });

function uitsnede(bron, w, h, deel, breedte) {
  const sw = Math.round(w * deel), sh = Math.round(h * deel);
  const schaal = Math.min(breedte / sw, 3);
  doek.width = Math.max(1, Math.round(sw * schaal));
  doek.height = Math.max(1, Math.round(sh * schaal));
  pen.drawImage(bron, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, doek.width, doek.height);
  return doek;
}

async function leesCode(detector, bron, w, h, welke) {
  const [deel, breedte] = UITSNEDEN[welke % UITSNEDEN.length];
  const codes = await detector.detect(uitsnede(bron, w, h, deel, breedte));
  return codes.length ? codes[0].rawValue : null;
}

async function startCamera() {
  if (!("BarcodeDetector" in window)) return startCameraOud();
  stopScanner();
  const lezer = document.getElementById("lezer");
  let formaten = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "itf"];
  try {
    const kan = await BarcodeDetector.getSupportedFormats();
    formaten = formaten.filter((f) => kan.includes(f));
  } catch (e) {}
  if (!formaten.length) return startCameraOud();
  const detector = new BarcodeDetector({ formats: formaten });

  lezer.innerHTML =
    '<p class="melding">Houd de barcode in beeld, op 15 tot 20 cm afstand. Wacht even tot het beeld scherp is.</p>' +
    '<video playsinline muted autoplay style="width:100%;border-radius:12px"></video>' +
    '<div class="rij"><button id="wissel">🔄 Andere camera</button><button id="lamp" hidden>🔦 Lamp</button></div>' +
    '<p class="klein" id="scaninfo">Camera starten...</p>';
  const video = lezer.querySelector("video");
  const info = document.getElementById("scaninfo");

  let stroom = null;
  let actief = true;
  let tijd = null;
  scanner = {
    stop() {
      actief = false;
      clearTimeout(tijd);
      if (stroom) stroom.getTracks().forEach((t) => t.stop());
      return Promise.resolve();
    },
  };
  const dezeScanner = scanner;

  const video_eisen = { width: { ideal: 1920 }, height: { ideal: 1080 } };
  try {
    let cams = [];
    if (camNummer >= 0) {
      cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      video_eisen.deviceId = { exact: cams[camNummer % cams.length].deviceId };
    } else {
      video_eisen.facingMode = "environment";
    }
    stroom = await navigator.mediaDevices.getUserMedia({ video: video_eisen, audio: false });
  } catch (e) {
    return startScherm("Geen toegang tot de camera. Geef de browser toestemming of typ de code in.");
  }
  if (!actief || scanner !== dezeScanner) {
    stroom.getTracks().forEach((t) => t.stop());
    return;
  }
  video.srcObject = stroom;
  try { await video.play(); } catch (e) {}

  const spoor = stroom.getVideoTracks()[0];
  try {
    const mog = spoor.getCapabilities ? spoor.getCapabilities() : {};
    const extra = {};
    if (mog.focusMode && mog.focusMode.includes("continuous")) extra.focusMode = "continuous";
    if (mog.zoom && mog.zoom.max >= 1.5) extra.zoom = Math.min(1.5, mog.zoom.max);
    if (Object.keys(extra).length) await spoor.applyConstraints({ advanced: [extra] });
    if (mog.torch) {
      const lamp = document.getElementById("lamp");
      let aan = false;
      lamp.hidden = false;
      lamp.onclick = async () => {
        aan = !aan;
        try { await spoor.applyConstraints({ advanced: [{ torch: aan }] }); } catch (e) {}
      };
    }
  } catch (e) {}

  document.getElementById("wissel").onclick = async () => {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    const huidig = cams.findIndex((d) => d.deviceId === spoor.getSettings().deviceId);
    camNummer = (huidig + 1) % cams.length;
    startCamera();
  };

  let pogingen = 0;
  const kijk = async () => {
    if (!actief) return;
    pogingen++;
    try {
      if (video.readyState >= 2) {
        const code = await leesCode(detector, video, video.videoWidth, video.videoHeight, pogingen);
        if (actief && code) {
          stopScanner();
          zoek(code);
          return;
        }
      }
    } catch (e) {}
    const s = spoor.getSettings();
    info.textContent = pogingen > 60
      ? "Lukt het niet? Houd de barcode recht en dichterbij, zet de lamp aan, of typ de cijfers onder de barcode in."
      : "Zoeken naar de barcode...";
    tijd = setTimeout(kijk, 150);
  };
  kijk();
}

// Een foto met de gewone camera-app is scherper (die stelt zelf scherp) en heeft een
// hogere resolutie dan het videobeeld. De foto wordt op verschillende formaten gelezen.
async function leesFoto(bestand) {
  if (!bestand) return;
  const melding = document.querySelector(".melding");
  melding.textContent = "Foto wordt gelezen...";
  try {
    if (!("BarcodeDetector" in window)) throw new Error("geen lezer");
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "itf"] });
    const beeld = await createImageBitmap(bestand);
    for (let i = 0; i < UITSNEDEN.length; i++) {
      const code = await leesCode(detector, beeld, beeld.width, beeld.height, i);
      if (code) return zoek(code);
    }
    melding.textContent =
      "Geen barcode gevonden op de foto. Maak de foto van dichtbij, recht van voren en scherp, of typ de cijfers onder de barcode in.";
  } catch (e) {
    melding.textContent = "De foto kon niet worden gelezen. Typ de cijfers onder de barcode in.";
  }
}

function startCameraOud() {
  if (typeof Html5Qrcode === "undefined") {
    startScherm("De camera-scanner kon niet laden. Typ de barcode of de naam in.");
    return;
  }
  stopScanner();
  document.getElementById("lezer").insertAdjacentHTML(
    "beforebegin",
    '<p class="melding" id="scanhulp">Houd de barcode dwars in het kader, op 15 tot 20 cm afstand. Wacht even tot het beeld scherp is.</p>'
  );
  let klaar = false;
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
    .start(
      { facingMode: "environment" },
      {
        fps: 15,
        qrbox: (b, h) => ({ width: Math.floor(b * 0.9), height: Math.floor(Math.min(h * 0.5, b * 0.45)) }),
        videoConstraints: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: "continuous" }],
        },
      },
      (tekst) => {
        if (klaar) return;
        klaar = true;
        zoek(tekst);
      },
      () => {}
    )
    .catch(() => startScherm("Geen toegang tot de camera. Geef de browser toestemming of typ de code in."));
}

function zoek(code) {
  const invoer = String(code || "").trim();
  if (!invoer) return startScherm("Vul eerst een barcode of naam in.");
  if (/[a-zA-Z]/.test(invoer)) {
    const lijst = zoekOpNaam(invoer);
    if (lijst.length === 1) {
      product = lijst[0];
      return bevestigScherm();
    }
    startScherm(
      lijst.length
        ? ""
        : "Geen artikel gevonden met de naam \"" + invoer + "\". Controleer de naam zoals die in Stocky staat. " +
            "Vind je het niet: stop, en win informatie in bij een collega-leidinggevende."
    );
    document.getElementById("ean").value = invoer;
    document.getElementById("treffers").innerHTML = trefferKnoppen(lijst);
    koppelKnoppen();
    return;
  }
  const schoon = invoer.replace(/\D/g, "");
  const kern = schoon.replace(/^0+/, "");
  const gevonden = kern && PRODUCTEN.find((p) => (p.ean || []).some((e) => String(e).replace(/\D/g, "").replace(/^0+/, "") === kern));
  if (!gevonden)
    return startScherm(
      "Geen VIB gevonden voor code " + schoon + ". Controleer de code, of zoek op de naam zoals in Stocky. " +
        "Vind je het niet: stop, en win informatie in bij een collega-leidinggevende."
    );
  product = gevonden;
  bevestigScherm();
}

function vibKnoppen() {
  if (!heeftVib(product)) return "";
  const bestand = (product.naam || "vib").replace(/[^\w\-]+/g, "_").slice(0, 60) + ".pdf";
  return (
    '<div class="vibknoppen">' +
    '<a class="knoplink" href="' + esc(product.vibPdf) + '" target="_blank" rel="noopener">📄 VIB lezen</a>' +
    '<a class="knoplink licht" href="' + esc(product.vibPdf) + '" download="' + esc(bestand) + '">⬇️ VIB downloaden</a>' +
    "</div>" +
    andereVibs()
  );
}

function andereVibs() {
  const alle = product.alleVibs || [];
  if (alle.length < 2) return "";
  const regels = alle
    .map((v, i) => {
      const info = [v.datum || "datum onbekend", v.verlopen ? "verlopen" : "", v.taal ? TAAL[v.taal] || v.taal : ""].filter(Boolean).join(", ");
      return '<li><a href="' + esc(v.pdf) + '" target="_blank" rel="noopener">VIB ' + (i + 1) + "</a> (" + esc(info) + ')' +
        ' · <a href="' + esc(v.pdf) + '" download>download</a>' + (i === 0 ? " · <i>wordt hierboven getoond</i>" : "") + "</li>";
    })
    .join("");
  return '<details class="alle"><summary>Alle ' + alle.length + " VIB's van dit product</summary><ul>" + regels + "</ul></details>";
}

function heeftVib(p) {
  return Boolean(p && p.vibPdf);
}

const GEEN_VIB =
  "<p><b>Stop.</b> Ga niet verder met dit product.</p>" +
  "<p><b>Win informatie in bij een collega-leidinggevende.</b></p>";

function geenVibScherm() {
  app.innerHTML =
    kop() +
    '<section class="blok gevaar"><h2>⚠️ Er is geen VIB beschikbaar voor dit product</h2>' + GEEN_VIB + "</section>";
  onderbalk([
    { tekst: "BHV'ers en telefoonnummers", fn: bhvScherm },
    { tekst: "Ander product scannen", fn: startScherm, klasse: "knop licht" },
  ]);
  window.scrollTo(0, 0);
}

function bevestigScherm() {
  stopScanner();
  app.innerHTML =
    kop(true) +
    "<h2 class='scherm'>Klopt dit product?</h2>" +
    '<button class="situatie" id="ja"><span class="ic">✅</span><span>Ja, dit is het product</span></button>' +
    '<button class="situatie grijs" id="nee"><span class="ic">🔄</span><span>Nee, opnieuw zoeken</span></button>' +
    vibKnoppen();
  document.getElementById("ja").onclick = () => (heeftVib(product) ? menuScherm() : geenVibScherm());
  document.getElementById("nee").onclick = () => startScherm();
  window.scrollTo(0, 0);
}

function menuScherm() {
  app.innerHTML =
    kop() +
    "<h2 class='scherm'>Wat is er aan de hand?</h2>" +
    '<button class="situatie midden rood" data-s="gewond"><span class="ic">🚑</span><span>Iemand is gewond of onwel</span><span class="ic">🚑</span></button>' +
    '<button class="situatie midden" data-s="gemorst"><span class="ic">💧</span><span>Product is gemorst of gelekt<br><small>met opruimen en afvoeren</small></span><span class="ic">💧</span></button>' +
    '<button class="situatie midden oranje" data-s="brand"><span class="ic">🔥</span><span>Brand</span><span class="ic">🔥</span></button>' +
    '<button class="situatie midden grijs" data-s="alles"><span class="ic">❓</span><span>Ik weet het niet</span><span class="ic">❓</span></button>';
  document.querySelectorAll("[data-s]").forEach((b) => {
    b.onclick = () => kies(b.dataset.s);
  });
  app.insertAdjacentHTML("beforeend", vibKnoppen());
  onderbalk([
    { tekst: "BHV'ers en telefoonnummers", fn: bhvScherm },
    { tekst: "Ander product scannen", fn: startScherm, klasse: "knop licht" },
  ]);
  window.scrollTo(0, 0);
}

function vibInhoud(blokken) {
  return blokken
    .map((b) => {
      if (b.soort === "kop") return '<h3 class="vibkop">' + esc(b.tekst) + "</h3>";
      if (b.soort === "veld")
        return "<p><b>" + esc(b.kopje) + ":</b> " + (b.tekst ? esc(b.tekst) : "<i>" + esc(NIETS_IN_VIB) + "</i>") + "</p>";
      if (b.soort === "tabel")
        return (
          '<table class="vibtabel">' +
          b.rijen.map((r, i) => "<tr>" + r.map((c) => (i === 0 ? "<th>" : "<td>") + esc(c) + (i === 0 ? "</th>" : "</td>")).join("") + "</tr>").join("") +
          "</table>"
        );
      const t = b.tekst || "";
      const tussenkop = t.length < 70 && !/[.)]$/.test(t) && /^[A-ZÀ-Ý]/.test(t) && t.toLowerCase() !== "geen";
      return tussenkop ? '<p class="tussen">' + esc(t) + "</p>" : "<p>" + esc(t) + "</p>";
    })
    .join("");
}

// ---- Kort en krachtig: per rubriek direct alleen het onderdeel waarmee je actie neemt. ----
// De tekst blijft letterlijk uit het VIB. De rest staat met één tik open onder "Meer uit het VIB".

const KERN = { "8": "8.2", "4": "4.1", "6": "6.3", "5": "5.1", "13": "13.1" };
const BESCHERMING = /(oog|ogen|gelaat|gezicht|eye|face|yeux|augen|hand|main|huid|skin|peau|haut|lichaam|body|corps|körper|adem|inhal|respir|atem|kleding|cloth|vêtement)/i;
const ROUTES = {
  ogen: { tekst: "In de ogen", ic: "👁️", re: /(oog|ogen|eye|yeux|œil|oeil|auge)/i },
  huid: { tekst: "Op de huid", ic: "✋", re: /(huid|skin|peau|haut)/i },
  adem: { tekst: "Ingeademd", ic: "😮‍💨", re: /(inadem|ingeademd|inhal|adem|breath|einatm)/i },
  mond: { tekst: "Ingeslikt", ic: "👄", re: /(inslik|ingeslikt|mond|swallow|ingest|oral|avaler|verschluck)/i },
};
const ALGEMEEN = /^(algeme|general|ehbo algemeen|eerste.?hulp)/i;

function isTussenkop(t) {
  return t.length < 70 && !/[.)]$/.test(t) && /^[A-ZÀ-Ý]/.test(t) && t.toLowerCase() !== "geen";
}

// Deelt een rubriek op in onderdelen (4.1, 4.2, ...). Blokken vóór het eerste kopje horen bij "".
function onderdelen(blokken) {
  const uit = [{ nr: "", blokken: [] }];
  for (const b of blokken || []) {
    const m = b.soort === "kop" && b.tekst.match(/^(\d+\.\d+)/);
    if (m && m[1] !== uit[uit.length - 1].nr) uit.push({ nr: m[1], blokken: [] });
    uit[uit.length - 1].blokken.push(b);
  }
  return uit.filter((o) => o.blokken.length);
}

// Groepeert blokken tot items met een kopje (bijvoorbeeld "Huidcontact" + de tekst die erbij hoort).
function items(blokken) {
  const uit = [];
  let open = null;
  for (const b of blokken) {
    if (b.soort === "kop") { open = null; continue; }
    if (b.soort === "veld") { uit.push({ kopje: b.kopje, blokken: [b] }); open = null; continue; }
    if (b.soort === "alinea" && isTussenkop(b.tekst || "")) { open = { kopje: b.tekst, blokken: [b] }; uit.push(open); continue; }
    if (open) open.blokken.push(b);
    else uit.push({ kopje: "", blokken: [b] });
  }
  return uit;
}

// Waar gaat een item over: het kopje, of anders het begin van de tekst ("Inademing. De patiënt...").
function label(i) {
  return i.kopje || String((i.blokken[0] && i.blokken[0].tekst) || "").slice(0, 40);
}

function lengte(blokken) {
  return JSON.stringify(blokken).length;
}

// Geeft [direct tonen, meer] voor een rubriek.
function splits(nr, route) {
  const delen = onderdelen((product.rubrieken || {})[nr]);
  const kern = delen.find((o) => o.nr === KERN[nr]);
  if (!kern) return [delen.flatMap((o) => o.blokken), []]; // geen herkenbare indeling: alles tonen
  const rest = delen.filter((o) => o !== kern).flatMap((o) => o.blokken);
  let toon = kern.blokken;
  let weg = [];
  const lijst = items(kern.blokken);
  let keuze = null;
  if (nr === "8") keuze = lijst.filter((i) => BESCHERMING.test(label(i)));
  if (nr === "4" && route && ROUTES[route]) {
    keuze = lijst.filter((i) => ROUTES[route].re.test(label(i)) || (ALGEMEEN.test(label(i)) && lengte(i.blokken) < 400));
    if (!keuze.some((i) => ROUTES[route].re.test(label(i)))) keuze = null; // route niet te vinden: heel 4.1 tonen
  }
  if (keuze && keuze.length) {
    const gekozen = new Set(keuze.flatMap((i) => i.blokken));
    toon = kern.blokken.filter((b) => b.soort === "kop" || gekozen.has(b));
    weg = kern.blokken.filter((b) => b.soort !== "kop" && !gekozen.has(b));
  }
  return [toon, weg.concat(rest)];
}

function rubriekBlok(nr, stap, route) {
  const r = product.rubrieken || {};
  const naam = nr === "8" ? "8.2" : nr;
  const titel = (stap ? stap + ". " : "") + RUBRIEK_TITEL[nr] + " (rubriek " + naam + ")";
  let inhoud;
  if (!r[nr] || !r[nr].length) {
    inhoud = nr in r ? "<p>" + esc(NIETS_IN_VIB) + "</p>" : "<p><i>" + esc(NIET_GELEZEN + naam + ".") + "</i></p>";
  } else {
    const [direct, meer] = splits(nr, route);
    inhoud = vibInhoud(direct) +
      (meer.length ? '<details class="meer"><summary>Meer uit rubriek ' + esc(naam) + "</summary>" + vibInhoud(meer) + "</details>" : "");
  }
  return '<section class="blok' + (nr === "4" ? " eerst" : "") + '"><h2>' + esc(titel) + "</h2>" + inhoud + "</section>";
}

function routeScherm() {
  app.innerHTML =
    kop() +
    "<h2 class='scherm'>Waar kwam het product?</h2>" +
    Object.entries(ROUTES)
      .map(([k, v]) => '<button class="situatie rood" data-route="' + k + '"><span class="ic">' + v.ic + "</span><span>" + esc(v.tekst) + "</span></button>")
      .join("") +
    '<button class="situatie grijs" data-route=""><span class="ic">❓</span><span>Weet ik niet / meerdere</span></button>';
  document.querySelectorAll("[data-route]").forEach((b) => (b.onclick = () => kies("gewond", b.dataset.route || null)));
  onderbalk([{ tekst: "Terug", fn: menuScherm, klasse: "knop licht" }]);
  window.scrollTo(0, 0);
}

function uitleesmelding() {
  const r = product.rubrieken || {};
  if (!VOLGORDE.some((nr) => r[nr] && r[nr].length))
    return '<section class="blok let-op"><h2>De tekst van dit VIB kon niet worden uitgelezen</h2>' +
      "<p>Open het VIB (PDF) hieronder en lees de rubrieken " + VOLGORDE.join(", ").replace("8", "8.2") + ", in die volgorde.</p></section>";
  return "";
}

function kies(s, route) {
  const keuzes = {
    gewond: ["Iemand is gewond of onwel", ["4"]],
    gemorst: ["Gemorst of gelekt", ["8", "6", "13"]],
    brand: ["Brand", ["5"]],
    alles: ["Alles in volgorde", ["8", "4", "6", "5", "13"]],
  };
  const [titel, gekozen] = keuzes[s] || keuzes.alles;
  if (!heeftVib(product)) return geenVibScherm();
  if (s === "gewond" && route === undefined) return routeScherm();
  const nummers = VOLGORDE.filter((nr) => gekozen.includes(nr)); // altijd in de vaste volgorde
  const sub = route && ROUTES[route] ? titel + ": " + ROUTES[route].tekst.toLowerCase() : titel;
  toon(sub, [uitleesmelding()].concat(nummers.map((nr, i) => rubriekBlok(nr, nummers.length > 1 ? i + 1 : 0, route))));
}

function toon(titel, blokken, knoppen) {
  const voet = heeftVib(product) ? "De tekst hierboven komt letterlijk uit het VIB." : "";
  app.innerHTML =
    kop() +
    "<h2 class='scherm'>" + esc(titel) + "</h2>" +
    blokken.join("") +
    (voet ? '<p class="klein">' + voet + "</p>" : "") +
    vibKnoppen() +
    bhvBlok();
  onderbalk(knoppen || standaardKnoppen());
  window.scrollTo(0, 0);
}

startScherm();
