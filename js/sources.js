// ---------------------------------------------------------------
// Source registry
// Every quick-link card in the Discovery tab comes from here. Each
// entry is a record collection or finding aid that gets a prefilled
 // link built from the search context. Adding a collection or a
// place-specific guide is a data entry, not new code.
//
 // ctx: { givenName, surname, variants[], state, county, city, enslaver, region }
// `type` must match an option in the log modal's "Source type" select.
 // `group` controls result section headings in Discovery.
 // `planChecklist: true` includes the source on Research Plan step 3.
 // URLs verified / curated July 2026 — prefer free/open collections.
// ---------------------------------------------------------------

const FORMER_SLAVE_STATES = new Set([
  'Alabama','Arkansas','Delaware','District of Columbia','Florida','Georgia',
  'Kentucky','Louisiana','Maryland','Mississippi','Missouri','North Carolina',
  'South Carolina','Tennessee','Texas','Virginia','West Virginia'
]);
const US_PLACES = new Set([
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois',
  'Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts',
  'Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota',
  'Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
  'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
  'Wisconsin','Wyoming'
]);
const CARIBBEAN_PLACES = new Set([
  'Antigua and Barbuda','Bahamas','Barbados','Bermuda','Cuba','Dominica',
  'Dominican Republic','Grenada','Guyana','Haiti','Jamaica','Puerto Rico',
  'Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines',
  'Suriname','Trinidad and Tobago','U.S. Virgin Islands'
]);
const CANADA_PLACES = new Set(['Canada','Nova Scotia','Ontario','Quebec','New Brunswick']);
const UK_PLACES = new Set(['England','Scotland','Wales','Ireland','United Kingdom']);
const AFRICA_PLACES = new Set([
  'Angola','Benin','Congo','Ghana','Nigeria','Senegal','Sierra Leone',
  'Liberia','West Africa (general)'
]);
const LATIN_AMERICA_PLACES = new Set([
  'Brazil','Colombia','Mexico','Panama','Latin America (general)'
]);

// Place picker for Discovery + Plan (optgroups rendered by the UI).
const PLACE_GROUPS = [
  {
    label: 'U.S. — former slave states & D.C.',
    places: [
      'Alabama','Arkansas','Delaware','District of Columbia','Florida','Georgia',
      'Kentucky','Louisiana','Maryland','Mississippi','Missouri','North Carolina',
      'South Carolina','Tennessee','Texas','Virginia','West Virginia'
    ]
  },
  {
    label: 'U.S. — all other states',
    places: [
      'Alaska','Arizona','California','Colorado','Connecticut','Hawaii','Idaho',
      'Illinois','Indiana','Iowa','Kansas','Maine','Massachusetts','Michigan',
      'Minnesota','Montana','Nebraska','Nevada','New Hampshire','New Jersey',
      'New Mexico','New York','North Dakota','Ohio','Oklahoma','Oregon',
      'Pennsylvania','Rhode Island','South Dakota','Utah','Vermont','Washington',
      'Wisconsin','Wyoming'
    ]
  },
  {
    label: 'Caribbean & Guianas',
    places: [
      'Antigua and Barbuda','Bahamas','Barbados','Bermuda','Cuba','Dominica',
      'Dominican Republic','Grenada','Guyana','Haiti','Jamaica','Puerto Rico',
      'Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines',
      'Suriname','Trinidad and Tobago','U.S. Virgin Islands'
    ]
  },
  {
    label: 'Canada',
    places: ['Canada','Nova Scotia','Ontario','Quebec','New Brunswick']
  },
  {
    label: 'United Kingdom & Ireland',
    places: ['United Kingdom','England','Scotland','Wales','Ireland']
  },
  {
    label: 'Africa (ancestral / returnee)',
    places: [
      'West Africa (general)','Ghana','Nigeria','Senegal','Sierra Leone',
      'Benin','Angola','Congo','Liberia'
    ]
  },
  {
    label: 'Latin America',
    places: ['Brazil','Colombia','Mexico','Panama','Latin America (general)']
  },
  {
    label: 'Other',
    places: ['Other / not listed']
  }
];

// Keep US_STATES as a flat list for anything that still expects it
 // (Plan state dropdown uses PLACE_GROUPS via the same helper).
const US_STATES = PLACE_GROUPS.flatMap(g => g.places);

const SOURCE_GROUPS = [
  { id: 'us-census', title: 'U.S. census & schedules' },
  { id: 'us-reconstruction', title: 'Reconstruction & Freedmen records' },
  { id: 'us-enslavement', title: 'Named enslaved people & runaway / lost-family ads' },
  { id: 'us-military', title: 'Military & pensions' },
  { id: 'us-state', title: 'State & local collections' },
  { id: 'newspapers', title: 'Newspapers' },
  { id: 'diaspora-caribbean', title: 'Caribbean & Guianas' },
  { id: 'diaspora-canada', title: 'Canada' },
  { id: 'diaspora-uk', title: 'United Kingdom & Ireland' },
  { id: 'diaspora-africa', title: 'Africa & the Atlantic trade' },
  { id: 'diaspora-latam', title: 'Latin America' },
  { id: 'finding-aids', title: 'Finding aids & broad searches' }
];

function ctxState(ctx){
  return ctx.state && ctx.state !== 'Other / not listed' ? ctx.state : '';
}
function ctxPlace(ctx){
  return [ctx.county, ctx.city, ctxState(ctx)].filter(Boolean).join(', ');
}
function isUs(ctx){ return US_PLACES.has(ctx.state); }
function isUsSouth(ctx){ return FORMER_SLAVE_STATES.has(ctx.state); }
function isCaribbean(ctx){ return CARIBBEAN_PLACES.has(ctx.state); }
function isCanada(ctx){ return CANADA_PLACES.has(ctx.state); }
function isUk(ctx){ return UK_PLACES.has(ctx.state); }
function isAfrica(ctx){ return AFRICA_PLACES.has(ctx.state); }
function isLatAm(ctx){ return LATIN_AMERICA_PLACES.has(ctx.state); }
function placeUnset(ctx){ return !ctx.state; }

function familySearchCollectionUrl(ctx, collectionId){
  let u = 'https://www.familysearch.org/search/record/results?f.collectionId=' + collectionId;
  if(ctx.surname) u += '&q.surname=' + encodeURIComponent(ctx.surname);
  if(ctx.givenName) u += '&q.givenName=' + encodeURIComponent(ctx.givenName);
  const place = ctxPlace(ctx);
  if(place) u += '&q.residencePlace=' + encodeURIComponent(place);
  return u;
}
function familySearchAllUrl(ctx){
  let u = 'https://www.familysearch.org/search/record/results?';
  const parts = [];
  if(ctx.surname) parts.push('q.surname=' + encodeURIComponent(ctx.surname));
  if(ctx.givenName) parts.push('q.givenName=' + encodeURIComponent(ctx.givenName));
  const place = ctxPlace(ctx);
  if(place) parts.push('q.residencePlace=' + encodeURIComponent(place));
  return u + parts.join('&');
}
function naraSearchUrl(terms){
  return 'https://catalog.archives.gov/search?q=' + encodeURIComponent(terms.filter(Boolean).join(' '));
}
function locChroniclingUrl(ctx){
  const q = [ctx.givenName, ctx.surname].filter(Boolean).join(' ');
  let u = 'https://www.loc.gov/collections/chronicling-america/?q=' + encodeURIComponent(q || ctx.surname || '');
  if(ctxState(ctx) && isUs(ctx)) u += '&fa=location:' + encodeURIComponent(ctxState(ctx));
  return u;
}

const SOURCE_REGISTRY = [
  // ----- U.S. census -----
  {
    id: 'census-1870',
    label: '1870 U.S. Census (FamilySearch)',
    type: 'Census / Slave Schedule',
    group: 'us-census',
    planChecklist: false,
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "The anchor record for formerly enslaved people: the first federal census to list them by their own full names.",
    url(ctx){ return familySearchCollectionUrl(ctx, '1438024'); }
  },
  {
    id: 'census-1880',
    label: '1880 U.S. Census (FamilySearch)',
    type: 'Census / Slave Schedule',
    group: 'us-census',
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "Adds relationship to head of household and parents' birthplaces — often the richest census for linking generations.",
    url(ctx){ return familySearchCollectionUrl(ctx, '1417683'); }
  },
  {
    id: 'census-1900',
    label: '1900 U.S. Census (FamilySearch)',
    type: 'Census / Slave Schedule',
    group: 'us-census',
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "Includes month/year of birth and years married — useful for pinning down cohabitation-era couples and migration north.",
    url(ctx){ return familySearchCollectionUrl(ctx, '1325221'); }
  },
  {
    id: 'slave-schedule-1860',
    label: '1860 U.S. Census Slave Schedule (FamilySearch)',
    type: 'Census / Slave Schedule',
    group: 'us-census',
    appliesTo(ctx){ return !!ctx.enslaver && (placeUnset(ctx) || isUsSouth(ctx) || isUs(ctx)); },
    note: "Searched under the candidate enslaver's surname — enslaved people appear as age/sex tallies. Match against your family's known ages.",
    url(ctx){
      const parts = String(ctx.enslaver).trim().split(/\s+/).filter(Boolean);
      const surname = parts.length ? parts[parts.length-1] : '';
      return familySearchCollectionUrl({ surname, county: ctx.county, state: ctx.state }, '3161105');
    }
  },
  {
    id: 'slave-schedule-1850',
    label: '1850 U.S. Census Slave Schedule (FamilySearch)',
    type: 'Census / Slave Schedule',
    group: 'us-census',
    appliesTo(ctx){ return !!ctx.enslaver && (placeUnset(ctx) || isUsSouth(ctx) || isUs(ctx)); },
    note: "Earlier slave schedule under the enslaver's name. A few counties also name individuals — worth checking both 1850 and 1860.",
    url(ctx){
      const parts = String(ctx.enslaver).trim().split(/\s+/).filter(Boolean);
      const surname = parts.length ? parts[parts.length-1] : '';
      return familySearchCollectionUrl({ surname, county: ctx.county, state: ctx.state }, '1420440');
    }
  },

  // ----- Reconstruction / Freedmen -----
  {
    id: 'nmaahc-fb-portal',
    label: "Smithsonian Freedmen's Bureau Search Portal",
    type: "Freedmen's Bureau Record",
    group: 'us-reconstruction',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUsSouth(ctx) || isUs(ctx); },
    note: "Name-indexed and transcribed Bureau records — the deepest free index of the 1.7-million-page collection.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname].filter(Boolean).join(' ') || ctx.surname;
      let u = 'https://nmaahc.si.edu/explore/freedmens-bureau/search?edan_q=' + encodeURIComponent(q);
      let i = 0;
      if(ctxState(ctx) && isUs(ctx)) u += '&edan_fq[' + (i++) + ']=' + encodeURIComponent('p.nmaahc_fb.index.event_state:' + ctxState(ctx));
      if(ctx.county) u += '&edan_fq[' + (i++) + ']=' + encodeURIComponent('p.nmaahc_fb.index.event_county:' + ctx.county);
      return u;
    }
  },
  {
    id: 'freedmans-bank',
    label: "Freedman's Bank Records, 1865–1874 (FamilySearch)",
    type: "Freedman's Bank Record",
    group: 'us-reconstruction',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "Depositor registers often name spouse, children, siblings, birthplace, plantation, and former enslaver — in the depositor's own words.",
    url(ctx){ return familySearchCollectionUrl(ctx, '1417695'); }
  },
  {
    id: 'mapping-fb',
    label: "Mapping the Freedmen's Bureau",
    type: 'Other',
    group: 'us-reconstruction',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUsSouth(ctx); },
    note: "Interactive map of field offices covering your county, with links to that office's microfilm rolls.",
    url(){ return 'https://www.mappingthefreedmensbureau.com/'; }
  },
  {
    id: 'nara-catalog',
    label: 'National Archives Catalog — Freedmen\'s Bureau',
    type: "Freedmen's Bureau Record",
    group: 'us-reconstruction',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "NARA Record Group 105 descriptions and digitized images.",
    url(ctx){
      return naraSearchUrl([ctx.givenName, ctx.surname, "Freedmen's Bureau", ctxState(ctx)]);
    }
  },
  {
    id: 'southern-claims',
    label: 'Southern Claims Commission (NARA)',
    type: 'Court / Petition',
    group: 'us-reconstruction',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUsSouth(ctx); },
    note: "Loyalty claims often include affidavits naming neighbors, formerly enslaved people, and property — rich local context for the 1860s–70s.",
    url(ctx){
      return naraSearchUrl([ctx.surname, 'Southern Claims Commission', ctxState(ctx)]);
    }
  },

  // ----- Named enslaved / ads -----
  {
    id: 'freedom-on-the-move',
    label: 'Freedom on the Move — runaway ads',
    type: 'Newspaper / Advertisement',
    group: 'us-enslavement',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "Crowdsourced database of newspaper ads for people who fled slavery — often include names, scars, skills, and destinations.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname].filter(Boolean).join(' ');
      return 'https://freedomonthemove.org/' + (q ? '?q=' + encodeURIComponent(q) : '');
    }
  },
  {
    id: 'last-seen',
    label: 'Last Seen: Finding Family After Slavery',
    type: 'Newspaper / Advertisement',
    group: 'us-enslavement',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "Post-emancipation 'information wanted' ads placed by formerly enslaved people searching for family sold away from them.",
    url(){ return 'https://www.informationwanted.org/'; }
  },
  {
    id: 'dlas',
    label: 'Digital Library on American Slavery (UNCG)',
    type: 'Court / Petition',
    group: 'us-enslavement',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "Court petitions, runaway ads, and bills of sale naming ~80,000 enslaved people across multiple projects.",
    url(){ return 'https://dlas.uncg.edu/'; }
  },
  {
    id: 'wpa-narratives',
    label: 'WPA Slave Narratives (Library of Congress)',
    type: 'WPA Slave Narrative',
    group: 'us-enslavement',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "2,300+ interviews with formerly enslaved people (1936–38). Search by name and check neighboring counties.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname, ctxState(ctx)].filter(Boolean).join(' ');
      return 'https://www.loc.gov/collections/slave-narratives-from-the-federal-writers-project-1936-to-1938/?q=' + encodeURIComponent(q);
    }
  },

  // ----- Military -----
  {
    id: 'usct-soldiers',
    label: 'U.S. Colored Troops — Soldiers & Sailors (NPS)',
    type: 'Military / Pension Record',
    group: 'us-military',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "Search the surname; a match's compiled service record and especially pension file at NARA can name parents, spouses, enslavers, and plantations.",
    url(){ return 'https://www.nps.gov/civilwar/search-soldiers.htm'; }
  },
  {
    id: 'nara-pensions',
    label: 'NARA — Civil War pensions & USCT',
    type: 'Military / Pension Record',
    group: 'us-military',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "Pension files (especially widows') often required proof of slave marriage and preserve family detail no other record kept.",
    url(ctx){
      return naraSearchUrl([ctx.givenName, ctx.surname, 'pension', 'Colored Troops']);
    }
  },

  // ----- Newspapers -----
  {
    id: 'chronicling-america',
    label: 'Chronicling America (Library of Congress)',
    type: 'Newspaper / Advertisement',
    group: 'newspapers',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "Free digitized U.S. newspapers — obituaries, notices, and local news that name Black families after emancipation.",
    url(ctx){ return locChroniclingUrl(ctx); }
  },

  // ----- State-specific (U.S.) -----
  {
    id: 'nc-cohabitation',
    label: 'NC Digital Collections — Cohabitation Records',
    type: 'Cohabitation / Marriage Record',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'North Carolina'; },
    note: "State Archives of North Carolina's digitized 1866–1868 cohabitation bonds. Ongoing digitization by county.",
    url(){ return 'https://digital.ncdcr.gov/collections/cohabitation-records'; }
  },
  {
    id: 'va-lva',
    label: 'Library of Virginia — Virginia Untold',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Virginia' || ctx.state === 'West Virginia'; },
    note: "Free Negro registers, cohabitation, freedom suits, and other records naming free and formerly enslaved Virginians.",
    url(){ return 'https://www.virginiamemory.com/collections/aan/'; }
  },
  {
    id: 'md-legacy',
    label: 'Legacy of Slavery in Maryland',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Maryland'; },
    note: "Maryland State Archives database of runaway ads, manumissions, and related records.",
    url(){ return 'https://slavery2.msa.maryland.gov/pages/Search.aspx'; }
  },
  {
    id: 'sc-digital',
    label: 'South Carolina Digital Library',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'South Carolina'; },
    note: "Statewide digitized collections including African American family papers and local histories.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname].filter(Boolean).join(' ') || ctx.surname;
      return 'https://scmemory.org/search/?query=' + encodeURIComponent(q || '');
    }
  },
  {
    id: 'ga-virtual-vault',
    label: 'Georgia Archives Virtual Vault',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Georgia'; },
    note: "Digitized Georgia records including Confederate pensions (sometimes naming enslaved people) and county records.",
    url(){ return 'https://vault.georgiaarchives.org/'; }
  },
  {
    id: 'la-notarial',
    label: 'Louisiana Colonial Documents / Notarial',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Louisiana'; },
    note: "Louisiana's civil-law tradition left unusually detailed notarial acts naming enslaved people — start with the Louisiana Colonial Documents Digitization Project.",
    url(){ return 'https://www.crt.state.la.us/louisiana-state-museum/collections/colonial-documents/index'; }
  },
  {
    id: 'tx-portal',
    label: 'The Portal to Texas History',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Texas'; },
    note: "Newspapers, photos, and local records across Texas — search surnames and county names.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname, ctx.county].filter(Boolean).join(' ');
      return 'https://texashistory.unt.edu/search/?q=' + encodeURIComponent(q || ctx.surname || '');
    }
  },
  {
    id: 'al-digital',
    label: 'Alabama Department of Archives & History — Digital Collections',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Alabama'; },
    note: "Alabama digitized records and photographs; pair with county probate for enslaver estate papers.",
    url(ctx){
      return 'https://digital.archives.alabama.gov/digital/search/searchterm/' + encodeURIComponent(ctx.surname || '');
    }
  },
  {
    id: 'ms-digital',
    label: 'Mississippi Digital Library',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Mississippi'; },
    note: "Cross-institutional Mississippi digital collections.",
    url(ctx){
      return 'https://msdiglib.org/search?query=' + encodeURIComponent(ctx.surname || '');
    }
  },
  {
    id: 'tn-digital',
    label: 'Tennessee Virtual Archive (TeVA)',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Tennessee'; },
    note: "Tennessee State Library & Archives digital collections.",
    url(){ return 'https://teva.contentdm.oclc.org/'; }
  },
  {
    id: 'ky-digital',
    label: 'Kentucky Digital Library',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Kentucky'; },
    note: "Kentucky newspapers, manuscripts, and local history — useful for a border state with complex free/enslaved communities.",
    url(ctx){
      return 'https://kdl.kyvl.org/?f%5Bdigital_collection%5D%5B%5D=&q=' + encodeURIComponent(ctx.surname || '');
    }
  },
  {
    id: 'ar-digital',
    label: 'Arkansas Digital Archives',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Arkansas'; },
    note: "Arkansas State Archives digital collections.",
    url(){ return 'https://digitalheritage.arkansas.gov/'; }
  },
  {
    id: 'fl-memory',
    label: 'Florida Memory',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Florida'; },
    note: "State Archives of Florida photos, documents, and audio.",
    url(ctx){
      return 'https://www.floridamemory.com/search/?q=' + encodeURIComponent(ctx.surname || '');
    }
  },
  {
    id: 'mo-digital',
    label: 'Missouri Digital Heritage',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Missouri'; },
    note: "Missouri state and local digital collections — including records relevant to free and enslaved communities.",
    url(ctx){
      return 'https://www.sos.mo.gov/mdh/' + (ctx.surname ? '?q=' + encodeURIComponent(ctx.surname) : '');
    }
  },
  {
    id: 'ok-dawes',
    label: 'Dawes Rolls (Oklahoma / Five Tribes) — NARA',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Oklahoma'; },
    note: "Enrollment cards for the Five Tribes often note Freedmen (formerly enslaved by tribal citizens) and their descendants.",
    url(ctx){
      return naraSearchUrl([ctx.surname, 'Dawes', 'Freedmen']);
    }
  },

  // ----- Caribbean -----
  {
    id: 'fs-caribbean',
    label: 'FamilySearch — Caribbean records',
    type: 'Vital Record',
    group: 'diaspora-caribbean',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isCaribbean(ctx); },
    note: "Broad FamilySearch search scoped to your island/country — baptism, marriage, and burial registers are the backbone of Caribbean genealogy.",
    url(ctx){
      const place = ctxState(ctx) || 'Caribbean';
      return familySearchAllUrl({ ...ctx, county: ctx.county, state: place });
    }
  },
  {
    id: 'jamaica-family-search',
    label: 'Jamaican Family Search',
    type: 'Vital Record',
    group: 'diaspora-caribbean',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Jamaica' || placeUnset(ctx); },
    note: "Transcriptions of Jamaican almanacs, directories, and some parish registers — a long-running free resource.",
    url(){ return 'http://www.jamaicanfamilysearch.com/'; }
  },
  {
    id: 'uwi-caribbean',
    label: 'UWI / Caribbean genealogy starting points',
    type: 'Other',
    group: 'diaspora-caribbean',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isCaribbean(ctx); },
    note: "Overview of island archives, slave registers (1817–1834 for British colonies), and where digitized copies live.",
    url(){ return 'https://www.familysearch.org/en/wiki/Caribbean'; }
  },
  {
    id: 'ancestry-slave-registers',
    label: 'British Caribbean Slave Registers (finding aid)',
    type: 'Other',
    group: 'diaspora-caribbean',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isCaribbean(ctx) || isUk(ctx); },
    note: "1813–1834 registers of enslaved people in British colonies (often on Ancestry/FamilySearch). Search by enslaver and plantation as well as given name.",
    url(){ return 'https://www.familysearch.org/en/wiki/Caribbean_Slave_Registers'; }
  },
  {
    id: 'haiti-archives',
    label: 'Haiti research guide (FamilySearch Wiki)',
    type: 'Other',
    group: 'diaspora-caribbean',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Haiti' || placeUnset(ctx); },
    note: "Haiti's records differ from English-speaking islands — start with the wiki for civil registration and diaspora paths.",
    url(){ return 'https://www.familysearch.org/en/wiki/Haiti_Genealogy'; }
  },

  // ----- Canada -----
  {
    id: 'black-loyalist',
    label: 'Black Loyalist Heritage Centre',
    type: 'Other',
    group: 'diaspora-canada',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isCanada(ctx) || ctx.state === 'Nova Scotia'; },
    note: "Documents Black Loyalists who left the U.S. for Nova Scotia after the Revolutionary War — names, ships, and settlements.",
    url(){ return 'https://blackloyalist.com/'; }
  },
  {
    id: 'lac-canada',
    label: 'Library and Archives Canada — Black history',
    type: 'Other',
    group: 'diaspora-canada',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isCanada(ctx); },
    note: "Census, immigration, military, and thematic Black history guides for Canada.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname].filter(Boolean).join(' ') || ctx.surname || 'Black history';
      return 'https://library-archives.canada.ca/eng/collection/research-help/genealogy-family-history/Pages/genealogy-family-history.aspx';
    }
  },
  {
    id: 'fs-canada',
    label: 'FamilySearch — Canada records',
    type: 'Vital Record',
    group: 'diaspora-canada',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isCanada(ctx); },
    note: "Census and vital records for Black Canadian communities, including Underground Railroad destinations in Ontario.",
    url(ctx){ return familySearchAllUrl({ ...ctx, state: ctxState(ctx) || 'Canada' }); }
  },

  // ----- UK -----
  {
    id: 'tna-discovery',
    label: 'UK National Archives — Discovery',
    type: 'Other',
    group: 'diaspora-uk',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUk(ctx) || isCaribbean(ctx); },
    note: "Colonial Office, Admiralty, and slave-compensation records for Britain and its Caribbean colonies.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname, 'slave'].filter(Boolean).join(' ');
      return 'https://discovery.nationalarchives.gov.uk/results/r?_q=' + encodeURIComponent(q || ctx.surname || '');
    }
  },
  {
    id: 'ucl-legacies',
    label: 'UCL Legacies of British Slavery',
    type: 'Other',
    group: 'diaspora-uk',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUk(ctx) || isCaribbean(ctx); },
    note: "Database of slave-owners who claimed compensation in 1833 — useful when tracing an enslaver surname into Caribbean estates.",
    url(){ return 'https://www.ucl.ac.uk/lbs/'; }
  },
  {
    id: 'fs-england',
    label: 'FamilySearch — England & Wales records',
    type: 'Vital Record',
    group: 'diaspora-uk',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUk(ctx); },
    note: "Civil registration and parish records for Caribbean and African migrants in Britain, including Windrush-era families.",
    url(ctx){ return familySearchAllUrl({ ...ctx, state: ctxState(ctx) || 'England' }); }
  },

  // ----- Africa / Atlantic -----
  {
    id: 'slave-voyages',
    label: 'Slave Voyages — Trans-Atlantic & Intra-American',
    type: 'Ship / Voyage Record',
    group: 'diaspora-africa',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isAfrica(ctx) || isCaribbean(ctx) || isLatAm(ctx) || isUs(ctx); },
    note: "36,000+ Atlantic voyages and intra-American trafficking — best for place/time of arrival, not usually individual surnames. Pair with African Origins for liberated African names.",
    url(){ return 'https://www.slavevoyages.org/'; }
  },
  {
    id: 'african-origins',
    label: 'African Origins (via Slave Voyages)',
    type: 'Ship / Voyage Record',
    group: 'diaspora-africa',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isAfrica(ctx) || isCaribbean(ctx) || isUk(ctx); },
    note: "Names of Africans liberated from illegal slave ships (mostly 1808–1866), with audio pronunciations to help match language groups.",
    url(){ return 'https://www.slavevoyages.org/resources/african-origins'; }
  },

  // ----- Latin America -----
  {
    id: 'fs-brazil',
    label: 'FamilySearch — Brazil records',
    type: 'Vital Record',
    group: 'diaspora-latam',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Brazil' || ctx.state === 'Latin America (general)' || placeUnset(ctx); },
    note: "Brazil received more enslaved Africans than any other country in the Americas — parish and civil registers are the main name-level path.",
    url(ctx){ return familySearchAllUrl({ ...ctx, state: 'Brazil' }); }
  },
  {
    id: 'fs-mexico',
    label: 'FamilySearch — Mexico records',
    type: 'Vital Record',
    group: 'diaspora-latam',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Mexico' || ctx.state === 'Latin America (general)' || placeUnset(ctx); },
    note: "Colonial and national records for Afro-Mexican communities.",
    url(ctx){ return familySearchAllUrl({ ...ctx, state: 'Mexico' }); }
  },

  // ----- Reconstruction / Freedmen (additional) -----
  {
    id: 'voter-reg-1867',
    label: '1867 Voter Registrations (FamilySearch)',
    type: "Freedmen's Bureau Record",
    group: 'us-reconstruction',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUsSouth(ctx) || isUs(ctx); },
    note: "First post-war federal records naming formerly enslaved Black men by name, county, and physical description — and often birthplace. Three years earlier than the 1870 census.",
    url(ctx){
      return familySearchCollectionUrl(ctx, '4056148');
    }
  },
  {
    id: 'lost-friends',
    label: 'Lost Friends — Southwestern Christian Advocate',
    type: 'Other',
    group: 'us-reconstruction',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || ctx.state === 'Louisiana' || isUsSouth(ctx); },
    note: "Historic New Orleans Collection database of \"Information Wanted\" ads, 1879–1900 — freed people searching for family separated by slavery. Particularly strong for Louisiana and the Gulf South.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname].filter(Boolean).join(' ') || ctx.surname || '';
      return 'https://www.hnoc.org/database/lost-friends/index.php?search=' + encodeURIComponent(q);
    }
  },
  {
    id: 'usct-service',
    label: 'USCT Service Records — United States Colored Troops (FamilySearch)',
    type: 'Military Record',
    group: 'us-reconstruction',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUsSouth(ctx) || isUs(ctx); },
    note: "Service records for 180,000+ Black soldiers, 1863–1866 — name, birthplace, age, and physical description. Often the only pre-1870 primary source naming an ancestor directly.",
    url(ctx){ return familySearchCollectionUrl(ctx, '2178220'); }
  },
  {
    id: 'liberated-africans',
    label: 'Liberated Africans database',
    type: 'Ship / Voyage Record',
    group: 'diaspora-africa',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isAfrica(ctx) || isCaribbean(ctx) || isUs(ctx); },
    note: "Names of Africans freed from illegal slave ships by British and U.S. navies, 1808–1900. These are individual names recorded from Africa — broader than Slave Voyages' African Origins index.",
    url(ctx){
      const q = ctx.givenName || '';
      return 'https://liberatedafricans.org/public/search.php?q=' + encodeURIComponent(q);
    }
  },

  // ----- Free Black / pre-war -----
  {
    id: 'free-negro-registers',
    label: 'Free Negro Registers — FamilySearch research guide',
    type: 'Other',
    group: 'us-reconstruction',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUsSouth(ctx) || ctx.state === 'Virginia' || ctx.state === 'Maryland' || ctx.state === 'North Carolina' || ctx.state === 'South Carolina'; },
    note: "Virginia, Maryland, NC, and SC required free Black residents to register their name, age, physical description, and how they obtained freedom. Key source when your brick wall is a free ancestor, not an enslaved one.",
    url(){ return 'https://www.familysearch.org/en/wiki/Free_African_American_Records'; }
  },

  // ----- Great Migration — Northern state archives -----
  {
    id: 'il-digital',
    label: 'Illinois State Archives — digital collections',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Illinois'; },
    note: "Illinois archives including county naturalization, military, and Black History records. Chicago was the #1 Great Migration destination.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname].filter(Boolean).join(' ') || ctx.surname || '';
      return 'https://www.ilsos.gov/departments/archives/genealogy.html';
    }
  },
  {
    id: 'oh-digital',
    label: 'Ohio History Center — digital collections',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Ohio'; },
    note: "Ohio State Archives and History collections. Cleveland, Columbus, and Cincinnati were major Great Migration destinations with Black community records.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname].filter(Boolean).join(' ') || ctx.surname || '';
      return 'https://ohiomemory.org/digital/search/searchterm/' + encodeURIComponent(q || '');
    }
  },
  {
    id: 'mi-digital',
    label: 'Michigan State Archives — digital',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Michigan'; },
    note: "Michigan Archives collections. Detroit was a major Great Migration and auto-industry destination — strong oral histories and community records.",
    url(){ return 'https://www.michigan.gov/libraryofmichigan/collections/genealogy'; }
  },
  {
    id: 'pa-digital',
    label: 'Pennsylvania Digital Collections',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Pennsylvania'; },
    note: "Pennsylvania State Archives and partner collections. Philadelphia had a large pre-Civil War free Black community — key for families who were never enslaved in the South.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname].filter(Boolean).join(' ') || ctx.surname || '';
      return 'https://www.phmc.pa.gov/Archives/Research-Online/Pages/default.aspx';
    }
  },

  // ----- Probate / estate records -----
  {
    id: 'probate-guide',
    label: 'Probate & estate records — FamilySearch guide',
    type: 'Property / Tax Record',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUsSouth(ctx) || isUs(ctx); },
    note: "Estate inventories naming enslaved people are the primary pre-1870 name source. This guide links to digitized county court collections by state.",
    url(){ return 'https://www.familysearch.org/en/wiki/United_States_Probate_Records'; }
  },
  {
    id: 'heritagequest',
    label: 'HeritageQuest Online — probate and land records',
    type: 'Property / Tax Record',
    group: 'us-state',
    planChecklist: false,
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "Free through many public library cards — includes probate indexes, land records, and PERSI (Periodical Source Index). Check your library's e-resources page.",
    url(){ return 'https://www.heritagequestonline.com/'; }
  },

  // ----- Plantation & estate records -----
  {
    id: 'enslaved-org',
    label: 'Enslaved: Peoples of the Historical Slave Trade',
    type: 'Other',
    group: 'us-reconstruction',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx) || isCaribbean(ctx) || isLatAm(ctx); },
    note: "Linked database of named enslaved individuals drawn from plantation records, estate inventories, ship manifests, and other primary sources across the Atlantic world.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname].filter(Boolean).join(' ') || ctx.surname || '';
      return 'https://enslaved.org/search/?q=' + encodeURIComponent(q);
    }
  },
  {
    id: 'docsouth',
    label: 'Documenting the American South — UNC',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return placeUnset(ctx) || isUsSouth(ctx); },
    note: "Full-text plantation diaries, memoirs, slave narratives, and overseers' records from UNC-Chapel Hill. Names sometimes appear in plantation journals when no official record survives.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname, ctx.county].filter(Boolean).join(' ');
      return 'https://docsouth.unc.edu/browse/search/?q=' + encodeURIComponent(q || ctx.surname || '');
    }
  },
  {
    id: 'plantation-records-duke-usc',
    label: 'Plantation records — Duke & USC finding aids',
    type: 'Other',
    group: 'us-state',
    planChecklist: false,
    appliesTo(ctx){ return placeUnset(ctx) || isUsSouth(ctx); },
    note: "Duke Rubenstein Library and USC South Caroliniana Library both hold digitized plantation ledgers, medical records, and estate papers that can name individual enslaved people. Search by county and enslaver surname.",
    url(ctx){
      const q = [ctx.enslaver, ctx.county, ctx.state].filter(Boolean).join(' ');
      return 'https://finding-aids.lib.unc.edu/search?query=' + encodeURIComponent(q || ctx.surname || '');
    }
  },

  // ----- Spanish colonial records -----
  {
    id: 'fl-spanish-colonial',
    label: 'East Florida Papers — Library of Congress / FamilySearch',
    type: 'Vital Record',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Florida' || placeUnset(ctx); },
    note: "St. Augustine parish baptism registers (1594–1821) and East Florida Papers name enslaved and free Black individuals under Spanish colonial rule — decades before U.S. control of Florida.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname].filter(Boolean).join(' ') || ctx.surname || '';
      return 'https://www.familysearch.org/search/record/results?q.surname=' + encodeURIComponent(ctx.surname||'') + '&q.residencePlace=Florida&f.collectionId=1921688';
    }
  },
  {
    id: 'tx-bexar',
    label: 'Bexar Archives — colonial Texas records (UT Austin)',
    type: 'Other',
    group: 'us-state',
    planChecklist: true,
    appliesTo(ctx){ return ctx.state === 'Texas' || placeUnset(ctx); },
    note: "Spanish and Mexican colonial records for Texas (1717–1836) held at UT Austin. Includes baptisms, census lists, and estate records that predate Anglo settlement and sometimes name enslaved or free Black individuals.",
    url(ctx){
      const q = [ctx.givenName, ctx.surname].filter(Boolean).join(' ') || ctx.surname || '';
      return 'https://digitalcollections.lib.utexas.edu/search?query=' + encodeURIComponent(q || '');
    }
  },

  // ----- Finding aids -----
  {
    id: 'familysearch-all',
    label: 'FamilySearch — all collections',
    type: 'Other',
    group: 'finding-aids',
    planChecklist: true,
    note: "Free account required. Searches all FamilySearch collections at once for this name and place.",
    url(ctx){ return familySearchAllUrl(ctx); }
  },
  {
    id: 'fs-wiki-aa',
    label: 'FamilySearch Wiki — African American research',
    type: 'Other',
    group: 'finding-aids',
    note: "Step-by-step research guidance and links to state-specific record types.",
    url(){ return 'https://www.familysearch.org/en/wiki/African_American_Genealogy'; }
  },
  {
    id: 'nara-aa',
    label: 'NARA — African American research portal',
    type: 'Other',
    group: 'finding-aids',
    appliesTo(ctx){ return placeUnset(ctx) || isUs(ctx); },
    note: "National Archives overview of federal records for Black genealogy.",
    url(){ return 'https://www.archives.gov/research/african-americans'; }
  },
  {
    id: 'afrigeneas',
    label: 'AfriGeneas',
    type: 'Other',
    group: 'finding-aids',
    note: "Long-running community boards and surname databases for African-centered genealogy.",
    url(){ return 'https://www.afrigeneas.com/'; }
  }
];

function normalizeVariants(variants){
  if(!variants) return [];
  if(Array.isArray(variants)) return variants.map(v => String(v).trim()).filter(Boolean);
  return String(variants).split(/[,;|/]+/).map(v => v.trim()).filter(Boolean);
}

function buildQuickLinks(ctx){
  const base = Object.assign({}, ctx, {
    variants: normalizeVariants(ctx.variants)
  });
  return SOURCE_REGISTRY
    .filter(s => !s.appliesTo || s.appliesTo(base))
    .map(s => ({
      id: s.id,
      label: s.label,
      note: s.note,
      type: s.type,
      group: s.group || 'finding-aids',
      planChecklist: !!s.planChecklist,
      url: typeof s.url === 'function' ? s.url(base) : s.url
    }));
}

function buildQuickLinksGrouped(ctx){
  const links = buildQuickLinks(ctx);
  return SOURCE_GROUPS.map(g => ({
    id: g.id,
    title: g.title,
    links: links.filter(l => l.group === g.id)
  })).filter(g => g.links.length > 0);
}

// Extra cards: same key collections, but with each name variant as surname.
function buildVariantLinks(ctx){
  const variants = normalizeVariants(ctx.variants)
    .filter(v => v.toLowerCase() !== String(ctx.surname || '').toLowerCase())
    .slice(0, 4);
  if(!variants.length) return [];
  const keyIds = new Set([
    'census-1870','census-1880','freedmans-bank','nmaahc-fb-portal',
    'familysearch-all','chronicling-america','fs-caribbean','fs-canada','fs-england'
  ]);
  const out = [];
  variants.forEach(variant => {
    const vctx = Object.assign({}, ctx, { surname: variant, variants: [] });
    buildQuickLinks(vctx)
      .filter(l => keyIds.has(l.id))
      .forEach(l => {
        out.push(Object.assign({}, l, {
          id: l.id + '::' + variant,
          label: l.label + ' — variant "' + variant + '"',
          note: 'Same collection, searched under the spelling "' + variant + '".',
          group: 'finding-aids'
        }));
      });
  });
  return out;
}

function planChecklistLinks(ctx){
  return buildQuickLinks(ctx).filter(l => l.planChecklist);
}

// Per-variant URLs for one collection — used for the "also try" chips
// on key collection cards instead of spawning whole extra cards.
function variantUrlsFor(sourceId, ctx){
  const variants = normalizeVariants(ctx.variants)
    .filter(v => v.toLowerCase() !== String(ctx.surname || '').toLowerCase())
    .slice(0, 4);
  if(!variants.length) return [];
  const src = SOURCE_REGISTRY.find(s => s.id === sourceId);
  if(!src || typeof src.url !== 'function') return [];
  return variants.map(v => ({
    variant: v,
    url: src.url(Object.assign({}, ctx, { surname: v, variants: [] }))
  }));
}
