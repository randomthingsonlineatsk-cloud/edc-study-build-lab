# EDC Study Build Lab

Build a clinical trial database from its protocol. You read a protocol written in the
**ICH M11** structure, turn its schedule of activities into visits and windows, place
**CDISC CDASH** forms at the right visits, set the codelists, program the edit checks the
protocol calls for (each with test cases), run **user acceptance testing**, sign it off and
release a versioned **study build file**. The
[CDM Query & Edit-Check Console](https://randomthingsonlineatsk-cloud.github.io/cdm-query-console/)
imports that file, so the build you release is the one you then clean data with.

Live: https://randomthingsonlineatsk-cloud.github.io/edc-study-build-lab/

Training only. The protocol HLV-204-201 (VASCLEAR-2), the product and the sponsor are fictional.

## What you do

1. **Protocol**: the M11 title page, design, schedule of activities, criteria and objectives.
   Ticks in the schedule turn green when the build collects them.
2. **Schedule**: create the visits from the protocol, check each window, and tick the forms
   collected at each visit. Adverse events, medications and deviations are log forms.
3. **Forms**: add forms from the CDASH library (including a pregnancy test form the console's
   shipped build lacks) or design your own: fields, types, units, codelists, required and
   critical-to-quality flags, show-if logic, a live preview and the completion guidelines.
4. **Codelists**: the answers behind each closed question, including the criteria list.
5. **Edit checks**: a coverage table of the checks the protocol calls for, and an editor for
   logic, query text and test cases, run as you type.
6. **Build review**: findings against the protocol, CDASH conventions, the needed checks, the
   console's importer and the completion guidelines. High findings block release.
7. **UAT**: run every test case, turn failures into issues, fix or accept them with a reason,
   write the summary and sign. Any later change withdraws the sign-off.
8. **Release**: version, notes and signature. Downloads: the study build file (JSON), the
   annotated CRF with CDASH and SDTM annotations, the data validation specification (CSV), the
   CRF completion guidelines, the UAT report, the build as CDISC ODM v2.0 XML and the protocol
   as USDM data.

## Roles and independence

The study team has a study builder, a UAT tester and a lead data manager; switch between them in
the header. Only the builder changes the build, only the tester runs and signs UAT, and only the
lead releases. Nobody who changed a build version can sign its UAT.

## Scripted UAT

Besides the test cases on each check, the UAT plan has seven test scripts. The tester enters test
patients through the eCRF pages step by step and records whether the expected queries appear;
deviations from the scripted data, failures and blocked steps become issues. The tester can
leave a script out of scope for a round, with a reason; the sign-off is then partial and cannot
support a release. A script result
stays valid until the forms, checks or visits it tests change, so after a change only the
affected scripts are run again (regression testing scoped by impact).

## Protocol amendment after go-live

Build 1.0 is in production with data entered when amendment 3 arrives: a new Week 6 visit, serum
magnesium, and a lower potassium threshold from the effective date. The Amendment page holds the
impact assessment, shows the queries the new build would raise on data already entered, lists
earlier results for the medical monitor, and shows which scripts need re-testing.

## Standards: ODM and USDM

- **CDISC ODM v2.0**: the build exports as ODM study metadata (study events, item groups, items
  with CDASH and SDTM aliases, codelists, show-if conditions, and each edit check as a soft
  RangeCheck with its query text). The tests validate the export against the official CDISC
  ODM v2.0 schema (included under `tests/odm-v2.0-schema`, MIT License).
- **CDISC USDM v4**: the protocol is available as USDM-shaped data (a teaching subset), and a
  generator drafts a first-pass build from it, with the misses automation typically makes. You
  can also generate a build from an edited USDM file of this protocol.

## Missions

- **M1 Fix the draft build and release 1.0**: the console's build 0.1 has a wrong visit
  window, a missing ECG visit, no pregnancy test form, a criterion that cannot be recorded and
  three faulty edit checks.
- **M2 Build the study from the protocol**: from an empty build to a release the console
  imports.
- **M3 UAT: find the three faulty checks**, with test cases and scripts, ending in a partial UAT
  sign-off (S5 and S6 out of scope, with reasons), which the lab will not release.
- **M4 Protocol amendment after go-live**: impact assessment, build 1.1, regression UAT and
  release without new queries on old data.
- **M5 Review the build generated from the digital protocol**.

Three levels: guided (goals and hints), standard (goals) and expert (goals shown after
submission). The grader reads the build itself and re-tests changed checks with hidden test
cases, so changing a test's expected result does not count as a fix. Passing all five gives a
certificate with a verification code and a passport record for the
[Regulatory Skills Passport](https://randomthingsonlineatsk-cloud.github.io/pharmolecule/passport.html).

## Run it

```bash
npm ci
npm run dev      # development server
npm test         # unit tests (vitest)
npm run build    # type-check and build to dist/
```

The study build file format is in `docs/study-build-format.md`.

## Sources

- ICH M11 Clinical electronic Structured Harmonised Protocol (Step 4, 19 November 2025).
- ICH E6(R3) Good Clinical Practice (Step 4, 6 January 2025).
- CDISC ODM v2.0 (specification and schema: github.com/cdisc-org/DataExchange-ODM).
- CDISC USDM version 4 (released June 2025).
- CDISC CDASHIG v2.3, SDTM and Controlled Terminology.

## Licence

Apache License 2.0. See `LICENSE` and `NOTICE`.

Built by Khan Gulrez Shagufa Fazal Ahmed.
