/**
 * TriviaController - SnapStudy Trivia MVP (stepping stone)
 *
 * Displays a trivia question on a head-locked Text panel, then listens (mic) for
 * the user's spoken answer via the on-device AsrModule. If the recognized speech
 * contains the card's answer (lenient, normalized contains-match), it advances to
 * the next question; otherwise it stays on the current question and keeps listening.
 *
 * This is a deliberate stepping stone toward the eventual voice-only / TTS build
 * described in IdleStudy_SPEC.md — no voice output, command words, or summary yet.
 *
 * Voice pattern mirrors Scripts/ASR/ChatASRController.ts (require("LensStudio:AsrModule")).
 */

interface Card {
  front: string
  back: string
}

@component
export class TriviaController extends BaseScriptComponent {
  @input
  @hint("Text component that displays the current question")
  private questionText: Text

  @input
  @hint("Silence (ms) before a spoken answer is finalized")
  private silenceMs: number = 2000

  @input
  @hint("Enable debug logging")
  private enableDebugLogging: boolean = true

  private asrModule: AsrModule = require("LensStudio:AsrModule")
  private cards: Card[] = []
  private index: number = 0
  private finished: boolean = false
  private restartEvent: DelayedCallbackEvent

  onAwake(): void {
    // Reusable delayed callback used to re-arm the mic between attempts/cards.
    // Prevents any tight restart loop if ASR errors/finalizes rapidly.
    this.restartEvent = this.createEvent("DelayedCallbackEvent")
    this.restartEvent.bind(() => this.listen())

    this.createEvent("OnStartEvent").bind(() => this.initialize())
  }

  private initialize(): void {
    this.cards = this.loadDeck()
    if (!this.cards || this.cards.length === 0) {
      this.setText("No cards found in the deck.")
      return
    }
    this.index = 0
    this.finished = false
    this.showCurrentCard()
    this.listen()
  }

  /**
   * Parse the bundled deck. NOTE: this Lens Studio SDK exposes no scripting API
   * for reading an imported .json/.txt file's contents (no JsonAsset/TextAsset
   * class, no getText()/.json accessor), so the deck is embedded in DECK_JSON
   * below. Keep DECK_JSON in sync with Assets/AgenticPlayground/Data/deck.json,
   * which remains the human-editable source of record.
   */
  private loadDeck(): Card[] {
    const parsed = JSON.parse(DECK_JSON)
    this.log(`Loaded ${parsed.cards.length} cards from bundled deck`)
    return parsed.cards.map((c: any) => ({front: c.front, back: c.back}))
  }

  private showCurrentCard(): void {
    if (this.index >= this.cards.length) {
      this.finished = true
      this.setText("You've reached the end of the deck. Nice work!")
      this.log("Deck complete")
      return
    }
    this.setText(this.cards[this.index].front)
    this.log(`Card ${this.index + 1}/${this.cards.length}: ${this.cards[this.index].front}`)
  }

  /**
   * Listen for one spoken answer, evaluate it, then re-arm for the next attempt.
   */
  private listen(): void {
    if (this.finished) return
    this.startTranscribing()
      .then((spoken) => this.evaluate(spoken))
      .catch((err) => this.log(`Listen error: ${err}`))
      .then(() => this.scheduleListen(0.3))
  }

  private scheduleListen(delaySeconds: number): void {
    if (this.finished) return
    this.restartEvent.reset(delaySeconds)
  }

  private evaluate(spoken: string): void {
    const card = this.cards[this.index]
    if (!card) return
    const heard = this.normalize(spoken)
    const answer = this.normalize(card.back)
    const correct = answer.length > 0 && heard.indexOf(answer) !== -1
    this.log(`Heard "${spoken}" -> ${correct ? "CORRECT" : "no match"} (answer: "${card.back}")`)
    if (correct) {
      this.index++
      this.showCurrentCard()
    }
    // If not correct, stay on the current card; scheduleListen() re-arms the mic.
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
   * Mirrors the AsrModule usage in ChatASRController.createASROptions().
   */
  private startTranscribing(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      try {
        this.asrModule.stopTranscribing()
      } catch (e) {
        // ignore — nothing was transcribing
      }

      const options = AsrModule.AsrTranscriptionOptions.create()
      options.mode = AsrModule.AsrMode.HighAccuracy
      options.silenceUntilTerminationMs = this.silenceMs

      let settled = false
      options.onTranscriptionUpdateEvent.add((asrOutput) => {
        if (!asrOutput.isFinal || settled) return
        settled = true
        const text = asrOutput.text.trim()
        if (text.length > 0) {
          resolve(text)
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
