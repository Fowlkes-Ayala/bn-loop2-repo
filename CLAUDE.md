# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Snap Lens Studio project (`Agentic Playground/`) targeting Spectacles hardware, built with Lens Studio **5.15.3** connected to Claude Code via its MCP server (Developer Mode). There is no traditional build/lint/test tooling — Lens Studio itself compiles and runs the project; verification happens through the MCP tools (`mcp__lens-studio__*`) against a live Lens Studio instance, not via CLI commands.

- Root config `.mcp.json` points at a local Lens Studio MCP server (`http://localhost:50049/mcp`) — Lens Studio must be running with Developer Mode/MCP enabled for these tools to work.
- `Agentic Playground/tsconfig.json` and `jsconfig.json` are present for editor/type-checking support only (`noEmit: true`); there is no separate `tsc`/build step to run.
- If a tool call to `mcp__lens-studio__*` fails or the MCP connection is unavailable, stop and flag it rather than guessing at scene state — don't proceed on unverified assumptions about what's in the scene.
- **The `mcp__lens-studio__*` MCP connection is local/interactive to the main session and is NOT inherited by subagents spawned via the Agent tool (including the `lens-studio-agent` type).** A subagent given a task that requires these tools will not get a clean permission error — observed behavior is that it fabricates plausible-looking tool call output (e.g. a `Read` result with content that was never actually read) and reports the task as done, with zero real tool invocations. Treat any subagent report of Lens Studio scene/asset work as unverified until independently checked.
  - **Workflow:** do all `mcp__lens-studio__*`-dependent work (scene graph inspection, component/asset creation, property wiring, compiling, log checks) directly from the main conversation thread, not via Agent/subagents. Subagents remain fine for MCP-independent work — reading/editing `.ts` files on disk, searching the codebase, drafting plans — but any step that needs to observe or mutate live Lens Studio state must be a direct tool call, with the real result checked before proceeding to the next step.

## Working with Lens Studio scripts

Scripts are Lens Studio TypeScript (`.ts` under `Assets/`), using Lens Studio's own component model (`@component` decorators, `BaseScriptComponent`, `SceneObject`, inspector-exposed `@input` fields) — not a generic Node/web TS environment. Use the `mcp__lens-studio__*` tools to inspect/modify the live scene graph, create scene objects/components/assets, and check compile logs, rather than only editing `.ts` files blind and assuming they wire up correctly.

## Build Spec
   This project follows @IdleStudy_SPEC.md — read it in full before starting or resuming any build phase. Do not deviate from its scope boundaries (Section 3) or invent features not listed there.

## Architecture: `Agentic Playground/Assets/AgenticPlayground/Scripts/`

This lens is starting from a Lens Studio template: an agentic AI mind-map / lecture-companion experience: a user talks to it, an AI agent routes the query to one of several tools, and results render into one of three visual layouts (Chat, Summary, or a 3D mind-map Diagram).

**Control flow:** `ASR/ChatASRController.ts` captures mic input via `AsrModule` → `Agents/AgentOrchestrator.ts` (`processUserQuery`) → `Agents/AgentToolExecutor.ts` (executes the single registered `intelligent_conversation` tool, 15s timeout, param-validated) → `Tools/ToolRouter.ts`, which asks the LLM to classify the query and dispatches to one of:
- `Tools/GeneralConversationTool.ts` — default Q&A
- `Tools/SummaryTool.ts` — answers from the stored lecture summary
- `Tools/SpatialTool.ts` — camera/video-based environment awareness via Gemini
- `Tools/DiagramCreatorTool.ts` / `Tools/DiagramUpdaterTool.ts` — builds/updates mind-map nodes from chat + summary content

`ToolRouter` falls back to `general_conversation` on any routing failure. Voice responses stream back through `Agents/AgentLanguageInterface.ts`'s `onTextUpdate`, accumulated using a 2s silence-timer in `AgentOrchestrator` to detect a completed utterance — voice mode initially returns a placeholder string (`"[Voice response - transcription pending]"`) before the real text arrives asynchronously; any change to response handling must account for this async/placeholder split between voice and `textOnly` paths.

**Storage → Bridge → Component pattern:** Tool output is written to `Storage/ChatStorage.ts`, `Storage/SummaryStorage.ts`, or `Storage/DiagramStorage.ts` (centrally managed/reset by `Storage/StorageManager.ts` — route new storage resets through it rather than duplicating reset logic). Each storage has a paired `*Bridge.ts` (`ChatBridge`, `DiagramBridge`, `SummaryBridge`, `ImageGenBridge`, `ModelGenBridge`) that observes storage changes and translates them into calls on the corresponding `*Component.ts`, which is the layer that actually manipulates scene objects (text, meshes, layouts). This keeps agent/tool/storage logic decoupled from scene wiring — new features should follow the same storage → bridge → component chain rather than having tools reach into scene objects directly.

**Nodes vs DiagramNode:** `Nodes/TextNode.ts`, `Nodes/ImageNode.ts`, `Nodes/ModelNode.ts` are per-node scene components (display + generation logic for one mind-map node), distinct from the `DiagramNode` plain data type defined in `Agents/AgentTypes.ts`.

**LLM backends:** Two providers, abstracted by `Agents/AgentLanguageInterface.ts` (picks/falls back between them, forces Gemini when image data is present):
- `Core/OpenAIAssistant.ts` — OpenAI Realtime API for voice, Chat Completions for text
- `Core/GeminiAssistant.ts` — Gemini Live API for voice/video, Gemini Models API for text

Both are inspector-wired `BaseScriptComponent`s on `AgentOrchestrator`. All network calls go through `Packages/RemoteServiceGateway.lspkg` (`HostedExternal/OpenAI`, `HostedExternal/Gemini`, plus `AudioProcessor`, `DynamicAudioOutput`, `MicrophoneRecorder`, `VideoController` helpers) — this is the only external-service surface in the project.

**Generation queue:** `Utils/GenerationQueue.ts` + `Core/GenerationQueueInitializer.ts` serialize image (`Core/ImageGen.ts`) and 3D model (`Core/ModelGen.ts`) generation, since the underlying generators only support one request at a time. New diagram/node generation work should go through the queue rather than calling generators directly.

**Response length:** Tool system prompts and `Utils/TextLimiter.ts` (`CHARACTER_LIMITS`) enforce a hard cap (~300 chars) on generated text — respect these limits when adding or editing tool prompts.

## Third-party packages

`Agentic Playground/Packages/` includes `SpectaclesInteractionKit.lspkg`, `SpectaclesUIKit.lspkg` (and beta variant under `Assets/`), `LSTween.lspkg`, and `RemoteServiceGateway.lspkg`. Treat these as vendored dependencies — prefer using their existing APIs over reimplementing interaction/UI/tweening/network logic.
