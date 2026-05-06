/**
 * Idempotent: creates (or replaces) the showcase restaurant Tavli uses to
 * demo the platform to prospective partners. Re-running drops the existing
 * showcase + cascading menu/availability and re-creates from this file's
 * single source of truth.
 *
 * Photos are intentionally NOT seeded here — those will be AI-generated and
 * uploaded via the partner UI / a follow-up script.
 */
import { config } from "dotenv";
config({ path: ".env.prod" });
import { createClient } from "@supabase/supabase-js";

const OWNER_EMAIL = process.env.SHOWCASE_OWNER_EMAIL ?? "hltissink+claude-tavli-qa@gmail.com";
const CITY_SLUG = "bucuresti";
const SLUG = "atelier-floreasca";

interface ItemSpec {
  name: string;
  description: string;
  priceLei: number;
  dietaryTags?: Array<"vegetarian" | "vegan" | "gluten_free" | "spicy" | "chef_pick" | "popular">;
  isChefPick?: boolean;
}

interface SectionSpec {
  name: string;
  intro?: string;
  items: ItemSpec[];
}

const SECTIONS: SectionSpec[] = [
  {
    name: "Aperitive",
    intro: "Aperitive de sezon, de împărțit la masă, fără grabă.",
    items: [
      {
        name: "Pâine de casă cu unt afumat și sare de Praid",
        description:
          "Pâine cu maia naturală, fermentată 36 de ore. Unt afumat cu lemn de fag și sare grunjoasă de Praid.",
        priceLei: 22,
        dietaryTags: ["vegetarian"],
      },
      {
        name: "Burrată de Andria, sfeclă coaptă și pesto de leuștean",
        description:
          "Burrată din Puglia, sfeclă roșie coaptă în crustă de sare, pesto de leuștean și ulei de in presat la rece.",
        priceLei: 48,
        dietaryTags: ["vegetarian", "gluten_free", "chef_pick"],
        isChefPick: true,
      },
      {
        name: "Tartar de vită cu gălbenuș confit și pâine prăjită",
        description:
          "Vită Black Angus tăiată cu cuțitul, gălbenuș confit la 60 °C, capere prăjite, pâine prăjită în unt brun.",
        priceLei: 62,
        dietaryTags: ["popular"],
      },
      {
        name: "Ciuperci sălbatice pe mămăligă moale",
        description:
          "Hribi, gălbiori și zbârciogi sotați cu cimbru și usturoi negru. Mămăligă cu unt și brânză de burduf, mărar proaspăt.",
        priceLei: 42,
        dietaryTags: ["vegetarian", "gluten_free"],
      },
    ],
  },
  {
    name: "Feluri principale",
    intro: "Carne gătită lent, pește prins săptămâna asta și două feluri vegetariene fără compromis.",
    items: [
      {
        name: "Tochitură de porc Mangalița, mămăligă și ou ochi",
        description:
          "Mangaliță din Banat gătită lent, 6 ore. Mămăligă cu telemea de oaie, ou prăjit și murături de casă.",
        priceLei: 92,
        dietaryTags: ["chef_pick", "popular"],
        isChefPick: true,
      },
      {
        name: "Sarmalele casei cu mămăligă și smântână",
        description:
          "Sarmale în foi de viță, cu carne de porc și vițel, gătite în vin alb cu boia dulce. Mămăligă cremoasă, smântână grasă.",
        priceLei: 78,
        dietaryTags: ["popular"],
      },
      {
        name: "File de biban-de-mare cu legume de sezon",
        description:
          "Biban-de-mare glasat cu unt brun și migdale prăjite. Mazăre proaspătă, sparanghel verde, ulei de pătrunjel.",
        priceLei: 124,
        dietaryTags: ["gluten_free"],
      },
      {
        name: "Risotto cu hribi și parmigiano 36 luni",
        description:
          "Carnaroli cu fond preparat din hribi uscați. Parmigiano reggiano de 36 de luni, ulei de trufe albe.",
        priceLei: 76,
        dietaryTags: ["vegetarian", "gluten_free"],
      },
      {
        name: "Coastă de vită afumată 14 ore",
        description:
          "Coastă afumată cu lemn de cireș, glasaj de vin roșu și miere de mănăstire. Cartofi confitați în grăsime de rață.",
        priceLei: 138,
        dietaryTags: ["chef_pick"],
        isChefPick: true,
      },
    ],
  },
  {
    name: "Deserturi",
    intro: "Trei feluri pentru sfârșit de masă: un clasic românesc, un clasic european și o mică surpriză.",
    items: [
      {
        name: "Papanași cu dulceață de afine și smântână",
        description:
          "Papanași prăjiți la comandă. Dulceață de afine de munte, fiartă în casă. Smântână grasă din Bucovina, mentă proaspătă.",
        priceLei: 32,
        dietaryTags: ["chef_pick", "popular"],
        isChefPick: true,
      },
      {
        name: "Tartă de mere cu crustă de migdale și înghețată de scorțișoară",
        description:
          "Mere golden românești coapte cu zahăr brun, crustă fragedă de migdale, înghețată de scorțișoară făcută în casă.",
        priceLei: 28,
        dietaryTags: ["vegetarian"],
      },
      {
        name: "Crème brûlée cu lavandă",
        description:
          "Cremă fină cu lavandă proaspătă. Crustă de zahăr brun caramelizată la masă.",
        priceLei: 26,
        dietaryTags: ["vegetarian", "gluten_free"],
      },
    ],
  },
  {
    name: "Băuturi Selecte",
    intro: "Vinuri naturale, apă plată și un espresso ales cu grijă.",
    items: [
      {
        name: "Fetească Neagră 2021 — Crama Bauer (sticlă)",
        description:
          "Dealu Mare. Fructe de pădure, condimente blânde, o notă delicată de fum. Se potrivește cu Mangalița și coasta de vită.",
        priceLei: 145,
      },
      {
        name: "Limonadă de soc cu mentă și pepene",
        description:
          "Soc proaspăt din pădurile Transilvaniei, mentă proaspătă, pepene roșu și o sferă de gheață.",
        priceLei: 22,
        dietaryTags: ["vegan", "gluten_free"],
      },
      {
        name: "Espresso de specialitate — Origo",
        description:
          "Arabica de pe o singură fermă din Yirgacheffe, Etiopia. Prăjită săptămânal la Origo, București.",
        priceLei: 18,
        dietaryTags: ["vegan", "gluten_free"],
      },
    ],
  },
];

const AVAILABILITY = [
  { dayOfWeek: 2, slotStart: "12:00:00", slotEnd: "23:00:00", capacity: 38 }, // Tue
  { dayOfWeek: 3, slotStart: "12:00:00", slotEnd: "23:00:00", capacity: 38 }, // Wed
  { dayOfWeek: 4, slotStart: "12:00:00", slotEnd: "23:00:00", capacity: 38 }, // Thu
  { dayOfWeek: 5, slotStart: "12:00:00", slotEnd: "23:30:00", capacity: 38 }, // Fri
  { dayOfWeek: 6, slotStart: "12:00:00", slotEnd: "23:30:00", capacity: 38 }, // Sat
  { dayOfWeek: 0, slotStart: "11:00:00", slotEnd: "22:00:00", capacity: 38 }, // Sun
  // Mon (1) closed: no row.
];

const SCHEDULE = [
  { days: "Marți – Sâmbătă", hours: "12:00 – 23:00" },
  { days: "Duminică", hours: "11:00 – 22:00" },
  { days: "Luni", hours: "Închis" },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. resolve owner + city
  const { data: owner } = await admin
    .from("profiles")
    .select("id")
    .eq("email", OWNER_EMAIL)
    .maybeSingle();
  if (!owner) throw new Error(`owner profile not found: ${OWNER_EMAIL}`);

  const { data: city } = await admin
    .from("cities")
    .select("id")
    .eq("slug", CITY_SLUG)
    .maybeSingle();
  if (!city) throw new Error(`city not found: ${CITY_SLUG}`);

  // 2. drop existing showcase (cascades menu/sections/items/availability/photos)
  await admin
    .from("restaurants")
    .delete()
    .eq("slug", SLUG)
    .eq("city_id", city.id);

  // 3. insert restaurant
  const { data: rest, error: restErr } = await admin
    .from("restaurants")
    .insert({
      slug: SLUG,
      name: "Atelier Floreasca",
      cuisines: ["Romanian", "European"],
      city_id: city.id,
      zone: "Floreasca",
      price_level: 3,
      lat: 44.4575,
      lng: 26.1015,
      description:
        "Bucătărie românească contemporană într-un atelier intim cu 38 de locuri, în inima Floreascăi. Schimbăm meniul săptămânal, după producătorii cu care lucrăm. O listă scurtă de vinuri naturale și rețete vechi reinterpretate.",
      hero_note: "De la fermă, în farfurie. Din pădure, în pahar.",
      address: "Strada Glinka 9, Floreasca, București",
      phone: "+40 21 234 5678",
      email: "hltissink+atelier-floreasca@gmail.com",
      tags: ["sezon", "vinuri naturale", "intim", "atelier"],
      schedule: SCHEDULE,
      status: "live",
      owner_user_id: owner.id,
    })
    .select("id")
    .single();
  if (restErr || !rest) throw restErr ?? new Error("restaurant insert returned nothing");

  // 4. menu (one row per restaurant)
  const { error: menuErr } = await admin.from("menus").insert({
    restaurant_id: rest.id,
    currency: "lei",
    hero_note:
      "Meniul urmează sezonul. Întrebați chelnerul ce ne-au trimis fermierii săptămâna asta.",
  });
  if (menuErr) throw menuErr;

  // 5. sections + items
  for (let s = 0; s < SECTIONS.length; s++) {
    const section = SECTIONS[s];
    const { data: sectionRow, error: sErr } = await admin
      .from("menu_sections")
      .insert({
        restaurant_id: rest.id,
        name: section.name,
        intro: section.intro ?? null,
        sort_order: s,
      })
      .select("id")
      .single();
    if (sErr || !sectionRow) throw sErr ?? new Error("section insert returned nothing");

    const itemRows = section.items.map((it, idx) => ({
      restaurant_id: rest.id,
      section_id: sectionRow.id,
      name: it.name,
      description: it.description,
      price_cents: it.priceLei * 100,
      currency: "lei",
      dietary_tags: it.dietaryTags ?? [],
      is_chef_pick: it.isChefPick ?? false,
      is_available: true,
      sort_order: idx,
    }));
    const { error: iErr } = await admin.from("menu_items").insert(itemRows);
    if (iErr) throw iErr;

    console.log(`✓ section "${section.name}" — ${section.items.length} items`);
  }

  // 6. availability
  const availRows = AVAILABILITY.map((a) => ({
    restaurant_id: rest.id,
    day_of_week: a.dayOfWeek,
    slot_start: a.slotStart,
    slot_end: a.slotEnd,
    capacity: a.capacity,
  }));
  const { error: aErr } = await admin.from("restaurant_availability").insert(availRows);
  if (aErr) throw aErr;
  console.log(`✓ availability — ${availRows.length} rows`);

  console.log("\n— Showcase live —");
  console.log(`  discovery:   https://tavli.ro/${CITY_SLUG}`);
  console.log(`  detail:      https://tavli.ro/${CITY_SLUG}/${SLUG}`);
  console.log(`  diner menu:  https://tavli.ro/${CITY_SLUG}/${SLUG}/menu`);
  console.log(`  partner UI:  log in as ${OWNER_EMAIL}\n`);
}

main().catch((err) => {
  console.error("create-showcase-restaurant failed:", err);
  process.exit(1);
});
