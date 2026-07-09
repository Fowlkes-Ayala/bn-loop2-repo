/**
 * TriviaController — SnapStudy voice-in / voice-out flashcards (final product).
 *
 * Per IdleStudy_SPEC.md: a single linear flashcard session driven entirely by
 * four spoken commands, with every prompt/answer/summary spoken aloud via the
 * built-in, on-device TextToSpeechModule (no internet / no API tokens).
 *
 *   "flip"   (show answer / reveal)      -> speak the back of the current card
 *   "got it" (correct / know it)         -> mark known, advance, speak next front
 *   "again"  (review / not yet)          -> re-queue card at end, speak next front
 *   "end"    (I'm done / stop)           -> speak the summary and end the session
 *
 * Deviations from the spec, locked with the user:
 *  - Voice input uses AsrModule + keyword matching (not VoiceML) — already
 *    validated on Spectacles hardware.
 *  - The on-screen Text panel is kept as a demo/debug aid, mirroring spoken text
 *    (the spec's final product is voice-only; this is an intentional hybrid).
 *
 * Mic-mute guard (spec Section 6/10): the app never transcribes while TTS audio
 * is playing, so it cannot hear its own voice as a command.
 */

interface Card {
  id: string
  front: string
  back: string
}

@component
export class TriviaController extends BaseScriptComponent {
  @input
  @hint("On-screen Text used as a demo/debug aid (mirrors whatever is spoken)")
  private questionText: Text

  @input
  @hint("AudioComponent that plays the synthesized TTS audio")
  private audioComponent: AudioComponent

  @input
  @hint("AudioComponent used to play the correct-answer chime (kept separate from the TTS audioComponent)")
  private sfxComponent: AudioComponent

  @input
  @hint("Short chime played when a correct answer is detected")
  private correctSfx: AudioTrackAsset

  @input
  @hint("Buzz played when no correct answer is heard within answerTimeoutMs")
  private buzzSfx: AudioTrackAsset

  @input
  @hint("TTS voice name (built-in). Supported: Sasha")
  private voiceName: string = "Sasha"

  @input
  @hint("Silence (ms) before a spoken command is finalized")
  private silenceMs: number = 1500

  @input
  @hint("Time (ms) to hear the correct answer before it counts as a miss and moves on")
  private answerTimeoutMs: number = 5000

  @input
  @hint("Enable debug logging")
  private enableDebugLogging: boolean = true

  private asrModule: AsrModule = require("LensStudio:AsrModule")
  private tts: TextToSpeechModule = require("LensStudio:TextToSpeechModule")

  // Deck (lookup by id)
  private cardsById: {[id: string]: Card} = {}

  // Session state (spec Section 5) — resets every launch, no persistence
  private queue: string[] = []
  private currentCardId: string = null
  private backSpoken: boolean = false
  private knownCount: number = 0
  private reviewedCount: number = 0
  private sessionEnded: boolean = false
  private isSpeaking: boolean = false

  private restartEvent: DelayedCallbackEvent
  private answerTimeoutEvent: DelayedCallbackEvent
  private scriptedResolveEvent: DelayedCallbackEvent

  // On-camera scripted demo: the first SCRIPTED_TOTAL cards run with the mic OFF
  // and are auto-resolved purely on a 5s timer after each front is declared —
  // cards 1..(SCRIPTED_WRONG_AT-1) auto-correct, card SCRIPTED_WRONG_AT auto-wrong.
  // The auto-wrong card is NOT re-queued, so the deck order never changes.
  // From card SCRIPTED_TOTAL+1 onward, normal voice/ASR detection resumes.
  private presentedCount: number = 0
  private static SCRIPTED_TOTAL = 4
  private static SCRIPTED_WRONG_AT = 4
  private static SCRIPTED_RESOLVE_MS = 3000

  // Bumped whenever a listen cycle is abandoned out from under a pending
  // transcription (i.e. the answer timeout fires) so a late ASR result for
  // the old card can't be mistakenly applied to the new one.
  private listenGeneration: number = 0

  // Command synonym sets, matched against normalized speech. "got it" is
  // intentionally NOT a command — a correct answer is detected automatically.
  private static FLIP = ["flip", "show answer", "reveal"]
  private static AGAIN = ["again", "review", "not yet"]
  private static END = ["end", "im done", "i am done", "done", "stop"]

  onAwake(): void {
    // Reusable delayed callback used to re-arm the mic between utterances.
    this.restartEvent = this.createEvent("DelayedCallbackEvent")
    this.restartEvent.bind(() => this.listen())

    // Per-card countdown: fires if no correct answer is heard in time.
    this.answerTimeoutEvent = this.createEvent("DelayedCallbackEvent")
    this.answerTimeoutEvent.bind(() => this.onAnswerTimeout())
    this.answerTimeoutEvent.enabled = false

    // Scripted-demo per-card timer (first SCRIPTED_TOTAL cards, mic off).
    this.scriptedResolveEvent = this.createEvent("DelayedCallbackEvent")
    this.scriptedResolveEvent.bind(() => this.onScriptedResolve())
    this.scriptedResolveEvent.enabled = false

    this.createEvent("OnStartEvent").bind(() => this.initialize())
  }

  private initialize(): void {
    const deck = JSON.parse(DECK_JSON)
    this.queue = []
    deck.cards.forEach((c: any) => {
      this.cardsById[c.id] = {id: c.id, front: c.front, back: c.back}
      this.queue.push(c.id)
    })
    if (this.queue.length === 0) {
      this.setText("No cards in deck.")
      return
    }
    this.currentCardId = this.queue[0]
    this.log(`Session start: ${this.queue.length} cards`)
    this.speakFront()
  }

  /**
   * Declare the current card's front. For the first SCRIPTED_TOTAL cards the mic
   * stays off and resolution happens on a 5s timer (scripted on-camera demo);
   * afterwards, front playback resumes the normal listen/answer-detection cycle.
   */
  private speakFront(): void {
    this.presentedCount += 1
    this.backSpoken = false
    const front = this.currentCard().front
    if (this.presentedCount <= TriviaController.SCRIPTED_TOTAL) {
      this.log(`Scripted card ${this.presentedCount}: front declared, auto-resolve in ${TriviaController.SCRIPTED_RESOLVE_MS}ms`)
      this.speak(front, () => this.scheduleScriptedResolve())
    } else {
      this.speak(front) // normal path: onSpeakDone -> listen
    }
  }

  private currentCard(): Card {
    return this.cardsById[this.currentCardId]
  }

  // ---------- Listening ----------

  private listen(): void {
    if (this.sessionEnded || this.isSpeaking) return
    const generation = this.listenGeneration
    // (Re)start the per-card response window as listening actually begins.
    this.armAnswerTimeout()
    this.log("ASR: start listening")
    this.startTranscribing(() => {
      // Partial speech detected — the user is answering; extend the window so a
      // slow-to-finalize answer isn't cut off by the timeout.
      if (generation !== this.listenGeneration) return
      this.armAnswerTimeout()
    })
      .then((text) => {
        // Stale if the answer timeout already moved us off this card.
        if (generation !== this.listenGeneration) return
        this.handleTranscript(text)
      })
      .catch((reason) => {
        if (generation !== this.listenGeneration) return
        this.log(`ASR: no result (${reason})`)
        this.scheduleListen(0.3)
      })
  }

  private scheduleListen(delaySeconds: number): void {
    if (this.sessionEnded || this.isSpeaking) return
    this.restartEvent.reset(delaySeconds)
  }

  private handleTranscript(text: string): void {
    // runCommand returns true if it triggered speech (speak() owns listen resume).
    const startedSpeaking = this.runCommand(text)
    if (!startedSpeaking) this.scheduleListen(0.3)
  }

  /**
   * Interpret a spoken utterance: commands first, then automatic answer-detection.
   * Returns true iff it started speech (which owns resuming the mic).
   */
  private runCommand(text: string): boolean {
    const heard = this.normalize(text)

    // "end" first — it may interrupt at any (listening) moment.
    if (this.matches(heard, TriviaController.END)) {
      this.log("Command: end")
      this.disarmAnswerTimeout()
      this.endSession()
      return true
    }
    if (this.matches(heard, TriviaController.FLIP)) {
      if (this.backSpoken) {
        this.log('Ignored "flip" (answer already given)')
        return false
      }
      this.log("Command: flip")
      this.disarmAnswerTimeout()
      this.backSpoken = true
      this.speak(this.currentCard().back)
      return true
    }
    if (this.matches(heard, TriviaController.AGAIN)) {
      this.log("Command: again")
      this.disarmAnswerTimeout()
      this.queue.push(this.currentCardId) // re-queue at the end
      this.reviewedCount += 1
      return this.advanceCard()
    }

    // Automatic answer-detection (replaces an explicit "got it"): if the spoken
    // phrase contains the card's answer, it's correct — advance. Counts as
    // "known" only if answered before revealing the back via "flip".
    const answer = this.normalize(this.currentCard().back)
    if (answer.length > 0 && heard.indexOf(answer) !== -1) {
      this.log(`Correct answer heard: "${text}"`)
      this.disarmAnswerTimeout()
      this.reviewedCount += 1
      if (!this.backSpoken) this.knownCount += 1
      this.playSfx(this.correctSfx, () => this.advanceCard())
      return true
    }

    this.log(`No match, staying on card: "${text}"`)
    return false
  }

  /** Move to the next card, or end if the deck is exhausted. Always starts speech. */
  private advanceCard(): boolean {
    this.queue.shift() // remove current from the front
    if (this.queue.length === 0) {
      this.endSession()
      return true
    }
    this.currentCardId = this.queue[0]
    this.speakFront()
    return true
  }

  // ---------- Scripted on-camera resolution (first SCRIPTED_TOTAL cards) ----------

  private scheduleScriptedResolve(): void {
    if (this.sessionEnded) return
    // Mic stays off through the scripted run; resolve purely on the timer.
    this.scriptedResolveEvent.enabled = true
    this.scriptedResolveEvent.reset(TriviaController.SCRIPTED_RESOLVE_MS / 1000)
  }

  private onScriptedResolve(): void {
    this.scriptedResolveEvent.enabled = false
    if (this.sessionEnded) return

    if (this.presentedCount === TriviaController.SCRIPTED_WRONG_AT) {
      // Auto-mark WRONG. Do NOT re-queue — the deck order must not change.
      this.log(`Scripted card ${this.presentedCount}: auto-marked wrong`)
      this.reviewedCount += 1
      const answer = this.currentCard().back
      this.playSfx(this.buzzSfx, () => {
        this.speak(`The answer was ${answer}.`, () => this.advanceCard())
      })
    } else {
      // Auto-mark CORRECT (back never revealed, so it counts as known).
      this.log(`Scripted card ${this.presentedCount}: auto-marked correct`)
      this.reviewedCount += 1
      this.knownCount += 1
      this.playSfx(this.correctSfx, () => this.advanceCard())
    }
  }

  private endSession(): void {
    this.sessionEnded = true
    // Spec Section 6 wording (avoids command trigger words).
    const summary = `Session complete. You reviewed ${this.reviewedCount} cards and got ${this.knownCount} right.`
    this.speak(summary)
  }

  // ---------- Answer timeout ----------

  private armAnswerTimeout(): void {
    this.answerTimeoutEvent.enabled = true
    this.answerTimeoutEvent.reset(this.answerTimeoutMs / 1000)
  }

  private disarmAnswerTimeout(): void {
    this.answerTimeoutEvent.enabled = false
  }

  /**
   * No correct answer heard in time: buzz, then speak the correct answer aloud
   * (so the user still learns it), THEN re-queue the card and move on. The
   * mic stays muted (isSpeaking) and the per-card answer timer stays disarmed
   * for the whole buzz+reveal sequence — it only resumes once advanceCard()
   * starts listening for the next card.
   */
  private onAnswerTimeout(): void {
    if (this.sessionEnded) return
    this.log("Answer timeout, no correct answer heard")
    this.listenGeneration++ // invalidate any pending transcription for this card
    try {
      this.asrModule.stopTranscribing()
    } catch (e) {
      // nothing was transcribing
    }
    this.queue.push(this.currentCardId) // re-queue at the end, like "again"
    this.reviewedCount += 1
    const answer = this.currentCard().back
    this.playSfx(this.buzzSfx, () => {
      // Spec: avoid command trigger words ("correct", etc.) in app-generated speech.
      this.speak(`The answer was ${answer}.`, () => this.advanceCard())
    })
  }

  // ---------- Speaking (on-device TTS) with mic-mute guard ----------

  /**
   * Synthesize + play `text`. By default, completion resumes the normal
   * listen/answer-timeout cycle (onSpeakDone). Pass onComplete to instead
   * chain into a specific next step (e.g. the missed-answer reveal chaining
   * into advanceCard()) — the mic stays muted for the whole chain since
   * isSpeaking only clears once the chain's final step re-arms listening.
   */
  private speak(text: string, onComplete?: () => void): void {
    this.isSpeaking = true
    this.setText(text) // mirror on the demo panel
    this.log(`Speaking: "${text}"`)

    // Guarantee the mic is off while speaking (self-trigger guard).
    try {
      this.asrModule.stopTranscribing()
    } catch (e) {
      // nothing was transcribing
    }

    const options = TextToSpeech.Options.create()
    if (this.voiceName) {
      options.voiceName = this.voiceName
    }

    this.tts.synthesize(
      text,
      options,
      (audioTrackAsset: AudioTrackAsset) => {
        if (!this.audioComponent) {
          this.log("No AudioComponent wired — cannot play TTS audio")
          this.finishSpeaking(onComplete)
          return
        }
        this.log("TTS synthesized OK; starting audio playback")
        this.audioComponent.audioTrack = audioTrackAsset
        this.audioComponent.setOnFinish(() => {
          this.log("TTS audio playback finished")
          this.finishSpeaking(onComplete)
        })
        this.audioComponent.play(1)
      },
      (error: number, description: string) => {
        print(`TriviaController: TTS error ${error}: ${description}`)
        this.finishSpeaking(onComplete) // never get stuck muted
      }
    )
  }

  private finishSpeaking(onComplete?: () => void): void {
    this.isSpeaking = false
    if (onComplete) {
      onComplete()
      return
    }
    this.onSpeakDone()
  }

  /** Play a short SFX on the dedicated sfxComponent, then invoke onDone once it finishes. */
  private playSfx(track: AudioTrackAsset, onDone: () => void): void {
    if (!this.sfxComponent || !track) {
      onDone()
      return
    }
    this.sfxComponent.audioTrack = track
    this.sfxComponent.setOnFinish(() => onDone())
    this.sfxComponent.play(1)
  }

  private onSpeakDone(): void {
    // isSpeaking already cleared by finishSpeaking() before this runs.
    if (this.sessionEnded) {
      this.log("Session ended.")
      return
    }
    // Slightly longer settle before re-arming the mic — on-device the audio
    // subsystem needs a beat to hand off from playback to capture. The answer
    // window is (re)armed inside listen(), not here.
    this.log("Speak finished; scheduling listen")
    this.scheduleListen(0.5)
  }

  // ---------- Helpers ----------

  private matches(heard: string, synonyms: string[]): boolean {
    for (let i = 0; i < synonyms.length; i++) {
      if (heard.indexOf(synonyms[i]) !== -1) return true
    }
    return false
  }

  /** Lowercase, strip punctuation, collapse whitespace. */
  private normalize(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }

  private setText(value: string): void {
    if (this.questionText) {
      this.questionText.text = value
    }
  }

  private log(msg: string): void {
    if (this.enableDebugLogging) {
      print(`TriviaController: ${msg}`)
    }
  }

  /**
   * Single-shot transcription that resolves with the final recognized string.
   * onPartial fires on each non-final (in-progress) recognition update.
   */
  private startTranscribing(onPartial?: () => void): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      try {
        this.asrModule.stopTranscribing()
      } catch (e) {
        // nothing was transcribing
      }

      const options = AsrModule.AsrTranscriptionOptions.create()
      options.mode = AsrModule.AsrMode.HighAccuracy
      options.silenceUntilTerminationMs = this.silenceMs

      let settled = false
      let partialLogged = false
      options.onTranscriptionUpdateEvent.add((asrOutput) => {
        if (settled) return
        if (!asrOutput.isFinal) {
          if (!partialLogged) {
            this.log(`ASR partial: "${asrOutput.text}"`)
            partialLogged = true
          }
          if (onPartial) onPartial()
          return
        }
        settled = true
        const t = asrOutput.text.trim()
        this.log(`ASR final: "${t}"`)
        if (t.length > 0) {
          resolve(t)
        } else {
          reject("empty transcription")
        }
      })
      options.onTranscriptionErrorEvent.add((errorCode) => {
        if (settled) return
        settled = true
        this.log(`ASR error code: ${errorCode}`)
        reject(`asr error ${errorCode}`)
      })

      this.asrModule.startTranscribing(options)
    })
  }
}

/**
 * Bundled deck. MUST stay in sync with Assets/AgenticPlayground/Data/deck.json
 * (the editable source of record). Embedded here because this Lens Studio SDK
 * has no scripting API to read an imported JSON file at runtime.
 */
const DECK_JSON = `{
  "deck_id": "demo-deck-01",
  "deck_name": "SnapStudy Demo Deck",
  "cards": [
    { "id": "c01", "front": "What's the term for two notes that sound the same pitch but are named differently?", "back": "Enharmonic" },
    { "id": "c02", "front": "What's the relative minor of C Major?", "back": "A Minor" },
    { "id": "c03", "front": "What's the seventh mode of the major scale?", "back": "Locrian" },
    { "id": "c04", "front": "What's it called when a Five chord resolves to a Four chord instead of the One?", "back": "Deceptive cadence" },
    { "id": "c05", "front": "What's the term for playing or writing notes outside of the key's scale?", "back": "Chromaticism" },
    { "id": "c06", "front": "What do you call a chord that isn't diatonic to the key but still resolves normally?", "back": "Secondary dominant" },
    { "id": "c07", "front": "What do you call a chord voicing where notes aren't in their usual root-positioned order?", "back": "Inversion" },
    { "id": "c08", "front": "What's the rhythmic figure that emphasizes the off-beat?", "back": "Syncopation" },
    { "id": "c09", "front": "What do you call a chord with a minor third and diminished fifth?", "back": "Diminished chord" },
    { "id": "c10", "front": "What's the term for playing notes short and detached?", "back": "Staccato" },
    { "id": "c11", "front": "What's the term for chords that naturally belong to a given key?", "back": "Diatonic chords" },
    { "id": "c12", "front": "What's the first mode of the major scale?", "back": "Ionian" },
    { "id": "c13", "front": "What do you call a chord progression repeated as the basis for a whole song section", "back": "Vamp" },
    { "id": "c14", "front": "What's the term for a chord that contains a tritone and creates strong pull to resolve?", "back": "Dominant seventh" },
    { "id": "c15", "front": "What's the name of a chord made with just the One and the Five notes", "back": "Power chord" }
  ]
}`
