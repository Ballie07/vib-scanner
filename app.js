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
  return `<div class="productkaart${groot ? " gestapeld" : ""}">${foto}<div><h1>${esc(toonNaam(product))}</h1>${product.taal && product.taal !== "nl" ? '<p class="klein">Taal van het VIB: ' + esc(TAAL[product.taal] || product.taal) + "</p>" : ""}</div></div>`;
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

// ---- Hulpfuncties om de VIB-tekst in onderdelen en items op te delen. ----

const ROUTES = {
  ogen: { tekst: "In de ogen", ic: "👁️", re: /(oog|ogen|eye|yeux|œil|oeil|auge)/i },
  huid: { tekst: "Op de huid", ic: "✋", re: /(huid|skin|peau|haut)/i },
  adem: { tekst: "Ingeademd", ic: "😮‍💨", re: /(inadem|ingeademd|inhal|adem|breath|einatm)/i },
  mond: { tekst: "Ingeslikt", ic: "👄", re: /(inslik|ingeslikt|mond|swallow|ingest|oral|avaler|verschluck)/i },
};

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
    // "Bescherming van het lichaam Beschermende kleding ..." begint een eigen onderwerp, ook als het geen los kopje is.
    const eigen = b.soort === "alinea" && (b.tekst || "").match(/^((bescherming van (de |het )?[\wÀ-ÿ/ ]{3,25}?|[\wÀ-ÿ-]*bescherming|(skin|eye|hand|body|respiratory) protection)\b)/i);
    if (eigen) { uit.push({ kopje: eigen[1], blokken: [b] }); open = null; continue; } // neemt de volgende alinea niet mee
    if (open) open.blokken.push(b);
    else uit.push({ kopje: "", blokken: [b] });
  }
  return uit;
}

// Waar gaat een item over: het kopje, of anders het begin van de tekst ("Inademing. De patiënt...").
function label(i) {
  return i.kopje || String((i.blokken[0] && i.blokken[0].tekst) || "").slice(0, 40);
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

// ---- Stapsgewijs: alleen de letterlijke doe-zinnen uit het VIB. ----
// Uitleg, normen, doorbraaktijden, verwijzingen en regelgeving vallen weg.
// Vindt de tool in een onderdeel geen enkele doe-zin, dan toont hij dat onderdeel letterlijk,
// zodat er nooit iets ongemerkt verdwijnt. De volledige tekst staat altijd onder "Volledige VIB-tekst".

const DOE = new RegExp(
  "\\b(" +
    // Nederlands
    "gebruik\\w*|draag|dragen|\\w*spoel\\w*|was|wassen|\\w*wassen|verwijder\\w*|trek|uittrekken|uitdoen|verzamel\\w*|opnemen|opzuigen|opvegen|" +
    "absorbe\\w*|indammen|afdekken|ventile\\w*|zorg|zorgen|houd|houden|breng\\w*|vervoer\\w*|raadpleeg|raadplegen|inwinnen|" +
    "bel|bellen|laat|laten|vermijd\\w*|blus\\w*|koel\\w*|plaats\\w*|verplaats\\w*|reinig\\w*|afvoeren|voer|ontdoen|dient|" +
    "dienen|moet|moeten|verboden|nooit|toedienen|opwekken|hanteren|zitten|liggen|afsluiten|neutralise\\w*|verdunnen|" +
    "lopen|aanraken|inademen|toegelaten|toegestaan|allowed|permitted|" +
    "waarschuw\\w*|alarmeer\\w*|inschakelen|tonen|toon|drinken|drink|uitdoen|afdekken|afzetten|wegnemen|" +
    "inroepen|roep|opzoeken|zoek|raadpleeg\\w*|consulteren|consulteer|verlaten|verlaat|" +
    // Engels
    "use|wear|rinse|wash|remove|take|move|call|get|seek|keep|avoid|never|collect|absorb|sweep|contain|dispose|blot|flush|" +
    "contact (a|the|your)|obtain|induce|" +
    "ventilate|flush|place|transfer|clean|prevent|evacuate|ensure|must|should|do not|don't|" +
    // Duits / Frans
    "tragen|spülen|entfernen|verwenden|aufnehmen|vermeiden|bringen|utiliser|porter|rincer|enlever|éviter|ne pas|absorber|recueillir|appeler" +
    ")\\b",
  "i"
);
const GEEN_DOE =
  /(zie rubriek|zie punt|see section|siehe abschnitt|voir (la )?section|rubriek \d|rubrieken \d|section \d|doorbraaktijd|breakthrough|\bdikte|thickness|\bafhankelijk|hangt af|\bdepend|\boverleg|fabrikant|manufacturer|reglement|regulation|wetgeving|legislation|richtlijn|voorschrift|blootstellingslimiet|exposure limit|beschermingsniveau|geschiktheid|suitab|zie ook|(meer|verdere|aanvullende|more|further|additional|weitere) (informatie|information|gegevens|informationen)|deze rubriek|this section)/i;
const NORM = /\s*\((?:EN|NEN|ISO|DIN|NF)\b[^)]*\)/g;

function zinnen(tekst) {
  return String(tekst || "")
    .replace(NORM, "")
    .split(/(?<=[.!;])\s+(?=[A-ZÀ-Ý(•\-])|,\s*(?=(?:en )?(?:dan|daarna|vervolgens|eerst|then|afterwards)\b)|\s+[•·]\s+|\s*\n\s*/)
    .map((z) => z.replace(/^[•·\-\s]+/, "").trim())
    .filter(Boolean)
    .map((z) => z.charAt(0).toUpperCase() + z.slice(1));
}

// "Niet vereist", "niet nodig": geen opdracht, maar wel wat je moet weten.
const NIET_NODIG = /\b(niet|geen)\b[^.]{0,40}\b(vereist|nodig|noodzakelijk|verplicht)\b|not (required|necessary|needed)/i;

function doeZinnen(tekst) {
  return zinnen(tekst).filter(
    (z) =>
      z.length > 6 &&
      (DOE.test(z) || /^(niet|geen|nooit|do not|never|no)\b/i.test(z) || NIET_NODIG.test(z)) &&
      !GEEN_DOE.test(z)
  );
}

function blokTekst(b) {
  if (b.soort === "tabel") return b.rijen.map((r) => r.join(" ")).join(". ");
  return b.tekst || "";
}

// Onderdeel (bijv. "6.3") van een rubriek, als blokken zonder de kop.
// Heeft de rubriek helemaal geen genummerde onderdelen (oudere VIB's: "4. Eerste hulp" met direct
// "Inademing: ..."), dan geldt de hele rubriek als het belangrijkste onderdeel (4.1, 5.1, 8.2, 13.1).
const HOOFDONDERDEEL = { "4": "4.1", "5": "5.1", "8": "8.2", "13": "13.1" };

function onderdeel(nr, sub) {
  const delen = onderdelen((product.rubrieken || {})[nr]);
  const o = delen.find((x) => x.nr === sub);
  if (o) return o.blokken.filter((b) => b.soort !== "kop");
  const genummerd = delen.some((x) => x.nr && x.nr.startsWith(nr + "."));
  if (!genummerd && HOOFDONDERDEEL[nr] === sub && delen.length) return delen.flatMap((x) => x.blokken).filter((b) => b.soort !== "kop");
  return [];
}

function lijst(zinnenLijst) {
  return "<ul class='doe'>" + zinnenLijst.map((z) => "<li>" + esc(z) + "</li>").join("") + "</ul>";
}

// Doe-zinnen uit een reeks blokken; zonder doe-zinnen de letterlijke tekst.
function doeUit(blokken) {
  const z = blokken.flatMap((b) => doeZinnen(blokTekst(b)));
  if (z.length) return lijst(z);
  const tekst = blokken.map(blokTekst).filter((t) => t && t.toLowerCase() !== "geen").join(" ");
  return tekst ? "<p>" + esc(tekst) + "</p>" : "";
}

function stap(nummer, titel, inhoud, klasse) {
  return '<section class="stap ' + (klasse || "") + '"><h2><span class="nr">' + nummer + "</span>" + esc(titel) + "</h2>" + inhoud + "</section>";
}

// --- Bescherm jezelf (rubriek 8.2) ---
// Regels zonder inhoud: een los kopje, een paragraafnummer of alleen een norm.
const LOS_KOPJE = new RegExp(
  "^(" +
    [
      "(\\d+\\.)+\\d*\\.?", // paragraafnummer
      "bescherming van (de |het )?[\\wÀ-ÿ-]+(\\/(de |het )?[\\wÀ-ÿ-]+)?( en (de |het )?[\\wÀ-ÿ-]+)?", // "Bescherming van de ogen/het gezicht"
      "[\\wÀ-ÿ-]*bescherming", // "Oogbescherming"
      "(huid|hand|oog|lichaams?)[\\wÀ-ÿ-]*( en [\\wÀ-ÿ-]+)? ?bescherming", // "Huid en lichaam bescherming"
      "persoonlijke beschermingsmiddelen",
      "individuele beschermingsmaatregelen.*",
      "symbo\\(o\\)l\\(en\\).*",
      "pictogram.*",
      "norm",
      "(en|en iso|nf en|nen|din)\\s*\\d[\\d\\s,./:-]*", // alleen een normnummer
      "(skin|eye|hand|body) protection",
    ].join("|") +
    ")[\\s:.]*$",
  "i"
);
const PBM = [
  { ic: "🧤", re: /(handschoen|glove|gant|handschuh|\bhand)/i },
  { ic: "🥽", re: /(oog|ogen|bril|eye|gelaat|gezicht|face|yeux|augen)/i },
  { ic: "😷", re: /(adem|inhal|respir|masker|breath|atem)/i, masker: true },
  { ic: "🦺", re: /(huid|skin|lichaam|body|kleding|cloth|overige|peau|haut|körper|vêtement)/i },
];

// Masker: nodig of niet? Afgeleid uit de zinnen over ademhaling in 8.2 (die zinnen worden er letterlijk bij getoond).
// Uitgangspunt: nooit onterecht "niet nodig". Bij twijfel de veilige kant.
const ADEM = /(adem|inhal|respir|masker|mask|breath|atem|filter|ffp|abek)/i;
const MASKER =
  /(masker|mask|adembescherming|ademhalingsbescherming|ademhalingstoestel|ademhalingsbeschuttings|beschermingsmiddel|bescherming|respirator|respiratory|breathing apparatus|protection|filter|ffp|abek|atemschutz|appareil respiratoire)/i;
const NEGATIEF =
  /(niet nodig|niet vereist|niet noodzakelijk|niet verplicht|\bgeen\b[^.]{0,50}\b(vereist|nodig|noodzakelijk)|not (required|necessary|needed)|\bno\b[^.]{0,50}(necessary|required|needed)|n'est pas nécessaire|pas nécessaire|non nécessaire|nicht erforderlich|nicht notwendig)/i;
const VOORWAARDE =
  /\b(in geval van|bij|indien|wanneer|zolang|als|in case of|if|when|where|en cas de|bei|falls)\s+(?!voorkeur|nodig|necessary|needed|nécessaire)/i;
const ALS_NODIG = /(indien nodig|zo nodig|if necessary|if needed|si nécessaire|falls erforderlich|eventueel)/i;

function zonderLabel(z) {
  return z.replace(/^[^:]{0,60}:\s*/, "");
}

function voorwaarde(zin) {
  const m = zin.match(new RegExp(VOORWAARDE.source + "([^.;:(]+)", "i"));
  if (!m) return "";
  let t = (m[1] + " " + m[2]).replace(/,.*$/, "").replace(/\s(een|geschikt\w*|gebruik\w*|draag|dragen|moet|wear|use|must|type)\b.*$/i, "").trim();
  if (t.split(/\s+/).length < 2) return "";
  if (t.length > 70) t = t.slice(0, 67).replace(/\s+\S*$/, "") + "…";
  return t.charAt(0).toLowerCase() + t.slice(1);
}

const GEEN_INFO_MASKER = "bij twijfel altijd gebruiken";

function maskerOordeel(zinnenLijst) {
  // Gecontroleerd door Toppy (nov 2026): zegt het VIB niets over ademhaling, dan bij twijfel altijd gebruiken.
  if (!zinnenLijst.length) return GEEN_INFO_MASKER;
  const neg = zinnenLijst.filter((z) => NEGATIEF.test(z));
  // Een "draag/gebruik een masker"-zin: een doe-werkwoord én een masker in de zin zelf (niet alleen in het kopje).
  const pos = zinnenLijst.filter((z) => !NEGATIEF.test(z) && MASKER.test(zonderLabel(z)) && DOE.test(zonderLabel(z)));
  const posMet = pos.filter((z) => voorwaarde(z) || ALS_NODIG.test(z));
  const posZonder = pos.filter((z) => !posMet.includes(z));
  const vw = (z) => voorwaarde(z) || "indien nodig";
  if (posZonder.length) return "nodig";
  if (posMet.length) return (neg.length ? "niet nodig, behalve " : "nodig ") + vw(posMet[0]);
  if (neg.length) return "niet nodig" + (voorwaarde(neg[0]) ? " " + voorwaarde(neg[0]) : "");
  return "bij twijfel dragen";
}

// Alleen door Toppy goedgekeurde oordelen worden getoond (masker-gecontroleerd.js).
// Al het andere, ook een nieuw of gewijzigd VIB, wordt "bij twijfel altijd gebruiken".
const GOEDGEKEURD = typeof MASKER_GECONTROLEERD !== "undefined" ? MASKER_GECONTROLEERD : {};

// Sleutel voor een goedgekeurd oordeel: alleen letters en cijfers, zodat spaties, leestekens en
// hoe de lezer de tekst opknipt geen verschil maken.
function tekstSleutel(t) {
  return String(t || "").toLowerCase().replace(/[^0-9a-zà-ÿ]+/g, "");
}

function maskerSleutel(ademZinnen) {
  return tekstSleutel(ademZinnen.join(" "));
}

function gecontroleerdOordeel(ademZinnen) {
  const sleutel = maskerSleutel(ademZinnen);
  return (sleutel && GOEDGEKEURD[sleutel]) || GEEN_INFO_MASKER;
}

function ademZinnenVan(blokken) {
  return blokken
    .flatMap((b) => (b.soort === "veld" ? zinnen(b.kopje + ": " + b.tekst) : zinnen(blokTekst(b))))
    .filter((z) => ADEM.test(z) && !GEEN_DOE.test(z) && !/(milieu|environment|hand|glove|handschoen|oog|eye)/i.test(z.slice(0, 25)));
}

// Voor een nieuwe controleronde: de VIB's met tekst over ademhaling die nog niet zijn goedgekeurd,
// met het voorstel van de tool. Aan te roepen in de browserconsole: maskerTeControleren()
function maskerTeControleren() {
  const groep = new Map();
  const bewaar = product;
  for (const p of PRODUCTEN.filter((x) => x.vibPdf)) {
    product = p;
    const adem = ademZinnenVan(onderdeel("8", "8.2"));
    const sleutel = maskerSleutel(adem);
    if (!sleutel || GOEDGEKEURD[sleutel]) continue;
    if (!groep.has(sleutel)) groep.set(sleutel, { voorstel: maskerOordeel(adem), tekst: adem.join(" "), producten: [], pdf: p.vibPdf });
    groep.get(sleutel).producten.push(p.naam);
  }
  product = bewaar;
  return [...groep.values()];
}

function beschermStap(nummer) {
  const blokken = onderdeel("8", "8.2");
  const regels = [];
  // Masker: alle zinnen in 8.2 die over ademhaling gaan, ook als ze niet onder een eigen kopje staan.
  const ademZinnen = ademZinnenVan(blokken);
  {
    // Ook als rubriek 8.2 niet uit te lezen is, staat de masker-regel er (dan: bij twijfel altijd gebruiken).
    const oordeel = gecontroleerdOordeel(ademZinnen);
    // Alleen de zinnen waarop het oordeel rust: "niet nodig"-zinnen en "draag/gebruik een masker"-zinnen.
    const bron = ademZinnen
      .filter((z) => NEGATIEF.test(z) || (MASKER.test(zonderLabel(z)) && DOE.test(zonderLabel(z))))
      .slice(0, 2)
      .join(" ");
    regels.push("<li class='pbm'><span class='ic'>😷</span><div><b>Masker: " + esc(oordeel) + "</b>" +
      (bron ? "<p class='vibzin'>VIB: “" + esc(bron) + "”</p>" : "") + "</div></li>");
  }
  const overig = [];
  // Milieumaatregelen horen bij opruimen (rubriek 6), niet bij bescherm jezelf.
  const GEEN_PBM = /^(milieu|beheersing van milieu|beheersing van milieublootstelling|environmental|controle van de blootstelling van het milieu)/i;
  for (const it of items(blokken)) {
    const tekst = it.blokken.map((b) => (b.soort === "veld" ? b.tekst : blokTekst(b))).join("\n");
    if (GEEN_PBM.test(label(it))) continue;
    // Waar gaat dit over: het kopje, het begin van de tekst, of anders de tekst zelf.
    let soort =
      PBM.find((p) => p.re.test(it.kopje || "")) ||
      PBM.find((p) => p.re.test(label(it))) ||
      PBM.find((p) => !p.masker && p.re.test(tekst.slice(0, 200)));
    if (soort && soort.masker) soort = null; // ademhaling staat al bij het masker; de rest gaat naar "Overig"
    if (soort) {
      // Bij een beschermingsmiddel telt ook een zin zonder werkwoord ("Veiligheidsbril").
      const z = zinnen(tekst)
        .map((x) => x.replace(/^\d+(\.\d+)+\.?\s*/, "")) // paragraafnummer ervoor ("8.2.2.1.")
        .filter(
          (x) =>
            x.length > 2 &&
            !GEEN_DOE.test(x) &&
            !ADEM.test(x) &&
            !LOS_KOPJE.test(x)
        );
      if (!z.length) continue;
      const ic = /(handschoen|glove|gant|handschuh)/i.test(z.join(" ") + " " + (it.kopje || "")) ? "🧤" : soort.ic;
      // Alleen een kopje dat een label is ("Bescherming van de handen") wordt vet; "Veiligheidsbril" is inhoud.
      const label_ = LOS_KOPJE.test(it.kopje || "") ? (it.kopje || "").replace(/[\s:]+$/, "") : "";
      regels.push("<li class='pbm'><span class='ic'>" + ic + "</span><div>" + (label_ ? "<b>" + esc(label_) + "</b>" : "") + lijst(z) + "</div></li>");
    } else {
      overig.push(...doeZinnen(tekst).filter((x) => !ADEM.test(x)));
    }
  }
  // Doe-zinnen zonder herkenbaar beschermingsmiddel: niet weglaten, maar onder "Overig".
  if (overig.length) regels.push("<li class='pbm'><span class='ic'>📋</span><div><b>Overig</b>" + lijst([...new Set(overig)]) + "</div></li>");
  const inhoud =
    "<ul class='pbmlijst'>" + regels.join("") + "</ul>" + (blokken.length ? "" : "<p><i>" + esc(NIET_GELEZEN + "8.2.") + "</i></p>");
  return stap(nummer, "Bescherm jezelf", inhoud);
}

// --- Eerste hulp (rubriek 4.1) ---
function eersteHulp(route) {
  const blokken = onderdeel("4", "4.1");
  if (!blokken.length) return "<p><i>" + esc(NIET_GELEZEN + "4.") + "</i></p>";
  const lijstItems = items(blokken);
  const routeVan = (it) => Object.keys(ROUTES).find((k) => ROUTES[k].re.test(label(it)));
  const algemeen = lijstItems.filter((it) => !routeVan(it)).flatMap((it) => it.blokken.flatMap((b) => doeZinnen(blokTekst(b))));
  const perRoute = (k) => lijstItems.filter((it) => routeVan(it) === k).flatMap((it) => it.blokken.flatMap((b) => doeZinnen(blokTekst(b))));
  if (route && ROUTES[route]) {
    const z = perRoute(route);
    if (z.length) return lijst(z.concat(algemeen));
  }
  // Alle routes onder elkaar (of route niet te vinden).
  const delen = Object.keys(ROUTES)
    .map((k) => [k, perRoute(k)])
    .filter(([, z]) => z.length)
    .map(([k, z]) => "<p class='route'>" + ROUTES[k].ic + " " + esc(ROUTES[k].tekst) + "</p>" + lijst(z));
  if (!delen.length) return doeUit(blokken);
  return delen.join("") + (algemeen.length ? "<p class='route'>Altijd</p>" + lijst(algemeen) : "");
}

// --- Brand (rubriek 5.1) ---
// Alleen wat het VIB zelf geschikt noemt komt onder "Blussen met"; wat het ongeschikt noemt onder "Niet blussen met".
// De tekst wordt opgeknipt op de kopjes ("Geschikte blusmiddelen", "Ongeschikte blusmiddelen", ...),
// of die nu als eigen regel, als veld of midden in een alinea staan.
const BLUS_NIET =
  /(ongeschikte blusmiddelen|niet[- ]geschikte blusmiddelen|te mijden blusmiddelen|blusmiddelen die (om veiligheidsredenen |uit veiligheidsoogpunt |uit veiligheidsoverwegingen )?niet (mogen|moeten|kunnen) worden gebruikt|blusmiddelen die (om veiligheidsredenen |uit veiligheidsoogpunt |uit veiligheidsoverwegingen )?niet geschikt zijn|niet te gebruiken blusmiddelen|unsuitable extinguishing media|extinguishing media (which|that) (must|should) not be used|ungeeignete löschmittel|nicht geeignete löschmittel|aus sicherheitsgründen ungeeignete löschmittel|moyens d['’]extinction (inappropriés|inadaptés|déconseillés|à éviter|non appropriés)|\bniet geschikt\s*:|\bunsuitable\s*:|medios de extinción no (adecuados|apropiados))/i;
const BLUS_WEL =
  /((?<![a-z])(geschikte|aanbevolen|passende) blusmiddelen|(?<!un)suitable extinguishing media|(?<!un)geeignete löschmittel|moyens d['’]extinction appropriés|(?<!niet )(?<!un)\b(geschikt|suitable)\s*:|medios de extinción (adecuados|apropiados))/i;

function blusDelen(tekst) {
  const merk = new RegExp("(" + BLUS_NIET.source + "|" + BLUS_WEL.source + ")", "gi");
  const delen = [];
  let soort = "begin", vanaf = 0, m;
  while ((m = merk.exec(tekst))) {
    delen.push({ soort, tekst: tekst.slice(vanaf, m.index) });
    soort = BLUS_NIET.test(m[0]) ? "niet" : "wel";
    vanaf = m.index + m[0].length;
  }
  delen.push({ soort, tekst: tekst.slice(vanaf) });
  return delen
    .map((d) => ({ soort: d.soort, tekst: d.tekst.replace(/^[\s:.\-–]+|[\s:\-–]+$/g, "") }))
    .map((d) => ({ soort: d.soort, tekst: d.soort === "niet"
      ? d.tekst.replace(/^(geen|none|keine|aucun|ninguno)( bekend| known| bekannt| connu)?(,? (voor zover|so far as|as far as)[^.]*)?[.,]?\s*/i, "")
      : d.tekst }))
    .filter((d) => d.tekst && !/^(geen|none|keine|aucun|ninguno)\.?$/i.test(d.tekst))
    // Een los kopje ("Blusmiddelen", "Extinguishing media") is geen blusmiddel.
    .filter((d) => !/^(5\.1\.?\s*)?(blusmiddelen|extinguishing media|löschmittel|moyens d['’]extinction|medios de extinción)\.?$/i.test(d.tekst));
}

// Alleen door Toppy goedgekeurde brandstappen worden ingedeeld getoond (brand-gecontroleerd.js).
// Een nieuw of gewijzigd VIB: de letterlijke tekst van 5.1, met "nog niet gecontroleerd".
const BRAND_GOED = typeof BRAND_GECONTROLEERD !== "undefined" ? BRAND_GECONTROLEERD : {};

function brandBlokken() {
  const niet53 = onderdeel("5", "5.3").filter((b) => b.soort === "veld" && BLUS_NIET.test(b.kopje));
  return onderdeel("5", "5.1").concat(niet53);
}

function brandSleutel(blokken) {
  return tekstSleutel(blokken.map((b) => (b.soort === "veld" ? b.kopje + ": " + b.tekst : blokTekst(b))).join(" "));
}

function brandStap(nummer) {
  const blokken = brandBlokken();
  if (!blokken.length) return stap(nummer, "Blussen", "<p><i>" + esc(NIET_GELEZEN + "5.") + "</i></p>", "brand");
  const goed = BRAND_GOED[brandSleutel(blokken)];
  if (goed) return stap(nummer, "Blussen", goed, "brand");
  const letterlijk = blokken.map((b) => (b.soort === "veld" ? b.kopje + ": " + b.tekst : blokTekst(b))).join(" ");
  return stap(
    nummer,
    "Blussen",
    "<p class='blus'>⚠️ <b>Nog niet gecontroleerd. Volg de tekst uit het VIB:</b></p><p>" + esc(letterlijk) + "</p>",
    "brand"
  );
}

// Voor een nieuwe controleronde: brandstappen die nog niet zijn goedgekeurd, met het voorstel van de tool.
function brandTeControleren() {
  const groep = new Map();
  const bewaar = product;
  for (const p of PRODUCTEN.filter((x) => x.vibPdf)) {
    product = p;
    const blokken = brandBlokken();
    const sleutel = brandSleutel(blokken);
    if (!blokken.length || BRAND_GOED[sleutel]) continue;
    if (!groep.has(sleutel)) groep.set(sleutel, { sleutel, voorstel: brandVoorstel(blokken), producten: [], pdf: p.vibPdf });
    groep.get(sleutel).producten.push(p.naam);
  }
  product = bewaar;
  return [...groep.values()];
}

// Het voorstel van de tool: geschikte en ongeschikte blusmiddelen uit elkaar gehaald.
function brandVoorstel(blokken) {
  // Een veld waarvan het kopje meer bevat dan alleen "(On)geschikte blusmiddelen" (door elkaar gelopen opmaak
  // in de PDF) kan de tool niet betrouwbaar indelen: dat wordt letterlijk en neutraal getoond.
  const onduidelijk = [];
  const helder = blokken.filter((b) => {
    if (b.soort !== "veld") return true;
    const m = b.kopje.match(BLUS_NIET) || b.kopje.match(BLUS_WEL);
    if (!m || b.kopje.replace(/[\s:.\-–]+$/, "").trim().length <= m[0].length + 3) return true;
    onduidelijk.push(b.kopje + ": " + b.tekst);
    return false;
  });
  const tekst = helder.map((b) => (b.soort === "veld" ? b.kopje + ": " + b.tekst : blokTekst(b))).join(" \n ");
  const wel = [], niet = [], los = [];
  const NEE = /\b(niet|geen|nooit|not|never|no|avoid|vermijd\w*|nicht|kein\w*|pas|ne)\b/i;
  for (const d of blusDelen(tekst)) {
    if (d.soort === "wel") {
      // Een verbod tussen de geschikte middelen ("Geen water gebruiken.") komt op een eigen regel.
      const z = d.tekst.split(/(?<=[.!])\s+/);
      const goed = z.filter((x) => !NEE.test(x)).join(" ").trim();
      if (goed) wel.push(goed);
      los.push(...z.filter((x) => NEE.test(x)));
    }
    else if (d.soort === "niet") niet.push(d.tekst);
    // Tekst onder het kopje "5.1 Blusmiddelen" zonder eigen kopje: alleen "blussen met" als er geen ontkenning in staat.
    else if (!NEE.test(d.tekst)) wel.push(d.tekst);
    else los.push(d.tekst);
  }
  const regel = (t) => esc(t.replace(/\s*\n\s*/g, " "));
  const inhoud =
    (wel.length ? "<p class='blus'>🧯 <b>Blussen met:</b> " + wel.map(regel).join("; ") + "</p>" : "") +
    (niet.length ? "<p class='blus niet'>🚫 <b>Niet blussen met:</b> " + niet.map(regel).join("; ") + "</p>" : "") +
    (los.length ? "<p class='blus niet'>🚫 " + los.map(regel).join(" ") + "</p>" : "") +
    (onduidelijk.length
      ? "<p class='blus'>⚠️ <b>Onduidelijk in het VIB, lees rubriek 5 in de PDF.</b></p><p class='vibzin'>VIB: “" + onduidelijk.map(regel).join(" ") + "”</p>"
      : "");
  return inhoud || doeUit(blokken);
}

// --- Opruimen (rubriek 6) en afvoeren (rubriek 13) ---
function opruimStap(nummer) {
  const hoe = onderdeel("6", "6.3"), voor = onderdeel("6", "6.1"), milieu = onderdeel("6", "6.2");
  if (!hoe.length && !voor.length) {
    const alles = ((product.rubrieken || {})["6"] || []).filter((b) => b.soort !== "kop");
    return stap(nummer, "Ruim op", alles.length ? doeUit(alles) : "<p><i>" + esc(NIET_GELEZEN + "6.") + "</i></p>");
  }
  // Eerst waarmee en hoe (6.3), dan waar je op let (6.1 en 6.2).
  const z = (bl) => bl.flatMap((b) => doeZinnen(blokTekst(b)));
  const hoeZ = z(hoe), letop = z(voor).concat(z(milieu));
  const inhoud =
    (hoeZ.length ? "<p class='route'>Waarmee en hoe</p>" + lijst(hoeZ) : hoe.length ? doeUit(hoe) : "") +
    (letop.length ? "<p class='route'>Let op</p>" + lijst(letop) : "");
  return stap(nummer, "Ruim op", inhoud || doeUit(hoe.concat(voor)));
}

function afvoerStap(nummer) {
  const blokken = onderdeel("13", "13.1");
  const alles = blokken.length ? blokken : ((product.rubrieken || {})["13"] || []).filter((b) => b.soort !== "kop");
  return stap(nummer, "Voer af", alles.length ? doeUit(alles) : "<p><i>" + esc(NIET_GELEZEN + "13.") + "</i></p>");
}

function adrStap(nummer, terug) {
  return stap(
    nummer,
    terug ? "Zet de ADR-kar terug" : "Pak de ADR-kar",
    terug
      ? "<p>Zet de ADR-kar na gebruik weer terug.</p><p class='bron'>Werkinstructie, niet uit het VIB</p>"
      : "<p>Maak altijd gebruik van de ADR-kar. Pak deze alvorens je begint met opruimen.</p><p class='bron'>Werkinstructie, niet uit het VIB</p>",
    "instructie"
  );
}

function volledigeTekst(nummers) {
  const r = product.rubrieken || {};
  const delen = nummers
    .filter((nr) => r[nr] && r[nr].length)
    .map((nr) => "<h3 class='vibkop'>Rubriek " + (nr === "8" ? "8.2" : nr) + " – " + esc(RUBRIEK_TITEL[nr]) + "</h3>" + vibInhoud(r[nr]));
  return delen.length ? '<details class="meer volledig"><summary>Volledige VIB-tekst</summary>' + delen.join("") + "</details>" : "";
}

// Bouwt de stappen voor een situatie, altijd in de vaste volgorde 8.2, 4, 6, 5, 13.
function stappen(s, route) {
  const uit = [];
  let n = 0;
  const opruimen = s === "gemorst" || s === "alles";
  if (opruimen) uit.push(adrStap(++n));
  if (s === "gemorst" || s === "alles") uit.push(beschermStap(++n));
  if (s === "gewond" || s === "alles") uit.push(stap(++n, "Eerste hulp", eersteHulp(route), "eerst"));
  if (opruimen) uit.push(opruimStap(++n));
  if (s === "brand" || s === "alles") uit.push(brandStap(++n));
  if (opruimen) uit.push(afvoerStap(++n));
  if (opruimen) uit.push(adrStap(++n, true));
  return uit;
}

function kies(s, route) {
  const keuzes = {
    gewond: ["Iemand is gewond of onwel", ["4"]],
    gemorst: ["Gemorst of gelekt", ["8", "6", "13"]],
    brand: ["Brand", ["5"]],
    alles: ["Alles in volgorde", ["8", "4", "6", "5", "13"]],
  };
  if (!keuzes[s]) s = "alles";
  const [titel, nummers] = keuzes[s];
  if (!heeftVib(product)) return geenVibScherm();
  if (s === "gewond" && route === undefined) return routeScherm();
  const sub = route && ROUTES[route] ? titel + ": " + ROUTES[route].tekst.toLowerCase() : titel;
  toon(sub, [uitleesmelding()].concat(stappen(s, route), [volledigeTekst(nummers)]));
}

function toon(titel, blokken, knoppen) {
  const voet = heeftVib(product)
    ? "De zinnen komen letterlijk uit het VIB. Oranje = eigen werkinstructie. De regel 'Masker' is afgeleid uit het VIB."
    : "";
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
