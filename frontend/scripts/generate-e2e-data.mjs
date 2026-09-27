// Synthetic research data only. Regeneration needs the DuckDB CLI; E2E runs use
// the committed files and the application's own importer, without this script.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const directory = fileURLToPath(new URL('../e2e/fixtures/data/', import.meta.url));
await mkdir(directory, { recursive: true });
const topics = [
  'Housing and rental affordability',
  'Housing and rental affordability',
  'Housing and rental affordability',
  'Public health and community wellbeing',
  'Education, schools and lifelong learning',
  'Transport — regional access',
  'Climate adaptation / 气候',
  'Arts, language and cultural participation',
  'housing and rental affordability',
  'Digital inclusion and accessibility',
];
const stages = ['Support', 'Undecided', 'Oppose', null];
const records = Array.from({ length: 480 }, (_, i) => {
  // Preserve daily observations and deliberate gaps across a year boundary. No clock or randomness.
  const day = new Date(Date.UTC(2025, 10, 1 + Math.floor(i / 3) + Math.floor(i / 60) * 2))
    .toISOString()
    .slice(0, 10);
  return {
    row_id: i + 1,
    day,
    recorded_at: `${day} 09:30:15.125 +0530`,
    topic: topics[i % topics.length],
    region: ['North', 'South', 'Remote / regional communities', 'Inner city', '', 'NULL'][i % 6],
    before: stages[i % 4],
    after: stages[Math.floor(i / 3) % 4],
    followup: stages[Math.floor(i / 7) % 4],
    // Repeated coordinates, zero weights, negative axes, missing measurements, outlier.
    x: i % 79 === 0 ? null : i === 479 ? 900 : (i % 40) - 20,
    y: i % 83 === 0 ? null : (i % 40) * 2 + (Math.floor(i / 40) % 3) * 5,
    weight: i % 31 === 0 ? 0 : (i % 9) + 1,
    measurement: i % 17 === 0 ? null : (i % 101) - 35.5,
    label: `Synthetic interview ${String(i + 1).padStart(3, '0')} — ${topics[i % topics.length]}`,
  };
});
const csvCell = (value) => (value === null ? '' : `"${String(value).replaceAll('"', '""')}"`);
await writeFile(
  join(directory, 'community-survey.csv'),
  [
    Object.keys(records[0]).map(csvCell).join(','),
    ...records.map((row) => Object.values(row).map(csvCell).join(',')),
  ].join('\n') + '\n',
);
// Source rows also supply an independent oracle for aggregate/publication assertions.
await writeFile(join(directory, 'community-survey.json'), JSON.stringify(records, null, 2) + '\n');
const quote = (s) => `'${s.replaceAll("'", "''")}'`;
execFileSync(process.env.DUCKDB_CLI ?? 'duckdb', [
  '-c',
  `COPY (
  SELECT * REPLACE (day::DATE AS day,
    strptime(recorded_at, '%Y-%m-%d %H:%M:%S.%f %z') AS recorded_at,
    measurement::DECIMAL(12,2) AS measurement)
  FROM read_json(${quote(join(directory, 'community-survey.json'))})
) TO ${quote(join(directory, 'community-survey.parquet'))} (FORMAT PARQUET);`,
]);

// Dense short-range chart regression: uneven groups, gaps, a year boundary and offsets.
const dense = Array.from({ length: 720 }, (_, i) => {
  const day = new Date(Date.UTC(2025, 11, 24 + (i % 14) + (i % 14 >= 5 ? 2 : 0)))
    .toISOString().slice(0, 10);
  return { row_id: i + 1, day, recorded_at: `${day} 09:30:15.125 +0530`,
    topic: topics[i % topics.length], measurement: i % 17 ? i % 31 : null };
});
await writeFile(join(directory, 'dense-trends.json'), JSON.stringify(dense, null, 2) + '\n');
execFileSync(process.env.DUCKDB_CLI ?? 'duckdb', ['-c', `COPY (
  SELECT * REPLACE (day::DATE AS day,
    strptime(recorded_at, '%Y-%m-%d %H:%M:%S.%f %z') AS recorded_at)
  FROM read_json(${quote(join(directory, 'dense-trends.json'))})
) TO ${quote(join(directory, 'dense-trends.parquet'))} (FORMAT PARQUET);`]);

const vocabulary = [
  'housing rent tenants buildings homes neighbourhood planning zoning',
  'health clinics nurses doctors medicine prevention wellbeing care',
  'education teachers students schools learning literacy books classrooms',
  'transport trains buses cycling walking roads access stations',
  'climate heat rainfall drought rivers trees gardens energy',
  'culture language music museums theatre community heritage stories',
  'digital internet devices networks skills services inclusion accessibility',
  'employment wages work training jobs industry markets investment',
];
for (const [name, length, shift] of [
  ['reference', 72, 0],
  ['study', 54, 3],
]) {
  const rows = Array.from({ length }, (_, i) => ({
    document_id: `${name}-${i + 1}`,
    text:
      i === 0
        ? null
        : i === 1
          ? ''
          : [
              `😀 Research diary ${i + 1}. Community policy discussion — café, naïve, 猫 and 教育.`,
              ...Array.from(
                { length: 1 + (i % 6) },
                (_, j) =>
                  `${vocabulary[(i + j + shift) % vocabulary.length]}. ${j % 2 ? 'Policy' : 'policy'} responses matter to residents.`,
              ),
              i % 5 === 0
                ? 'A short follow-up.\nPolicy implementation needs public discussion.'
                : '',
            ].join(' '),
    topic: topics[(i + shift) % topics.length],
    speaker: `Participant ${String((i % 12) + 1).padStart(2, '0')} — synthetic interview`,
    tags: i % 7 === 0 ? [] : ['synthetic', i % 2 ? 'interview' : 'meeting'],
  }));
  await writeFile(
    join(directory, `public-discourse-${name}.json`),
    JSON.stringify(rows, null, 2) + '\n',
  );
}
const quotations = Array.from({ length: 28 }, (_, i) => ({
  document_id: i + 1,
  text:
    i === 0
      ? null
      : i === 1
        ? 'This document contains no direct quotation.'
        : [
            '😀 Alice said, "The project will finish tomorrow morning."',
            ...(i % 2 ? ['She added, "The team will begin the following project next week."'] : []),
            `The synthetic interview record covers ${topics[i % topics.length]}.`,
          ].join(' '),
  topic: topics[i % topics.length],
  tags: i % 3 ? ['interview', 'synthetic'] : [],
}));
await writeFile(
  join(directory, 'public-discourse-quotations.json'),
  JSON.stringify(quotations, null, 2) + '\n',
);

// Topic fitting uses recognisable, uneven themes plus multilingual and long rows.
const experiences = [
  ['Our lease expires next month and the rent increase would take half our wages.',
   'The flat has mould; the landlord has not returned our calls.',
   'I share a bedroom with two siblings because a larger home is unaffordable.',
   'Accessible public housing is scarce in our regional town.',
   'We moved away from school friends after the last eviction.',
   'Short-stay rentals have replaced homes for permanent residents.',
   'A longer lease would help us plan childcare and employment.',
   'Better insulation could reduce winter power bills for tenants.'],
  ['My specialist appointment was postponed twice this winter.',
   'Our local clinic needs an interpreter for older patients.',
   'Travelling four hours for dialysis is exhausting.',
   'Nurses explained the treatment carefully, but the waiting room was full.',
   'The pharmacy closes before shift workers finish work.',
   'Mental health support should be available without a long referral process.',
   'Video appointments help, except when our internet fails.',
   'A wheelchair-accessible entrance would make the clinic welcoming.'],
  ['The last bus leaves before evening classes finish.',
   'I missed a hospital appointment when the train was cancelled.',
   'A safe crossing is needed between the station and the primary school.',
   'The timetable assumes everyone travels to the city centre.',
   'Bus stops need shade and seating during summer heatwaves.',
   'I cycle to work, but the protected lane ends at a busy intersection.',
   'Audio announcements would help passengers with impaired vision.',
   'Cheaper fares are useful only if services run often enough.'],
];
const topicSentences = [
  'Tenants need affordable housing. Rental prices are rising and families cannot find a home. The council should build social housing and protect renters.',
  'Doctors and nurses need more resources in local hospitals. Patients wait for treatment and medicine. Community clinics improve public health and prevention.',
  'Trains and buses should run more frequently. Commuters need reliable public transport, accessible stations and safe cycling routes to work.',
];
for (const [name, length, shift] of [['reference', 96, 0], ['study', 64, 1]]) {
  const rows = Array.from({ length }, (_, i) => ({
    document_id: i + 1,
    text: i === 0 ? null : i === 1 ? '' : i === 2 ? '   ' : i === 3
      ? '住房租金太高，家庭需要可负担的住房。医院的医生和护士需要更多资源。😀'
      : Array.from({ length: i % 19 === 0 ? 14 : 1 }, (_, j) => {
        const theme = (i + shift + j) % (i % 5 === 0 ? 2 : 3);
        // Deliberate exact duplicates coexist with varied, overlapping accounts.
        if (i % 13 === 0) return topicSentences[theme];
        return `${topicSentences[theme]}\n\n${experiences[theme][Math.floor(i / 3 + j) % 8]} ${experiences[theme][(i + j + 2) % 8]}`;
      }).join('\n'),
    source: name,
    participant: `Synthetic participant ${String(i + 1).padStart(3, '0')}`,
    tags: i % 7 ? ['synthetic', 'consultation'] : [],
    TOPIC_top1: 'original metadata with a generated-name collision',
  }));
  await writeFile(join(directory, `topic-consultation-${name}.json`), JSON.stringify(rows, null, 2) + '\n');
}

const annotationRows = Array.from({length: 39}, (_, i) => ({
  rowid: i === 0 ? '01' : i === 1 ? '1' : `doc-${String(i).padStart(3,'0')}`,
  text: i === 34 ? null : i === 35 ? '' : i === 36 ? ' \t\n ' : i === 37
    ? 'A synthetic long response about transport and accessible services. '.repeat(120)
    : i % 4 === 0 || i === 38 ? 'Language matters — 语言 😀'
      : `Synthetic public consultation response ${i}: transport and accessible services.`,
  label: i === 0 ? 'obsolete' : i % 3 === 0 ? null : 'A',
  correction: i === 3 ? 'A' : null,
  reference: i % 2 ? 'B' : 'A',
  region: ['North','South','East'][i % 3], count: i,
}));
await writeFile(join(directory,'annotation-documents.json'),JSON.stringify(annotationRows,null,2)+'\n');
await writeFile(join(directory,'annotation-codebook.json'),JSON.stringify([
  {code:'A',description:'Support for the proposal',retained:'first'},
  {code:'B',description:'Concerns or disagreement',retained:'second'},
],null,2)+'\n');

// Participant lookups intentionally contain missing and duplicate keys, plus an unmatched record.
const participants = records.filter(r => r.row_id % 3 === 0).flatMap(r => [
  { row_id: r.row_id, cohort: 'Panel A', consent: true },
  ...(r.row_id % 11 === 0 ? [{ row_id: r.row_id, cohort: 'Panel B', consent: false }] : []),
]);
participants.push({ row_id: 999, cohort: 'No response', consent: false });
await writeFile(join(directory, 'survey-participants.json'), JSON.stringify(participants, null, 2) + '\n');
