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
   CRF completion guidelines and the UAT report.

## Missions

- **M1 Fix the draft build and release 1.0**: the console's build 0.1 has a wrong visit
  window, a missing ECG visit, no pregnancy test form, a criterion that cannot be recorded and
  three faulty edit checks.
- **M2 Build the study from the protocol**: from an empty build to a release the console
  imports.
- **M3 UAT: find the three faulty checks**.

Three levels: guided (goals and hints), standard (goals) and expert (goals shown after
submission). The grader reads the build itself and re-tests fixed checks with hidden test
cases, so changing a test's expected result does not count as a fix.

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
- CDISC CDASHIG v2.3, SDTM and Controlled Terminology.

## Licence

Apache License 2.0. See `LICENSE` and `NOTICE`.

Built by Khan Gulrez Shagufa Fazal Ahmed.
