/**
 * Supporting restaurant specs for Tavli demo seed.
 *
 * 11 synthetic Bucharest restaurants designed to populate the diner-side feed,
 * map, filters, and search alongside the canonical Atelier Floreasca showcase.
 * Names, addresses, producers, and people are creative content (not real
 * establishments) — but plausible enough to demo to prospective Romanian
 * partners.
 *
 * All copy is Romanian with proper diacritics. Cuisine keys, dietary tags,
 * and structural fields stay in English to match the canonical schema.
 *
 * Consumed by `scripts/seed-supporting-restaurants.ts` (separate task).
 */

export interface RestaurantSpec {
  slug: string;
  name: string;
  ownerEmail: string;
  citySlug: "bucuresti";
  cuisines: string[];
  priceLevel: 1 | 2 | 3 | 4;
  zone: string;
  address: string;
  lat: number;
  lng: number;
  capacity: number;
  daysAgoCreated: number;
  heroNote: string;
  description: string;
  schedule: { dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; openTime: string; closeTime: string }[];
  availability: {
    dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    startTime: string;
    endTime: string;
    capacity: number;
  }[];
  menu: {
    heroNote: string;
    sections: { id: string; name: string; intro: string; orderIndex: number }[];
    items: {
      sectionId: string;
      name: string;
      description: string;
      priceLei: number;
      tags: ("vegan" | "vegetarian" | "gluten-free" | "spicy" | "popular" | "chef-pick")[];
    }[];
  };
  reviews: {
    firstName: string;
    rating: 1 | 2 | 3 | 4 | 5;
    daysAgo: number;
    partySize: number;
    comment: string;
    zone?: string;
  }[];
  bestFor: string[];
  photoPrompts: {
    hero: string;
    gallery: string[];
    dishes: { itemName: string; prompt: string }[];
  };
  ratingTarget: number;
}

export const SUPPORTING_RESTAURANTS: RestaurantSpec[] = [
  // ─────────────────────────────────────────────────────────────────────
  // 1. Casa Doina — Romanian/Balkan, $, Centrul Vechi
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "casa-doina",
    name: "Casa Doina",
    ownerEmail: "demo-casa-doina@tavli-supporting.invalid",
    citySlug: "bucuresti",
    cuisines: ["Romanian", "Balkan"],
    priceLevel: 1,
    zone: "Centrul Vechi",
    address: "Strada Lipscani 56, Sector 3",
    lat: 44.4341,
    lng: 26.1041,
    capacity: 60,
    daysAgoCreated: 150,
    heroNote: "Mâncarea bunicii, în inima Lipscaniului. Ciorbe care se fierb 6 ore.",
    description:
      "Tavernă de familie deschisă de 25 de ani, cu rețete moștenite și producători de încredere: măcelarul Bujenița din Cluj, mămăliga din Suceava, brânzeturile de la stâna Pleșa din Sibiu. Atmosferă caldă, pereți din cărămidă veche, mese acoperite cu fețe brodate. Țuica de prună din pivnița casei se servește rece, în păhăruțe de lut.",
    schedule: [
      { dayOfWeek: 1, openTime: "11:00", closeTime: "22:00" },
      { dayOfWeek: 2, openTime: "11:00", closeTime: "22:00" },
      { dayOfWeek: 3, openTime: "11:00", closeTime: "22:00" },
      { dayOfWeek: 4, openTime: "11:00", closeTime: "22:00" },
      { dayOfWeek: 5, openTime: "11:00", closeTime: "22:00" },
      { dayOfWeek: 6, openTime: "11:00", closeTime: "22:00" },
      { dayOfWeek: 0, openTime: "12:00", closeTime: "21:00" },
    ],
    availability: [
      { dayOfWeek: 1, startTime: "11:00", endTime: "22:00", capacity: 60 },
      { dayOfWeek: 2, startTime: "11:00", endTime: "22:00", capacity: 60 },
      { dayOfWeek: 3, startTime: "11:00", endTime: "22:00", capacity: 60 },
      { dayOfWeek: 4, startTime: "11:00", endTime: "22:00", capacity: 60 },
      { dayOfWeek: 5, startTime: "11:00", endTime: "22:00", capacity: 60 },
      { dayOfWeek: 6, startTime: "11:00", endTime: "22:00", capacity: 60 },
      { dayOfWeek: 0, startTime: "12:00", endTime: "21:00", capacity: 60 },
    ],
    menu: {
      heroNote: "Rețete vechi, gătite încet. Producători cunoscuți pe nume.",
      sections: [
        { id: "aperitive", name: "Aperitive Reci", intro: "De pus pe masă pentru toată lumea, cu pâine de casă.", orderIndex: 0 },
        { id: "ciorbe", name: "Ciorbe", intro: "Fierte 6 ore în zeamă de oase, drese cu smântână și ardei iute.", orderIndex: 1 },
        { id: "principale", name: "Feluri principale", intro: "Carne gătită lent, mămăligă caldă, murături de casă.", orderIndex: 2 },
        { id: "deserturi", name: "Deserturi", intro: "Trei dulciuri, toate făcute aici, niciunul cumpărat.", orderIndex: 3 },
      ],
      items: [
        // Aperitive
        { sectionId: "aperitive", name: "Zacuscă de casă cu vinete coapte pe lemn", description: "Vinete coapte pe lemn de fag, ardei copți, ceapă carameliată, ulei de floarea-soarelui. Servită cu pâine de casă.", priceLei: 22, tags: ["vegan", "vegetarian"] },
        { sectionId: "aperitive", name: "Salată de boeuf tradițională", description: "Cartofi, morcovi, mazăre, vită fiartă lent, maioneză bătută cu mâna, decorată cu ardei copt și măsline.", priceLei: 28, tags: ["popular"] },
        { sectionId: "aperitive", name: "Brânză telemea de Sibiu cu roșii și ceapă verde", description: "Telemea de oaie de la stâna Pleșa, roșii de Buzău, ceapă verde, busuioc, ulei de măsline.", priceLei: 24, tags: ["vegetarian", "gluten-free"] },
        { sectionId: "aperitive", name: "Slană țărănească afumată cu mărar", description: "Slană afumată cu lemn de prun, ceapă roșie, ardei iute, mărar proaspăt, pâine prăjită.", priceLei: 26, tags: [] },
        // Ciorbe
        { sectionId: "ciorbe", name: "Ciorbă de burtă cu smântână și ardei iute", description: "Burtă de vită fiartă 6 ore, dreasă cu smântână grasă și gălbenuș, oțet și usturoi pisat.", priceLei: 32, tags: ["chef-pick", "popular"] },
        { sectionId: "ciorbe", name: "Ciorbă de văcuță cu leuștean", description: "Vită gătită încet cu rădăcinoase, acrită cu borș de casă din Bucovina, leuștean proaspăt.", priceLei: 30, tags: [] },
        { sectionId: "ciorbe", name: "Ciorbă de fasole cu ciolan afumat", description: "Fasole albă, ciolan afumat de la măcelarul Bujenița, ceapă, morcov, frunze de dafin.", priceLei: 28, tags: [] },
        // Principale
        { sectionId: "principale", name: "Sarmale cu mămăligă și smântână", description: "Sarmale în varză murată, cu carne de porc și vițel, gătite o noapte cu boia și cimbru. Mămăligă cu unt, smântână grasă.", priceLei: 42, tags: ["chef-pick", "popular"] },
        { sectionId: "principale", name: "Mititei de casă cu muștar și pâine", description: "Mititei făcuți zilnic în casă, gătiți pe grătar de cărbuni. Muștar dulce cu hrean, pâine de casă, murături.", priceLei: 38, tags: ["popular"] },
        { sectionId: "principale", name: "Tochitură de porc cu mămăligă și ou ochi", description: "Porc gătit lent în propria grăsime cu vin alb și boia, ou ochi proaspăt, mămăligă caldă, brânză de burduf.", priceLei: 46, tags: ["chef-pick"] },
        { sectionId: "principale", name: "Papricaș de pui cu găluște", description: "Pui gătit cu boia, ardei, ceapă și smântână. Găluște moi de griș, mărar.", priceLei: 36, tags: [] },
        { sectionId: "principale", name: "Pleșcăviță (piept de porc) la grătar cu cartofi țărănești", description: "Piept de porc marinat cu usturoi și cimbru, gătit pe grătar. Cartofi tăiați gros, gătiți cu slănină și ceapă.", priceLei: 44, tags: [] },
        { sectionId: "principale", name: "Fasole bătută cu ciolan și ceapă caramelată", description: "Fasole albă fiartă lent, pasată cu ulei și usturoi, ciolan afumat, ceapă caramelată cu boia.", priceLei: 32, tags: [] },
        // Deserturi
        { sectionId: "deserturi", name: "Papanași prăjiți cu dulceață de afine și smântână", description: "Papanași făcuți la comandă, prăjiți crocant, dulceață de afine de munte fiartă în casă, smântână din Bucovina.", priceLei: 26, tags: ["chef-pick", "popular"] },
        { sectionId: "deserturi", name: "Plăcintă cu mere și scorțișoară", description: "Foi subțiri întinse cu mâna, mere golden, zahăr brun, scorțișoară, unt topit. Servită caldă.", priceLei: 18, tags: ["vegetarian"] },
        { sectionId: "deserturi", name: "Cozonac cu nucă și rahat (felie)", description: "Cozonac copt în casă, umplutură generoasă cu nucă măcinată și rahat, presărat cu zahăr pudră.", priceLei: 16, tags: ["vegetarian"] },
        // Băuturi
        { sectionId: "deserturi", name: "Țuică de prună de la casă (50ml)", description: "Țuică de prună din pivnița casei, distilată în Maramureș, învechită 3 ani. Servită rece în păhăruțe de lut.", priceLei: 14, tags: [] },
        { sectionId: "deserturi", name: "Vișinată de casă (50ml)", description: "Vișine puse în alcool cu zahăr și scorțișoară, lăsate 6 luni în butoi de stejar.", priceLei: 12, tags: [] },
        { sectionId: "deserturi", name: "Limonadă cu mentă și miere de salcâm", description: "Lămâi proaspete, mentă din grădina bunicii, miere de salcâm, gheață mărunțită.", priceLei: 14, tags: ["vegan", "vegetarian", "gluten-free"] },
      ],
    },
    reviews: [
      { firstName: "Cătălin", rating: 5, daysAgo: 4, partySize: 4, comment: "Am venit duminică la prânz cu părinții. Sarmalele cu mămăligă — exact cum le făcea bunica mea în Maramureș. Țuica de prună de la casă a închis treaba perfect.", zone: "Centrul Vechi" },
      { firstName: "Andreea", rating: 5, daysAgo: 11, partySize: 2, comment: "Ciorba de burtă e o nebunie — se vede că fierbe ore întregi. Atmosfera caldă, fețele brodate, totul m-a dus în copilărie. Papanașii cu afine — desertul serii." },
      { firstName: "Răzvan", rating: 4, daysAgo: 18, partySize: 6, comment: "Locul e mic și plin sâmbătă seara, am așteptat masa vreo 15 minute, dar a meritat. Tochitura cu ou ochi — bestie. Mititeii — dintre cei mai buni din București." },
      { firstName: "Mihaela", rating: 5, daysAgo: 27, partySize: 3, comment: "Am dus niște prieteni din Italia aici și au plâns de bună ce a fost zacusca. Telemeaua de Sibiu e o minune. Vișinata de casă — am cerut sticla acasă." },
      { firstName: "Bogdan", rating: 5, daysAgo: 38, partySize: 2, comment: "Mâncare adevărată, prețuri cinstite. Fasole bătută cu ciolan și ceapă caramelată — pentru atât merita drumul. Pâinea de casă o ții pe masă toată cina.", zone: "Centrul Vechi" },
      { firstName: "Ana", rating: 4, daysAgo: 52, partySize: 4, comment: "Bun raport calitate-preț în Centrul Vechi, ceea ce e rar. Plăcinta cu mere caldă cu scorțișoară — copilărie pură. Singurul minus: muzica ușor cam tare seara." },
    ],
    bestFor: ["Familie", "Prânz tradițional", "Întâlnire cu prieteni"],
    photoPrompts: {
      hero: "Cinematic wide interior of a rustic Romanian tavern in Bucharest's old town at dusk, exposed brick walls warmed by candlelight, dark wood tables draped in hand-embroidered white tablecloths with red folk patterns, copper pots and ladles hanging from beams, ceramic plates on display shelves, warm amber atmosphere, no people, editorial photography, 35mm full frame, no text",
      gallery: [
        "Close-up of weathered exposed brick wall in a Romanian tavern, copper utensils hanging on iron hooks, vintage folk-pattern embroidered cloth draped beside, warm tungsten lighting, soft shadows, editorial detail shot, 50mm",
        "Top-down view of a wooden tavern table set for four, hand-thrown ceramic plates with blue rim, a cast-iron pot of stew steaming in the center, fresh dill bunches and a basket of country bread, candlelight, warm autumnal palette, 35mm",
        "Cellar shelf displaying glass bottles of plum brandy and homemade wine, dim warm light, dust motes in the air, wooden barrels in the background, rustic Romanian provenance, moody chiaroscuro photography, 50mm",
        "Detail of an embroidered Romanian tablecloth with red and black folk-cross patterns, a single ceramic shot glass of clear țuică set on top, candle reflection beside, intimate warm light, editorial close-up, 50mm",
        "Open kitchen pass-through showing a grandmother-aged cook stirring a copper cauldron of soup, steam rising, herbs on the counter, soft window light from the side, behind-the-scenes editorial, 35mm",
      ],
      dishes: [
        { itemName: "Sarmale cu mămăligă și smântână", prompt: "Editorial overhead photo of three Romanian sarmale wrapped in pickled cabbage leaves on a hand-thrown ceramic plate with blue rim, glistening tomato sauce, a quenelle of thick sour cream beside a mound of yellow polenta, fresh dill garnish, dark wood table, warm tungsten light, 50mm shallow depth of field" },
        { itemName: "Ciorbă de burtă cu smântână și ardei iute", prompt: "Three-quarter view of a deep ceramic bowl of Romanian tripe soup with creamy white broth, visible pieces of tripe and root vegetables, swirl of sour cream on top, two small red chili peppers and a clove of garlic on the saucer, country bread torn beside, candlelit tavern background blurred, 50mm" },
        { itemName: "Tochitură de porc cu mămăligă și ou ochi", prompt: "Editorial top-down of a small enamel pot of slow-cooked Romanian pork stew with deep mahogany sauce, beside a yellow polenta mound topped with a sunny-side-up egg, crumbled sheep cheese, fresh dill, rustic wooden surface, warm amber light, 50mm" },
        { itemName: "Mititei de casă cu muștar și pâine", prompt: "Close-up three-quarter view of five charred Romanian mititei sausages on a wooden board, blistered crust, alongside a small ramekin of yellow mustard with horseradish, country bread slices, pickled hot peppers, smoky warm light, 50mm shallow depth of field" },
        { itemName: "Papanași prăjiți cu dulceață de afine și smântână", prompt: "Top-down view of two golden fried Romanian papanași donuts stacked, generously crowned with thick white sour cream and a glistening dark blueberry compote dripping down the sides, fresh mint sprig, hand-thrown ceramic plate, warm tavern lighting, 50mm" },
        { itemName: "Țuică de prună de la casă (50ml)", prompt: "Intimate close-up of a small ceramic shot glass filled with clear plum brandy on a hand-embroidered red-and-black folk tablecloth, candle reflection in the liquid, dried plum beside, dim warm tungsten light, moody editorial photography, 50mm" },
      ],
    },
    ratingTarget: 4.5,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 2. Trattoria Buongiorno — Italian/European, $$, Dorobanți
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "trattoria-buongiorno",
    name: "Trattoria Buongiorno",
    ownerEmail: "demo-trattoria-buongiorno@tavli-supporting.invalid",
    citySlug: "bucuresti",
    cuisines: ["Italian", "European"],
    priceLevel: 2,
    zone: "Dorobanți",
    address: "Calea Dorobanți 132, Sector 1",
    lat: 44.4555,
    lng: 26.0944,
    capacity: 40,
    daysAgoCreated: 95,
    heroNote: "Pasta proaspătă în fiecare zi. Reteta — bunica din Bologna. Restul — al nostru.",
    description:
      "Trattoria de cartier cu paste făcute manual zilnic, după rețeta nonnei Carla din Bologna. Parmigiano Reggiano învechit 24 de luni, prosciutto de la măcelăria Bolognani, San Marzano sub denumire de origine. Specialități săptămânale care urmează piața. Lista de vinuri — focus pe Toscana și Emilia-Romagna, cu un Sangiovese de casă în carafă.",
    schedule: [
      { dayOfWeek: 2, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 3, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 4, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 5, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 6, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 0, openTime: "12:00", closeTime: "23:00" },
    ],
    availability: [
      { dayOfWeek: 2, startTime: "12:00", endTime: "23:00", capacity: 40 },
      { dayOfWeek: 3, startTime: "12:00", endTime: "23:00", capacity: 40 },
      { dayOfWeek: 4, startTime: "12:00", endTime: "23:00", capacity: 40 },
      { dayOfWeek: 5, startTime: "12:00", endTime: "23:00", capacity: 40 },
      { dayOfWeek: 6, startTime: "12:00", endTime: "23:00", capacity: 40 },
      { dayOfWeek: 0, startTime: "12:00", endTime: "23:00", capacity: 40 },
    ],
    menu: {
      heroNote: "Pasta făcută în casă dimineața. Specialitățile săptămânii pe tablă.",
      sections: [
        { id: "antipasti", name: "Antipasti", intro: "De împărțit la masă, cu un pahar de Prosecco rece.", orderIndex: 0 },
        { id: "primi", name: "Primi", intro: "Paste proaspete, întinse la 6 dimineața. Reteta nonnei Carla.", orderIndex: 1 },
        { id: "secondi", name: "Secondi", intro: "Carne și pește, gătite simplu, ca în Italia.", orderIndex: 2 },
        { id: "dolci", name: "Dolci", intro: "Trei dulciuri italienești, niciunul cumpărat.", orderIndex: 3 },
      ],
      items: [
        // Antipasti
        { sectionId: "antipasti", name: "Bruschetta cu roșii San Marzano și busuioc", description: "Pâine prăjită cu usturoi, roșii San Marzano DOP, busuioc proaspăt, ulei de măsline extravirgin, sare grunjoasă.", priceLei: 32, tags: ["vegetarian"] },
        { sectionId: "antipasti", name: "Burrata pugliese cu prosciutto crudo Parma", description: "Burrată proaspătă din Puglia, prosciutto Parma 24 luni, rucola, ulei de măsline, piper negru.", priceLei: 58, tags: ["chef-pick", "popular"] },
        { sectionId: "antipasti", name: "Vitello tonnato cu capere și lămâie", description: "Vițel fiert lent, sos de ton cu capere, maioneză cu lămâie, măsline taggiasche, pătrunjel.", priceLei: 52, tags: [] },
        { sectionId: "antipasti", name: "Tagliere di salumi e formaggi", description: "Selecție de mezeluri italiene (prosciutto, salame Felino, mortadella) și brânzeturi (Parmigiano 24 luni, gorgonzola dolce, pecorino), cu grissini și miere.", priceLei: 68, tags: [] },
        // Primi
        { sectionId: "primi", name: "Tagliatelle al ragù di Bologna", description: "Tagliatelle proaspete, ragù bolognez fiert 5 ore cu vin Sangiovese, parmezan 24 luni ras la masă.", priceLei: 58, tags: ["chef-pick", "popular"] },
        { sectionId: "primi", name: "Cacio e pepe", description: "Tonnarelli proaspete, pecorino romano DOP, piper negru proaspăt măcinat, apă de paste pentru cremozitate.", priceLei: 48, tags: ["vegetarian", "chef-pick"] },
        { sectionId: "primi", name: "Spaghetti alle vongole veraci", description: "Spaghetti, scoici vongole veraci, vin alb Vermentino, usturoi, pătrunjel, ardei iute, ulei de măsline.", priceLei: 72, tags: ["popular"] },
        { sectionId: "primi", name: "Risotto ai porcini", description: "Carnaroli gătit cu fond de porcini uscați, hribi proaspeți sotați, parmezan 24 luni, unt de munte, pătrunjel.", priceLei: 62, tags: ["vegetarian", "gluten-free"] },
        { sectionId: "primi", name: "Lasagne alla bolognese", description: "Foi de pastă proaspătă, ragù bolognez, besciamel, parmezan, gratinată în cuptor de lemne.", priceLei: 54, tags: [] },
        // Secondi
        { sectionId: "secondi", name: "Saltimbocca alla romana", description: "Vițel cu prosciutto crudo și salvie, saltimbocca în unt și vin alb Frascati, cartofi prăjiți cu rozmarin.", priceLei: 78, tags: ["chef-pick"] },
        { sectionId: "secondi", name: "Branzino al sale", description: "Biban-de-mare întreg copt în crustă de sare, deshus la masă, ulei de măsline cu lămâie, legume de sezon.", priceLei: 88, tags: ["gluten-free"] },
        { sectionId: "secondi", name: "Ossobuco cu polenta gialla", description: "Rasol de vițel gătit lent cu vin alb și gremolata, polenta moale cu unt și parmezan.", priceLei: 82, tags: [] },
        // Dolci
        { sectionId: "dolci", name: "Tiramisù della casa", description: "Mascarpone proaspăt, savoiardi muiate în espresso de Origo și Marsala, cacao amaruie. Făcut zilnic.", priceLei: 32, tags: ["vegetarian", "chef-pick", "popular"] },
        { sectionId: "dolci", name: "Panna cotta cu fructe de pădure", description: "Cremă de smântână cu vanilie de Madagascar, coulis de fructe de pădure, mentă proaspătă.", priceLei: 28, tags: ["vegetarian", "gluten-free"] },
        { sectionId: "dolci", name: "Cannoli siciliani cu ricotta și fistic", description: "Coji crocante umplute la comandă cu ricotta de oaie îndulcită, fistic de Bronte, ciocolată neagră.", priceLei: 30, tags: ["vegetarian"] },
        // Băuturi
        { sectionId: "dolci", name: "Sangiovese di casa (carafă 500ml)", description: "Vin roșu Sangiovese de la o crămă mică din Romagna, carafă de jumătate de litru. Se potrivește cu ragù și saltimbocca.", priceLei: 64, tags: [] },
        { sectionId: "dolci", name: "Aperol Spritz", description: "Aperol, Prosecco DOC, sifon, felie de portocală, măslină verde.", priceLei: 28, tags: [] },
        { sectionId: "dolci", name: "Espresso ristretto", description: "Espresso scurt, blend italian sicilian-toscan, prăjit săptămânal.", priceLei: 12, tags: [] },
      ],
    },
    reviews: [
      { firstName: "Iulia", rating: 5, daysAgo: 5, partySize: 2, comment: "Tagliatelle al ragù — au gust de Bologna. Pasta se simte că e proaspătă, nu seamănă cu nimic din supermarket. Sangiovese de casă perfect.", zone: "Dorobanți" },
      { firstName: "Tudor", rating: 5, daysAgo: 12, partySize: 4, comment: "Burrata cu Parma 24 luni — antipasto-ul ar putea fi singurul lucru pe masă și am pleca fericiți. Cacio e pepe simplă și impecabilă, fără show inutil." },
      { firstName: "Călin", rating: 5, daysAgo: 21, partySize: 2, comment: "Aniversarea soției — branzino al sale deshus la masă a fost teatrul perfect. Tiramisù făcut în casă — nu am mai gustat așa ceva în București." },
      { firstName: "Andrada", rating: 5, daysAgo: 33, partySize: 6, comment: "Cină de business, 6 persoane. Servirea — calmă, profesionistă, fără presiune să eliberăm masa. Tagliere di salumi pentru toată lumea, vongole veraci absolut proaspete." },
      { firstName: "Cosmin", rating: 4, daysAgo: 47, partySize: 2, comment: "Risotto ai porcini — cremos cum trebuie, cu hribi adevărați. Singurul lucru: prețul saltimboccăi mi s-a părut un pic peste București, dar calitatea justifică." },
      { firstName: "Valentina", rating: 5, daysAgo: 64, partySize: 3, comment: "Cannoli siciliani umpluți la comandă — fistic de Bronte adevărat, simți diferența. Espresso ristretto exact cât trebuia. Locul e mic, intim, mereu plin — rezervare obligatoriu." },
      { firstName: "Octavian", rating: 5, daysAgo: 78, partySize: 2, comment: "Lista vinurilor are personalitate, somelierul ne-a recomandat un Chianti Classico care a făcut casă perfectă cu lasagna. Locul are suflet de trattoria adevărată." },
    ],
    bestFor: ["Întâlnire romantică", "Cină de afaceri", "Aniversare"],
    photoPrompts: {
      hero: "Wide cinematic interior of a warm Italian trattoria at dusk, exposed wooden beams overhead, weathered brick walls, candles in empty Chianti bottles dripping wax, copper pots hanging behind the bar, fresh basil plants on the windowsill, handwritten chalk menu board, dark wood tables, warm tungsten lighting, no people, editorial photography, 35mm full frame, no text",
      gallery: [
        "Detail of a marble pasta-making station, fresh tagliatelle hanging on a wooden rod to dry, semolina-dusted board, vintage brass pasta cutter, soft window light from above, editorial behind-the-scenes, 50mm",
        "Close-up of a chalkboard with handwritten Italian daily specials in Italian and Romanian, fresh basil bunch and a wedge of Parmigiano on the counter beside, warm tungsten light, 50mm shallow depth of field",
        "Wall of wine bottles on rough wooden shelves, mostly Italian Sangiovese and Chianti, candle in a Chianti bottle on a small wooden table in front, warm amber light, intimate trattoria mood, 35mm",
        "Two-person table by a brick wall with a single candle in a wine bottle, two glasses of red wine, a small dish of olives and grissini, basil plant nearby, soft evening light, no people, editorial, 50mm",
        "Wood-fired oven glow in the background of an open kitchen, marble pizza prep counter in foreground with flour dusting, fresh basil bunch, San Marzano tomato can opened, warm orange flame light, 35mm",
      ],
      dishes: [
        { itemName: "Tagliatelle al ragù di Bologna", prompt: "Editorial three-quarter view of a deep bowl of fresh tagliatelle ribbons coated in rich mahogany Bolognese ragù, generous shavings of aged Parmigiano on top, sprig of fresh parsley, ceramic plate, dark wood table, warm tungsten light, basil plant blurred behind, 50mm shallow depth of field" },
        { itemName: "Burrata pugliese cu prosciutto crudo Parma", prompt: "Top-down editorial photo of a creamy whole burrata torn open in the center revealing soft cream, draped with translucent ribbons of pink Parma prosciutto, scattered rocket leaves, drizzle of green olive oil, cracked black pepper, ceramic plate, warm light, 50mm" },
        { itemName: "Cacio e pepe", prompt: "Three-quarter view of a shallow pasta bowl with glossy tonnarelli coated in pale yellow pecorino-and-pepper sauce, generous black pepper on top, single basil leaf, marble surface with a wedge of pecorino and pepper grinder beside, warm tungsten light, 50mm" },
        { itemName: "Saltimbocca alla romana", prompt: "Editorial overhead of three veal saltimbocca medallions wrapped in prosciutto with sage leaf on top, glistening butter-and-white-wine sauce, alongside golden rosemary potatoes, ceramic plate, dark wood table, candlelight from the side, 50mm shallow depth of field" },
        { itemName: "Tiramisù della casa", prompt: "Three-quarter view of a single portion of tiramisù in a small glass cup, layered savoiardi and mascarpone, generously dusted dark cocoa on top, espresso cup beside, candlelit Italian trattoria background blurred, warm amber light, 50mm" },
        { itemName: "Spaghetti alle vongole veraci", prompt: "Editorial overhead of a wide shallow bowl of spaghetti tossed with open vongole veraci clam shells, scattered chopped parsley and red chili flakes, drizzle of olive oil, lemon wedge on the side, white plate, warm tungsten light, 50mm" },
      ],
    },
    ratingTarget: 4.7,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 3. Sakura House — Japanese, $$$, Aviatorilor
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "sakura-house",
    name: "Sakura House",
    ownerEmail: "demo-sakura-house@tavli-supporting.invalid",
    citySlug: "bucuresti",
    cuisines: ["Japanese"],
    priceLevel: 3,
    zone: "Aviatorilor",
    address: "Bd. Aviatorilor 18, Sector 1",
    lat: 44.4683,
    lng: 26.0913,
    capacity: 32,
    daysAgoCreated: 75,
    heroNote: "Sushi-ul de la Tsukiji, ramen-ul de la Sapporo. Mâini formate la izakaya.",
    description:
      "Sushi și ramen autentic, cu pește importat săptămânal de la piața Toyosu (succesoarea Tsukiji) prin avion. Tonkotsu fiert 14 ore, omakase counter cu 4 locuri (rezervare cu o săptămână înainte). Chef Hiroshi a lucrat 12 ani la izakaya Sapporo înainte de București. Sake junmai daiginjo importat direct, listă de 18 etichete.",
    schedule: [
      { dayOfWeek: 2, openTime: "18:00", closeTime: "23:30" },
      { dayOfWeek: 3, openTime: "18:00", closeTime: "23:30" },
      { dayOfWeek: 4, openTime: "18:00", closeTime: "23:30" },
      { dayOfWeek: 5, openTime: "18:00", closeTime: "23:30" },
      { dayOfWeek: 6, openTime: "18:00", closeTime: "23:30" },
      { dayOfWeek: 0, openTime: "18:00", closeTime: "22:30" },
    ],
    availability: [
      { dayOfWeek: 2, startTime: "18:00", endTime: "23:30", capacity: 32 },
      { dayOfWeek: 3, startTime: "18:00", endTime: "23:30", capacity: 32 },
      { dayOfWeek: 4, startTime: "18:00", endTime: "23:30", capacity: 32 },
      { dayOfWeek: 5, startTime: "18:00", endTime: "23:30", capacity: 32 },
      { dayOfWeek: 6, startTime: "18:00", endTime: "23:30", capacity: 32 },
      { dayOfWeek: 0, startTime: "18:00", endTime: "22:30", capacity: 32 },
    ],
    menu: {
      heroNote: "Pește din Toyosu, ramen fiert 14 ore. Omakase doar la rezervare.",
      sections: [
        { id: "sushi", name: "Sushi & Sashimi", intro: "Pește livrat săptămânal pe avion. Orez Koshihikari, oțet de orez Mizkan.", orderIndex: 0 },
        { id: "ramen", name: "Ramen & Donburi", intro: "Tonkotsu fiert 14 ore. Tăiței proaspeți, făcuți în casă.", orderIndex: 1 },
        { id: "izakaya", name: "Izakaya", intro: "Mici plăcuri pentru împărțit, ca în barurile din Sapporo.", orderIndex: 2 },
        { id: "desert", name: "Desert & Sake", intro: "Mochi făcut zilnic. 18 etichete de sake junmai.", orderIndex: 3 },
      ],
      items: [
        // Izakaya (apetizers)
        { sectionId: "izakaya", name: "Edamame cu sare yuzu", description: "Boabe edamame opărite, sare cu coajă de yuzu uscată, ulei de susan.", priceLei: 38, tags: ["vegan", "vegetarian", "gluten-free"] },
        { sectionId: "izakaya", name: "Gyoza cu porc Iberico", description: "5 gyoza umplute cu porc Iberico, varză și ghimbir, prăjite la abur, sos ponzu cu ulei rayu.", priceLei: 52, tags: ["popular"] },
        { sectionId: "izakaya", name: "Karaage de pui cu maioneză kewpie", description: "Pui marinat în sake și ghimbir, pane în amidon de cartofi, prăjit. Maioneză Kewpie cu shichimi.", priceLei: 48, tags: [] },
        { sectionId: "izakaya", name: "Yakitori de pui și praz", description: "3 frigărui yakitori cu sos tare, gătite pe binchotan. Pui, praz, ardei shishito.", priceLei: 56, tags: [] },
        { sectionId: "izakaya", name: "Wagyu tartare cu yakult de gălbenuș", description: "Wagyu A5 tăiat cu cuțitul, gălbenuș de prepeliță, alge nori, ridiche daikon murată, ulei de susan.", priceLei: 128, tags: ["chef-pick"] },
        // Sushi & Sashimi
        { sectionId: "sushi", name: "Sashimi assortiment (12 felii)", description: "Selecția chefului: ton roșu otoro, hamachi, somon norvegian, doradă, ikura, wasabi proaspăt ras.", priceLei: 148, tags: ["gluten-free", "chef-pick", "popular"] },
        { sectionId: "sushi", name: "Nigiri selection (8 piese)", description: "8 nigiri alese de sushi chef: ton, hamachi, somon, anghilă unagi, ebi, tamago. Wasabi proaspăt, soia Kikkoman.", priceLei: 138, tags: ["chef-pick"] },
        { sectionId: "sushi", name: "Maki California cu crab adevărat", description: "Crab roșu de Hokkaido (nu surimi), avocado, castravete japonez, susan, mai 8 piese.", priceLei: 78, tags: ["popular"] },
        { sectionId: "sushi", name: "Maki Spider cu soft-shell crab", description: "Crab cu carapace moale prăjit, avocado, castravete, sos eel teriyaki, 8 piese.", priceLei: 88, tags: [] },
        { sectionId: "sushi", name: "Chirashi don", description: "Bol de orez sushi acoperit cu felii de pește variat, tamago, ikura, wasabi, gari, alge nori.", priceLei: 124, tags: ["gluten-free"] },
        // Ramen
        { sectionId: "ramen", name: "Tonkotsu ramen 14h cu chashu de porc", description: "Bulion de oase de porc fiert 14 ore, tăiței proaspeți, chashu, ou ajitsuke, mugulă bambus, alge nori, ceapă verde.", priceLei: 78, tags: ["chef-pick", "popular"] },
        { sectionId: "ramen", name: "Shoyu ramen cu pui karaage", description: "Bulion shoyu pe bază de pui, ou ajitsuke, karaage de pui crocant, ceapă verde, alge wakame.", priceLei: 68, tags: [] },
        { sectionId: "ramen", name: "Miso ramen cu unt și porumb", description: "Bulion miso roșu cu unt, porumb dulce, alfalfa, chashu, tăiței groși de Sapporo. Stilul nordic.", priceLei: 72, tags: [] },
        { sectionId: "ramen", name: "Vegan ramen cu shiitake și miso alb", description: "Bulion miso alb cu shiitake și kombu, tofu silken, ciuperci enoki, ceapă verde, ulei de susan negru.", priceLei: 64, tags: ["vegan", "vegetarian"] },
        // Desert & Sake
        { sectionId: "desert", name: "Mochi cu înghețată matcha și hojicha", description: "Două mochi proaspete (matcha Uji și hojicha), făcute zilnic, înveliș fin de orez glutinos.", priceLei: 42, tags: ["vegetarian", "chef-pick"] },
        { sectionId: "desert", name: "Cheesecake japonez (jiggly)", description: "Cheesecake umflat la abur cu textură de pernă, fructe de pădure, sirop de yuzu.", priceLei: 38, tags: ["vegetarian"] },
        { sectionId: "desert", name: "Sake junmai daiginjo Dassai 39 (180ml)", description: "Sake premium din Yamaguchi, orez șlefuit la 39%, note de pere și pepene galben. Servit rece.", priceLei: 88, tags: [] },
        { sectionId: "desert", name: "Asahi Super Dry (330ml)", description: "Bere japoneză uscată, importată direct, servită rece în pahar înghețat.", priceLei: 28, tags: [] },
      ],
    },
    reviews: [
      { firstName: "Adrian", rating: 5, daysAgo: 3, partySize: 2, comment: "Tonkotsu ramen 14h — cel mai bun din București, pur și simplu. Bulionul are corp, chashu se topește. Am fost la Sakura din Sapporo, nivelul e similar.", zone: "Aviatorilor" },
      { firstName: "Smaranda", rating: 5, daysAgo: 9, partySize: 4, comment: "Sashimi assortiment — peștele e clar proaspăt, nu fibros. Otoro topit pe limbă. Chef Hiroshi ne-a salutat la counter — atmosferă rară pentru București." },
      { firstName: "Mihail", rating: 5, daysAgo: 17, partySize: 2, comment: "Am stat la counter omakase. 14 piese, 90 de minute, 580 lei/persoană — și a meritat fiecare leu. Sake Dassai 39 a fost recomandarea perfectă." },
      { firstName: "Ileana", rating: 4, daysAgo: 28, partySize: 3, comment: "Maki California cu crab adevărat — diferența față de surimi e zi-noapte. Wagyu tartare — un pic mic ca porție pentru preț. Restul, impecabil." },
      { firstName: "Robert", rating: 5, daysAgo: 41, partySize: 2, comment: "Atmosferă moody, lumini roșii, lemn închis — exact ca într-un izakaya autentic. Karaage cu Kewpie — am mai cerut o porție. Yakitori pe binchotan se simte." },
      { firstName: "Andra", rating: 5, daysAgo: 56, partySize: 2, comment: "Mochi cu matcha Uji — dintre cele mai bune deserturi japoneze din oraș. Soția mea n-a vrut să plece. Locul e mic — rezervă cu o săptămână înainte." },
      { firstName: "Bogdan", rating: 5, daysAgo: 70, partySize: 4, comment: "Vegan ramen cu shiitake — am dus o prietenă vegană și a găsit ceva real, nu o adaptare slabă. Atenție la detalii — wasabi proaspăt ras la masă." },
    ],
    bestFor: ["Cină de seară", "Întâlnire cu prieteni", "Întâlnire romantică"],
    photoPrompts: {
      hero: "Cinematic wide interior of an intimate Japanese sushi bar at night, dark walnut sushi counter with 8 stools, single red neon kanji sign on the back wall, paper lanterns hanging overhead casting soft crimson light, sake bottles on dark wood shelves backlit, dark booth seating, moody crimson and amber palette, no people, editorial photography, 35mm full frame, no text",
      gallery: [
        "Close-up of a sushi chef's hands shaping a piece of nigiri on a dark wood counter, dim warm light highlighting the rice grains and tuna, blurred sake bottles in the background, behind-the-scenes editorial, 50mm shallow depth",
        "Detail shot of glowing red Japanese paper lanterns hanging in a row from a dark ceiling, crimson light pooling below on a polished black bar surface, moody atmospheric photography, 35mm",
        "Shelf of sake bottles backlit on dark wood, cedar shelving with hand-written kanji labels, subtle amber and crimson reflections, intimate izakaya mood, editorial detail, 50mm",
        "Two-person dark booth with a single hanging paper lantern overhead, lacquered black table with a small bowl of edamame and chopsticks, dim crimson light, no people, atmospheric, 35mm",
        "Top-down of a binchotan grill glowing orange-red in dim light, yakitori skewers smoking gently on top, bamboo skewer holder beside, dark wood counter, smoky moody photography, 50mm",
      ],
      dishes: [
        { itemName: "Tonkotsu ramen 14h cu chashu de porc", prompt: "Editorial overhead photo of a deep black ceramic bowl of cloudy-cream tonkotsu ramen, fresh wavy noodles visible, two pink-rimmed slices of pork chashu, perfectly halved soft-boiled egg with orange yolk, bamboo shoots, sheet of nori, scattered green scallions, crimson lantern light from above, 50mm" },
        { itemName: "Sashimi assortiment (12 felii)", prompt: "Top-down editorial of an assorted sashimi platter on a long dark wood board: marbled otoro tuna, hamachi yellowtail, salmon, dorade, salmon roe in a small dish, freshly grated wasabi, pickled ginger, edible green leaves, dim moody lighting, 50mm shallow depth of field" },
        { itemName: "Nigiri selection (8 piese)", prompt: "Three-quarter editorial shot of 8 nigiri arranged on a slate stone, varied toppings (tuna, salmon, yellowtail, eel with sauce glaze, shrimp, tamago, uni), dab of fresh wasabi on each, dim crimson ambient light, 50mm" },
        { itemName: "Wagyu tartare cu yakult de gălbenuș", prompt: "Editorial overhead of hand-cut A5 wagyu tartare in a small black ceramic bowl, glossy quail egg yolk in the center, julienne nori strips, pickled daikon, sesame oil drizzle, dark moody background, 50mm shallow depth of field" },
        { itemName: "Mochi cu înghețată matcha și hojicha", prompt: "Three-quarter view of two mochi balls (one bright matcha green, one warm hojicha brown) on a small dark slate plate, dusting of matcha powder, kintsugi-style accent, dim warm spotlight, intimate Japanese restaurant background blurred, 50mm" },
        { itemName: "Gyoza cu porc Iberico", prompt: "Editorial overhead of 5 perfectly pleated gyoza dumplings arranged in a circle on a dark ceramic plate, golden crisp bottoms, small dish of ponzu sauce with chili oil, fresh chives, dim warm light, 50mm shallow depth of field" },
      ],
    },
    ratingTarget: 4.8,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 4. Cafe Etage — Coffee/Brunch, $$, Universitate
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "cafe-etage",
    name: "Cafe Etage",
    ownerEmail: "demo-cafe-etage@tavli-supporting.invalid",
    citySlug: "bucuresti",
    cuisines: ["Coffee", "Brunch"],
    priceLevel: 2,
    zone: "Universitate",
    address: "Strada Edgar Quinet 8, Sector 1",
    lat: 44.4361,
    lng: 26.1037,
    capacity: 50,
    daysAgoCreated: 110,
    heroNote: "Cafea de specialitate prăjită aici. Mic dejun până la 14, Wi-Fi rapid.",
    description:
      "Cafenea pe două etaje cu prăjitorie proprie la subsol. Boabe proveniență directă din Etiopia (Yirgacheffe), Columbia (Huila) și Costa Rica (Tarrazú), prăjite săptămânal. Mic dejun toată ziua, Wi-Fi rapid pentru lucru, evenimente lunare de cupping deschise publicului. Spațiu cu lumină naturală, plante, mese din stejar deschis.",
    schedule: [
      { dayOfWeek: 1, openTime: "07:00", closeTime: "20:00" },
      { dayOfWeek: 2, openTime: "07:00", closeTime: "20:00" },
      { dayOfWeek: 3, openTime: "07:00", closeTime: "20:00" },
      { dayOfWeek: 4, openTime: "07:00", closeTime: "20:00" },
      { dayOfWeek: 5, openTime: "07:00", closeTime: "20:00" },
      { dayOfWeek: 6, openTime: "08:00", closeTime: "20:00" },
      { dayOfWeek: 0, openTime: "08:00", closeTime: "20:00" },
    ],
    availability: [
      { dayOfWeek: 1, startTime: "07:00", endTime: "20:00", capacity: 50 },
      { dayOfWeek: 2, startTime: "07:00", endTime: "20:00", capacity: 50 },
      { dayOfWeek: 3, startTime: "07:00", endTime: "20:00", capacity: 50 },
      { dayOfWeek: 4, startTime: "07:00", endTime: "20:00", capacity: 50 },
      { dayOfWeek: 5, startTime: "07:00", endTime: "20:00", capacity: 50 },
      { dayOfWeek: 6, startTime: "08:00", endTime: "20:00", capacity: 50 },
      { dayOfWeek: 0, startTime: "08:00", endTime: "20:00", capacity: 50 },
    ],
    menu: {
      heroNote: "Cafea prăjită la noi. Mic dejun până la 14, în fiecare zi.",
      sections: [
        { id: "cafele", name: "Cafele", intro: "Boabe single-origin, prăjite săptămânal la subsol. Întreabă-l pe barista despre lot.", orderIndex: 0 },
        { id: "mic-dejun", name: "Mic dejun", intro: "Disponibil până la 14:00. Cu pâine de casă din maia.", orderIndex: 1 },
        { id: "brunch", name: "Brunch", intro: "Pentru weekend (sau pentru cei norocoși care lucrează când vor).", orderIndex: 2 },
        { id: "patiserie", name: "Patiserie & deserturi", intro: "Coapte zilnic la patiseria de pe colț, exclusiv pentru noi.", orderIndex: 3 },
      ],
      items: [
        // Cafele
        { sectionId: "cafele", name: "Espresso", description: "Blend casa: 70% Brazilia Cerrado, 30% Etiopia Yirgacheffe. Note de cacao și citrice.", priceLei: 12, tags: ["vegan", "gluten-free"] },
        { sectionId: "cafele", name: "Cappuccino oat", description: "Espresso dublu, lapte de ovăz Oatly Barista, microfoam catifelată.", priceLei: 18, tags: ["vegan", "vegetarian"] },
        { sectionId: "cafele", name: "Latte Yirgacheffe", description: "Espresso single-origin Etiopia Yirgacheffe (note florale, citrice), lapte integral, art latte.", priceLei: 20, tags: ["vegetarian", "chef-pick"] },
        { sectionId: "cafele", name: "V60 Colombia Huila", description: "Filtrare manuală V60, boabe washed Huila, prăjită medium. 250ml, fără lapte. Note de caramel și prună.", priceLei: 22, tags: ["vegan", "gluten-free", "chef-pick"] },
        { sectionId: "cafele", name: "Cold brew în carafă (500ml)", description: "Boabe Costa Rica Tarrazú extrase la rece 18 ore, în carafă cu gheață. Pentru două persoane.", priceLei: 32, tags: ["vegan", "gluten-free"] },
        { sectionId: "cafele", name: "Matcha latte Uji", description: "Pulbere matcha ceremonială Uji din Kyoto, lapte integral sau ovăz, sirop de orez (opțional).", priceLei: 24, tags: ["vegetarian"] },
        { sectionId: "cafele", name: "Smoothie verde (kale, măr, ghimbir)", description: "Kale, măr verde, banană, ghimbir proaspăt, lămâie, lapte de migdale.", priceLei: 22, tags: ["vegan", "vegetarian", "gluten-free"] },
        // Mic dejun
        { sectionId: "mic-dejun", name: "Avocado toast cu cânepă și sumac", description: "Pâine de casă cu maia, avocado pisat, semințe de cânepă, sumac, ridichi felii, ulei de măsline.", priceLei: 38, tags: ["vegan", "vegetarian", "chef-pick"] },
        { sectionId: "mic-dejun", name: "Ouă Benedict cu somon afumat", description: "2 ouă poșate, somon afumat de la Aqua Carpatica, hollandaise cu lămâie, English muffin.", priceLei: 48, tags: ["popular"] },
        { sectionId: "mic-dejun", name: "Croque monsieur cu Comté", description: "Pâine de casă, Comté de 12 luni, șuncă de Praga, besciamel, gratinat la cuptor.", priceLei: 42, tags: [] },
        { sectionId: "mic-dejun", name: "Pancakes cu sirop de arțar și fructe de pădure", description: "3 pancakes pufoase, sirop de arțar Quebec grad A, fructe de pădure proaspete, unt topit.", priceLei: 36, tags: ["vegetarian", "popular"] },
        // Brunch
        { sectionId: "brunch", name: "Smoothie bowl cu açaí și granola", description: "Açaí brazilian, banană, lapte de cocos, granola de casă, fructe de pădure, fistic, miere.", priceLei: 42, tags: ["vegan", "vegetarian"] },
        { sectionId: "brunch", name: "Shakshuka cu feta și mărar", description: "Sos roșu de roșii cu ardei și chimion, 2 ouă coapte, feta sfărâmată, mărar, pâine prăjită.", priceLei: 44, tags: ["vegetarian", "spicy"] },
        { sectionId: "brunch", name: "Granola de casă cu iaurt grecesc și miere de salcâm", description: "Granola coaptă în casă cu nuci și fulgi de cocos, iaurt grecesc 10%, miere de salcâm, fructe.", priceLei: 32, tags: ["vegetarian"] },
        // Patiserie
        { sectionId: "patiserie", name: "Cinnamon roll cardamom", description: "Cinnamon roll suedez cu cardamom măcinat proaspăt, glasaj de cremă de brânză.", priceLei: 22, tags: ["vegetarian", "chef-pick"] },
        { sectionId: "patiserie", name: "Croissant cu unt francez", description: "Croissant cu unt francez Beurre d'Isigny, foile drepte, fragede, copt de dimineață.", priceLei: 18, tags: ["vegetarian"] },
        { sectionId: "patiserie", name: "Cheesecake cu fructe de pădure", description: "Cheesecake clasic, bază de biscuiți de cacao, topping de fructe de pădure proaspete.", priceLei: 28, tags: ["vegetarian"] },
        { sectionId: "patiserie", name: "Brownie cu nucă pecan și sare Maldon", description: "Brownie dens cu ciocolată 70%, nucă pecan caramelată, fulgi de sare Maldon.", priceLei: 24, tags: ["vegetarian"] },
      ],
    },
    reviews: [
      { firstName: "Daniel", rating: 5, daysAgo: 2, partySize: 1, comment: "Lucrez aici de 3 luni, vin și sâmbăta. V60 Colombia Huila dimineața — note de caramel exact cum spun cardurile. Wi-Fi rapid, prize la fiecare masă. Locul ideal de lucru.", zone: "Universitate" },
      { firstName: "Cosmina", rating: 5, daysAgo: 8, partySize: 2, comment: "Am venit la cuppingul lunar — m-a învățat să simt diferențele între washed și natural. Latte Yirgacheffe e cea mai bună cafea cu lapte din oraș." },
      { firstName: "George", rating: 4, daysAgo: 15, partySize: 3, comment: "Brunchul de duminică e plin până la 12 — vino devreme. Avocado toast cu cânepă — surprinzător de bun. Pancakes cu sirop de arțar — copilăria în farfurie." },
      { firstName: "Diana", rating: 5, daysAgo: 23, partySize: 1, comment: "Cinnamon roll cu cardamom + V60 — combinație care a făcut dimineața mea de luni suportabilă. Plante peste tot, lumină naturală mult, atmosferă scandinavică." },
      { firstName: "Mihai", rating: 5, daysAgo: 36, partySize: 2, comment: "Ouă Benedict cu somon afumat — hollandaise făcut perfect, fără grumeji. Cold brew în carafă pentru 2 — ne-a ținut toată dimineața. Servire prietenoasă, fără grabă." },
      { firstName: "Iulia", rating: 4, daysAgo: 49, partySize: 4, comment: "Sâmbătă dimineața e plin, am așteptat masa 20 min. Etajul 2 e mai liniștit decât parterul. Shakshuka — corect, dar puțin sub Frunză & Linguriță." },
    ],
    bestFor: ["Brunch de duminică", "Cafea de lucru", "Mic dejun cu prieteni"],
    photoPrompts: {
      hero: "Wide bright cinematic interior of a Scandinavian-minimal coffee shop in Bucharest at morning, light oak tables and chairs, exposed concrete pillars, large arched windows flooding the space with natural light, plants in terracotta pots on shelves, La Marzocco espresso machine on a marble counter, coffee bean bags on wooden shelves, two-floor open layout, no people, editorial photography, 35mm, no text",
      gallery: [
        "Close-up of a chrome La Marzocco espresso machine with a steaming portafilter pulling a shot, espresso flowing into a small white ceramic cup, soft morning window light from the side, blurred barista hand visible, editorial detail, 50mm",
        "Detail shot of a wooden shelf with rows of paper coffee bags from Ethiopia, Colombia, Costa Rica, hand-stamped origin labels, natural plant in foreground, bright morning light, 50mm shallow depth of field",
        "Top-down of a marble café table with a V60 pourover dripper mid-pour, a small ceramic carafe of black coffee, a cinnamon roll on a small plate, an open notebook and a laptop edge, soft morning light, 35mm",
        "Wide shot of the upper floor with light oak tables and chairs, large windows with sheer curtains, hanging plants in macramé, wood floor, two empty leather armchairs by a window, calm atmosphere, no people, 35mm",
        "Behind-the-scenes detail of a small commercial coffee roaster with green coffee beans being added, warm soft light, brick walls in the background, copper roaster body reflecting amber tones, editorial 50mm",
      ],
      dishes: [
        { itemName: "V60 Colombia Huila", prompt: "Three-quarter view of a V60 ceramic dripper sitting atop a small glass server with golden filtered coffee inside, a small white cup beside, scoop of medium roast beans, gooseneck kettle in soft focus background, bright morning window light, marble table, 50mm" },
        { itemName: "Avocado toast cu cânepă și sumac", prompt: "Editorial top-down of a thick slice of sourdough toast topped with smashed avocado, scattered green hemp seeds, dusting of red sumac, thin radish slices fanned across, drizzle of olive oil, on a stoneware plate, bright natural light, 50mm" },
        { itemName: "Ouă Benedict cu somon afumat", prompt: "Three-quarter view of two halves of an English muffin topped with smoked salmon ribbons, perfect poached eggs with glossy yolks dripping yellow, generous yellow hollandaise, fresh dill garnish, on a white plate, soft morning light, 50mm" },
        { itemName: "Cinnamon roll cardamom", prompt: "Top-down close-up of a single Swedish cinnamon roll with visible cardamom seeds in the dough swirl, glossy cream cheese drizzle on top, dusting of crushed cardamom, on a small ceramic plate beside an espresso cup, soft window light, 50mm shallow depth of field" },
        { itemName: "Pancakes cu sirop de arțar și fructe de pădure", prompt: "Editorial overhead of three fluffy stacked pancakes with maple syrup pouring down the side, fresh blueberries and raspberries scattered on top, a pat of melting butter, dusting of powdered sugar, white plate, bright natural light, 50mm" },
        { itemName: "Smoothie bowl cu açaí și granola", prompt: "Top-down of a thick deep-purple açaí bowl in a ceramic bowl, topped with banana slices, granola clusters, fresh raspberries and blueberries, pistachios, drizzle of honey, coconut flakes, bright morning light, 50mm" },
      ],
    },
    ratingTarget: 4.6,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 5. Frunză & Linguriță — Brunch/Vegetarian, $$, Cotroceni
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "frunza-si-lingurita",
    name: "Frunză & Linguriță",
    ownerEmail: "demo-frunza-si-lingurita@tavli-supporting.invalid",
    citySlug: "bucuresti",
    cuisines: ["Brunch", "Vegetarian"],
    priceLevel: 2,
    zone: "Cotroceni",
    address: "Strada Doctor Lister 32, Sector 5",
    lat: 44.4297,
    lng: 26.0641,
    capacity: 28,
    daysAgoCreated: 62,
    heroNote: "Brunch slow, plante de la fermieri, lumină de Cotroceni.",
    description:
      "Spațiu intim de 28 de locuri pentru brunch în weekend, cu legume aduse direct de la familia Stănescu (ferma Stejaru, lângă Călărași) și ouă de la Ileana din Vidra. În ultima duminică din lună schimbăm meniul cu un farmer-collab — fermierul gătește un fel cu produsele lui. Pereți albi, plăci de marmură, plante atârnate în macramé.",
    schedule: [
      { dayOfWeek: 3, openTime: "10:00", closeTime: "15:00" },
      { dayOfWeek: 4, openTime: "10:00", closeTime: "15:00" },
      { dayOfWeek: 5, openTime: "10:00", closeTime: "15:00" },
      { dayOfWeek: 6, openTime: "09:00", closeTime: "16:00" },
      { dayOfWeek: 0, openTime: "09:00", closeTime: "16:00" },
    ],
    availability: [
      { dayOfWeek: 3, startTime: "10:00", endTime: "15:00", capacity: 28 },
      { dayOfWeek: 4, startTime: "10:00", endTime: "15:00", capacity: 28 },
      { dayOfWeek: 5, startTime: "10:00", endTime: "15:00", capacity: 28 },
      { dayOfWeek: 6, startTime: "09:00", endTime: "16:00", capacity: 28 },
      { dayOfWeek: 0, startTime: "09:00", endTime: "16:00", capacity: 28 },
    ],
    menu: {
      heroNote: "Plante de la fermieri cu nume. Brunch fără grabă, până la 16.",
      sections: [
        { id: "smoothie", name: "Smoothie & sucuri", intro: "Stoarce zilnic, presat la rece, fără îndulcitori adăugați.", orderIndex: 0 },
        { id: "toasturi", name: "Toasturi", intro: "Pâine din maia, pe acasă fermentată, prăjită la comandă.", orderIndex: 1 },
        { id: "oua", name: "Ouă & vafe", intro: "Ouă de la Ileana din Vidra, vafe Belgian făcute pe loc.", orderIndex: 2 },
        { id: "cocktailuri", name: "Cocktailuri de zi", intro: "Pentru duminici lente. Mimosa la carafă.", orderIndex: 3 },
      ],
      items: [
        // Smoothies
        { sectionId: "smoothie", name: "Smoothie verde (spanac, măr verde, ghimbir)", description: "Spanac proaspăt, măr verde, banană, ghimbir proaspăt, mentă, lapte de migdale.", priceLei: 26, tags: ["vegan", "vegetarian", "gluten-free"] },
        { sectionId: "smoothie", name: "Smoothie roz (sfeclă, mango, lime)", description: "Sfeclă coaptă, mango, banană, lime, lapte de cocos, semințe de chia.", priceLei: 28, tags: ["vegan", "vegetarian", "gluten-free", "chef-pick"] },
        { sectionId: "smoothie", name: "Açaí bowl cu granola și fructe", description: "Açaí brazilian, banană, granola de casă, kiwi, fragi, fistic, miere de salcâm, fulgi de cocos.", priceLei: 38, tags: ["vegetarian", "popular"] },
        { sectionId: "smoothie", name: "Suc presat la rece (morcov, portocală, ghimbir, turmeric)", description: "Sucuri presate la rece azi dimineață. Morcov, portocală, ghimbir, turmeric, piper negru.", priceLei: 24, tags: ["vegan", "vegetarian", "gluten-free"] },
        // Toasturi
        { sectionId: "toasturi", name: "Avocado toast cu radish marinat și sumac", description: "Pâine din maia, avocado pisat, ridichi marinate, sumac, microverdețuri, semințe de cânepă.", priceLei: 38, tags: ["vegan", "vegetarian", "chef-pick"] },
        { sectionId: "toasturi", name: "Ricotta toast cu miere și nucă", description: "Pâine din maia, ricotta proaspătă bătută, miere de salcâm, nuci caramelate, cimbru.", priceLei: 36, tags: ["vegetarian"] },
        { sectionId: "toasturi", name: "Burrata toast cu roșii cherry coapte", description: "Pâine din maia, burrată din Puglia, roșii cherry coapte cu cimbru, busuioc, ulei de măsline.", priceLei: 46, tags: ["vegetarian", "chef-pick", "popular"] },
        { sectionId: "toasturi", name: "Toast cu ciuperci și ou poșat", description: "Pâine din maia, hribi sotați cu cimbru, ou poșat, parmigiano ras, mărar proaspăt.", priceLei: 42, tags: ["vegetarian"] },
        // Ouă & vafe
        { sectionId: "oua", name: "Ouă poșate cu hummus de mazăre și sumac", description: "2 ouă poșate de la Ileana, hummus de mazăre proaspătă, sumac, semințe de dovleac, pâine prăjită.", priceLei: 42, tags: ["vegetarian"] },
        { sectionId: "oua", name: "Shakshuka cu feta și mărar", description: "Sos de roșii cu ardei, chimion și paprika afumată, 2 ouă coapte, feta sfărâmată, mărar, pâine.", priceLei: 44, tags: ["vegetarian", "spicy", "popular"] },
        { sectionId: "oua", name: "Vafe Belgian cu fructe de pădure și mascarpone", description: "Vafe pufoase făcute pe loc, fructe de pădure proaspete, mascarpone, sirop de arțar.", priceLei: 38, tags: ["vegetarian", "chef-pick"] },
        { sectionId: "oua", name: "Pancakes cu lemon curd și fragi", description: "3 pancakes pufoase, lemon curd făcut în casă, fragi proaspeți, frunze de mentă, zahăr pudră.", priceLei: 36, tags: ["vegetarian"] },
        // Cocktailuri
        { sectionId: "cocktailuri", name: "Mimosa (carafă 500ml)", description: "Prosecco DOC, suc proaspăt de portocale roșii. Pentru două persoane.", priceLei: 58, tags: [] },
        { sectionId: "cocktailuri", name: "Bloody Mary cu țelină și ardei iute", description: "Vodka, suc de roșii, lămâie, sos Worcestershire, țelină proaspătă, ardei iute.", priceLei: 32, tags: ["spicy"] },
        { sectionId: "cocktailuri", name: "Aperol Spritz cu rozmarin", description: "Aperol, Prosecco, sifon, ramură de rozmarin proaspăt, portocală.", priceLei: 28, tags: ["vegetarian"] },
      ],
    },
    reviews: [
      { firstName: "Andra", rating: 5, daysAgo: 4, partySize: 2, comment: "Burrata toast cu roșii cherry coapte — duminica perfectă. Plantele de la ferma Stejaru se simt — roșiile au gust adevărat, nu de supermarket. Atmosferă caldă, lumină de Cotroceni.", zone: "Cotroceni" },
      { firstName: "Costin", rating: 5, daysAgo: 10, partySize: 3, comment: "Am prins farmer-collab cu Ileana din Vidra — a făcut o omletă cu ierburi din curtea ei. Experiență rară în București. Smoothie roz cu sfeclă — nebunie." },
      { firstName: "Valentina", rating: 5, daysAgo: 19, partySize: 2, comment: "Brunchul nostru de sâmbătă regulat. Vafe Belgian cu mascarpone — soțul meu nu mai poate fără. Mimosa la carafă — ne ține dimineața toată." },
      { firstName: "Vlad", rating: 4, daysAgo: 31, partySize: 4, comment: "Avocado toast cu sumac — făcut cu grijă, ridichi marinate îi dau accent. Locul e mic, doar 28 de locuri — rezervare obligatoriu sâmbătă-duminică. A meritat așteptarea." },
      { firstName: "Cosmina", rating: 5, daysAgo: 44, partySize: 2, comment: "Pancakes cu lemon curd — cel mai bun lemon curd din oraș, făcut clar în casă. Atmosferă slow, fără muzică tare, cu plante peste tot. Locul ăsta e o terapie." },
      { firstName: "Adrian", rating: 5, daysAgo: 56, partySize: 3, comment: "Shakshuka cu feta — ouăle încă tremurau, sosul cu chimion și boia afumată — nivelul Tel Aviv. Suc presat la rece cu turmeric — exact ce-mi trebuia după sâmbătă." },
    ],
    bestFor: ["Brunch de duminică", "Întâlnire cu prieteni", "Mic dejun lent"],
    photoPrompts: {
      hero: "Wide bright cinematic interior of a small intimate brunch café in Cotroceni at morning, white tile walls with brass accents, marble counter with display of pastries, large mirrors reflecting natural light, hanging plants in macramé from the ceiling, fresh flowers in bud vases on small marble tables, light wood floors, soft morning light from large windows, no people, editorial photography, 35mm, no text",
      gallery: [
        "Detail of fresh flowers in slim glass bud vases on a small marble table, light playing through morning window, soft pastel color palette, bright natural light, editorial close-up, 50mm shallow depth of field",
        "Top-down of a marble counter laden with bowls of fresh seasonal vegetables (radishes, peas, cherry tomatoes, herbs), a knife on a wooden board, soft morning light, behind-the-scenes editorial, 35mm",
        "Hanging plants in macramé hangers in front of a large arched window with sheer curtains, sun streaming through, light oak chair below with a folded newspaper, no people, calm atmospheric photography, 35mm",
        "Close-up of pastel pink and mint ceramic plates stacked on an open white shelf, fresh herbs in a small clay pot beside, bright morning light reflecting off polished surfaces, editorial detail, 50mm",
        "Wide shot of the brunch counter with two baristas making coffee in soft focus, marble countertop in foreground with a freshly poured matcha latte and a small floral arrangement, large mirror reflecting the room, bright natural light, 35mm",
      ],
      dishes: [
        { itemName: "Burrata toast cu roșii cherry coapte", prompt: "Editorial top-down of a thick sourdough toast topped with creamy torn burrata, glossy roasted cherry tomatoes still on the vine, fresh basil leaves, drizzle of green olive oil, scatter of flaky sea salt, on a pastel ceramic plate, bright morning light, 50mm" },
        { itemName: "Avocado toast cu radish marinat și sumac", prompt: "Three-quarter view of sourdough toast layered with smashed avocado, thin pickled pink radish slices fanned across, dusting of red sumac, microgreens, hemp seeds, on a marble surface with a small dish of olive oil beside, bright window light, 50mm" },
        { itemName: "Smoothie roz (sfeclă, mango, lime)", prompt: "Three-quarter view of a tall glass of vivid magenta-pink beet-mango smoothie with a striped paper straw, lime wedge on the rim, scattered chia seeds floating on top, on a small marble table with fresh flowers in a bud vase, bright morning light, 50mm" },
        { itemName: "Vafe Belgian cu fructe de pădure și mascarpone", prompt: "Editorial overhead of two golden Belgian waffles dusted with powdered sugar, generous quenelle of white mascarpone, scattered fresh raspberries, blueberries, blackberries, drizzle of maple syrup, mint leaf, pastel ceramic plate, bright natural light, 50mm" },
        { itemName: "Shakshuka cu feta și mărar", prompt: "Three-quarter view of a small cast-iron skillet of bubbling red shakshuka with two perfectly cooked eggs nestled in the sauce, crumbled white feta scattered on top, fresh dill, slice of toasted sourdough beside, bright natural light, 50mm shallow depth of field" },
        { itemName: "Açaí bowl cu granola și fructe", prompt: "Top-down of a deep purple açaí bowl in a ceramic bowl, layered with granola clusters, banana slices, kiwi rounds, fresh strawberries, scattered pistachios, drizzle of honey, coconut flakes, on a marble surface with fresh flowers nearby, bright morning light, 50mm" },
      ],
    },
    ratingTarget: 4.7,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 6. The Hop & Hammer — Burger/American, $$, Băneasa
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "the-hop-and-hammer",
    name: "The Hop & Hammer",
    ownerEmail: "demo-the-hop-and-hammer@tavli-supporting.invalid",
    citySlug: "bucuresti",
    cuisines: ["Burger", "American"],
    priceLevel: 2,
    zone: "Băneasa",
    address: "Șoseaua Pipera-Tunari 198, Sector 1",
    lat: 44.5063,
    lng: 26.0824,
    capacity: 80,
    daysAgoCreated: 135,
    heroNote: "Smash burgers gătite pe gril fierbinte. 12 IPA-uri la robinet, schimbate săptămânal.",
    description:
      "Gastropub industrial pe două etaje, cu 80 de locuri și o terasă acoperită. Smash burgers din vită Black Angus de la o fermă de familie din Banat, 12 robinete cu IPA românești rotative — Hop Hooligans, Bereta, Ground Zero, Ground Hog. La etajul doi, sâmbăta seara, cântă blues local. Bucătăria pleacă de la 12, kitchen-late până la 1 noaptea.",
    schedule: [
      { dayOfWeek: 1, openTime: "12:00", closeTime: "01:00" },
      { dayOfWeek: 2, openTime: "12:00", closeTime: "01:00" },
      { dayOfWeek: 3, openTime: "12:00", closeTime: "01:00" },
      { dayOfWeek: 4, openTime: "12:00", closeTime: "01:00" },
      { dayOfWeek: 5, openTime: "12:00", closeTime: "01:00" },
      { dayOfWeek: 6, openTime: "12:00", closeTime: "01:00" },
      { dayOfWeek: 0, openTime: "12:00", closeTime: "01:00" },
    ],
    availability: [
      { dayOfWeek: 1, startTime: "12:00", endTime: "01:00", capacity: 80 },
      { dayOfWeek: 2, startTime: "12:00", endTime: "01:00", capacity: 80 },
      { dayOfWeek: 3, startTime: "12:00", endTime: "01:00", capacity: 80 },
      { dayOfWeek: 4, startTime: "12:00", endTime: "01:00", capacity: 80 },
      { dayOfWeek: 5, startTime: "12:00", endTime: "01:00", capacity: 80 },
      { dayOfWeek: 6, startTime: "12:00", endTime: "01:00", capacity: 80 },
      { dayOfWeek: 0, startTime: "12:00", endTime: "01:00", capacity: 80 },
    ],
    menu: {
      heroNote: "Smash burgers și 12 IPA-uri rotative. Sâmbătă seara — blues live.",
      sections: [
        { id: "aperitive", name: "Aperitive", intro: "Pentru deschidere și pentru împărțit pe la mese.", orderIndex: 0 },
        { id: "burgeri", name: "Burger-uri", intro: "Vită Black Angus de la o fermă de familie din Banat, smash pe gril fierbinte.", orderIndex: 1 },
        { id: "side", name: "Garnituri", intro: "Pentru a întregi farfuria. De împărțit la masă.", orderIndex: 2 },
        { id: "bauturi", name: "Bere & cocktailuri", intro: "12 IPA-uri rotative la robinet, schimbate săptămânal.", orderIndex: 3 },
      ],
      items: [
        // Aperitive
        { sectionId: "aperitive", name: "Wings buffalo cu blue cheese", description: "8 aripioare marinate, prăjite, glasate cu sos buffalo, dip de blue cheese, țelină.", priceLei: 42, tags: ["spicy", "popular"] },
        { sectionId: "aperitive", name: "Cartofi pai cu aioli de usturoi", description: "Cartofi prăjiți de două ori, sare grunjoasă, dip de aioli făcut cu mâna.", priceLei: 22, tags: ["vegetarian"] },
        { sectionId: "aperitive", name: "Onion rings cu chipotle ranch", description: "Inele groase de ceapă, paneură crocantă, dip ranch cu chipotle afumat.", priceLei: 28, tags: ["vegetarian", "spicy"] },
        { sectionId: "aperitive", name: "Mozzarella sticks cu sos marinara", description: "6 batoane de mozzarella, paneură cu pesmet panko, sos marinara cu busuioc.", priceLei: 32, tags: ["vegetarian"] },
        { sectionId: "aperitive", name: "Loaded fries cu bacon și cheddar topit", description: "Cartofi pai, cheddar topit, bacon prăjit crocant, ceapă verde, sos jalapeño.", priceLei: 38, tags: ["spicy", "popular"] },
        // Burgeri
        { sectionId: "burgeri", name: "Classic Cheeseburger", description: "180g vită Black Angus smash, cheddar topit, bacon afumat, ceapă caramelată, salată, roșii, sos casa, chiflă brioche.", priceLei: 56, tags: ["popular", "chef-pick"] },
        { sectionId: "burgeri", name: "Smokestack Burger (BBQ)", description: "180g vită smash, BBQ casei, jalapeños murați, cheddar dublu, ceapă crocantă, chiflă brioche.", priceLei: 62, tags: ["spicy", "chef-pick"] },
        { sectionId: "burgeri", name: "Truffle Burger cu Brie și ulei trufe", description: "180g vită smash, brie topit, rucola, ceapă caramelată, ulei de trufe negre, maioneză trufe, chiflă brioche.", priceLei: 78, tags: ["chef-pick"] },
        { sectionId: "burgeri", name: "Double Smash Cheese", description: "Două chiftele 100g vită smash, cheddar topit dublu, ceapă carameloasă, sos casa, chiflă brioche.", priceLei: 68, tags: ["popular"] },
        { sectionId: "burgeri", name: "Vegan Beyond Burger", description: "Beyond Meat 180g, brânză vegană, salată, roșii, ceapă roșie, sos vegan special, chiflă vegană.", priceLei: 58, tags: ["vegan", "vegetarian"] },
        { sectionId: "burgeri", name: "BBQ Pulled Pork Mangalița 12h", description: "Porc Mangalița afumat 12 ore, BBQ casei, coleslaw cu mărar, jalapeños, chiflă brioche.", priceLei: 64, tags: ["chef-pick", "popular"] },
        // Side
        { sectionId: "side", name: "Sweet potato fries cu sos miere-muștar", description: "Cartofi dulci pai, sare cu rozmarin, dip miere-muștar.", priceLei: 24, tags: ["vegetarian"] },
        { sectionId: "side", name: "Coleslaw cu mărar și ceapă verde", description: "Varză albă și roșie tăiată subțire, morcov, mărar, maioneză cu lămâie.", priceLei: 18, tags: ["vegetarian", "gluten-free"] },
        { sectionId: "side", name: "Mac & cheese cu trei brânzeturi", description: "Macaroane cu cheddar, gruyère și parmezan, gratinate cu pesmet panko.", priceLei: 28, tags: ["vegetarian"] },
        // Băuturi
        { sectionId: "bauturi", name: "Hop Hooligans IPA la robinet (500ml)", description: "Săptămâna asta — Hop Hooligans Apex Predator, IPA cu Citra și Mosaic, 6.5%.", priceLei: 26, tags: ["popular"] },
        { sectionId: "bauturi", name: "Bereta NEIPA la robinet (500ml)", description: "New England IPA cu Galaxy și Nelson Sauvin, troublé, 6.2%.", priceLei: 28, tags: [] },
        { sectionId: "bauturi", name: "Ground Zero Pilsner la robinet (500ml)", description: "Pilsner cehesc clasic, lager, 4.8%, pentru pauze între IPA-uri.", priceLei: 22, tags: [] },
        { sectionId: "bauturi", name: "Negroni clasic", description: "Campari, Cinzano Rosso, Tanqueray gin, gheață, felie de portocală.", priceLei: 32, tags: [] },
        { sectionId: "bauturi", name: "Brownie cu vanilie și sare Maldon", description: "Brownie cald, înghețată de vanilie Madagascar, sare Maldon, sos de ciocolată topită.", priceLei: 28, tags: ["vegetarian"] },
      ],
    },
    reviews: [
      { firstName: "Călin", rating: 5, daysAgo: 6, partySize: 4, comment: "Smokestack Burger — jalapeños murați și BBQ casei, fix combinația ideală. Hop Hooligans Apex Predator de la robinet a fost decizia serii. Sâmbătă seara cu blues live la etaj — vibe perfect.", zone: "Băneasa" },
      { firstName: "Răzvan", rating: 5, daysAgo: 14, partySize: 6, comment: "Venim cu echipa în fiecare vineri. Loaded fries pentru toată lumea, Double Smash Cheese pentru cei flămânzi. 12 IPA-uri rotative — am încercat 5 și încă mai venim." },
      { firstName: "Iulia", rating: 4, daysAgo: 22, partySize: 2, comment: "Truffle Burger cu brie — surprinzător de subtil pentru un loc industrial. BBQ Pulled Pork Mangalița — făcut cum trebuie, 12 ore se simt. Singurul minus: zgomotos sâmbăta seara." },
      { firstName: "Bogdan", rating: 5, daysAgo: 35, partySize: 3, comment: "Beyond Burger pentru iubita vegană — nu s-a simțit pe locul al doilea. Wings buffalo + blue cheese, classic. Bereta NEIPA — galaxy hopuri se simt. Locul are personalitate." },
      { firstName: "Andrei", rating: 4, daysAgo: 48, partySize: 5, comment: "Vinerea seara plin, am așteptat masa 25 min — meritat. Onion rings + chipotle ranch — mâncare de bar la nivel. Brownie cu sare Maldon — finalul perfect." },
      { firstName: "Daniel", rating: 5, daysAgo: 67, partySize: 2, comment: "Sweet potato fries cu miere-muștar — combinația de care nu știam că am nevoie. Negroni servit corect, nu diluat. Bartender știe ce face. Atmosfera industrială fără să fie kitsch." },
      { firstName: "George", rating: 4, daysAgo: 89, partySize: 4, comment: "Mac & cheese cu trei brânzeturi — un side dish de care vorbim încă. Smash technique se simte, marginile crocante. Prețuri OK pentru zona Băneasa." },
    ],
    bestFor: ["Aperitiv după muncă", "Cină în grup", "Întâlnire cu prieteni"],
    photoPrompts: {
      hero: "Wide cinematic interior of a moody industrial gastropub at evening, exposed brick walls and overhead pipes, polished dark walnut bar lined with 12 chrome beer taps, neon \"Hop & Hammer\" sign in red glowing on the back wall, leather booth seating, vintage Edison bulbs hanging on dark cords, smoky atmospheric lighting, no people, editorial photography, 35mm full frame, no text",
      gallery: [
        "Close-up of 12 chrome beer taps in a row on a dark walnut bar, glistening glass of amber IPA being poured into a tulip glass beneath, beer foam visible, warm tungsten light from above, editorial detail, 50mm shallow depth of field",
        "Detail shot of a glowing red neon \"Hop & Hammer\" sign mounted on dark exposed brick, hammered copper accents on a wooden panel beside, dim atmospheric light, moody industrial photography, 35mm",
        "Wide shot of upper-floor blues stage with a vintage microphone and stool, exposed pipes overhead, leather booths in soft focus background, dim warm spotlight on the stage, no people, atmospheric, 35mm",
        "Top-down of a polished dark wood bar table with a glass of NEIPA, a small wooden board with charcuterie, a candle in a metal holder, condensation on the glass catching warm light, 50mm",
        "Behind-the-scenes detail of the kitchen pass with a chef smashing a beef patty on a hot flat-top grill, sizzle and steam rising, melting cheese on top, blurred warm orange flame light, editorial 50mm",
      ],
      dishes: [
        { itemName: "Classic Cheeseburger", prompt: "Editorial top-down of a perfectly seared smashed beef burger on a glossy brioche bun, lacy melted cheddar dripping over caramelized onions and crispy bacon, fresh lettuce and tomato peeking out, on a dark walnut wood board, warm tungsten lighting from above, smoky industrial gastropub atmosphere visible blurred behind, 50mm shallow depth of field" },
        { itemName: "Smokestack Burger (BBQ)", prompt: "Three-quarter view of a beef burger with charred edges, glossy BBQ sauce dripping down, pickled jalapeños scattered on top, double cheddar melting over, crispy fried onions, brioche bun glistening, on a dark wood board, smoky moody light, 50mm" },
        { itemName: "Truffle Burger cu Brie și ulei trufe", prompt: "Editorial three-quarter of a beef burger with melting wedge of brie cheese on top, a few rocket leaves, drizzle of dark truffle oil pooling, caramelized onions visible, golden brioche bun, on slate board with shaved black truffle beside, warm dim light, 50mm shallow depth of field" },
        { itemName: "BBQ Pulled Pork Mangalița 12h", prompt: "Top-down of a brioche bun overflowing with shreds of glistening BBQ pulled pork, glossy mahogany sauce, mound of dill coleslaw spilling out, scattered pickled jalapeños, on a dark wood board, smoky atmosphere visible blurred, warm tungsten light, 50mm" },
        { itemName: "Loaded fries cu bacon și cheddar topit", prompt: "Editorial overhead of a metal basket of golden fries piled high, generously covered in melted orange cheddar, scattered crispy bacon bits, sliced green onions, drizzle of jalapeño sauce, on dark wood, atmospheric warm light, 50mm" },
        { itemName: "Hop Hooligans IPA la robinet (500ml)", prompt: "Three-quarter close-up of a tall tulip pint glass full of hazy amber IPA with thick white foam head, condensation droplets running down, blurred row of beer taps in the background, dim atmospheric warm light, dark wood bar surface, 50mm shallow depth of field" },
      ],
    },
    ratingTarget: 4.5,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 7. Pizzeria Margherita — Pizza/Italian, $$, Pipera
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "pizzeria-margherita",
    name: "Pizzeria Margherita",
    ownerEmail: "demo-pizzeria-margherita@tavli-supporting.invalid",
    citySlug: "bucuresti",
    cuisines: ["Pizza", "Italian"],
    priceLevel: 2,
    zone: "Pipera",
    address: "Calea Floreasca 159, Sector 1",
    lat: 44.4953,
    lng: 26.1192,
    capacity: 70,
    daysAgoCreated: 85,
    heroNote: "Aluat fermentat 48 de ore. Cuptor cu lemne la 480°. Pizza scoasă în 90 de secunde.",
    description:
      "Pizzeria napoletana cu cuptor de lemn de fag, încins la 480°C. Aluatul nostru fermentează la rece 48 de ore — cojile sunt aerate, ușoare, ușor digerabile. San Marzano DOP, mozzarella di bufala adusă săptămânal din Campania, busuioc tăiat de pe acoperiș. Pizzaiolul Marco a învățat la Napoli. 70 de locuri — terasă vara.",
    schedule: [
      { dayOfWeek: 3, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 4, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 5, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 6, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 0, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 1, openTime: "12:00", closeTime: "23:00" },
    ],
    availability: [
      { dayOfWeek: 3, startTime: "12:00", endTime: "23:00", capacity: 70 },
      { dayOfWeek: 4, startTime: "12:00", endTime: "23:00", capacity: 70 },
      { dayOfWeek: 5, startTime: "12:00", endTime: "23:00", capacity: 70 },
      { dayOfWeek: 6, startTime: "12:00", endTime: "23:00", capacity: 70 },
      { dayOfWeek: 0, startTime: "12:00", endTime: "23:00", capacity: 70 },
      { dayOfWeek: 1, startTime: "12:00", endTime: "23:00", capacity: 70 },
    ],
    menu: {
      heroNote: "Aluat 48 ore, cuptor 480°. Mozzarella di bufala săptămânal din Campania.",
      sections: [
        { id: "antipasti", name: "Antipasti", intro: "De împărțit înainte de pizza, cu un pahar de Lambrusco rece.", orderIndex: 0 },
        { id: "rosse", name: "Pizza Rosse", intro: "Pe bază de roșii San Marzano DOP. Cojile coapte 90 de secunde.", orderIndex: 1 },
        { id: "bianche", name: "Pizza Bianche", intro: "Fără sos de roșii. Pentru cei care vor altceva.", orderIndex: 2 },
        { id: "dolci", name: "Dolci", intro: "Două dulciuri italienești, ambele importate de la pasticceria.", orderIndex: 3 },
      ],
      items: [
        // Antipasti
        { sectionId: "antipasti", name: "Antipasto della casa (pentru 2)", description: "Selecție de mezeluri (prosciutto crudo, salame Felino, mortadella) și brânzeturi (pecorino, gorgonzola), grissini, măsline taggiasche, miere de smochine.", priceLei: 78, tags: ["popular"] },
        { sectionId: "antipasti", name: "Bruschetta cu roșii și busuioc", description: "Pâine prăjită cu usturoi, roșii San Marzano cubulețe, busuioc proaspăt, ulei de măsline, sare grunjoasă.", priceLei: 28, tags: ["vegan", "vegetarian"] },
        { sectionId: "antipasti", name: "Burrata cu prosciutto crudo și smochine", description: "Burrată pugliese, prosciutto crudo Parma, smochine proaspete (sezon), busuioc, ulei de măsline.", priceLei: 56, tags: ["chef-pick"] },
        { sectionId: "antipasti", name: "Caprese cu mozzarella di bufala", description: "Mozzarella di bufala DOP, roșii San Marzano feliate, busuioc proaspăt de pe acoperiș, ulei de măsline.", priceLei: 42, tags: ["vegetarian", "gluten-free"] },
        // Pizza Rosse
        { sectionId: "rosse", name: "Pizza Margherita", description: "San Marzano DOP, mozzarella di bufala, busuioc proaspăt, ulei de măsline. Clasica napoletană.", priceLei: 42, tags: ["vegetarian", "popular", "chef-pick"] },
        { sectionId: "rosse", name: "Pizza Marinara", description: "San Marzano DOP, usturoi, oregano, ulei de măsline. Fără brânză — pizza de pescari, cea mai veche.", priceLei: 32, tags: ["vegan", "vegetarian"] },
        { sectionId: "rosse", name: "Pizza Diavola", description: "San Marzano, mozzarella fior di latte, salam picant Calabrese, ardei iute, ulei picant.", priceLei: 52, tags: ["spicy", "popular"] },
        { sectionId: "rosse", name: "Pizza Capricciosa", description: "San Marzano, mozzarella, prosciutto cotto, ciuperci, anghinare la borcan, măsline negre, ou.", priceLei: 56, tags: [] },
        { sectionId: "rosse", name: "Pizza Quattro Formaggi", description: "Bază roșie ușoară, mozzarella di bufala, gorgonzola dolce, parmezan ras, ricotta picurată.", priceLei: 58, tags: ["vegetarian"] },
        // Pizza Bianche
        { sectionId: "bianche", name: "Pizza Bianca cu Tartufo", description: "Bază albă cu mozzarella di bufala, ciuperci porcini, ulei de trufe negre, parmezan, rucola.", priceLei: 78, tags: ["vegetarian", "chef-pick"] },
        { sectionId: "bianche", name: "Pizza Bianca cu Mortadella și fistic", description: "Bază albă, mozzarella, mortadella di Bologna, fistic de Bronte tocat grosier, lămâie rasă, rucola.", priceLei: 68, tags: ["chef-pick", "popular"] },
        { sectionId: "bianche", name: "Pizza Bianca cu Salsiccia și friarielli", description: "Bază albă, mozzarella, cârnați italieni, friarielli (broccoli rabe), usturoi, ardei iute.", priceLei: 62, tags: ["spicy"] },
        // Dolci
        { sectionId: "dolci", name: "Tiramisù della casa", description: "Mascarpone, savoiardi muiate în espresso și Marsala, cacao amaruie. Făcut zilnic.", priceLei: 28, tags: ["vegetarian", "popular"] },
        { sectionId: "dolci", name: "Cannoli siciliani cu ricotta și fistic", description: "Coji crocante umplute la comandă cu ricotta îndulcită, fistic de Bronte, ciocolată neagră.", priceLei: 26, tags: ["vegetarian"] },
        // Băuturi
        { sectionId: "dolci", name: "Lambrusco rosso (carafă 500ml)", description: "Lambrusco di Sorbara, vin roșu spumant, servit rece. Se potrivește cu pizza Diavola.", priceLei: 56, tags: [] },
        { sectionId: "dolci", name: "Aperol Spritz", description: "Aperol, Prosecco, sifon, felie de portocală.", priceLei: 26, tags: [] },
      ],
    },
    reviews: [
      { firstName: "Andrei", rating: 5, daysAgo: 5, partySize: 4, comment: "Pizza Margherita — exact ca în Naples. Coja aerată, marginea pufoasă, ușor afumată. Mozzarella di bufala se vede că e proaspătă, are gust dulceag. La 42 lei e raport corect.", zone: "Pipera" },
      { firstName: "Ana", rating: 5, daysAgo: 12, partySize: 2, comment: "Pizza Bianca cu Mortadella și fistic — combinația de care nu mă mai satur. Lămâia rasă peste schimbă tot. Tiramisù făcut în casă — cremos, nu uscat ca în alte locuri." },
      { firstName: "Tudor", rating: 4, daysAgo: 20, partySize: 6, comment: "Cu copii — locul e mare, zgomotos, dar pizzaolul Marco a făcut o margherita simplă pentru cea mică, fără probleme. Quattro Formaggi pentru adulți, nivelul e ridicat." },
      { firstName: "Mihaela", rating: 5, daysAgo: 30, partySize: 2, comment: "Pizza Bianca cu Tartufo — un pic scumpă (78 lei), dar uleiul de trufe e adevărat și porcini se simt. Lambrusco la carafă a făcut casă perfectă." },
      { firstName: "Vlad", rating: 5, daysAgo: 42, partySize: 5, comment: "Cuptorul cu lemne se vede de la intrare, flacăra portocalie. Pizza scoasă în 90 secunde, exact cum scrie pe site. Diavola pentru iubitorii de picant — salam Calabrese e cheia." },
      { firstName: "Cosmin", rating: 4, daysAgo: 58, partySize: 3, comment: "Antipasto della casa pentru deschidere — porție generoasă pentru 2. Pizza Capricciosa — clasica perfectă, anghinarea la borcan e bună. Servire poate ușor lentă vinerea seara." },
      { firstName: "Smaranda", rating: 5, daysAgo: 71, partySize: 2, comment: "Burrata cu smochine proaspete (era sezon)— una dintre cele mai bune farfurii din ultimul timp. Cannoli umplut la comandă — fistic de Bronte adevărat, simt diferența." },
    ],
    bestFor: ["Familie", "Prânz rapid", "Cină în grup"],
    photoPrompts: {
      hero: "Wide cinematic interior of a Neapolitan pizzeria at dinnertime, white tile walls with green basil-leaf accents, large wood-fired oven dome on the back wall with bright orange flames glowing inside, marble pizza prep counter in foreground dusted with flour, fresh basil bunches in copper pots, warm orange firelight mixing with tungsten ambient light, dark wood tables, no people, editorial photography, 35mm full frame, no text",
      gallery: [
        "Close-up of the open wood-fired oven with leaping orange flames, a pizza on a long wooden peel about to enter the oven, dramatic firelight reflecting off the dome, warm orange glow, atmospheric editorial photography, 50mm shallow depth of field",
        "Detail of a marble counter with flour dust, fresh dough balls in a row, a wooden rolling pin and a pizza cutter, fresh basil bunch and a can of San Marzano tomatoes nearby, soft warm light, behind-the-scenes editorial, 50mm",
        "Top-down of a wooden pizza paddle leaving the oven with a freshly baked Margherita, charred leopard-spotted crust visible, basil leaves still glistening, embers in the oven mouth visible, warm orange glow, 35mm",
        "Wide shot of a brick rooftop herb garden with rows of basil plants in terracotta pots, large windows looking down on the pizzeria below, warm afternoon light, editorial atmospheric, no people, 35mm",
        "Detail of a glass of red Lambrusco on a dark wood table with a partly eaten pizza in soft focus background, warm tungsten and firelight mixing, intimate trattoria atmosphere, 50mm",
      ],
      dishes: [
        { itemName: "Pizza Margherita", prompt: "Editorial top-down of a Neapolitan Margherita pizza on a wooden board, leopard-spotted charred crust with airy puffy edges, vivid red San Marzano tomato sauce, melted creamy white mozzarella di bufala, scattered fresh whole basil leaves, drizzle of green olive oil, warm orange firelight from the side, 50mm" },
        { itemName: "Pizza Bianca cu Tartufo", prompt: "Three-quarter view of a white-base pizza with melted mozzarella, scattered porcini mushrooms, fresh rocket leaves piled in the center, generous shavings of black truffle on top, drizzle of dark truffle oil, charred Neapolitan crust, warm light, 50mm" },
        { itemName: "Pizza Bianca cu Mortadella și fistic", prompt: "Top-down of a Neapolitan white pizza with delicate slices of pink mortadella draped artfully across, scattered crushed pistachios in vivid green, microbasil leaves, lemon zest, charred crust visible, warm light, 50mm shallow depth of field" },
        { itemName: "Pizza Diavola", prompt: "Editorial overhead of a Neapolitan pizza with red San Marzano sauce, melted mozzarella, slices of pepperoni-style spicy salami curled with hot oil pooling on top, scattered red chili flakes, charred leopard-spotted crust, warm orange light, 50mm" },
        { itemName: "Burrata cu prosciutto crudo și smochine", prompt: "Top-down of a creamy whole burrata cheese torn open in the center on a marble surface, draped with translucent ribbons of pink prosciutto, halved fresh purple figs glistening, fresh basil leaves, drizzle of olive oil, soft warm light, 50mm shallow depth of field" },
        { itemName: "Tiramisù della casa", prompt: "Three-quarter view of a single portion of tiramisù in a small glass coffee cup, layered savoiardi and creamy mascarpone, generously dusted dark cocoa powder on top, espresso cup beside, candlelit Italian pizzeria background blurred, warm tungsten light, 50mm" },
      ],
    },
    ratingTarget: 4.6,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 8. Taverna Egeea — Greek/Mediterranean, $$, Herăstrău
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "taverna-egeea",
    name: "Taverna Egeea",
    ownerEmail: "demo-taverna-egeea@tavli-supporting.invalid",
    citySlug: "bucuresti",
    cuisines: ["Greek", "Mediterranean"],
    priceLevel: 2,
    zone: "Herăstrău",
    address: "Bd. Ion Mihalache 25, Sector 1",
    lat: 44.4733,
    lng: 26.0822,
    capacity: 90,
    daysAgoCreated: 170,
    heroNote: "Mezze-uri și grătar, vedere la Herăstrău. Pește prins astăzi.",
    description:
      "Tavernă inspirată din Mykonos, cu 55 de locuri în interior și o terasă acoperită de 35 cu vedere directă la lacul Herăstrău. Feta de la insulele Cycladice, octopod proaspăt din Mediterana, doradă din Marea Neagră adusă zilnic. Listă de vinuri grecești (Assyrtiko, Agiorgitiko) și flighturi de ouzo. Atmosferă albastru-alb, lemn cuprat, bougainvillea pe pereți.",
    schedule: [
      { dayOfWeek: 2, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 3, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 4, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 5, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 6, openTime: "12:00", closeTime: "23:00" },
      { dayOfWeek: 0, openTime: "12:00", closeTime: "23:00" },
    ],
    availability: [
      { dayOfWeek: 2, startTime: "12:00", endTime: "23:00", capacity: 90 },
      { dayOfWeek: 3, startTime: "12:00", endTime: "23:00", capacity: 90 },
      { dayOfWeek: 4, startTime: "12:00", endTime: "23:00", capacity: 90 },
      { dayOfWeek: 5, startTime: "12:00", endTime: "23:00", capacity: 90 },
      { dayOfWeek: 6, startTime: "12:00", endTime: "23:00", capacity: 90 },
      { dayOfWeek: 0, startTime: "12:00", endTime: "23:00", capacity: 90 },
    ],
    menu: {
      heroNote: "Pește prins azi, vedere la Herăstrău. Flight de ouzo — 38 lei.",
      sections: [
        { id: "mezze", name: "Mezze", intro: "Pe masă, de împărțit, cu pâine pita caldă. Așa începe orice cină grecească.", orderIndex: 0 },
        { id: "salate", name: "Salate", intro: "Cu telemea de Mykonos și ulei de măsline Kalamata.", orderIndex: 1 },
        { id: "principale", name: "Pește & fructe de mare", intro: "Pește prins în dimineața zilei. Întreabă de specialitate.", orderIndex: 2 },
        { id: "dulciuri", name: "Dulciuri", intro: "Două dulciuri grecești cu miere de Creta.", orderIndex: 3 },
      ],
      items: [
        // Mezze
        { sectionId: "mezze", name: "Tzatziki cu castravete și mărar", description: "Iaurt grecesc 10%, castravete ras stors, usturoi pisat, mărar, ulei de măsline, oțet de vin alb. Servit cu pita caldă.", priceLei: 22, tags: ["vegetarian", "gluten-free"] },
        { sectionId: "mezze", name: "Hummus de mazăre cu sumac", description: "Hummus din mazăre verde proaspătă, tahini, lămâie, sumac, ulei de măsline, semințe de dovleac.", priceLei: 26, tags: ["vegan", "vegetarian"] },
        { sectionId: "mezze", name: "Saganaki cu lămâie și miere", description: "Brânză kefalograviera prăjită în tigaie, miere de timian, susan, felie de lămâie. Servit fierbinte.", priceLei: 38, tags: ["vegetarian", "chef-pick"] },
        { sectionId: "mezze", name: "Dolmades (foi de viță umplute)", description: "Foi de viță umplute cu orez, mărar, mentă și ceapă, gătite în lămâie și ulei de măsline. 6 bucăți.", priceLei: 32, tags: ["vegan", "vegetarian"] },
        { sectionId: "mezze", name: "Taramasalata cu icre de morun", description: "Cremă de icre de morun, lămâie, ulei de măsline, ceapă, pâine, servită cu pita caldă.", priceLei: 36, tags: [] },
        // Salate
        { sectionId: "salate", name: "Salată grecească cu telemea Mykonos", description: "Roșii coapte, castraveți, ardei verzi, ceapă roșie, măsline Kalamata, telemea de Mykonos, oregano, ulei de măsline.", priceLei: 36, tags: ["vegetarian", "gluten-free", "popular"] },
        { sectionId: "salate", name: "Salată cu sfeclă coaptă, feta și nuci", description: "Sfeclă coaptă, feta sfărâmată, nuci caramelate, rucola, dressing de miere și muștar, semințe de rodie.", priceLei: 32, tags: ["vegetarian", "gluten-free"] },
        // Principale
        { sectionId: "principale", name: "Octopod la grătar cu cartofi confiat", description: "Octopod fiert lent 4 ore, finisat la grătar, ulei de măsline, lămâie, oregano. Cartofi confiat în grăsime de măsline cu cimbru.", priceLei: 88, tags: ["chef-pick", "popular", "gluten-free"] },
        { sectionId: "principale", name: "Branzino la sare cu lămâie", description: "Biban întreg copt în crustă de sare grunjoasă, deshus la masă, ulei de măsline cu lămâie și capere, ierburi.", priceLei: 92, tags: ["chef-pick", "gluten-free"] },
        { sectionId: "principale", name: "Doradă fripta cu legume mediteraneene", description: "Doradă întreagă din Marea Neagră, friptă pe grătar, dovlecel, vinete, ardei roșu, măsline, lămâie.", priceLei: 84, tags: ["gluten-free"] },
        { sectionId: "principale", name: "Souvlaki de miel cu pita și tzatziki", description: "Frigărui de miel marinat cu oregano și usturoi, pita caldă, tzatziki, ceapă roșie, salată.", priceLei: 68, tags: ["popular"] },
        { sectionId: "principale", name: "Moussaka tradițională", description: "Straturi de vinete, cartofi, carne de miel cu scorțișoară și roșii, besciamel cu kefalograviera, gratinată.", priceLei: 58, tags: ["chef-pick"] },
        { sectionId: "principale", name: "Gambas grilled cu unt de lămâie", description: "Creveți tigru întregi, gătiți pe grătar cu ulei de măsline, usturoi, lămâie, pătrunjel.", priceLei: 78, tags: ["gluten-free"] },
        // Dulciuri
        { sectionId: "dulciuri", name: "Baclava cu fistic și miere", description: "Foi subțiri de aluat, nucă și fistic, sirop de miere de timian și apă de portocale, scorțișoară.", priceLei: 28, tags: ["vegetarian", "popular"] },
        { sectionId: "dulciuri", name: "Loukoumades cu miere și nucă", description: "Gogoșele grecești prăjite, calde, scufundate în miere de Creta, nucă tocată, scorțișoară.", priceLei: 26, tags: ["vegetarian", "chef-pick"] },
        // Băuturi
        { sectionId: "dulciuri", name: "Flight de ouzo (3 × 30ml)", description: "Trei tipuri de ouzo grecesc — Plomari, Mini, Barbayanni — cu apă rece și gheață separat.", priceLei: 38, tags: ["chef-pick"] },
        { sectionId: "dulciuri", name: "Assyrtiko Santorini (pahar 150ml)", description: "Vin alb grecesc de Santorini, pe lavă vulcanică. Mineral, citric, perfect cu peștele.", priceLei: 42, tags: [] },
        { sectionId: "dulciuri", name: "Cafea grecească cu rahat", description: "Cafea fiartă pe nisip cald, rahat de trandafir, apă rece. Lasă-o să se așeze.", priceLei: 16, tags: [] },
      ],
    },
    reviews: [
      { firstName: "Adrian", rating: 5, daysAgo: 7, partySize: 2, comment: "Cina pe terasă, soare la apus peste Herăstrău, octopod la grătar și un Assyrtiko rece — nu mai puteam fi în București. Cartofii confiat sunt cireașa de pe tort.", zone: "Herăstrău" },
      { firstName: "Mihaela", rating: 5, daysAgo: 16, partySize: 6, comment: "Aniversarea mamei pe terasă. Mezze pentru toată lumea, branzino la sare deshus la masă — teatru perfect. Flight-ul de ouzo a fost o descoperire — Plomari câștigă." },
      { firstName: "Răzvan", rating: 4, daysAgo: 28, partySize: 4, comment: "Salata grecească cu telemea de Mykonos — feta adevărată, simți diferența. Souvlaki de miel — bun, dar pita putea fi mai caldă. Per total — calitate-preț corect pentru zonă." },
      { firstName: "Iulia", rating: 5, daysAgo: 41, partySize: 2, comment: "Saganaki cu lămâie și miere — brânza prăjită care îți face seara. Loukoumades cu miere de Creta — gogoșele calde, miere care curge. Vară pe terasă, lacul în spate — atmosferă magică." },
      { firstName: "Călin", rating: 5, daysAgo: 58, partySize: 3, comment: "Doradă din Marea Neagră — proaspătă, simți. Cu legume grilled și o jumătate de lămâie. Moussaka tradițională — bunica greacă i-a învățat clar pe bucătarii ăștia." },
      { firstName: "Cosmina", rating: 4, daysAgo: 78, partySize: 2, comment: "Tzatziki cu pita caldă — exact ce-mi trebuia într-o zi de vară. Hummus de mazăre — variațiune frumoasă pe rețeta clasică. Singurul minus: zgomotos sâmbăta seara." },
      { firstName: "Bogdan", rating: 5, daysAgo: 102, partySize: 4, comment: "Cafea grecească cu rahat — finalul perfect, fiartă pe nisip ca în Atena. Atmosfera albastru-alb cu bougainvillea — te transportă. Revin sigur cu prietenii." },
    ],
    bestFor: ["Întâlnire romantică", "Cină în grup", "Vară pe terasă"],
    photoPrompts: {
      hero: "Wide cinematic shot of a whitewashed Greek taverna terrace at golden hour overlooking Herastrau lake in Bucharest, Aegean-blue painted wooden chairs and tables, hanging clusters of fresh lemons, draped bougainvillea with magenta blossoms, weathered timber beams, blue-and-white striped table runners, lake view with reflected sunset light, no people, editorial photography, 35mm full frame, no text",
      gallery: [
        "Close-up of weathered whitewashed wall with bright Aegean-blue painted shutters, a hanging cluster of fresh yellow lemons in front, late afternoon golden light, editorial detail, 50mm",
        "Top-down of a wooden taverna table set with multiple small mezze plates (tzatziki, hummus, dolmades, olives), warm pita bread piled in a basket, blue-glazed ceramic plates, fresh oregano sprigs, golden hour light from the side, 35mm",
        "Wide shot of the lakeside terrace with empty wooden chairs facing the water, bougainvillea trailing overhead, soft golden sunset reflecting off the lake, no people, atmospheric, 35mm",
        "Detail of a small bowl of plump black Kalamata olives and feta cubes on a blue-glazed ceramic plate, fresh oregano, drizzle of olive oil, weathered wood table, golden warm light, 50mm shallow depth of field",
        "Behind-the-scenes shot of a chef placing a whole sea bass on a salt crust on a hot grill, smoke rising, fresh lemons and herbs nearby, warm warm afternoon light, editorial, 35mm",
      ],
      dishes: [
        { itemName: "Octopod la grătar cu cartofi confiat", prompt: "Editorial three-quarter view of a charred grilled octopus tentacle curled artfully on a blue-glazed ceramic plate, glossy from olive oil, scattered fresh oregano and lemon zest, alongside golden confit potatoes with thyme, capers, lemon wedge, warm golden hour light, 50mm shallow depth of field" },
        { itemName: "Branzino la sare cu lămâie", prompt: "Top-down editorial of a whole sea bass cooked in a cracked white salt crust on a long blue-glazed platter, fresh lemon halves, oregano sprigs, drizzle of olive oil, capers scattered, white tablecloth with blue stripe, golden hour terrace light, 50mm" },
        { itemName: "Salată grecească cu telemea Mykonos", prompt: "Top-down of a traditional Greek salad with chunks of red tomato, cucumber, green pepper, red onion, plump Kalamata olives, a thick slab of white feta on top dusted with oregano, drizzle of olive oil, blue-glazed ceramic bowl, golden warm light, 50mm" },
        { itemName: "Saganaki cu lămâie și miere", prompt: "Three-quarter view of a small black cast-iron skillet with golden-fried saganaki cheese, drizzle of glossy honey pooling on top, sprinkle of toasted sesame seeds, fresh thyme, lemon wedge on the side, warm tungsten light, 50mm shallow depth of field" },
        { itemName: "Moussaka tradițională", prompt: "Editorial three-quarter view of a single portion of Greek moussaka in a small ceramic ramekin, golden bubbly bechamel top with crispy edges, layers of eggplant and lamb visible from the side, sprinkled with cinnamon, fresh oregano garnish, blue-glazed plate, warm light, 50mm" },
        { itemName: "Loukoumades cu miere și nucă", prompt: "Top-down of a small blue-glazed bowl of golden Greek loukoumades doughnuts piled high, glistening with honey drizzle pouring down the sides, scattered chopped walnuts, dusting of cinnamon, fresh mint sprig, warm light, 50mm shallow depth of field" },
      ],
    },
    ratingTarget: 4.5,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 9. Beirut Express — Lebanese/Mediterranean, $$, Centrul Vechi
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "beirut-express",
    name: "Beirut Express",
    ownerEmail: "demo-beirut-express@tavli-supporting.invalid",
    citySlug: "bucuresti",
    cuisines: ["Lebanese", "Mediterranean"],
    priceLevel: 2,
    zone: "Centrul Vechi",
    address: "Strada Smârdan 12, Sector 3",
    lat: 44.4291,
    lng: 26.1006,
    capacity: 25,
    daysAgoCreated: 140,
    heroNote: "Mezze, hummus și shawarma, ca în Beirut. Mâncare libaneză adevărată.",
    description:
      "Spațiu mic de 25 de locuri, deschis non-stop. Hummus făcut zilnic dimineața din năut fiert lent, shawarma tăiată la solicitarea fiecărei comenzi de pe rotativă, falafel prăjit la porție, halloumi cipriot, măsline Kalamata, pita coaptă continuu pe loc în cuptorul de piatră. Ulei de măsline libanez. Cafea cu cardamom servit în fildjan-uri.",
    schedule: [
      { dayOfWeek: 1, openTime: "11:00", closeTime: "23:00" },
      { dayOfWeek: 2, openTime: "11:00", closeTime: "23:00" },
      { dayOfWeek: 3, openTime: "11:00", closeTime: "23:00" },
      { dayOfWeek: 4, openTime: "11:00", closeTime: "23:00" },
      { dayOfWeek: 5, openTime: "11:00", closeTime: "23:00" },
      { dayOfWeek: 6, openTime: "11:00", closeTime: "23:00" },
      { dayOfWeek: 0, openTime: "11:00", closeTime: "23:00" },
    ],
    availability: [
      { dayOfWeek: 1, startTime: "11:00", endTime: "23:00", capacity: 25 },
      { dayOfWeek: 2, startTime: "11:00", endTime: "23:00", capacity: 25 },
      { dayOfWeek: 3, startTime: "11:00", endTime: "23:00", capacity: 25 },
      { dayOfWeek: 4, startTime: "11:00", endTime: "23:00", capacity: 25 },
      { dayOfWeek: 5, startTime: "11:00", endTime: "23:00", capacity: 25 },
      { dayOfWeek: 6, startTime: "11:00", endTime: "23:00", capacity: 25 },
      { dayOfWeek: 0, startTime: "11:00", endTime: "23:00", capacity: 25 },
    ],
    menu: {
      heroNote: "Hummus făcut dimineața. Pita coaptă pe loc, toată ziua.",
      sections: [
        { id: "mezze", name: "Mezze", intro: "De împărțit la masă, cu pita caldă coaptă pe loc.", orderIndex: 0 },
        { id: "shawarma", name: "Shawarma & sandvișuri", intro: "Carne tăiată direct de pe rotativă, învelită în pita.", orderIndex: 1 },
        { id: "gratar", name: "Grătar", intro: "Pe cărbuni, ca în Liban. Marinat 24 de ore.", orderIndex: 2 },
        { id: "deserturi", name: "Deserturi", intro: "Două dulciuri libaneze, cu cafea de cardamom.", orderIndex: 3 },
      ],
      items: [
        // Mezze
        { sectionId: "mezze", name: "Hummus clasic", description: "Năut fiert lent, tahini, lămâie, usturoi, ulei de măsline libanez, paprika afumată, pita caldă.", priceLei: 24, tags: ["vegan", "vegetarian", "popular", "chef-pick"] },
        { sectionId: "mezze", name: "Hummus cu carne tocată și pini", description: "Hummus de bază, carne de miel tocată cu scorțișoară și sumac, pini prăjiți, pătrunjel, ulei de măsline.", priceLei: 38, tags: ["chef-pick"] },
        { sectionId: "mezze", name: "Baba ghanoush cu rodie", description: "Vinete coapte pe foc deschis, tahini, lămâie, usturoi, sumac, semințe de rodie, ulei de măsline.", priceLei: 28, tags: ["vegan", "vegetarian", "gluten-free"] },
        { sectionId: "mezze", name: "Falafel cu tahini și sumac (6 buc)", description: "Năut, ierburi, condimente, prăjit la porție, sos tahini cu lămâie, salată, sumac, pita.", priceLei: 32, tags: ["vegan", "vegetarian", "popular"] },
        { sectionId: "mezze", name: "Tabbouleh cu pătrunjel și mentă", description: "Pătrunjel tocat fin, mentă, roșii, ceapă verde, bulgur, lămâie, ulei de măsline.", priceLei: 26, tags: ["vegan", "vegetarian"] },
        { sectionId: "mezze", name: "Halloumi prăjit cu sumac și miere", description: "Halloumi cipriot prăjit, sumac, miere de timian, susan, lămâie, mentă proaspătă.", priceLei: 36, tags: ["vegetarian", "chef-pick"] },
        // Shawarma & sandvișuri
        { sectionId: "shawarma", name: "Shawarma de pui în pita cu garlic sauce", description: "Pui de pe rotativă, sos toum (aioli de usturoi), salată, roșii, castraveți murați, pita caldă.", priceLei: 32, tags: ["popular"] },
        { sectionId: "shawarma", name: "Shawarma de miel cu tahini", description: "Miel marinat de pe rotativă, sos tahini, ceapă cu sumac, pătrunjel, ardei iute, pita caldă.", priceLei: 38, tags: ["chef-pick", "popular"] },
        { sectionId: "shawarma", name: "Manakish cu za'atar", description: "Aluat copt pe piatră, ulei de măsline, za'atar libanez (cimbru sălbatic, sumac, susan).", priceLei: 22, tags: ["vegan", "vegetarian"] },
        { sectionId: "shawarma", name: "Manakish cu brânză și nucă", description: "Aluat copt pe piatră, akkawi (brânză libaneză), nuci tocate, mentă, susan negru.", priceLei: 28, tags: ["vegetarian"] },
        // Grătar
        { sectionId: "gratar", name: "Mixed grill libanez (kebab, kofta, taouk)", description: "Frigărui de miel kebab, kofta de vită cu pătrunjel și ceapă, pui taouk marinat în iaurt și usturoi, hummus, pita.", priceLei: 76, tags: ["chef-pick", "popular"] },
        { sectionId: "gratar", name: "Kafta de miel cu tahini și sumac", description: "Frigărui de miel tocat cu pătrunjel, ceapă, scorțișoară, sumac, gătite pe cărbuni. Sos tahini, pita.", priceLei: 58, tags: [] },
        { sectionId: "gratar", name: "Pui taouk pe iaurt și usturoi", description: "Cuburi de pui marinate 24h în iaurt, usturoi, lămâie, ardei roșu. Frigărui pe cărbuni, pita.", priceLei: 52, tags: [] },
        // Deserturi
        { sectionId: "deserturi", name: "Baklava libaneză cu fistic", description: "Foi subțiri, fistic de Aleppo măcinat, sirop de apă de trandafiri și miere de timian, scorțișoară.", priceLei: 24, tags: ["vegetarian", "chef-pick", "popular"] },
        { sectionId: "deserturi", name: "Mhalabia cu pistache și apă de trandafiri", description: "Cremă fină de orez cu lapte, apă de trandafiri, fistic măcinat, miere, mastica.", priceLei: 22, tags: ["vegetarian"] },
        // Băuturi
        { sectionId: "deserturi", name: "Cafea cu cardamom (fildjan)", description: "Cafea libaneză fiartă cu cardamom, servită în fildjan, cu rahat de cardamom.", priceLei: 14, tags: ["vegan", "gluten-free"] },
        { sectionId: "deserturi", name: "Limonadă cu mentă și apă de trandafiri", description: "Lămâi proaspete, mentă, apă de trandafiri, gheață mărunțită.", priceLei: 18, tags: ["vegan", "vegetarian", "gluten-free"] },
      ],
    },
    reviews: [
      { firstName: "Andreea", rating: 5, daysAgo: 3, partySize: 1, comment: "Prânz solo în Centrul Vechi, hummus + pita caldă + falafel — m-a costat 60 lei și am fost plină 4 ore. Pita coaptă pe loc, hummus făcut clar dimineața. Locul mic, real.", zone: "Centrul Vechi" },
      { firstName: "Daniel", rating: 5, daysAgo: 9, partySize: 2, comment: "Shawarma de miel cu tahini — cea mai bună shawarma din București. Carnea tăiată direct de pe rotativă în pita ta. La ușă mereu coadă, dar merge repede." },
      { firstName: "Smaranda", rating: 5, daysAgo: 17, partySize: 4, comment: "Mixed grill libanez pentru 4 persoane — am rămas cu mâncare. Hummus cu carne și pini — combinație care a făcut seara. Locul are personalitate, nu e pretențios." },
      { firstName: "Mihail", rating: 4, daysAgo: 28, partySize: 2, comment: "Halloumi prăjit cu sumac — surprinzător de fin. Baklava libaneză — fistic de Aleppo se simte, mai puțin dulce decât cea greacă, mai elegantă. Doar 25 locuri — vino devreme." },
      { firstName: "Ioana", rating: 5, daysAgo: 42, partySize: 3, comment: "Vegana din grup a găsit minunea — 3 mezze și mai voia. Falafel proaspăt prăjit, baba ghanoush cu rodie, tabbouleh viu. Cafea cu cardamom în fildjan — finalul corect." },
      { firstName: "Ana", rating: 5, daysAgo: 61, partySize: 2, comment: "Manakish cu za'atar — gust de copilărie pentru o prietenă din Beirut. Adevărată mâncare libaneză, fără compromisuri. Nu te mai gândești 3 zile la altceva.", zone: "Centrul Vechi" },
      { firstName: "Costin", rating: 4, daysAgo: 89, partySize: 2, comment: "Kafta de miel pe cărbuni — bună, marinada se simte. Singurul lucru: spațiul mic, vara fără AC e cald. Iarna — perfect, atmosferă caldă, abur de pita din cuptor." },
    ],
    bestFor: ["Prânz rapid", "Vegetarian friendly", "Singur la masă"],
    photoPrompts: {
      hero: "Wide cinematic interior of a small intimate Lebanese restaurant in Bucharest's old town, vivid Levantine market aesthetic with hand-painted blue-and-green ceramic tiles on the walls, brass lanterns hanging overhead casting golden patterned light, jars of olives and pickles on shelves, stacks of fresh warm pita on the counter, bunches of fresh herbs hanging, clay tagine pots, warm amber atmospheric lighting, no people, editorial photography, 35mm, no text",
      gallery: [
        "Close-up of brass Moroccan-style hanging lanterns with pierced patterns casting decorative golden shadows on a blue-tiled wall, dim warm light, atmospheric editorial photography, 50mm",
        "Detail of glass jars of green and black olives, pickled turnips, peppers, lined up on a wooden shelf, blue-and-white tile background, warm tungsten light, 50mm shallow depth of field",
        "Top-down of a counter with stacks of fresh warm pita, a chef's hands working dough nearby, sesame seeds and za'atar in small bowls, copper coffee pot with cardamom coffee, warm light from above, 35mm",
        "Detail of a vertical shawarma rotisserie with golden-brown crusty meat, knife about to slice off thin pieces, soft warm orange light, smoky moody atmosphere, behind-the-scenes editorial, 50mm",
        "Wide shot of a small intimate Lebanese restaurant table set with mezze plates, ceramic plates with hand-painted blue patterns, hanging lantern overhead, dim warm atmospheric light, no people, 35mm",
      ],
      dishes: [
        { itemName: "Hummus clasic", prompt: "Editorial top-down of a shallow ceramic bowl of creamy hummus with a swirled well in the center, generous pool of golden olive oil, dusting of red paprika and sumac, scattered whole chickpeas, sprig of parsley, warm pita bread torn beside, blue-and-white tile background, warm light, 50mm" },
        { itemName: "Shawarma de miel cu tahini", prompt: "Three-quarter view of a Lebanese lamb shawarma wrap in warm pita opened to show the filling: thinly sliced spiced lamb, tahini sauce drizzle, sumac onions, fresh parsley, pickled turnip pink, on a small ceramic plate, atmospheric warm light, 50mm shallow depth of field" },
        { itemName: "Mixed grill libanez (kebab, kofta, taouk)", prompt: "Editorial overhead of a wooden platter laden with skewers of grilled lamb kebab, kofta, and chicken taouk, charred edges visible, alongside small bowls of hummus, garlic toum, fresh pita stack, parsley, lemon wedges, blue-tile background, warm light, 50mm" },
        { itemName: "Falafel cu tahini și sumac (6 buc)", prompt: "Three-quarter view of six golden-fried green-centered falafel balls on a ceramic plate, drizzle of pale tahini sauce, scattered red sumac, fresh parsley, lemon wedge, warm pita on the side, blue-tile background blurred, warm light, 50mm" },
        { itemName: "Halloumi prăjit cu sumac și miere", prompt: "Editorial three-quarter of golden-grilled halloumi cheese slices stacked on a small ceramic plate, glossy honey drizzle pooling, dusting of red sumac, scattered sesame seeds, fresh mint sprigs, lemon wedge, warm tungsten light, 50mm shallow depth of field" },
        { itemName: "Baklava libaneză cu fistic", prompt: "Top-down of three diamond-shaped pieces of baklava on a small ceramic plate, glistening with golden syrup, generous bright green crushed pistachios on top, dusting of cinnamon, edible rose petal, small cup of cardamom coffee in the corner, warm light, 50mm" },
      ],
    },
    ratingTarget: 4.6,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 10. Atelier de Cocktailuri — Cocktails/European, $$$, Aviatorilor
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "atelier-de-cocktailuri",
    name: "Atelier de Cocktailuri",
    ownerEmail: "demo-atelier-de-cocktailuri@tavli-supporting.invalid",
    citySlug: "bucuresti",
    cuisines: ["Cocktails", "European"],
    priceLevel: 3,
    zone: "Aviatorilor",
    address: "Strada General Praporgescu 18, Sector 2",
    lat: 44.4652,
    lng: 26.0918,
    capacity: 40,
    daysAgoCreated: 50,
    heroNote: "Cocktailuri clasice, mixate cu mâinile celor care le-au creat. Atmosferă de altădată.",
    description:
      "Bar speakeasy în stilul anilor '20, cu 40 de locuri la mese de marmură și un bar de alamă lungit pe trei laturi. Bartender Marius (15 ani la London Negroni Bar) mixează clasicele și creațiile proprii rotative pe sezon. Carte de small-plates pentru a însoți (caviar, stridii, carpaccio). Vinilurile de jazz se învârt vinerea seara.",
    schedule: [
      { dayOfWeek: 2, openTime: "18:00", closeTime: "02:00" },
      { dayOfWeek: 3, openTime: "18:00", closeTime: "02:00" },
      { dayOfWeek: 4, openTime: "18:00", closeTime: "02:00" },
      { dayOfWeek: 5, openTime: "18:00", closeTime: "02:00" },
      { dayOfWeek: 6, openTime: "18:00", closeTime: "02:00" },
    ],
    availability: [
      { dayOfWeek: 2, startTime: "18:00", endTime: "02:00", capacity: 40 },
      { dayOfWeek: 3, startTime: "18:00", endTime: "02:00", capacity: 40 },
      { dayOfWeek: 4, startTime: "18:00", endTime: "02:00", capacity: 40 },
      { dayOfWeek: 5, startTime: "18:00", endTime: "02:00", capacity: 40 },
      { dayOfWeek: 6, startTime: "18:00", endTime: "02:00", capacity: 40 },
    ],
    menu: {
      heroNote: "Clasice și creații. Vineri seara — viniluri de jazz pe Thorens.",
      sections: [
        { id: "clasice", name: "Cocktailuri clasice", intro: "Rețetele care au definit barul. Făcute exact cum trebuie.", orderIndex: 0 },
        { id: "creatii", name: "Creații proprii", intro: "Schimbate cu sezonul. Întreabă-l pe Marius despre ultima.", orderIndex: 1 },
        { id: "vinuri", name: "Vinuri & spirturi", intro: "Listă scurtă, aleasă cu grijă. Se servesc și whisky-uri rare la pahar.", orderIndex: 2 },
        { id: "small-plates", name: "Small plates", intro: "Pentru a însoți cocktailurile, fără a deveni cina.", orderIndex: 3 },
      ],
      items: [
        // Clasice
        { sectionId: "clasice", name: "Negroni", description: "Campari, Cinzano Rosso 1757, Beefeater, gheață mare, felie de portocală arsă cu flacără.", priceLei: 42, tags: ["chef-pick", "popular"] },
        { sectionId: "clasice", name: "Old Fashioned cu Bulleit Rye", description: "Bulleit Rye 95% rye, demerara homemade, Angostura, Peychaud's, coajă de portocală arsă.", priceLei: 48, tags: ["chef-pick"] },
        { sectionId: "clasice", name: "Manhattan", description: "Bulleit Bourbon, Carpano Antica Formula, Angostura, vișină Luxardo, gheață cubulețe.", priceLei: 46, tags: [] },
        { sectionId: "clasice", name: "Sazerac cu absint", description: "Pahar răcit clătit cu absint Pernod, Sazerac Rye, demerara, Peychaud's, coajă de lămâie.", priceLei: 52, tags: ["chef-pick"] },
        { sectionId: "clasice", name: "Whiskey Sour cu albuș de ou", description: "Buffalo Trace, lămâie proaspătă, demerara, albuș de ou bătut spumă, Angostura puncte.", priceLei: 44, tags: ["popular"] },
        { sectionId: "clasice", name: "Vesper Martini", description: "Tanqueray No. Ten, Stoli Elit, Lillet Blanc, coajă lungă de lămâie. Servit foarte rece.", priceLei: 48, tags: [] },
        // Creații
        { sectionId: "creatii", name: "Atelier Spritz", description: "Aperol, Prosecco DOC, Hendrick's gin, sirop de ghimbir-lavandă, sifon, ramură de rozmarin arsă.", priceLei: 42, tags: ["chef-pick"] },
        { sectionId: "creatii", name: "Smokey Mary (Bloody Mary cu vodka afumată)", description: "Vodka afumată în casă cu lemn de fag, suc de roșii proaspete, hrean, Worcester, ardei iute, sare cu boia afumată, țelină.", priceLei: 46, tags: ["spicy", "chef-pick"] },
        { sectionId: "creatii", name: "Earl Grey Martini", description: "Gin Tanqueray infuzat 24 ore în ceai Earl Grey, sirop de zahăr cu lămâie, albuș de ou, coajă de lămâie.", priceLei: 48, tags: ["chef-pick", "popular"] },
        { sectionId: "creatii", name: "Espresso Martini de toamnă", description: "Vodka, espresso de Origo, Kahlua, sirop de scorțișoară-vanilie, boabe de cafea pe spumă.", priceLei: 46, tags: [] },
        // Vinuri & spirturi
        { sectionId: "vinuri", name: "Champagne Drappier rosé (pahar)", description: "Champagne brut rosé, Pinot Noir dominant, note de fructe roșii și brioșă.", priceLei: 88, tags: [] },
        { sectionId: "vinuri", name: "Whisky Glenfarclas 21 ani (40ml)", description: "Single malt Speyside, învechit 21 ani în butoaie de Sherry. Note de fructe uscate, ciocolată, lemn de stejar.", priceLei: 168, tags: [] },
        { sectionId: "vinuri", name: "Vermut de casă cu botanice", description: "Vermut alb infuzat in-house cu pelin, lavandă, coajă de citrice, măsline castelvetrano, gheață mare.", priceLei: 38, tags: ["vegetarian"] },
        // Small plates
        { sectionId: "small-plates", name: "Caviar Beluga 15g cu blini și smântână", description: "Caviar Beluga, blini calzi de hrișcă, smântână grasă, ceapă verde tocată, ouă de prepeliță.", priceLei: 188, tags: ["chef-pick"] },
        { sectionId: "small-plates", name: "Carpaccio de vită cu rucola și parmezan", description: "Vită Black Angus tăiată subțire, rucola, parmezan ras, capere prăjite, ulei de măsline cu lămâie.", priceLei: 78, tags: ["popular"] },
        { sectionId: "small-plates", name: "Stridii de Galway (3 buc)", description: "Stridii irlandeze, mignonette de șalotă cu oțet de Champagne, lămâie, gheață pisată.", priceLei: 88, tags: ["gluten-free"] },
        { sectionId: "small-plates", name: "Ceviche de doradă cu lapte de tigru", description: "Doradă tăiată subțire, lapte de tigru cu lămâie verde, coriandru, ardei iute, ceapă roșie, batate dulci.", priceLei: 72, tags: ["gluten-free", "spicy"] },
        { sectionId: "small-plates", name: "Cheese board cu 4 brânzeturi", description: "Comté 24 luni, gorgonzola dolce, Brie de Meaux, manchego, miere de smochine, struguri, nuci.", priceLei: 88, tags: ["vegetarian"] },
        { sectionId: "small-plates", name: "Trifle cu fructe de pădure și mascarpone", description: "Pandișpan cu Marsala, mascarpone bătut, fructe de pădure proaspete, coulis, fistic.", priceLei: 38, tags: ["vegetarian"] },
      ],
    },
    reviews: [
      { firstName: "Octavian", rating: 5, daysAgo: 4, partySize: 2, comment: "Marius mi-a făcut un Old Fashioned perfect — exact bourbon-ul potrivit, demerara homemade, portocală arsă cu flacără. Atmosferă speakeasy autentică, vinilurile de jazz vinerea seara — magic.", zone: "Aviatorilor" },
      { firstName: "Andrada", rating: 5, daysAgo: 11, partySize: 2, comment: "Aniversarea de 5 ani împreună. Earl Grey Martini pentru mine, Sazerac pentru el. Caviar Beluga pe blini — un detaliu mic, dar a contat. Marius a ținut minte că prefer gin-ul foarte rece." },
      { firstName: "Bogdan", rating: 5, daysAgo: 19, partySize: 4, comment: "After-work cu colegii din consultanță. Atelier Spritz pentru toți — creație proprie, nu am mai gustat așa ceva. Carpaccio de vită cu rucola — perfect ca să nu cinăm propriu-zis." },
      { firstName: "Iulia", rating: 5, daysAgo: 28, partySize: 2, comment: "Smokey Mary — vodka afumată cu lemn de fag, simți afumătura. Marius m-a întrebat câtă spice vreau și a făcut exact. Atmosferă — velvet bordeaux, Edison bulbs, ca într-un film de epocă." },
      { firstName: "Vlad", rating: 5, daysAgo: 36, partySize: 2, comment: "Vesper Martini servit foarte rece, exact cum scria James Bond. Whisky Glenfarclas 21 ani la 40ml — moment rar. Vinilurile de jazz pe Thorens vinerea — detaliu care contează." },
      { firstName: "Ioana", rating: 4, daysAgo: 47, partySize: 4, comment: "Cocktailurile — toate impecabile, prețuri pe măsură (42-48 lei). Stridii de Galway — proaspete, mignonette perfectă. Singurul minus: rezervarea sâmbăta seara e dificilă, locul e mic." },
      { firstName: "Adrian", rating: 5, daysAgo: 42, partySize: 2, comment: "Locul în care merg când vreau să tac și să beau ceva bine făcut. Vermut de casă cu botanice — aromele se simt, măslinele Castelvetrano se topesc. Marius merită deplasarea." },
    ],
    bestFor: ["Întâlnire romantică", "Aperitiv după muncă", "Aniversare"],
    photoPrompts: {
      hero: "Wide cinematic interior of a 1920s speakeasy cocktail bar at night, dark bordeaux velvet upholstered banquettes, vintage hammered brass bar stretching across, marble bar top with cocktails being garnished, amber Edison bulb lighting hanging from the ceiling on cloth-wrapped cords, mahogany shelves backlit displaying rare spirits, leather-bound menus, crystal coupe glassware, moody intimate atmosphere, no people, editorial photography, 35mm, no text",
      gallery: [
        "Close-up of a bartender's hands stirring a Negroni in a cut-crystal mixing glass with a long bar spoon, polished brass bar surface reflecting amber light, Edison bulb glowing warm above, blurred bottles in the background, editorial 50mm shallow depth of field",
        "Detail of mahogany shelving displaying rare whiskeys and amber spirits, backlit warm amber light, brass label plates beside each bottle, dark moody atmosphere, intimate speakeasy mood, 50mm",
        "Wide shot of an empty 1920s speakeasy booth with bordeaux velvet curved seating, low marble table with two crystal coupes containing red cocktails, single Edison bulb hanging overhead, dim atmospheric warm light, no people, 35mm",
        "Top-down of a marble bar top with a flight of three vermouths in small glasses, lemon peel, olive in a small dish, crystal coupe with a Manhattan cherry, soft amber light, editorial detail, 50mm",
        "Behind-the-scenes detail of a vinyl record on a Thorens turntable spinning, warm tungsten light from a single lamp, bar bottles in soft focus background, mood evocative, atmospheric editorial, 50mm shallow depth of field",
      ],
      dishes: [
        { itemName: "Negroni", prompt: "Editorial three-quarter view of a Negroni in a heavy crystal rocks glass with a single large clear ice cube, deep ruby-red color catching warm Edison bulb light, charred orange peel curl on the rim, dark marble bar top, blurred amber spirits in the background, moody warm light, 50mm shallow depth of field" },
        { itemName: "Old Fashioned cu Bulleit Rye", prompt: "Three-quarter view of an Old Fashioned in a heavy rocks glass with a single chiseled ice cube, deep amber color, large flamed orange peel twist hovering, single Luxardo cherry beneath the ice, marble bar top, dim warm tungsten light, 50mm" },
        { itemName: "Earl Grey Martini", prompt: "Editorial three-quarter view of a coupe glass filled with a pale lemon-yellow Earl Grey Martini, fluffy egg white foam on top with three drops of Angostura bitters dragged into a feathered pattern, long lemon peel twist on the side, dark marble bar, dim moody warm light, 50mm" },
        { itemName: "Smokey Mary (Bloody Mary cu vodka afumată)", prompt: "Three-quarter view of a tall highball glass of deep red Bloody Mary with smoke curling out from the top under a glass dome being lifted, celery stalk and rim of smoked paprika salt, lemon wedge, dim atmospheric speakeasy lighting, 50mm shallow depth of field" },
        { itemName: "Caviar Beluga 15g cu blini și smântână", prompt: "Editorial top-down of a small mother-of-pearl spoon with glistening dark Beluga caviar, beside small dollar-sized blini stacked, a tiny dish of crème fraîche, chopped chives, two halved quail eggs, dark slate plate, dim moody warm light, 50mm shallow depth of field" },
        { itemName: "Carpaccio de vită cu rucola și parmezan", prompt: "Editorial overhead of paper-thin slices of raw beef carpaccio fanned across a black slate plate, rocket leaves piled in the center, generous shavings of aged Parmigiano, scattered crispy fried capers, drizzle of olive oil and lemon, dim warm bar light, 50mm" },
      ],
    },
    ratingTarget: 4.8,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 11. Verde — Vegan/Vegetarian/European, $$, Cișmigiu (NEWEST)
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: "verde",
    name: "Verde",
    ownerEmail: "demo-verde@tavli-supporting.invalid",
    citySlug: "bucuresti",
    cuisines: ["Vegan", "Vegetarian", "European"],
    priceLevel: 2,
    zone: "Cișmigiu",
    address: "Strada Brezoianu 38, Sector 1",
    lat: 44.4378,
    lng: 26.0938,
    capacity: 32,
    daysAgoCreated: 30,
    heroNote: "Bucătărie 100% pe bază de plante, zero compromisuri.",
    description:
      "Spațiu nou de fine dining vegetal cu doar 32 de locuri, lângă parcul Cișmigiu. Chef Iulian s-a întors după 6 ani la Eleven Madison Park (New York) și aplică tehnica de fine dining clasic exclusiv ingredientelor pe bază de plante. Cremă de migdale care înlocuiește besciamel, fond de hribi care joacă rol de demi-glace, cașu fermentat 8 săptămâni. Rezervare recomandată.",
    schedule: [
      { dayOfWeek: 2, openTime: "12:00", closeTime: "22:00" },
      { dayOfWeek: 3, openTime: "12:00", closeTime: "22:00" },
      { dayOfWeek: 4, openTime: "12:00", closeTime: "22:00" },
      { dayOfWeek: 5, openTime: "12:00", closeTime: "22:00" },
      { dayOfWeek: 6, openTime: "12:00", closeTime: "22:00" },
      { dayOfWeek: 0, openTime: "12:00", closeTime: "17:00" },
    ],
    availability: [
      { dayOfWeek: 2, startTime: "12:00", endTime: "22:00", capacity: 32 },
      { dayOfWeek: 3, startTime: "12:00", endTime: "22:00", capacity: 32 },
      { dayOfWeek: 4, startTime: "12:00", endTime: "22:00", capacity: 32 },
      { dayOfWeek: 5, startTime: "12:00", endTime: "22:00", capacity: 32 },
      { dayOfWeek: 6, startTime: "12:00", endTime: "22:00", capacity: 32 },
      { dayOfWeek: 0, startTime: "12:00", endTime: "17:00", capacity: 32 },
    ],
    menu: {
      heroNote: "100% plante, tehnică de fine dining. Chef Iulian, ex-Eleven Madison Park.",
      sections: [
        { id: "mic-dejun", name: "Mic dejun & brunch", intro: "Disponibil până la 14:00 sâmbăta și duminica. Ouăle? Tofu silken, fără minciuni.", orderIndex: 0 },
        { id: "bowls", name: "Bowls", intro: "Bowl-uri sezoniere, dezvoltate cu nutriționistul, niciodată plictisitoare.", orderIndex: 1 },
        { id: "principale", name: "Feluri principale", intro: "Fine dining vegetal. Tehnica e identică cu Eleven Madison.", orderIndex: 2 },
        { id: "deserturi", name: "Deserturi", intro: "Trei deserturi vegane care nu se simt veganice.", orderIndex: 3 },
      ],
      items: [
        // Mic dejun
        { sectionId: "mic-dejun", name: "Avocado toast cu radish marinat și sumac", description: "Pâine din maia, avocado pisat, ridichi marinate cu oțet de mere, sumac, microverdețuri, semințe de cânepă, ulei de măsline.", priceLei: 38, tags: ["vegan", "vegetarian", "popular"] },
        { sectionId: "mic-dejun", name: "Smoothie bowl açaí cu granola și fistic", description: "Açaí brazilian, banană, lapte de cocos, granola de casă fără zahăr, fistic, fragi proaspete, miere de salcâm, fulgi de cocos.", priceLei: 38, tags: ["vegan", "vegetarian"] },
        { sectionId: "mic-dejun", name: "Tofu Benedict cu hollandaise vegan", description: "Tofu silken poșat în loc de ou, hollandaise pe bază de migdale și turmeric, English muffin, spanac sotat, mărar.", priceLei: 44, tags: ["vegan", "vegetarian", "chef-pick"] },
        { sectionId: "mic-dejun", name: "Green smoothie (kale, măr, ghimbir)", description: "Kale, măr verde, banană, ghimbir proaspăt, lămâie, lapte de migdale, semințe de chia, mentă.", priceLei: 26, tags: ["vegan", "vegetarian", "gluten-free"] },
        // Bowls
        { sectionId: "bowls", name: "Buddha bowl (quinoa, năut, baby spanac)", description: "Quinoa cu lămâie, năut prăjit cu boia afumată, baby spanac, avocado, edamame, semințe de cânepă, dressing tahini-lămâie.", priceLei: 48, tags: ["vegan", "vegetarian", "popular"] },
        { sectionId: "bowls", name: "Bowl orez negru cu edamame și tofu pane", description: "Orez negru forbidden, edamame, varză roșie crocantă, morcov, tofu pane în susan, sos teriyaki vegan, ceapă verde.", priceLei: 52, tags: ["vegan", "vegetarian"] },
        { sectionId: "bowls", name: "Bowl mediteranean cu hummus de sfeclă", description: "Bulgur cu mentă, hummus de sfeclă, falafel de casă, castravete, roșii cherry, măsline Kalamata, mărar, tahini.", priceLei: 46, tags: ["vegan", "vegetarian"] },
        // Principale
        { sectionId: "principale", name: "Risotto de hribi cu trufe negre", description: "Carnaroli gătit cu fond de hribi uscați (în loc de fond de pui), hribi proaspeți sotați, ulei de trufe negre, parmezan vegan din caju fermentat 8 săptămâni.", priceLei: 78, tags: ["vegan", "vegetarian", "chef-pick", "popular"] },
        { sectionId: "principale", name: "Cannelloni cu spanac și ricotta vegan", description: "Cannelloni umplut cu spanac sotat, ricotta vegană din migdale, sos de roșii San Marzano, cremă de migdale (în loc de besciamel), parmezan vegan, busuioc.", priceLei: 64, tags: ["vegan", "vegetarian", "chef-pick"] },
        { sectionId: "principale", name: "Curry tailandez de legume cu lapte de cocos", description: "Pastă curry verde, lapte de cocos, dovlecel, ardei roșu, vinete, fasole verde, busuioc thai, orez jasmine, lime, ardei iute.", priceLei: 56, tags: ["vegan", "vegetarian", "spicy", "gluten-free"] },
        { sectionId: "principale", name: "Beyond Burger cu chipotle și cartofi dulci", description: "Beyond Meat 180g, brânză vegană topită, salată, ceapă caramelată, sos chipotle, chiflă vegană din cereale antice, cartofi dulci pai.", priceLei: 58, tags: ["vegan", "vegetarian", "spicy"] },
        { sectionId: "principale", name: "Linte beluga cu legume rădăcinoase", description: "Linte beluga gătită lent în fond de hribi, sfeclă coaptă, morcov heritage, păstârnac, vinaigrette de mere, semințe de dovleac.", priceLei: 52, tags: ["vegan", "vegetarian", "gluten-free"] },
        // Deserturi
        { sectionId: "deserturi", name: "Tiramisù vegan cu cremă de cocos", description: "Savoiardi vegane muiate în espresso de Origo, cremă de cocos bătută cu vanilie de Madagascar, cacao amaruie. Făcut zilnic.", priceLei: 32, tags: ["vegan", "vegetarian", "chef-pick", "popular"] },
        { sectionId: "deserturi", name: "Cheesecake cu afine pe bază de caju", description: "Caju înmuiate 24h, lapte de cocos, sirop de arțar, vanilie, bază de migdale și curmale, topping afine proaspete, mentă.", priceLei: 30, tags: ["vegan", "vegetarian", "gluten-free", "chef-pick"] },
        { sectionId: "deserturi", name: "Mousse de ciocolată cu avocado și sare Maldon", description: "Mousse de ciocolată 70% cu avocado și sirop de arțar, fragi proaspeți, fulgi de sare Maldon, fistic.", priceLei: 28, tags: ["vegan", "vegetarian"] },
        // Băuturi
        { sectionId: "deserturi", name: "Kombucha de casă (ghimbir-turmeric)", description: "Kombucha fermentată în casă, sirop natural de ghimbir-turmeric, lămâie, gheață.", priceLei: 22, tags: ["vegan", "vegetarian", "gluten-free"] },
        { sectionId: "deserturi", name: "Vin natural orange (pahar 150ml)", description: "Vin orange românesc, contact prelungit cu cojile, mineral, structură. Se potrivește cu risotto-ul de hribi.", priceLei: 38, tags: [] },
      ],
    },
    reviews: [
      { firstName: "Andra", rating: 5, daysAgo: 2, partySize: 2, comment: "Am mâncat la Eleven Madison Park cu 4 ani în urmă — recunosc tehnica chefului Iulian aici. Risotto-ul de hribi cu trufe — parmezan vegan din caju fermentat are corp adevărat. Locul ăsta e ceva nou.", zone: "Cișmigiu" },
      { firstName: "Mihaela", rating: 5, daysAgo: 6, partySize: 4, comment: "Cina de business cu 3 colegi vegani și 1 carnivor. Tofu Benedict cu hollandaise de migdale — colegul carnivor a comandat 2. Cannelloni cu cremă de migdale — nu îți lipsește besciamel-ul." },
      { firstName: "Tudor", rating: 5, daysAgo: 11, partySize: 2, comment: "Sunt omnivor. Am venit pentru iubita vegană. Beyond Burger cu chipotle — cel mai bun burger fără carne din București. Cheesecake cu afine pe caju — memorabil. Mă întorc fără ea." },
      { firstName: "Diana", rating: 5, daysAgo: 17, partySize: 2, comment: "Vegană de 8 ani, în sfârșit fine dining real. Buddha bowl la prânz — porție corectă, dressing tahini făcut la moment. Tiramisù vegan cu cremă de cocos — nu se simte că e vegan." },
      { firstName: "Robert", rating: 4, daysAgo: 22, partySize: 3, comment: "Locul e mic, atmosferă minimalistă cu plante. Curry tailandez — bun, dar putea fi un pic mai picant. Vin natural orange recomandat de chelner — accord perfect cu risotto-ul." },
      { firstName: "Smaranda", rating: 5, daysAgo: 27, partySize: 2, comment: "Mousse de ciocolată cu avocado — sceptică inițial, am cerut a doua porție. Kombucha de casă cu ghimbir-turmeric — exact ce trebuia după prânz. Locul are personalitate, prețuri corecte." },
    ],
    bestFor: ["Întâlnire cu prieteni", "Cină de afaceri", "Vegan friendly"],
    photoPrompts: {
      hero: "Wide bright cinematic interior of a minimalist plant-forward fine-dining restaurant near Cismigiu park, white-washed walls with light terracotta accents, sage green velvet chairs, hanging plants in macramé from a high ceiling, pale oak tables with white ceramic plates, fresh greens prominently displayed on a wood counter, large windows with sheer linen curtains, soft natural light, no people, editorial photography, 35mm, no text",
      gallery: [
        "Close-up of a chef's hands plating a delicate vegan dish with tweezers, tiny microgreens being placed on a white ceramic plate, soft daylight from above, fresh herbs and edible flowers nearby, behind-the-scenes editorial, 50mm shallow depth of field",
        "Wide shot of a sage green velvet chair beside a pale oak table, hanging trailing plant in a macramé hanger overhead, soft window light, white ceramic vase with a single fresh green sprig, calm minimalist atmosphere, no people, 35mm",
        "Detail of a wooden counter laden with bowls of fresh seasonal vegetables and herbs (rocket, basil, baby beets, microherbs), a chef's knife on a wooden cutting board, soft natural light, behind-the-scenes editorial, 35mm",
        "Top-down of a glass jar of fermenting kombucha on a marble counter, hanging plants, a small bottle of cold-pressed olive oil beside, fresh ginger root, bright airy light, editorial detail, 50mm",
        "Wide bright shot of the kitchen pass through into the dining room, white ceramic plates being prepared, plants visible in soft focus background, large window flooding the space with natural light, calm minimalist mood, no people, 35mm",
      ],
      dishes: [
        { itemName: "Risotto de hribi cu trufe negre", prompt: "Editorial three-quarter view of a shallow white ceramic bowl of creamy mushroom risotto with sauteed porcini visible, generous shavings of cashew-based vegan parmesan, dark truffle slices on top, drizzle of black truffle oil, fresh parsley, soft natural light, plant-forward minimalist mood, 50mm shallow depth of field" },
        { itemName: "Tofu Benedict cu hollandaise vegan", prompt: "Three-quarter view of two halves of an English muffin topped with sautéed spinach, soft tofu silken disc replacing the egg, generous golden turmeric-tinted vegan hollandaise dripping down, fresh dill, microgreens, white ceramic plate, bright natural light, 50mm" },
        { itemName: "Cannelloni cu spanac și ricotta vegan", prompt: "Top-down editorial of two cannelloni tubes filled with green spinach and white almond ricotta, golden bubbly almond cream top with crispy edges, vibrant red San Marzano sauce around, fresh basil, vegan parmesan shavings, white ceramic plate, soft light, 50mm" },
        { itemName: "Avocado toast cu radish marinat și sumac", prompt: "Editorial top-down of a thick sourdough toast layered with smashed bright green avocado, thin pickled pink radish slices fanned across, dusting of red sumac, microgreens, hemp seeds, drizzle of olive oil, white ceramic plate on pale oak table, bright natural light, 50mm" },
        { itemName: "Tiramisù vegan cu cremă de cocos", prompt: "Three-quarter view of a small glass of vegan tiramisù with layered espresso-soaked savoiardi and creamy white coconut whip, generous dusting of dark cocoa on top, espresso cup beside on pale oak table, soft natural light, plant-forward minimalist background, 50mm shallow depth of field" },
        { itemName: "Cheesecake cu afine pe bază de caju", prompt: "Top-down of a slice of pale ivory cashew-based vegan cheesecake on a small white plate, generous topping of glossy dark blueberry compote and fresh whole blueberries, fresh mint leaf, dusting of crushed pistachio, soft natural daylight, 50mm" },
      ],
    },
    ratingTarget: 4.7,
  },
];
