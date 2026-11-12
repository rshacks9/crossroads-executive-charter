// Editorial content for the public site: things vAMSYS does not hold (aircraft roles, planning
// figures, sample itineraries, SOPs, news). Everything numeric about the airline's activity still
// comes from snapshot.json; nothing here may claim members, statistics, awards or real-world status.

import { capital, numberWord } from "./html-facts";

/**
 * The types based at Indianapolis Executive (KTYQ): the light and mid-size jets that fly from it, and
 * the Piper M600, listed there with the Executive division although its only routes are its own hop
 * between Westfield-Barnes (KBAF) and Hartford (KBDL), CRX751/752. Everything else is based at KIND.
 */
export const KTYQ_TYPES = ["M600", "C510", "PRM1", "C25C", "LJ35", "E55P", "H25B", "C750"] as const;

/** The KTYQ types that fly from KTYQ: all but the Piper M600. Copy that says what works from KTYQ means these. */
export const KTYQ_JETS: readonly string[] = KTYQ_TYPES.filter((code) => code !== "M600");

export function baseFor(code: string): "KTYQ" | "KIND" {
  return (KTYQ_TYPES as readonly string[]).includes(code) ? "KTYQ" : "KIND";
}

export interface FleetInfo {
  role: string;
  /** Crossroads planning range in nm, rounded and conservative (see the fleet page footnote). */
  range_nm: number;
  cruise_kt: number;
  blurb: string;
  livery?: { src: string; alt: string };
}

export const FLEET_INFO: Record<string, FleetInfo> = {
  M600: {
    role: "Single-engine turboprop",
    range_nm: 1100,
    cruise_kt: 260,
    blurb: "The only turboprop on the line, flown single-pilot. It flies the short hop between Westfield-Barnes and Bradley International at Hartford.",
  },
  C510: {
    role: "Entry light jet",
    range_nm: 950,
    cruise_kt: 340,
    blurb: "Where every Crossroads career starts. Four seats, simple systems and the short hops to Chicago, Nashville and Louisville that teach the KTYQ routine.",
    livery: { src: "img/livery/c510.webp", alt: "Citation Mustang in the Crossroads livery: white with a charcoal and orange cheatline and the crossroads mark on the tail" },
  },
  PRM1: {
    role: "Light jet, single pilot",
    range_nm: 1150,
    cruise_kt: 450,
    blurb: "The Premier IA is quicker than the Mustang with a roomier cabin. It flew the first setup test flight, CRX115 to Chicago Midway, while the airline was being built.",
  },
  C25C: {
    role: "Light jet workhorse",
    range_nm: 1800,
    cruise_kt: 430,
    blurb: "Modern avionics and enough legs for Aspen, Scottsdale and Van Nuys. It's the jet most of the KTYQ schedule is built around.",
  },
  LJ35: {
    role: "Classic fast light jet",
    range_nm: 1700,
    cruise_kt: 440,
    blurb: "Steam-era handling with a fast cruise. You hand-fly more of it, and you have to watch the numbers at hot-and-high airports.",
  },
  E55P: {
    role: "Light jet, long legs",
    range_nm: 1950,
    cruise_kt: 450,
    blurb: "The Phenom 300E is the newest jet at KTYQ. It is flown single-pilot, is comfortable on short runways and is on every light-jet route within its range, including the mountain fields and London City.",
  },
  H25B: {
    role: "Mid-size cabin",
    range_nm: 2300,
    cruise_kt: 430,
    blurb: "A stand-up cabin and transcontinental legs from KTYQ. The Hawker flies most light and mid-size executive routes.",
  },
  C750: {
    role: "High-speed mid-size",
    range_nm: 2900,
    cruise_kt: 500,
    blurb: "The fastest jet at KTYQ and the largest the field takes. It flew CRX121 to Hartford on a setup test flight while the airline was being built.",
  },
  C700: {
    role: "Super-midsize",
    range_nm: 3300,
    cruise_kt: 470,
    blurb: "Nonstop coast to coast from KIND with a flat-floor cabin: Teterboro, Los Cabos and the Caribbean.",
  },
  GLF6: {
    role: "Ultra-long-range",
    range_nm: 6500,
    cruise_kt: 490,
    blurb: "It crosses the Atlantic to Luton, Farnborough, Le Bourget, Geneva and Nice, all nonstop from Indianapolis.",
  },
  GA7C: {
    role: "Flagship business jet",
    range_nm: 7000,
    cruise_kt: 490,
    blurb: "The longest-legged executive jet on the line, on the same long-range routes as the G650 with more cabin.",
  },
  BCS3: {
    role: "VIP airliner, 48 seats",
    range_nm: 3000,
    cruise_kt: 450,
    blurb: "An executive-configured A220 for delegations and private groups, and a regular on sports charters.",
  },
  A346: {
    role: "VIP widebody, 100 seats",
    range_nm: 7000,
    cruise_kt: 480,
    blurb: "Four engines and a 100-seat premium cabin for tours and long-range groups to Europe and the West Coast.",
  },
  A388: {
    role: "VIP flagship, 150 seats",
    range_nm: 7500,
    cruise_kt: 490,
    blurb: "A 150-seat executive A380 for the biggest charters: Las Vegas, Los Angeles, Houston, Le Bourget and Geneva.",
  },
  E175: {
    role: "Regional group charter",
    range_nm: 1500,
    cruise_kt: 450,
    blurb: "Seventy-six seats sized for teams and corporate groups on regional game-day trips.",
  },
  E190: {
    role: "Group and sports charter",
    range_nm: 1900,
    cruise_kt: 450,
    blurb: "One hundred seats with the range for Cancun and the West. The first Crossroads airliner livery is on the E190.",
    livery: { src: "img/livery/e190.webp", alt: "Embraer E190 in the Crossroads livery: white with a charcoal and orange cheatline and the crossroads mark on the tail" },
  },
  B752: {
    role: "Charter heavy lifter",
    range_nm: 3500,
    cruise_kt: 460,
    blurb: "One hundred and eighty seats and short-field performance. It flies almost all domestic sports and group legs.",
  },
  A306: {
    role: "Medium freighter",
    range_nm: 2400,
    cruise_kt: 450,
    blurb: "The ad-hoc freighter for domestic runs to Miami, Ontario, Newark and Oakland.",
  },
  MD11: {
    role: "Tri-jet freighter",
    range_nm: 4000,
    cruise_kt: 480,
    blurb: "A demanding tri-jet freighter for Anchorage, Leipzig and Stansted. Respect the landing.",
  },
  B77L: {
    role: "Long-haul freighter",
    range_nm: 4800,
    cruise_kt: 490,
    blurb: "The heaviest lift we fly, on every cargo route from Indianapolis to Alaska and Europe.",
  },
};

// ------------------------------------------------------------------ services

export interface ItineraryLeg {
  callsign: string;
  aircraft: string;
  note: string;
}

export interface Service {
  /** Must match a division name in site.config.json. */
  division: string;
  slug: string;
  headline: string;
  pitch: string;
  points: string[];
  itinerary: { title: string; legs: ItineraryLeg[] };
}

export const SERVICES: Service[] = [
  {
    division: "Executive",
    slug: "executive",
    headline: "Executive: the light-jet heart of the airline",
    pitch: "Short-notice business flying from Indianapolis Executive, the way a Part 135 operator would run it: light jets, short taxis and a schedule built around meetings.",
    points: [
      `${capital(numberWord(KTYQ_JETS.length))} light and mid-size jets at KTYQ, from the Mustang to the Citation\u00a0X`,
      "Longitude, G650 and G700 at KIND for coast-to-coast and transatlantic trips",
      "The Piper M600 turboprop on its own hop between Westfield-Barnes and Hartford",
      "Ski fields (Aspen, Vail) are off-limits to the Mustang and Premier",
      "Short hops under an hour for when you have one evening to fly",
    ],
    itinerary: {
      title: "Sample week: a client meeting in New Jersey and a ski weekend",
      legs: [
        { callsign: "CRX101", aircraft: "C25C", note: "Monday 07:30 out of KTYQ, wheels down at Teterboro for a midtown lunch." },
        { callsign: "CRX102", aircraft: "C25C", note: "Same-day return. Home for dinner." },
        { callsign: "CRX107", aircraft: "C750", note: "Friday: the Citation X to Aspen. Brief the mountain arrival and run the numbers for a hot-and-high departure." },
        { callsign: "CRX108", aircraft: "C750", note: "Sunday afternoon back to Indianapolis Executive." },
      ],
    },
  },
  {
    division: "Executive Charter",
    slug: "executive-charter",
    headline: "Executive Charter: VIP airliners",
    pitch: "When the group outgrows a business jet. Executive-configured Airbus aircraft fly delegations, tours and private parties from Indianapolis International.",
    points: [
      "A220-300 with 48 seats, A340-600 with 100 and A380 with 150",
      "Long-range legs to Le Bourget, Geneva, Zurich and Los Cabos",
      "Business-jet flexibility, airliner procedures: full SimBrief OFPs and cost index",
      "Shares the KIND ramp with the Gulfstreams and freighters",
    ],
    itinerary: {
      title: "Sample trip: a 150-seat delegation to Paris",
      legs: [
        { callsign: "CRX503", aircraft: "A388", note: "Overnight A380 departure from KIND, North Atlantic Track to Le Bourget." },
        { callsign: "CRX504", aircraft: "A388", note: "Westbound return after the show. Expect a headwind and plan fuel for it." },
      ],
    },
  },
  {
    division: "Group & Sports Charter",
    slug: "group-sports",
    headline: "Group & Sports Charter: teams, tours and incentive trips",
    pitch: "Indianapolis is a sports town. Our E-Jets and the 757 take teams, bands and incentive groups to game-day cities and sunshine.",
    points: [
      "E175 (76 seats), E190 (100) and 757-200 (180), plus the A220 and A340 on longer legs",
      "Game-day cities: Boston, Phoenix, Denver, Minneapolis, Houston, Seattle and more",
      "Group getaways to Orlando, Las Vegas, Tampa and Cancun",
      "Quick turns and tight slot times, the way charter flying really works",
    ],
    itinerary: {
      title: "Sample road trip: an away game in Phoenix",
      legs: [
        { callsign: "CRX311", aircraft: "B752", note: "Thursday: team, staff and equipment in the 757, KIND to Phoenix Sky Harbor." },
        { callsign: "CRX312", aircraft: "B752", note: "Post-game red-eye back to Indianapolis. Fly a stable approach into KIND at dawn." },
      ],
    },
  },
  {
    division: "Cargo Charter",
    slug: "cargo",
    headline: "Cargo Charter: ad-hoc freight from a cargo city",
    pitch: "Indianapolis International is a major air-cargo airport. Our freighters fly the urgent loads: parts, perishables and anything that can't wait for a scheduled service.",
    points: [
      "A300-600F, MD-11F and 777F, all based at KIND",
      "Domestic runs to Miami, Ontario, Newark and Oakland",
      "Long-haul runs to Anchorage, Leipzig and London Stansted",
      "Cargo routes show dashed on every map",
    ],
    itinerary: {
      title: "Sample rotation: an urgent load to Europe and back",
      legs: [
        { callsign: "CRX607", aircraft: "B77L", note: "777F, KIND to Leipzig/Halle overnight with a heavy main deck. Plan the North Atlantic crossing." },
        { callsign: "CRX608", aircraft: "B77L", note: "Return load back to Indianapolis the next evening." },
      ],
    },
  },
];

// ------------------------------------------------------------------ external links

/** Official vAMSYS documentation for Pegasus ACARS (verified 2026-11-11: 200, "Pegasus ACARS | vAMSYS"). */
export const PEGASUS_URL = "https://vamsys.co.uk/docs/pegasus/pegasus-acars";

/**
 * The Crossroads rules on vAMSYS, which pilots accept when they register (verified 2026-11-12: 200,
 * the Booking and PIREP Guide with the airline rules; public, no sign-in needed).
 */
export const RULES_URL = "https://vamsys.io/crossroads/rules";

/** The one VATSIM flight plan remark for Crossroads flights, wherever the site tells pilots what to file. */
export const VATSIM_REMARKS = "CALLSIGN/CROSSROADS";

// ------------------------------------------------------------------ handbook

export const FLIGHT_NUMBER_BLOCKS: { block: string; use: string; base: string }[] = [
  { block: "CRX101–199", use: "Executive, light and mid-size jets (incl. point-to-point legs)", base: "KTYQ" },
  { block: "CRX201–299", use: "Group charter", base: "KIND" },
  { block: "CRX301–399", use: "Sports charter", base: "KIND" },
  { block: "CRX401–499", use: "Executive, large-cabin jets (incl. point-to-point legs)", base: "KIND" },
  { block: "CRX501–599", use: "International and long-range (incl. point-to-point legs)", base: "KIND" },
  { block: "CRX601–699", use: "Cargo charter", base: "KIND" },
  { block: "CRX701–799", use: "Executive, light and mid-size jets (overflow block, incl. point-to-point legs), and CRX751/752, the Piper M600's own hop between Westfield-Barnes and Hartford", base: "KTYQ" },
];

export const COST_INDEX: { group: string; types: string; guidance: string }[] = [
  { group: "Light and mid-size jets", types: "Mustang, Premier IA, CJ4, Learjet 35A, Phenom 300E, Hawker 800XP, Citation X", guidance: "No cost index. Fly the type's normal (long-range) cruise schedule. High-speed cruise is fine on short hops." },
  { group: "Turboprop", types: "Piper M600", guidance: "No cost index. Fly the normal cruise power setting; it is a 13 nm hop, so expect to level off low." },
  { group: "Large-cabin business jets", types: "Longitude, G650, G700", guidance: "Normal cruise Mach. Long-range cruise on transatlantic legs." },
  { group: "Passenger airliners", types: "E175, E190, A220, 757, A340, A380", guidance: "CI 30–50. Up to CI 80 to make up a late departure on a group or sports charter." },
  { group: "Freighters", types: "A300-600F, MD-11F, 777F", guidance: "CI 20–40. Lower on long overwater legs." },
];

export const FUEL_POLICY: string[] = [
  "Dispatch every flight with a SimBrief OFP. The Crew Tools fuel figures are planning estimates, not a dispatch release.",
  "Block fuel = taxi + trip + contingency (5% of trip, minimum 5 minutes) + alternate + final reserve + any extra the captain wants.",
  "Final reserve is 45 minutes at holding fuel flow on every Crossroads flight. Crew Tools uses the same figure.",
  "File an alternate whenever the destination forecast is below VFR or the TAF has TEMPO or PROB groups for low ceilings.",
  "Plan for winter westbound headwinds on the long light-jet legs (Van Nuys, Scottsdale, Las Vegas) and accept a fuel stop if the numbers say so.",
  "Never land with less than final reserve. If you expect to, divert. A diversion PIREP with a comment is good airmanship.",
];

export const LANDING_RATES: { band: string; label: string; tone: "good" | "ok" | "warn" | "bad" }[] = [
  { band: "60–250 fpm", label: "Target. A firm, positive touchdown in the zone", tone: "good" },
  { band: "250–400 fpm", label: "Acceptable, especially on short or wet runways", tone: "ok" },
  { band: "400–600 fpm", label: "Firm. Add a line about it in your PIREP comments", tone: "warn" },
  { band: "Over 600 fpm", label: "Hard landing. Note it in the PIREP and expect a staff review", tone: "bad" },
];

export const SOP_RULES: { title: string; body: string; link?: { href: string; label: string } }[] = [
  { title: "Right base, right aircraft", body: "Light and mid-size jets, from the Mustang to the Citation X, start and end at Indianapolis Executive, KTYQ. Everything larger works from Indianapolis International, KIND. The Piper M600 turboprop flies only its own hop, between Westfield-Barnes and Hartford. Book a route that matches the aircraft." },
  { title: "Gate to gate with Pegasus", link: { href: PEGASUS_URL, label: "Pegasus ACARS guide (vAMSYS docs)" }, body: "Start Pegasus before engine start and leave it running until the engines are off at the gate. No slew, no time acceleration, no in-flight refuelling. If real life calls, pause and say so in your PIREP comments." },
  { title: "Stabilised or go around", body: "On speed, on path and configured by 1,000 ft above the airport in cloud and 500 ft in visual conditions. If you aren't, go around. Nobody is penalised for a go-around." },
  { title: "Speed and altitude discipline", body: "250 kt below 10,000 ft in the US unless ATC says otherwise. Respect published SID and STAR restrictions and any noise abatement procedure published for the airport." },
  { title: "Online or offline", body: `Fly on VATSIM if you like. You don't have to. Online, use your CRX callsign, follow the network's rules and put ${VATSIM_REMARKS} in your flight plan remarks.` },
  { title: "Write it up", body: "PIREP comments are read. Diversions, go-arounds, technical issues and firm landings all belong there. Honest write-ups are part of the job." },
];

// ------------------------------------------------------------------ tours (vAMSYS Activities)

export interface Tour {
  name: string;
  window: string;
  points: number;
  summary: string;
  /** Airport pairs in order; each is a scheduled Crossroads route. */
  legs: [string, string][];
  /** The beginner tour: its first leg is the suggested first flight on the Fly with us page. */
  starter?: boolean;
}

export const TOURS: Tour[] = [
  {
    name: "Ski Season Tour 2026-27",
    window: "11 November 2026 to 15 April 2027",
    points: 500,
    summary: "Four mountain fields from Indianapolis Executive in the CJ4, Phenom 300E, Learjet, Hawker or Citation X. Brief the terrain and the hot-and-high numbers on every leg.",
    legs: [["KTYQ", "KEGE"], ["KEGE", "KTYQ"], ["KTYQ", "KASE"], ["KASE", "KTYQ"], ["KTYQ", "KJAC"], ["KJAC", "KTYQ"], ["KTYQ", "KSUN"], ["KSUN", "KTYQ"]],
  },
  {
    name: "Across the Pond: Transatlantic Executive Tour",
    window: "11 November 2026 to 30 June 2027",
    points: 750,
    summary: "Three European business capitals from KIND in the G650, G700, A340 or A380, with a North Atlantic crossing on every leg.",
    legs: [["KIND", "LFPB"], ["LFPB", "KIND"], ["KIND", "LSGG"], ["LSGG", "KIND"], ["KIND", "LSZH"], ["LSZH", "KIND"]],
  },
  {
    name: "Crossroads Circuit",
    window: "11 November 2026 to 31 December 2027",
    points: 300,
    summary: "Eight short legs out of Indianapolis Executive, each about an hour or less, in any KTYQ light or mid-size jet. A good way to learn a new type.",
    starter: true,
    legs: [["KTYQ", "KSDF"], ["KSDF", "KTYQ"], ["KTYQ", "KMDW"], ["KMDW", "KTYQ"], ["KTYQ", "KCMH"], ["KCMH", "KTYQ"], ["KTYQ", "KBNA"], ["KBNA", "KTYQ"]],
  },
];

// ------------------------------------------------------------------ news / NOTAMs

export interface NewsItem {
  date: string; // ISO date
  kind: "News" | "NOTAM" | "Fleet" | "Network";
  title: string;
  body: string;
  link?: { href: string; label: string };
}

export const NEWS: NewsItem[] = [
  {
    date: "2026-11-11",
    kind: "Fleet",
    title: "Phenom 300E joins KTYQ",
    body: "Embraer Phenom 300E N300CR is now based at Indianapolis Executive and flies every KTYQ and point-to-point light-jet route within its 1,950 nm planning range, including the mountain airports, the Caribbean and London City.",
    link: { href: "#/fleet/E55P", label: "Phenom 300E" },
  },
  {
    date: "2026-11-11",
    kind: "Network",
    title: "Network now 310 routes; airport restrictions applied",
    body: "Sixteen routes are new: a KTYQ-KIND positioning leg (CRX733/734), Martha's Vineyard from KTYQ and Teterboro, Van Nuys-Las Vegas, Denver Centennial-Aspen, Opa-locka-Nassau, White Plains-Boca Raton and Chicago Midway-Teterboro. With them and the two Columbus legs flown in the Crossroads Circuit (CRX731/732), the schedule has 310 routes. Fleets were also tidied to match real airport limits: no Gulfstreams at Aspen (95 ft wingspan limit) or London City (steep approach), no A220 at Teterboro (weight limit), and no A340-600 at Van Nuys, Luton or St Maarten.",
    link: { href: "#/routes", label: "Explore the network" },
  },
  {
    date: "2026-11-11",
    kind: "News",
    title: "New tour: Crossroads Circuit",
    body: "Eight short legs from KTYQ to Louisville, Chicago Midway, Columbus and Nashville and back, in any KTYQ jet, for 300 points. It runs until 31 December 2027. Register under Events in Phoenix, the vAMSYS pilot portal.",
    link: { href: "#/careers", label: "Tour legs and details" },
  },
  {
    date: "2026-11-11",
    kind: "Network",
    title: "Network now 292 routes",
    body: "We added 134 routes and 39 airports, taking the schedule from 158 to 292 routes at 111 airports. New light-jet flying from KTYQ to Sun Valley, Montrose, Steamboat, Bozeman, Truckee, the Caribbean and the Northeast; Munich, Zurich, Madrid, Milan Linate and Shannon from KIND, plus a Liege cargo run; and a new CRX701 block for KTYQ and point-to-point legs. The routes to Honolulu, Jackson Hole, Nassau, Providenciales, New Orleans, Philadelphia, Hilton Head and Cleveland Burke Lakefront are back on the schedule too.",
    link: { href: "#/routes", label: "Explore the network" },
  },
  {
    date: "2026-11-11",
    kind: "News",
    title: "Two tours open: Ski Season 2026-27 and Across the Pond",
    body: "The Ski Season Tour 2026-27 (8 legs, KTYQ to Vail, Aspen, Jackson Hole and Sun Valley and back) runs until 15 April 2027. Across the Pond (6 legs, KIND to Paris Le Bourget, Geneva and Zurich and back) runs until 30 June 2027. Register for both under Events in Phoenix, the vAMSYS pilot portal; finishing a tour earns bonus points.",
    link: { href: "#/careers", label: "Tour legs and details" },
  },
  {
    date: "2026-11-11",
    kind: "News",
    title: "Setup test flights",
    body: "While the airline was being built, the founder's automation tools flew three setup test flights: CRX115 Indianapolis Executive to Chicago Midway in the Premier IA, CRX116 back to KTYQ in the Citation Mustang, and CRX121 KTYQ to Hartford Bradley in the Citation X. They were tests of the airline's setup, not pilot flights.",
    link: { href: "#/routes", label: "See the routes" },
  },
  {
    date: "2026-11-11",
    kind: "Network",
    title: "Network expansion: 100 new routes",
    body: "Fifty new route pairs and 40 new airports are now live in vAMSYS, among them Vail, Geneva, Nice, Farnborough, Cancun, Bermuda and Toronto, plus new sports-charter cities from Seattle to Minneapolis. The Hawker 800XP and Citation X were added to the existing KTYQ routes in the same import. Every route on this site can be booked.",
    link: { href: "#/routes", label: "Explore the network" },
  },
  {
    date: "2026-11-11",
    kind: "Fleet",
    title: "Premier IA, Citation X and Hawker 800XP join KTYQ",
    body: "Three new jets at Indianapolis Executive: Beechcraft Premier IA N390CR, Cessna Citation X N750CR and Hawker 800XP N800CR. The Hawker and Citation X are now on most light/mid executive routes within their range.",
    link: { href: "#/fleet", label: "Meet the fleet" },
  },
  {
    date: "2026-11-10",
    kind: "Fleet",
    title: "First Crossroads liveries for the Mustang and E190",
    body: "Our livery is white with a charcoal and orange cheatline and the crossroads mark on the tail. It's in work for the Citation Mustang and the E190, and preview renders are on the fleet page.",
    link: { href: "#/fleet", label: "See the renders" },
  },
  {
    date: "2026-11-10",
    kind: "NOTAM",
    title: "Base rule: KTYQ for light and mid-size jets, KIND for everything larger",
    body: "Light and mid-size jets, from the Mustang to the Citation X, work from Indianapolis Executive (KTYQ). The Longitude, Gulfstreams, airliners and freighters work from Indianapolis International (KIND). The Piper M600 turboprop flies only its own hop, between Westfield-Barnes and Hartford. Routes in vAMSYS only offer the aircraft that fit.",
    link: { href: "#/handbook", label: "Read the handbook" },
  },
  {
    date: "2026-11-10",
    kind: "NOTAM",
    title: "Crew Tools briefings are live",
    body: "Every route now has a briefing on this site with live METAR and TAF, runway wind components, a phase-by-phase fuel estimate and a 3° approach card, refreshed with the schedule. For simulator use only.",
    link: { href: "#/crew", label: "Open Crew Tools" },
  },
  {
    date: "2026-11-10",
    kind: "News",
    title: "Crossroads Executive & Charter opens on vAMSYS",
    body: "The airline is set up on vAMSYS with one hub (Indianapolis, KTYQ and KIND), four divisions and a six-rank career ladder from Cadet to Chief Pilot. Live flight tracking on this site switches on once the vAMSYS data connection is enabled.",
    link: { href: "#/pilots", label: "How to join" },
  },
];
