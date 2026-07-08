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

---

## [Phase 5 — Voice-out final product, first test] — TTS + command model, "got it" flops, "repeat" discovered
**Timestamp:** Session 1, first full voice-in/voice-out test on-device
**What was built:** Rebuilt the app to the spec's finished form: on-device TextToSpeechModule speaks every prompt/answer/summary, driven by spoken commands (flip / got it / again / end) with a mic-mute guard so it never hears its own voice. Text panel kept as a demo aid.
**User's account:** "That UX hitch felt awkward in-lens. Flip worked but the 'got it' command did not. End worked as well." Also: having to say "got it" at all felt wrong — "I shouldn't have to tell it if I got it. When it hears the right answer, it should register that as correct and go to the next card." And a gap surfaced: "if I didn't hear the narrator state the question the first time, there was no way to repeat it... that made it clear a separate 'repeat' command is necessary for the final voice-only."
**Friction/struggle:** The "got it" voice command didn't register on-device, and more fundamentally the whole "tell the app you were right" interaction felt clunky. Two real design lessons from wearing the lens: (1) explicit self-grading is worse UX than just detecting the spoken answer; (2) with no visual fallback, a missed prompt is a dead end — you need a "repeat" command. The latter directly contradicted the spec, which had listed "repeat" as out of scope.
**Win/highlight:** "flip" and "end" both worked by voice, and the on-device TTS spoke cleanly with no self-triggering. The test itself was the win — in-lens use surfaced two concrete improvements a Preview run never would have.
**Suggested capture:** Record the awkward "got it" moment (command not registering) as the honest friction beat, then the fix: speaking the answer and having it auto-advance. Voiceover the "repeat" realization — it's a relatable "obvious in hindsight" design insight.

**Decisions from this test:** (a) Advancement reverts to automatic answer-detection (speak the correct answer → marked known → next card), removing the "got it" command. (b) "repeat" added to IdleStudy_SPEC.md Section 4 (not yet implemented) for the eventual voice-only build.
**Commit status:** NOT committing the "got it" command state — it was broken/awkward. Will commit after the answer-detection fix is confirmed working on-device (per spec Section 1 commit rules).

---

## [Phase 6 — On-device regression] — Perfect in Preview, silent & stuck on Spectacles
**Timestamp:** Session 2 (2026-07-08), on-device test of the audio-feedback / 5-second-rule build (commit `cc3318c`)
**What was built:** Since the last entry the app gained on-device TTS (built-in TextToSpeechModule), a correct/buzz audio-feedback chime (separate sfxComponent), and a "5-second rule" — if no correct answer is heard within 5s it buzzes, re-queues the card, and moves on. Deck content also swapped to music-theory questions.
**User's account:** "The app is working fully in the editor preview, but when I launch it on the Spectacles, it's not working at all, even though the debug logs are displaying appropriately as if it's working (I see 'speaking' and the question on there and then it says answer timeout, no matter if I say the answer). I hear no audio on the spectacles nor see the text, and when I look at my hand to open the menu widgets, the app is definitely open."
**Friction/struggle:** The classic Preview-passes / device-fails split the spec explicitly warned about (Section 10 + Phase 7). Three distinct on-device symptoms: (1) no TTS audio, (2) the text panel doesn't render, (3) the new 5-second timeout fires on every card regardless of spoken answers. Confirmed from code that the "answer timeout" log IS the 5-second rule (`onAnswerTimeout`), and that its firing means the flow does reach the listen phase but never detects an answer in time — i.e. TTS's callback chain completes (arming the timer) but produces no sound, and ASR never returns a matching answer within the window. Root cause not yet isolated: the Lens Studio MCP connection dropped mid-debug, so the actual on-device logs (which would show whether TTS hit its error path and what ASR returns) couldn't be read this pass.
**Win/highlight:** Failure is localizable fast once logs are readable, and there's a known-good on-device baseline to bisect against — the text-only MVP (commit `129a7d0`) that was confirmed working by voice on the glasses.
**Suggested capture:** A strong, relatable struggle beat: "it worked flawlessly on my computer and did absolutely nothing on the actual glasses." Capture the silent glasses + the debug log spamming "answer timeout." Pairs with the eventual fix as the breakthrough moment.
**Leading hypotheses (to confirm from device logs):**
- *No text on device:* the TriviaPanel Text likely has no Font asset assigned — Lens Studio renders a default font in Preview but often renders nothing on-device without an explicit Font.
- *No audio on device:* built-in TextToSpeechModule either hits its error path on-device (look for "TTS error ...") or completes but the AudioComponent output isn't audible on Spectacles (routing/spatial-audio config). If TTS/ASR quietly depend on connectivity, poor device Wi-Fi would hit both at once.
- *Always "answer timeout":* downstream — with no audible question the user can't answer in time, and the 5s window (which includes ASR's 1.5s silence-termination + device latency) is very tight even when they do speak; ASR may also fail to re-acquire the mic right after audio playback on-device.
**Baseline for bisecting:** `cc3318c` = broken on device. `129a7d0` (text-only MVP, no TTS) = last state confirmed working on device.
