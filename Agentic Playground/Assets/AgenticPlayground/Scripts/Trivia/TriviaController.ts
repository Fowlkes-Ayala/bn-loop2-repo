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
  @hint("TTS voice name (built-in). Supported: Sasha")
  private voiceName: string = "Sasha"

  @input
  @hint("Silence (ms) before a spoken command is finalized")
  private silenceMs: number = 1500

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

  // Command synonym sets (spec Section 4), matched against normalized speech.
  private static FLIP = ["flip", "show answer", "reveal"]
  private static GOT_IT = ["got it", "correct", "know it"]
  private static AGAIN = ["again", "review", "not yet"]
  private static END = ["end", "im done", "i am done", "done", "stop"]

  onAwake(): void {
    // Reusable delayed callback used to re-arm the mic between utterances.
    this.restartEvent = this.createEvent("DelayedCallbackEvent")
    this.restartEvent.bind(() => this.listen())
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
    this.backSpoken = false
    this.log(`Session start: ${this.queue.length} cards`)
    this.speak(this.currentCard().front)
  }

  private currentCard(): Card {
    return this.cardsById[this.currentCardId]
  }

  // ---------- Listening ----------

  private listen(): void {
    if (this.sessionEnded || this.isSpeaking) return
    this.startTranscribing()
      .then((text) => this.handleTranscript(text))
      .catch(() => this.scheduleListen(0.3))
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

  /** Interpret a spoken utterance as a command. Returns true iff it started speech. */
  private runCommand(text: string): boolean {
    const heard = this.normalize(text)

    // "end" first — it is allowed to interrupt at any (listening) moment.
    if (this.matches(heard, TriviaController.END)) {
      this.log("Command: end")
      this.endSession()
      return true
    }
    if (this.matches(heard, TriviaController.FLIP)) {
      if (this.backSpoken) {
        this.log('Ignored "flip" (answer already given)')
        return false
      }
      this.log("Command: flip")
      this.backSpoken = true
      this.speak(this.currentCard().back)
      return true
    }
    if (this.matches(heard, TriviaController.GOT_IT)) {
      if (!this.backSpoken) {
        this.log('Ignored "got it" (answer not given yet)')
        return false
      }
      this.log("Command: got it")
      this.knownCount += 1
      this.reviewedCount += 1
      return this.advanceCard()
    }
    if (this.matches(heard, TriviaController.AGAIN)) {
      if (!this.backSpoken) {
        this.log('Ignored "again" (answer not given yet)')
        return false
      }
      this.log("Command: again")
      this.queue.push(this.currentCardId) // re-queue at the end
      this.reviewedCount += 1
      return this.advanceCard()
    }

    this.log(`Unrecognized: "${text}"`)
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
    this.backSpoken = false
    this.speak(this.currentCard().front)
    return true
  }

  private endSession(): void {
    this.sessionEnded = true
    // Spec Section 6 wording (avoids command trigger words).
    const summary = `Session complete. You reviewed ${this.reviewedCount} cards and got ${this.knownCount} right.`
    this.speak(summary)
  }

  // ---------- Speaking (on-device TTS) with mic-mute guard ----------

  private speak(text: string): void {
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
          this.onSpeakDone()
          return
        }
        this.audioComponent.audioTrack = audioTrackAsset
        this.audioComponent.setOnFinish(() => this.onSpeakDone())
        this.audioComponent.play(1)
      },
      (error: number, description: string) => {
        print(`TriviaController: TTS error ${error}: ${description}`)
        this.onSpeakDone() // never get stuck muted
      }
    )
  }

  private onSpeakDone(): void {
    this.isSpeaking = false
    if (this.sessionEnded) {
      this.log("Session ended.")
      return
    }
    this.scheduleListen(0.2)
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

  /** Single-shot transcription that resolves with the final recognized string. */
  private startTranscribing(): Promise<string> {
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
      options.onTranscriptionUpdateEvent.add((asrOutput) => {
        if (!asrOutput.isFinal || settled) return
        settled = true
        const t = asrOutput.text.trim()
        if (t.length > 0) {
          resolve(t)
        } else {
          reject("empty transcription")
        }
      })
      options.onTranscriptionErrorEvent.add((errorCode) => {
        if (settled) return
        settled = true
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
    { "id": "c01", "front": "What is the capital of Japan?", "back": "Tokyo" },
    { "id": "c02", "front": "How many legs does a spider have?", "back": "Eight" },
    { "id": "c03", "front": "What planet is known as the Red Planet?", "back": "Mars" },
    { "id": "c04", "front": "What is the chemical symbol for gold?", "back": "Au" },
    { "id": "c05", "front": "How many continents are there on Earth?", "back": "Seven" },
    { "id": "c06", "front": "What is the largest ocean on Earth?", "back": "The Pacific Ocean" },
    { "id": "c07", "front": "In what year did the Titanic sink?", "back": "Nineteen twelve" },
    { "id": "c08", "front": "What is the freezing point of water in Celsius?", "back": "Zero degrees" },
    { "id": "c09", "front": "Who wrote the play Romeo and Juliet?", "back": "William Shakespeare" },
    { "id": "c10", "front": "What is the tallest mountain in the world?", "back": "Mount Everest" },
    { "id": "c11", "front": "How many sides does a hexagon have?", "back": "Six" },
    { "id": "c12", "front": "What gas do plants absorb from the air for photosynthesis?", "back": "Carbon dioxide" },
    { "id": "c13", "front": "What is the smallest prime number?", "back": "Two" },
    { "id": "c14", "front": "What currency is used in the United Kingdom?", "back": "The pound" },
    { "id": "c15", "front": "How many bones are in the adult human body?", "back": "Two hundred six" }
  ]
}`
