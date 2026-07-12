// ---------------------------------------------------------------
// Sample family
// Lets a new researcher see the app working — tree, evidence chips,
// research log, and a half-finished Research Plan — before entering
// their own family. The Freemans are fictional, but the record
// pattern (1870 census anchor, Freedman's Bank register, cohabitation
// bond, slave-schedule candidate) is the real method.
// Every record is flagged sample:true and removable in one click;
// removal writes tombstones so the sample never resurrects via sync.
// ---------------------------------------------------------------

const SAMPLE_IDS = {
  silas: 'sample-silas',
  chaney: 'sample-chaney',
  hattie: 'sample-hattie',
  june: 'sample-june'
};

function sampleLoaded(){
  return STATE.people.some(p=>p.sample) || STATE.logs.some(l=>l.sample);
}

function loadSampleFamily(){
  if(sampleLoaded()){ switchView('tree'); return; }
  const now = Date.now();
  const mk = o => Object.assign({ nameVariants:[], parentIds:[], spouses:[], notes:'', enslaverSurname:'', birthplace:'', updatedAt: now, sample:true }, o);

  STATE.people.push(
    mk({
      id: SAMPLE_IDS.silas, name: 'Silas Freeman',
      birthYear: 'c. 1832', deathYear: '1901',
      birthplace: 'Gaston County, NC', enslaverSurname: 'Rhyne',
      nameVariants: ['Silas Rhyne'],
      spouses: [{ personId: SAMPLE_IDS.chaney, note: 'cohabitation bond, Gaston County, 1866' }],
      notes: 'Oral history: "born on the Rhyne place near the South Fork river."'
    }),
    mk({
      id: SAMPLE_IDS.chaney, name: 'Chaney Freeman',
      birthYear: 'c. 1838', deathYear: '?',
      birthplace: 'Gaston County, NC',
      spouses: [{ personId: SAMPLE_IDS.silas, note: 'cohabitation bond, Gaston County, 1866' }]
    }),
    mk({
      id: SAMPLE_IDS.hattie, name: 'Hattie Freeman Leeper',
      birthYear: '1867', deathYear: '1939',
      birthplace: 'Belmont, Gaston County, NC',
      nameVariants: ['Hattie Leeper'],
      parentIds: [SAMPLE_IDS.silas, SAMPLE_IDS.chaney]
    }),
    mk({
      id: SAMPLE_IDS.june, name: 'June Leeper',
      birthYear: '1890', deathYear: '1968',
      birthplace: 'Charlotte, NC',
      parentIds: [SAMPLE_IDS.hattie]
    })
  );
  STATE.people.filter(p=>p.sample).forEach(p=>{
    if(typeof ensurePersonAfrica === 'function') ensurePersonAfrica(p);
  });

  STATE.logs.push(
    {
      id: 'sample-log-1870', sample: true, personId: SAMPLE_IDS.silas,
      date: '2026-06-02', type: 'Census / Slave Schedule', status: 'confirmed',
      sourceName: '1870 U.S. Census, Gaston County, NC',
      citation: 'https://www.familysearch.org/search/record/results?f.collectionId=1438024&q.surname=Freeman&q.residencePlace=Gaston%2C%20North%20Carolina',
      findings: 'Silas (38), Chaney (32), and Hattie (3) in River Bend township. This is the anchor record for the line.',
      nextSteps: 'Find the household again in 1880 to confirm the family group.',
      supports: ['name','location','relationship'], confidence: 'documentary', updatedAt: now
    },
    {
      id: 'sample-log-bank', sample: true, personId: SAMPLE_IDS.silas,
      date: '2026-06-15', type: "Freedman's Bank Record", status: 'promising',
      sourceName: "Freedman's Bank register, Charlotte branch",
      citation: 'https://www.familysearch.org/search/record/results?f.collectionId=1417695&q.surname=Freeman',
      findings: 'A Silas Freeman opened an account in 1871; the register names wife Chaney and "master J. Rhyne". Image not yet checked.',
      nextSteps: 'View the register image to confirm it is the same Silas.',
      supports: ['name','relationship'], confidence: 'documentary', updatedAt: now
    },
    {
      id: 'sample-log-schedule', sample: true, personId: SAMPLE_IDS.silas,
      date: '2026-06-20', type: 'Census / Slave Schedule', status: 'to-research',
      sourceName: '1860 Slave Schedule — candidate Rhyne, Gaston County',
      citation: '',
      findings: '',
      nextSteps: 'Match the Rhyne household tallies against Silas (b. c.1832) and Chaney (b. c.1838).',
      supports: [], confidence: 'speculative', updatedAt: now
    }
  );

  STATE.plans[SAMPLE_IDS.silas] = {
    updatedAt: now, state: 'North Carolina', county: 'Gaston',
    steps: {
      anchor:   { done: true,  note: 'Found in 1870, River Bend township — see the log.', checked: {} },
      county:   { done: true,  note: 'Nearest Freedmen\'s Bureau field office: Charlotte.', checked: {} },
      records:  { done: false, note: '', checked: { 'freedmans-bank': true } },
      enslaver: { done: false, note: '', checked: {} },
      confirm:  { done: false, note: '', checked: {} },
      africa:   { done: false, note: '', checked: {} }
    },
    candidates: [{ name: 'Jasper Rhyne', status: 'promising' }]
  };

  saveData();
  renderAll();
  switchView('tree');
  showToast('Sample family loaded');
}

function removeSampleFamily(){
  const now = Date.now();
  STATE.people = STATE.people.filter(p=>{
    if(!p.sample) return true;
    STATE.tombstones.push({ id: p.id, deletedAt: now });
    delete STATE.plans[p.id];
    return false;
  });
  STATE.logs = STATE.logs.filter(l=>{
    if(!l.sample) return true;
    STATE.tombstones.push({ id: l.id, deletedAt: now });
    return false;
  });
  saveData();
  renderAll();
  showToast('Sample family removed');
}

function renderSampleBanner(){
  const el = document.getElementById('sampleBanner');
  if(!el) return;
  if(!sampleLoaded()){ el.innerHTML = ''; return; }
  el.innerHTML = `<div class="sample-banner">
    <span><strong>Sample family.</strong> The Freemans are fictional — poke around the Tree, Log, and Research Plan to see how the pieces connect, then remove them and add your own people.</span>
    <button class="btn btn-ghost btn-small" onclick="removeSampleFamily()">Remove sample</button>
  </div>`;
}
