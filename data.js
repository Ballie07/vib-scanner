// Regels voor de teksten in dit bestand:
// 1. Volg het VIB, altijd. Niets toevoegen, ook niet als het goed bedoeld is.
// 2. Alleen moeilijke woorden mogen kort worden uitgelegd tussen haakjes, bijvoorbeeld "Longoedeem (vocht in de longen)".
// 3. Zegt het VIB ergens niets over, dan: "Gebruik je gezonde verstand en doe wat jou het veiligst lijkt."
//
// Proefversie: gebruik verzonnen namen en nummers zolang de site openbaar is.
const BHV_LIJST = [
  { naam: "Voorbeeld Een", rol: "BHV", telefoon: "06 00 00 00 01" },
  { naam: "Voorbeeld Twee", rol: "BHV", telefoon: "06 00 00 00 02" },
  { naam: "Voorbeeld Drie", rol: "Veiligheidsverantwoordelijke", telefoon: "06 00 00 00 03" }
];

const PRODUCTEN = [
  {
    naam: "W'eau overwinteringsvloeistof",
    vibDatum: "31 januari 2024",
    ean: ["8719326660592", "4019305657259"],
    vib: "",
    gevaar: "Gevaar. Kan bijtend zijn voor metalen. Veroorzaakt ernstig oogletsel.",
    bescherming: [
      "Nauw aansluitende veiligheidsbril (EN 166). Oogspoelfles met zuiver water binnen bereik houden.",
      "Bij uitzonderlijke verwerkingsproblemen: volgelaatsscherm en beschermend pak.",
      "Niet-doorlaatbare beschermende kleding die bestand is tegen dit product.",
      "Beschermende handschoenen dragen. Het VIB zegt niet welk type. Gebruik je gezonde verstand en kies de handschoenen die jou het veiligst lijken.",
      "Bij ademhalingsrisico: luchtzuiverend gezichtsmasker, type ABEK."
    ],
    eersteHulp: {
      algemeen: ["Bij ernstige of aanhoudende klachten zo spoedig mogelijk medisch advies inwinnen."],
      ogen: ["Eerst langdurig spoelen met water. Contactlenzen verwijderen als dat makkelijk kan. Daarna naar een arts."],
      huid: ["Verontreinigde kleding uittrekken. Huid spoelen met veel water. Onmiddellijk naar het ziekenhuis."],
      ingeademd: ["Rechtop laten zitten, frisse lucht, rust. Naar het ziekenhuis."],
      ingeslikt: ["Mond laten spoelen. GEEN braken opwekken. Onmiddellijk naar het ziekenhuis."],
      letOp: []
    },
    aanpak: [
      "Niet door de gemorste stof lopen en hem niet aanraken.",
      "Boven de wind blijven, zodat je geen uitwasemingen of damp inademt.",
      "Bezoedelde kleding en beschermingsmiddelen na gebruik uittrekken en veilig afvoeren.",
      "Niet in riool of openbaar water laten stromen.",
      "Zorgvuldig verzamelen en opslaan in geschikte houders. Eventueel opzuigen met absorberend materiaal."
    ],
    brand: [
      "Blussen met verneveld water, poeder, schuim of CO2.",
      "Over speciale gevaren en blusmiddelen die je niet mag gebruiken, zegt het VIB niets. Gebruik je gezonde verstand en doe wat jou het veiligst lijkt."
    ],
    afvoer: [
      "Het VIB zegt niet hoe je gemorst product afvoert. Het zegt wel dat het niet in riool of openbaar water mag (zie stap 2). Gebruik je gezonde verstand en doe wat jou het veiligst lijkt."
    ],
    proef: [
    ]
  },
  {
    naam: "HTH Stick",
    vibDatum: "7 juni 2024",
    ean: [],
    vib: "",
    gevaar: "Gevaar. Kan brand bevorderen (oxiderend). Veroorzaakt ernstige brandwonden en oogletsel. Schadelijk bij inslikken. Bijtend voor de luchtwegen. Vormt giftig gas (chloor) in contact met zuren. Zeer giftig voor waterleven.",
    bescherming: [
      "Chemische veiligheidsbril en gezichtsbescherming. Oogdouche in de buurt.",
      "Resistente handschoenen. Het VIB zegt niet welk type. Gebruik je gezonde verstand en kies de handschoenen die jou het veiligst lijken. Handschoenen met scheurtjes of gaatjes weggooien.",
      "Indien van toepassing: chemicaliënbestendig schort, veiligheidsschoenen, stofdicht beschermingspak, vuurbestendige kleding.",
      "Wie geen beschermende uitrusting draagt, mag het gebied met gemorst product niet in tot het opruimen klaar is."
    ],
    eersteHulp: {
      algemeen: [
        "Buiten de gevaarlijke zone brengen.",
        "Een arts raadplegen en dit VIB aan de arts tonen.",
        "Het slachtoffer niet alleen laten."
      ],
      ogen: ["Onmiddellijk met veel water spoelen en medisch advies inwinnen. Blijven spoelen tijdens het vervoer naar het ziekenhuis. Contactlenzen uitnemen. Onbeschadigd oog beschermen."],
      huid: ["Goed afspoelen met water. Verontreinigde kleding uittrekken."],
      ingeademd: ["Naar de frisse lucht. Warm en rustig houden. Bij bewusteloosheid: stabiele zijligging en medische hulp inroepen."],
      ingeslikt: ["Onmiddellijk medische hulp inroepen. GEEN braken opwekken. Mond spoelen met water. Geen melk of alcohol geven. Een bewusteloze nooit laten drinken of eten."],
      letOp: ["Longoedeem (vocht in de longen) kan vertraagd optreden."]
    },
    aanpak: [
      "Persoonlijke beschermingsmiddelen gebruiken. Stofvorming vermijden. Stof niet inademen.",
      "Verder lekken voorkomen als dat veilig kan. Niet in het riool laten komen. Raakt het rivieren, meren of riolen, dan de autoriteiten informeren.",
      "Opvegen en scheppen met een schone bezem of schep, in schone, droge houders.",
      "Gemorst product niet nat laten worden.",
      "Al het gemorste product is verontreinigd. Het kan een chemische reactie op gang brengen waardoor brandbaar materiaal spontaan kan ontbranden.",
      "Houders niet strak afsluiten. Het product onmiddellijk naar een geïsoleerde buitenruimte brengen."
    ],
    brand: [
      "Blussen met water. Niet met poederblussers die ammoniumverbindingen bevatten.",
      "Kan brand bevorderen (oxiderend). Bluswater niet in riool of waterloop laten lopen.",
      "Bij brand ontstaat chloor. Brandweer: persluchtmasker. Aan brand blootgestelde houders koelen met water."
    ],
    afvoer: [
      "Product niet in riool, waterstroom of bodem. Verwijderen volgens plaatselijke voorschriften.",
      "Verontreinigde verpakking: restant verwijderen en behandelen als ongebruikt product. Lege containers naar een erkende afvalverwerker, niet hergebruiken, het lege vat niet verbranden of met snijbrander bewerken."
    ],
    proef: []
  },
    {
    naam: "SWE Desinfectiegranulaat 65",
    vibDatum: "21 februari 2022",
    ean: [],
    vib: "",
    gevaar: "Gevaar. Kan brand bevorderen (oxiderend). Schadelijk bij inslikken. Veroorzaakt ernstige oogirritatie. Kan irritatie van de luchtwegen veroorzaken. Vormt giftig gas in contact met zuren. Niet combineren met andere producten, want er kan chloor vrijkomen. Zeer giftig voor waterleven.",
    bescherming: [
      "Goedsluitende veiligheidsbril met zijbescherming (EN 166) als er gevaar is voor oogcontact.",
      "Bij grootschalige blootstelling: stofmasker type FFP1 of hoger (EN 149).",
      "Handschoenen en kleding: bij normaal gebruik vraagt het VIB geen specifieke bescherming. Het VIB adviseert wel om deskundig advies in te winnen voor de situatie ter plekke.",
      "Schoenen met antislipzolen (gevaar voor slippen)."
    ],
    eersteHulp: {
      algemeen: [],
      ogen: ["Uitspoelen met (lauw) water. Contactlenzen verwijderen. Een arts raadplegen."],
      huid: ["Verontreinigde kleding uittrekken. Voordat het product opdroogt de huid afspoelen met veel water en zeep."],
      ingeademd: ["Slachtoffer naar de frisse lucht brengen. Een arts raadplegen."],
      ingeslikt: ["Geen braken opwekken. Mond uitspoelen. Eén glas water laten drinken. Een bewusteloze nooit iets via de mond geven. Voelt het slachtoffer zich onwel: onmiddellijk een arts raadplegen."],
      letOp: []
    },
    aanpak: [
      "Gevaar voor slippen: gemorst product onmiddellijk opruimen.",
      "Contact met gemorst of vrijgekomen product vermijden. Stof niet inademen.",
      "Niet in riool, oppervlakte- of grondwater laten komen. Instanties informeren als de omgeving wordt blootgesteld.",
      "Verzamelen in containers. Geen zaagsel gebruiken.",
      "Afvoeren naar een officieel afvalverzamelpunt.",
      "Bevuild oppervlak reinigen met ruim water en zeep. Geen oplosmiddelen gebruiken."
    ],
    brand: [
      "Blussen met een waterstraal. Alle andere blusmiddelen zijn niet geschikt.",
      "Reageert heftig met brandbare stoffen, met kans op explosies. Bij verhitting komt zuurstof vrij, wat de brand verhevigt. Water mag gebruikt worden om vaten en containers koel te houden.",
      "Bij brand ontstaan giftige en corrosieve dampen (fosgeen, zoutzuur) en eventueel koolmonoxide. Brandweer: adequate ademhalingsbescherming bij onvoldoende ventilatie."
    ],
    afvoer: [
      "Restanten van het product en niet-lege verpakking zijn gevaarlijk afval. Lege verpakking niet met huishoudelijk afval afvoeren.",
      "Afvoeren naar een officieel afvalverzamelpunt, volgens de plaatselijke regels."
    ],
    proef: [
    ]
  }
];
