# DEV_STORY_LOG

Development story capture for the SnapStudy build (per IdleStudy_SPEC.md, Section 1).

> Note: This log was created partway through Session 1 after the first working demo. Entries below marked _(backfilled)_ were reconstructed after the fact — their "User's account" fields were not captured in the moment. Logging is real-time from here forward.

---

## [Phase 1 — Scene skeleton] — Building over the Agentic Playground template _(backfilled)_
**Timestamp:** Session 1, early
**What was built:** Discovered the project was NOT blank — it was the full "Agentic Playground" template (Chat/Summary/Diagram panels, an agent orchestrator, LLM backends). Decided (with user) to build the trivia MVP over it: created a new `TriviaController` object + a head-locked `TriviaPanel` text object, and disabled 15 template feature/manager objects so the scene shows only the trivia flow.
**User's account:** _(not captured in the moment)_
**Friction/struggle:** The spec assumed a blank project; reality was a dense template, so the first task became triage — decide what to keep (Camera, SIK) vs. disable (all the agent/LLM machinery). Setting object positions via MCP also silently failed until switching from a whole-vec3 set to individual numeric components (`localTransform.position.z`).
**Win/highlight:** Clean separation achieved fast — one small self-contained script instead of touching any template code.
**Suggested capture:** Screen-record the Lens Studio scene hierarchy before/after — the wall of template objects collapsing down to a clean TriviaController + TriviaPanel.

---

## [Phase 2 — Deck loading + first card] — deck.json won't load, pivot to embedded deck _(backfilled)_
**Timestamp:** Session 1, mid
**What was built:** A 15-card trivia deck and loader logic. First card ("What is the capital of Japan?") renders on the head-locked panel at launch.
**User's account:** _(not captured in the moment)_
**Friction/struggle:** The real struggle beat. `deck.json` imported as a "JsonAsset", but reading it at runtime failed repeatedly: typing the input as `Asset` gave a runtime object with no `.json`; typing it as `JsonAsset` failed to compile (`TS2304: Cannot find name 'JsonAsset'`); a runtime probe confirmed `typeof .json = undefined`. Digging into `StudioLib.d.ts` proved this SDK has NO scripting API to read a bundled JSON/text file at all. Pivoted to embedding the deck in the script, with `deck.json` kept on disk as the editable source of record.
**Win/highlight:** Turned a dead-end SDK limitation into a clean, working fallback without losing the "edit the deck" workflow — and confirmed the constraint from the type definitions rather than guessing.
**Suggested capture:** Screen-record the compile-error → runtime-probe log (`typeof .json=undefined`) → grep of StudioLib.d.ts → the "Loaded 15 cards from bundled deck" success line. Classic debugging arc.

---

## [Phase 3/4 — Voice input + full loop] — Playing trivia by voice on Spectacles ✅
**Timestamp:** Session 1, first working demo
**What was built:** Reused Lens Studio's on-device `AsrModule` for continuous listening. On each recognized phrase, a lenient normalized contains-match compares speech to the card's answer — correct answer advances to the next question, wrong answer stays. Confirmed working end-to-end, live, on real Spectacles hardware.
**User's account:** "Phenomenal, it worked. I was able to play trivia with voice in the Spectacles." Follow-up detail: "The voice recognition was mostly reliable. No answers got misheard. The text panel sat comfortably in view and was easy to read and well positioned. I was surprised with how smooth it felt. There was a slight delay, so there was a bit of a moment where you're not sure if you got it or not."
**Friction/struggle:** Two false-negative answer-matching misses surfaced during testing: saying "nineteen twelve" didn't register against the card's written answer "Nineteen twelve" spoken differently as "one thousand, nine hundred and twelve"; and "the Pacific" (shortened) didn't match the stored answer "The Pacific Ocean" because the current contains-match requires the full stored answer string to appear in speech, not the reverse. User's take: "These hiccups are honestly fine for an MVP though since for the recording we can just make sure we say the right thing." Also noted: a slight recognition delay created a brief moment of not knowing if the answer registered — a known, accepted risk per spec Section 10 (no visual "processing" cue in scope).
**Win/highlight:** The payoff moment — a real voice-driven trivia loop running on actual Spectacles hardware, not just Preview. Panel legibility and positioning nailed on the first attempt. This is the hero shot for the video.
**Suggested capture:** Record — with audio on — a full run on the Spectacles: question appears, user speaks the answer aloud, the panel flips to the next question. Get the presenter's reaction on the first correct-answer advance. Optionally include a quick beat showing the "nineteen twelve" miss as a relatable, honest hiccup before the clean run.
