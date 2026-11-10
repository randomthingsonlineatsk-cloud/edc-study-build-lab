import { useState } from 'react'
import { Panel, Tabs } from './ui'

interface Lesson { id: string; title: string; body: React.ReactNode }
const P = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-lab-text leading-relaxed">{children}</p>
const L = ({ items }: { items: React.ReactNode[] }) => <ul className="list-disc ml-5 text-sm text-lab-text space-y-1">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>

const LESSONS: Lesson[] = [
  { id: 'what', title: '1. What a study build is', body: <>
    <P>Before the first participant is screened, data management turns the protocol into the electronic data capture (EDC) database that sites will use. This is the study build. Its parts are the visit schedule, the eCRF forms and their fields, the codelists behind each answer, the edit checks that raise queries, and the CRF completion guidelines that tell sites how to fill each form.</P>
    <P>The build is a computerised system that holds trial data, so ICH E6(R3) expects it to be fit for purpose and validated for the way it is used, with records of testing and approval. In practice that means a written specification, user acceptance testing (UAT) against it, sign-off, and change control for every later version.</P>
    <L items={['Input: the final protocol (here written in the ICH M11 structure, whose schedule of activities and eligibility criteria drive the build).', 'Output: a released build, its annotated CRF, the data validation specification (the edit check list) and the completion guidelines.', 'Who: a study builder or EDC programmer, the lead data manager who writes the specifications, and testers who are not the programmer.']} />
  </> },
  { id: 'm11', title: '2. Reading an M11 protocol for the build', body: <>
    <P>ICH M11 (Step 4 in November 2025) gives protocols a common structure and a technical specification, so the parts a builder needs are in the same place each time. Section 1.3, the schedule of activities, gives the visits, their timing windows and which procedures happen at each. Sections 5.1 and 5.2 list the inclusion and exclusion criteria. Section 8 describes the assessments and the safety reporting rules.</P>
    <L items={['Each column of the schedule becomes a visit; each window ("Day 50 to 64") becomes the window the visit-date check uses.', 'Each row becomes a form (or part of one) placed at the ticked visits. Rows collected "throughout" are log forms, entered whenever an event happens.', 'Each criterion becomes a codelist entry, so a site can record which criterion was not met, and where the data allow it, an edit check.', 'Footnotes matter: "seated, after 5 minutes rest" becomes a field or a completion guideline.']} />
  </> },
  { id: 'cdash', title: '3. CDASH forms and codelists', body: <>
    <P>CDISC CDASH sets the standard names and questions for collected data, so that each field maps cleanly to the SDTM dataset that will be submitted. Vital signs collect SYSBP and DIABP; adverse events collect AETERM, AESTDAT and AESER. Using the standard names, and the CDISC controlled terminology for the answers, makes the annotated CRF and the later SDTM mapping straightforward.</P>
    <L items={['Ask one thing per field. Keep units next to the value, or collect the unit when sites use more than one.', 'Use a codelist for any closed answer, and show dependent questions only when they apply ("if yes, specify").', 'Collect only what the protocol needs. Every extra field is data to clean and to justify.', 'The annotated CRF shows each field with its CDASH variable and SDTM target. It is part of the submission for many studies.']} />
  </> },
  { id: 'checks', title: '4. Edit checks and test cases', body: <>
    <P>An edit check is a rule that raises a query when entered data look wrong. The data validation specification lists each check: its ID, the form and field it lands on, its logic, the query text the site sees, and the test cases that show it works. Typical kinds are missing values, ranges, date order, cross-form consistency (a medication that breaks an exclusion criterion), and protocol logic (a visit outside its window).</P>
    <L items={['Write query text that is neutral: say what looks wrong and ask the site to check the source. Never suggest the answer.', 'Every check needs at least one test case that fires and one that does not, including the edge (a value equal to the limit).', 'A check that fires too often costs sites time and hides real problems; a check that never fires misses errors. Both are found in UAT.', 'Some checks only raise a listing for data management review instead of a site query; this lab keeps all of them as queries.']} />
  </> },
  { id: 'uat', title: '5. UAT, sign-off and release', body: <>
    <P>UAT runs every test case against the build and records the results. A failed test is an issue. The fix is normally in the check logic; only when the test case itself was wrong, or the behaviour is acceptable and documented, is an issue accepted without a change. Changing the expected result to match a faulty check is not a fix: the mission grader re-tests with hidden cases for this reason.</P>
    <L items={['The UAT summary says what was tested, by whom, the issues found and how each was resolved.', 'The sign-off applies to one exact build. Any change afterwards withdraws it here, as change control would in practice.', 'The release gets a version number and notes. Later changes (a protocol amendment, a new check) go through the same path as a new version: specify, build, test, sign, release, and then migrate the data already entered.']} />
  </> },
  { id: 'console', title: '6. Handing the build to the CDM console', body: <>
    <P>The released study build file is the input of the CDM Query &amp; Edit-Check Console, where you then clean the trial's data. The console's simulated sites enter data at fixed visits and forms, so a build that drops one of them would leave data with nowhere to go; the build review's "Console import" area lists these problems before you release. New forms (such as the pregnancy test form) are accepted by the console as additions.</P>
  </> },
]

export default function Learn() {
  const [id, setId] = useState(LESSONS[0].id)
  const l = LESSONS.find((x) => x.id === id)!
  return (
    <div className="space-y-4">
      <Tabs tabs={LESSONS.map((x) => ({ id: x.id, label: x.title }))} value={id} onChange={setId} />
      <Panel title={l.title}>{l.body}</Panel>
      <Panel title="Sources">
        <L items={[
          <a className="text-lab-fda underline" href="https://database.ich.org/sites/default/files/ICH_E6%28R3%29_Step4_FinalGuideline_2025_0106.pdf" target="_blank" rel="noreferrer">ICH E6(R3) Good Clinical Practice (Step 4, January 2025): computerised systems and data governance</a>,
          <a className="text-lab-fda underline" href="https://www.ich.org/page/multidisciplinary-guidelines" target="_blank" rel="noreferrer">ICH M11 Clinical electronic Structured Harmonised Protocol (CeSHarP), Step 4 November 2025</a>,
          <a className="text-lab-fda underline" href="https://www.cdisc.org/standards/foundational/cdash" target="_blank" rel="noreferrer">CDISC CDASH (CDASHIG v2.3)</a>,
          <a className="text-lab-fda underline" href="https://www.cdisc.org/standards/terminology/controlled-terminology" target="_blank" rel="noreferrer">CDISC Controlled Terminology</a>,
        ]} />
      </Panel>
    </div>
  )
}
