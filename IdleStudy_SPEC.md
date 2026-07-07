# Build Spec: SnapStudy — Voice-In, Voice-Out Flashcards for Spectacles
**Target audience: Claude Code, connected to Lens Studio via its MCP server**
**Goal: A working, demoable Lens in 6-8 hours. Bare-bones over scalable, every time.**

---

## 0. Context for Claude Code

You are building a real Lens Studio project for Snap Spectacles, not a web mockup. You have access to Lens Studio's MCP server (Developer Mode), which lets you inspect and modify the actual scene directly — list scene objects, set properties, add/edit scripts, get the scene graph — rather than only writing files blind. **Use the MCP tools to build and verify the scene as you go**, not just to write `.ts` files into a folder. After each phase in Section 8, use the MCP connection to confirm the scene actually reflects what you built (e.g. get scene graph, check the object exists, check script compiles) before moving to the next phase.

The project starts **completely blank**. You are building the scene from zero: objects, camera setup, and scripts all need to be created through Lens Studio, not assumed to exist.

**Required Lens Studio version: 5.15.3.** The target hardware is Spectacles (2024), and Snap has stated 5.15.x is the last supported Lens Studio series for that device — later versions (5.20+) target unreleased next-gen hardware and are not what this project should use. 5.15.3 also has the simplified MCP server connection and updated MCP protocol support. If the connected Lens Studio instance reports a different version, flag it to the user before proceeding rather than assuming compatibility.

**This app has no visual interface at all.** Input is voice (VoiceML Module). Output is voice (TextToSpeechModule). There is no text panel, no UI Kit, no screen content of any kind. Every single thing the user needs to know — the front of a card, the back of a card, confirmation that a command registered, the end-of-session summary — must be spoken aloud. If you find yourself creating a Text component, a UI Kit panel, or anything else meant to be looked at, stop — that's a violation of this spec, not a scope decision to make on your own.

If at any point the MCP connection is unavailable or a tool call fails, stop and flag it rather than guessing at what the scene contains — do not proceed on assumptions about scene state you haven't verified.

**Reference:** Snap's official guide for this exact workflow is "Developer Mode Using Claude Code" (developers.snap.com/lens-studio/features/lens-studio-ai/developer-mode/with-claude-code). If a `.claude/agents/lens-studio-agent.md` doesn't already exist in this project, create one following that guide's pattern before starting Phase 1 — it will make every subsequent MCP interaction more reliable.

---

## 1. Cross-Cutting Behavior: Development Story Capture & Git Workflow

**This section applies continuously, throughout the entire build — it is not a one-time setup step and it is not optional overhead. Treat it as equal priority to writing code.** This project's end goal isn't just a working Lens — it's also raw material for a short-form social video recapping the build ("vibe coding" arc: rapid build, real friction, breakthroughs, payoff). Your job includes tracking that narrative as it happens, because the context is only accurate if captured in the moment, not reconstructed afterward.

### Maintain `DEV_STORY_LOG.md`

Create this file at the project root at the very start of Phase 1, before any scene work. Every story point (defined below) gets appended as an entry in this exact format:

```
## [Phase X / Checklist item Y] — <short title>
**Timestamp:** <approx elapsed time or phase marker>
**What was built:** <1-2 sentence technical summary, plain language>
**User's account:** <the user's actual answer to "how did that go?">
**Friction/struggle:** <what went wrong, what took longer than expected, what was confusing — omit if genuinely none>
**Win/highlight:** <what worked well, anything visually or narratively demo-worthy>
**Suggested capture:** <the specific thing to screen/audio record for this moment>
```

### Trigger conditions — when something is a "story point"

Treat ALL of the following as story points, no exceptions:
- Completion of any Build Phase from Section 8.
- Any Acceptance Checklist item from Section 9 passing for the first time.
- Anything breaking unexpectedly and then getting fixed. **Do not skip logging failures** — a real struggle-and-recovery moment is more valuable to this video than a clean success, and skipping it to "keep things moving" actively works against the stated goal.
- Any moment the user expresses surprise, frustration, excitement, or relief in chat, even outside a formal phase boundary.

### Exact sequence to follow at every story point

Do not compress or skip steps in this sequence, and do not batch multiple story points into one prompt:

1. **Announce it** using this exact marker so it's unmissable in scrollback:
   ```
   🎬 STORY POINT: <what just happened, one line>
   ```
2. **Immediately follow with a screen-record reminder**, naming the specific thing to capture. Since this app is audio-only, the capture must include sound — e.g. "This is a good moment to record — with audio on — the first time the Lens speaks the answer aloud after 'flip'."
3. **Ask, verbatim or close to it:** "How did that go? Any friction, surprises, or wins worth noting?"
4. **Wait for the user's answer before continuing to the next build task.** Do not proceed and ask later — capture context while it's fresh.
5. **Log the answer** into `DEV_STORY_LOG.md` using the format above, immediately after receiving it.

### Git commit suggestions

Evaluate this after logging every story point:

- **Suggest a commit** when the user's answer signals the feature is genuinely working (language like "worked," "that's solid," "yeah good," first-try success). Propose a real, specific commit message that captures the technical change — and where it fits, the narrative beat too, e.g. `feat: voice "flip" command triggers TTS reading the card back`.
- **Also suggest a commit right before any risky or uncertain next step** (e.g. before touching VoiceML speech-context tuning once it's already working), framed as preserving a known-good rollback point, not as a formality.
- **Do not suggest a commit** if the answer signals the feature is broken, flaky, or incomplete. Wait until it's resolved, log the fix as its own story point (fixes are often the best content), and suggest the commit at that point instead.
- **Never execute the commit or push yourself.** Per your standing operating rules, this is a version-control action that requires the user's explicit go-ahead — always suggest, wait for confirmation, then act.

### End-of-build deliverable: `VIDEO_ROADMAP.md`

Once Section 9's Acceptance Checklist is fully complete, or the build session ends (whichever comes first), generate `VIDEO_ROADMAP.md`, built **entirely from what's actually in `DEV_STORY_LOG.md`** — do not invent beats that weren't logged. Structure it on established short-form video conventions:

- **Hook (first 1-3 seconds):** Open on the single highest-energy moment in the log — usually the final working demo, the funniest failure, or the most satisfying "it works" beat. Open on payoff or chaos, not chronology — flash back from there. Since the app itself has no visuals, the hook will likely be built around audio + the presenter's reaction, not on-screen UI — plan the shot description accordingly (e.g. "presenter's face when the glasses correctly speak the answer").
- **Setup (5-10 seconds):** One line establishing the premise, e.g. "I built a voice-only flashcard app for AR glasses — no screen, just talking to it — in one sitting with Claude Code."
- **Rapid build montage:** Fast cuts through early phases using the logged "Suggested capture" clips. High tempo, minimal narration — let on-screen text captions carry information instead of voiceover where possible, since the app's own audio output is part of the content, not something to talk over.
- **The struggle beat:** Pull the most relatable friction entry from the log — a real misfire, a real wiring bug, whatever actually happened. This is the retention anchor. Do not sand this down into something generic; specific, real friction outperforms a polished highlight reel for this format.
- **The breakthrough:** The moment that friction resolved. Pair it with the corresponding git commit if one exists.
- **Payoff/final demo:** A full clean run of the finished Lens — this should foreground the audio exchange (spoken command → spoken response) since that IS the product experience.
- **CTA/closer:** One line inviting engagement — comment, follow, "what should I vibe-code next."

For every beat, cite the exact `DEV_STORY_LOG.md` entry it's drawn from and the specific suggested-capture clip, so the user can locate the right footage without re-watching everything. Target 30-60 seconds total runtime (45 is the sweet spot for this genre), and mark which beats should be carried by on-screen captions versus voiceover.

---

## 2. What You're Building (one paragraph)

A single Lens, entirely voice-in/voice-out with **no visual interface whatsoever**: on launch, it loads a hardcoded flashcard deck from a bundled JSON file and speaks the front of card 1 aloud via text-to-speech. It is driven entirely by 4 voice commands — **"flip"** (speak the answer), **"got it"** (mark known, speak the next card), **"again"** (re-queue, speak the next card), **"end"** (speak the summary and end early). When the deck is exhausted, or "end" is spoken, the app speaks a summary: cards reviewed, number marked "got it". No screen content, no touch/gesture input, no deck authoring, no accounts, no persistence, no multi-deck support. This is a single, linear, fully spoken session.

---

## 3. Explicitly Out of Scope (do not build these)

- **No visual UI of any kind** — no text panels, no UI Kit elements, no on-screen content. Everything is spoken.
- No gesture/pinch/tap fallback input — voice only, in and out.
- No "start", "next", or "back" commands. ("repeat" is now IN scope — see Section 4. It was added after live-lens testing revealed that, with no visual fallback, a user who misses the spoken prompt has no way to hear it again.)
- No deck switching, deck authoring, or deck editing UI.
- No persistence across sessions (no save/resume).
- No accounts, no login, no user identity.
- No spaced-repetition scheduling — "again" cards just go to the back of the current session's queue.
- No Snap Cloud / remote data — deck is a local bundled JSON asset.
- No multiplayer / Connected Lenses.
- No image or audio flashcards — text-to-speech from plain text only.
- No outdoor-safety or motion-awareness features.
- No internet-dependent TTS (Remote Service Gateway / OpenAI TTS) — use Lens Studio's **built-in, on-device `TextToSpeechModule`**, which needs no API tokens, no internet connection, and no Remote Service Gateway setup. This is both simpler to wire up and more reliable for a live demo with unpredictable venue Wi-Fi.

If you find yourself building any of the above, stop — it's out of scope for this pass.

---

## 4. Voice Commands (final, locked)

| Spoken command (+ close synonyms) | Trigger condition | Effect |
|---|---|---|
| "flip" / "show answer" / "reveal" | Card back not yet spoken | Speak the back of the current card aloud |
| "got it" / "correct" / "know it" | Card back has been spoken | Mark card known, speak the front of the next card (or the summary if deck exhausted) |
| "again" / "review" / "not yet" | Card back has been spoken | Re-queue card at end of session queue, speak the front of the next card |
| "end" / "I'm done" / "stop" | Any time | Immediately speak the summary and end the session |
| "repeat" / "one more time" / "repeat that" | Any time | Re-speak the current card — the front, or the back if it has already been revealed. Does not advance the deck or change any counts. |

Notes for implementation:
- **"repeat" rationale + collision warning:** repeat exists because the voice-only product has no visual fallback — if the user misses the spoken prompt, this is the only way to re-hear it. Keep its keyword set DISJOINT from "again" (re-queue): do NOT use synonyms containing the word "again" (e.g. "say it again"), since command matching is substring-based and the two commands would collide.
- No wake word — VoiceML listens continuously for the session, **except while TTS audio is playing** (see Section 6's mic-muting requirement — this is not optional, see the self-triggering risk in Section 10).
- "got it" and "again" should only be actionable after the card back has been spoken. If spoken before that, ignore (no-op) rather than erroring.
- Use Lens Studio's VoiceML Module with Speech Context boosting on these exact keyword sets. Start boost value at 5 per Snap's guidance and adjust only if a specific command is consistently misclassified during testing.
- **Never include any of the command trigger words ("flip," "got it," "correct," "know it," "again," "review," "not yet," "end," "done," "stop") in TTS output.** Card content is fine as-is since it's user-authored placeholder trivia, but all app-generated spoken lines (confirmations, summary, etc.) must avoid these words entirely to reduce the chance of the app hearing its own voice as a command.

---

## 5. Data Model

### Deck file — `Assets/Data/deck.json` (bundled local asset)
Generic placeholder trivia deck, ~10 cards. Content doesn't matter for the demo — use straightforward trivia or vocab, whichever is faster to generate. Keep card text conversational and TTS-friendly (short sentences, no abbreviations that might mispronounce).

```json
{
  "deck_id": "demo-deck-01",
  "deck_name": "SnapStudy Demo Deck",
  "cards": [
    { "id": "c01", "front": "What is the capital of Japan?", "back": "Tokyo" }
  ]
}
```

### In-memory session state (no persistence — resets every launch)
```ts
interface SessionState {
  queue: string[];         // ordered card IDs remaining this session (re-queued "again" cards get pushed to the end)
  currentCardId: string | null;
  backSpoken: boolean;      // whether the back of the current card has been spoken yet
  knownCount: number;
  reviewedCount: number;    // total cards resolved (got it + again), NOT counting re-queues as new cards
  sessionEnded: boolean;
  isSpeaking: boolean;      // true while TTS audio is playing — used to mute VoiceML input, see Section 6
}
```

---

## 6. Session Logic (state machine)

**Critical requirement not present in a visual-UI version of this app: mute/ignore VoiceML input while `isSpeaking` is true.** The Spectacles speaker and microphone are both active on-device; without this guard, the app's own TTS output risks being picked up by VoiceML and misread as a command. Use the `TextToSpeechModule`'s completion callback (or the `AudioComponent`'s finished event) to flip `isSpeaking` back to `false` and resume listening only once playback actually finishes — don't estimate timing, use the real callback.

```
ON LENS LAUNCH:
  load deck.json
  queue = all card IDs in order
  currentCardId = queue[0]
  backSpoken = false
  speak(front text of currentCardId)   // sets isSpeaking = true, resumes listening onComplete

ON "flip" (only if !backSpoken AND !isSpeaking):
  backSpoken = true
  speak(back text of currentCardId)

ON "got it" (only if backSpoken AND !isSpeaking):
  knownCount += 1
  reviewedCount += 1
  advanceCard()

ON "again" (only if backSpoken AND !isSpeaking):
  queue.push(currentCardId)   // re-queue at the end
  reviewedCount += 1
  advanceCard()

ON "end" (any time, even mid-speech — this is the one command allowed to interrupt):
  sessionEnded = true
  speak(summary text)

FUNCTION advanceCard():
  remove currentCardId from front of queue
  if queue is empty (after removal, excluding any just-requeued copy):
    sessionEnded = true
    speak(summary text)
  else:
    currentCardId = queue[0]
    backSpoken = false
    speak(front text of currentCardId)

FUNCTION speak(text):
  isSpeaking = true
  call TextToSpeechModule.synthesize(text, ...)
  on completion callback: isSpeaking = false
```

**Edge case to handle explicitly:** if a card is re-queued via "again", the deck is only "exhausted" when every card has been marked "got it" at least once — i.e. check that `queue` (minus the card currently being resolved) is empty, not just that you've gone through the original card count once. Simplest correct implementation: after `advanceCard()`, if `queue.length === 0`, end the session.

### Summary speech (bare-bones)
Spoken aloud, no visual equivalent needed:
```
"Session complete. You reviewed {reviewedCount} cards and got {knownCount} right."
```

---

## 7. Scene Structure (build via MCP) — audio only, no visual objects

Minimum viable scene graph:

```
Scene
├── Camera (default AR camera setup — required by Lens Studio even with no visible content)
├── VoiceML Module (Speech Recognition, keyword/command mode, speech contexts for the 4 commands)
├── TTSPlayer (scene object)
│   ├── TextToSpeechModule (Asset — built-in, on-device, no internet/tokens required)
│   └── AudioComponent (plays the synthesized AudioTrackAsset that TextToSpeechModule produces)
└── SessionController (script object — owns SessionState, wires VoiceML command events and TTS completion callbacks to the state machine in Section 6)
```

There is intentionally no CardPanel, no Text component, no UI Kit dependency at all. Keep it to **one script** (`SessionController.ts`) owning all logic unless there's a clear reason to split — this is a 6-8 hour build, not a codebase to maintain. Don't over-architect: no separate manager classes for TTS vs. state vs. input unless the single-file version becomes genuinely unreadable.

---

## 8. Build Phases (suggested time-boxing for a 6-8 hour session)

Use the MCP connection to actually build and verify each phase in Lens Studio before moving on — don't write all the code first and wire it up at the end. **At the end of every phase, follow the Section 1 story-point sequence before starting the next phase.**

1. **(30-45 min) Scene skeleton.** Via MCP: create the TTSPlayer object with TextToSpeechModule + AudioComponent, and the SessionController object. Confirm via scene graph that both exist with correct setup. No visual objects to create — this phase is shorter than a UI-based build.
2. **(45-60 min) Deck loading + first spoken card.** Create `deck.json` with ~10 placeholder cards. Write loader logic in `SessionController.ts`. Verify: on Preview launch, the front of card 1 is audibly spoken through TTS with no visual confirmation needed or expected.
3. **(60-90 min) VoiceML setup + mic-muting.** Add VoiceML Module, configure speech contexts for the 4 commands with boost value 5. Implement the `isSpeaking` mute-guard from Section 6 from the start — do not wire voice commands first and add the guard later, since testing without it risks the app triggering itself and wasting debugging time on a misdiagnosed "voice recognition is unreliable" issue. Wire "flip" first, verify in Preview (mic test) that saying "flip" triggers TTS speaking the back, and that the TTS audio itself doesn't get picked up as a new command.
4. **(60-90 min) Full state machine.** Implement "got it" / "again" / "end" per Section 6. Verify a full manual run-through by ear only: flip → got it → flip → again → ... → deck exhausted → summary spoken with correct counts.
5. **(30-45 min) Summary speech polish.** Confirm the summary sentence sounds natural via TTS, confirm "end" mid-session speaks correct partial counts, not just end-of-deck counts.
6. **(45-60 min) Voice reliability pass.** Test all 4 commands multiple times in Preview with mic input, specifically including a check that the app never reacts to its own TTS output. Adjust boost values only for commands that misfire. Do not add new input modalities to compensate — if voice recognition is unreliable, note it as a known risk (Section 10), don't scope-creep a fix.
7. **(remaining time) Hardware deploy attempt, if time allows.** Push to physical Spectacles per Lens Studio's standard deploy flow. Pay particular attention here: on real hardware, speaker output and microphone input are physically live at the same time in a way Preview may not fully replicate — retest the self-triggering guard specifically on-device, don't assume the Preview result carries over. If this eats into remaining time with no clear path to success, fall back to Preview-only for the demo — a working Preview demo beats a half-broken hardware deploy.

If time runs short, cut in this order: (1) hardware deploy, (2) voice reliability polish beyond "it basically works", (3) summary speech wording polish. Do not cut the core flip/got-it/again loop — that's the entire product. Do not cut the Section 1 story-capture behavior to save time — logging a story point takes seconds and the video is a stated deliverable of this project, not a nice-to-have.

---

## 9. Acceptance Checklist (what "done" means for this build)

Each item below is also a story-point trigger per Section 1 — log it the first time it passes.

- [ ] Lens launches in Preview and immediately speaks card 1's front text aloud, with no visual content shown.
- [ ] Saying "flip" triggers TTS speaking the back of the current card.
- [ ] Saying "got it" (after the back has been spoken) advances to the next card and speaks its front.
- [ ] Saying "again" (after the back has been spoken) re-queues the current card and speaks the next card's front.
- [ ] Saying "got it"/"again" before the back has been spoken does nothing (no crash, no skip, no spoken response).
- [ ] Saying "end" at any point immediately speaks the summary with correct counts so far.
- [ ] Running through the full ~10-card deck naturally ends with a spoken summary containing correct `reviewedCount` and `knownCount`.
- [ ] The app does not react to its own TTS output as if it were a spoken command (tested across multiple cards, not just once).
- [ ] No crashes across one full continuous session start-to-summary.
- [ ] (Stretch) Same behavior confirmed on physical Spectacles hardware, not just Preview.

---

## 10. Known Risks (accept, don't over-engineer around)

- **Self-triggering: the app hearing its own voice.** This is the single biggest new risk introduced by going voice-out as well as voice-in. The mic-mute guard in Section 6 and the trigger-word avoidance rule in Section 4 are the two mitigations — implement both, don't rely on just one. If self-triggering still occurs after both are in place, that's worth flagging as a risk in the demo, not chasing indefinitely.
- **Voice misfires from background speech are still expected** on top of the above — "got it" and "again" are common enough phrases that background speech could trigger them. Accepted risk for this build, not a bug to eliminate — do not add wake-word or push-to-talk logic to fully solve it; that's out of scope.
- **TTS pacing/latency affects the whole experience** now that there's no visual fallback — if TTS takes a noticeable beat to start speaking, the user has zero feedback that their command registered at all (no visual "processing" cue is in scope). If this feels bad during testing, that's worth noting as a risk rather than solving by adding a visual loading indicator, which would violate the voice-only constraint.
- **VoiceML/TTS behavior in Preview vs. on-device can differ**, especially the timing of mic/speaker interaction described in Phase 7. Budget the hardware attempt accordingly and don't treat a Preview-only result as fully validated.
- **Single continuous listening session with no re-init logic.** If VoiceML needs to be reset/restarted after errors, add the minimum handling to keep the demo from silently dying — but don't build a robust reconnection system.

---

## 11. Explicit Non-Goals Reminder

This is a hackathon MVP. Every decision should optimize for "does the core loop work in a live demo," not "is this maintainable, scalable, or extensible." If you notice yourself adding configuration options, abstraction layers, visual feedback of any kind, or handling for cases outside the 4-command loop above, stop and check this spec again before continuing.
