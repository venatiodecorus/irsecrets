import { useState, useEffect, useCallback, useRef } from "react";
import {
  getAllCharacters,
  getCharacterById,
  getCharacterState,
  updateTrust,
  updateIrritation,
  updateMood,
  isGameOver,
  canDM,
  type Character,
  type Mood,
} from "./characters";
import {
  buildSystemPrompt,
  buildGroupChatContext,
  buildAssessmentPrompt,
  buildAssessmentUserMessage,
  buildCombinedResponsePrompt,
  buildCombinedResponseUserMessage,
  type AssessmentResult,
  type CharacterAssessment,
} from "./characterPrompt";
import { ClaudeService, type ClaudeMessage } from "./claude";

// --- Types ---

export interface ChatMessage {
  id: number;
  handle: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export type ChannelType = "group" | "dm";

export interface Channel {
  id: string;
  type: ChannelType;
  name: string;
  characterId?: string;
  messages: ChatMessage[];
}

export interface ChatUser {
  id: string;
  handle: string;
}

// --- Constants ---

const GROUP_CHANNEL_ID = "hexxorz";
const GROUP_CHANNEL_NAME = "#hexxorz";

// Message interval: base range for group chat idle chatter
const MIN_INTERVAL_MS = 8000;
const MAX_INTERVAL_MS = 15000;

// Cooldown after a burst of activity (player message + responses)
const POST_BURST_COOLDOWN_MS = 15000;
const POST_BURST_COOLDOWN_VARIANCE_MS = 15000;

// Delay between multi-line messages from the same character
const MULTILINE_DELAY_MIN_MS = 1000;
const MULTILINE_DELAY_MAX_MS = 3000;

// Delay between different characters responding to a player message
const RESPONSE_STAGGER_MIN_MS = 3000;
const RESPONSE_STAGGER_MAX_MS = 6000;

// Max lines per response
const MAX_RESPONSE_LINES = 2;

// Max tokens for different call types
const IDLE_CHAT_MAX_TOKENS = 100;
const ASSESSMENT_MAX_TOKENS = 300;
const COMBINED_RESPONSE_MAX_TOKENS = 250;

// Consecutive speaker limit (idle chatter only)
const MAX_CONSECUTIVE_SPEAKS = 2;

// History window cap
const MAX_HISTORY_MESSAGES = 50;

// --- Claude clients ---

const idleClaude = new ClaudeService({ maxTokens: IDLE_CHAT_MAX_TOKENS });
const assessmentClaude = new ClaudeService({ maxTokens: ASSESSMENT_MAX_TOKENS });
const responseClaude = new ClaudeService({ maxTokens: COMBINED_RESPONSE_MAX_TOKENS });

// --- Module-level state ---

const channelHistory = new Map<string, ClaudeMessage[]>();

// Track consecutive speakers for group chat idle chatter
let lastGroupSpeaker: string | null = null;
let consecutiveSpeakCount = 0;

// Track when the last burst of activity happened
let lastBurstTimestamp = 0;

// Flag to suppress idle interval while handling player-triggered responses
let isHandlingPlayerMessage = false;

// --- History helpers ---

function getHistory(channelId: string): ClaudeMessage[] {
  if (!channelHistory.has(channelId)) {
    channelHistory.set(channelId, []);
  }
  return channelHistory.get(channelId)!;
}

function appendToHistory(
  channelId: string,
  role: "user" | "assistant",
  content: string,
): void {
  const history = getHistory(channelId);
  // Claude requires alternating user/assistant messages.
  // We consolidate consecutive same-role messages.
  const last = history[history.length - 1];
  if (last && last.role === role) {
    last.content += "\n" + content;
  } else {
    history.push({ role, content });
  }

  // Trim history to cap
  trimHistory(channelId);
}

function trimHistory(channelId: string): void {
  const history = getHistory(channelId);
  if (history.length > MAX_HISTORY_MESSAGES) {
    const excess = history.length - MAX_HISTORY_MESSAGES;
    history.splice(0, excess);
  }
}

function getHistoryAsText(channelId: string): string {
  const history = getHistory(channelId);
  return history.map((m) => m.content).join("\n");
}

// --- Character selection (idle chatter only) ---

function pickCharacterToSpeak(characters: Character[]): Character | null {
  // Weight by chattiness — higher chattiness = more likely to be picked
  const weights = characters.map((c) => c.chattiness);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;

  let picked: Character = characters[characters.length - 1];
  for (let i = 0; i < characters.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      picked = characters[i];
      break;
    }
  }

  // Enforce consecutive speaker limit
  if (picked.handle === lastGroupSpeaker) {
    if (consecutiveSpeakCount >= MAX_CONSECUTIVE_SPEAKS) {
      return null;
    }
    consecutiveSpeakCount++;
  } else {
    lastGroupSpeaker = picked.handle;
    consecutiveSpeakCount = 1;
  }

  return picked;
}

function getNextInterval(): number {
  const now = Date.now();
  const timeSinceBurst = now - lastBurstTimestamp;

  // If there was recent burst activity, use a longer cooldown
  if (lastBurstTimestamp > 0 && timeSinceBurst < POST_BURST_COOLDOWN_MS) {
    const remaining = POST_BURST_COOLDOWN_MS - timeSinceBurst;
    return remaining + Math.random() * POST_BURST_COOLDOWN_VARIANCE_MS;
  }

  return MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
}

// --- Split multi-line responses ---

function splitResponse(text: string): string[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Cap at MAX_RESPONSE_LINES
  return lines.slice(0, MAX_RESPONSE_LINES);
}

// --- Generate a message from a character (idle chatter only) ---

async function generateCharacterMessage(
  character: Character,
  channelId: string,
): Promise<string[]> {
  const state = getCharacterState(character.id);
  if (!state) return [];

  const systemPrompt = buildSystemPrompt(character, state, "group");
  idleClaude.setSystemPrompt(systemPrompt);

  const history = getHistory(channelId);

  const contextMessage = buildGroupChatContext(character.handle);

  const messages: ClaudeMessage[] =
    history.length > 0
      ? [
          {
            role: "user" as const,
            content:
              contextMessage +
              "\n\n" +
              history.map((m) => m.content).join("\n"),
          },
        ]
      : [
          {
            role: "user" as const,
            content:
              contextMessage +
              "\n\nThe chat has been quiet. Start a conversation based on your interests or personality.",
          },
        ];

  try {
    const response = await idleClaude.sendMessage(messages);
    return splitResponse(response);
  } catch (err) {
    console.error(`Failed to generate message for ${character.handle}:`, err);
    return [];
  }
}

// --- Assessment ---

function parseAssessmentResponse(
  responseText: string,
  characters: Character[],
): AssessmentResult | null {
  try {
    // Strip markdown code fences if present
    let cleaned = responseText.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(cleaned) as AssessmentResult;

    // Validate structure — ensure all character handles are present
    const result: AssessmentResult = {};
    for (const character of characters) {
      const entry = parsed[character.handle];
      if (entry && typeof entry === "object") {
        result[character.handle] = {
          shouldRespond: Boolean(entry.shouldRespond),
          trustDelta: clampNumber(entry.trustDelta, -1, 1),
          irritationDelta: clampNumber(entry.irritationDelta, -1, 3),
          moodOverride: isValidMood(entry.moodOverride) ? entry.moodOverride : null,
        };
      } else {
        // Default: no response, no state change
        result[character.handle] = {
          shouldRespond: false,
          trustDelta: 0,
          irritationDelta: 0,
          moodOverride: null,
        };
      }
    }

    return result;
  } catch (err) {
    console.error("Failed to parse assessment response:", err);
    return null;
  }
}

function clampNumber(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || isNaN(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

const VALID_MOODS: Mood[] = ["neutral", "annoyed", "suspicious", "friendly", "hostile"];

function isValidMood(value: unknown): value is Mood {
  return typeof value === "string" && VALID_MOODS.includes(value as Mood);
}

async function assessPlayerMessage(
  playerMessage: string,
  channelId: string,
  playerHandle: string,
  context: "group" | "dm",
  targetCharacters: Character[],
): Promise<{ responders: Character[]; gameOverHandle?: string }> {
  const historyText = getHistoryAsText(channelId);

  const systemPrompt = buildAssessmentPrompt(targetCharacters, context);
  assessmentClaude.setSystemPrompt(systemPrompt);

  const userMessage = buildAssessmentUserMessage(
    historyText,
    playerMessage,
    playerHandle,
  );

  let assessment: AssessmentResult | null = null;

  try {
    const responseText = await assessmentClaude.sendMessage([
      { role: "user", content: userMessage },
    ]);
    assessment = parseAssessmentResponse(responseText, targetCharacters);
  } catch (err) {
    console.error("Assessment call failed:", err);
  }

  // Apply state updates
  const responders: Character[] = [];

  if (assessment) {
    for (const character of targetCharacters) {
      const entry = assessment[character.handle];
      if (!entry) continue;

      applyAssessment(character, entry);

      // Check game over after each state update
      const gameOverInfo = isGameOver();
      if (gameOverInfo.gameOver) {
        return { responders: [], gameOverHandle: gameOverInfo.kickedBy };
      }

      if (entry.shouldRespond) {
        responders.push(character);
      }
    }
  } else {
    // Fallback: if assessment failed, use simple heuristic
    // At least one character responds in group, always respond in DM
    if (context === "dm") {
      responders.push(...targetCharacters);
    } else {
      // Pick the most chatty character as a fallback
      const sorted = [...targetCharacters].sort(
        (a, b) => b.chattiness - a.chattiness,
      );
      if (sorted.length > 0) {
        responders.push(sorted[0]);
      }
    }
  }

  return { responders };
}

function applyAssessment(
  character: Character,
  entry: CharacterAssessment,
): void {
  if (entry.trustDelta !== 0) {
    updateTrust(character.id, entry.trustDelta);
  }
  if (entry.irritationDelta !== 0) {
    updateIrritation(character.id, entry.irritationDelta);
  }
  if (entry.moodOverride !== null) {
    updateMood(character.id, entry.moodOverride);
  }
}

// --- Combined response generation ---

function parseCombinedResponse(
  responseText: string,
  characters: Character[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  try {
    // Strip markdown code fences if present
    let cleaned = responseText.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(cleaned) as Record<string, string>;

    for (const character of characters) {
      const text = parsed[character.handle];
      if (typeof text === "string" && text.trim().length > 0) {
        result.set(character.handle, splitResponse(text));
      }
    }
  } catch (err) {
    console.error("Failed to parse combined response:", err);
  }

  return result;
}

async function generateCombinedResponse(
  characters: Character[],
  channelId: string,
  playerHandle: string,
  context: "group" | "dm",
): Promise<Map<string, string[]>> {
  if (characters.length === 0) return new Map();

  const historyText = getHistoryAsText(channelId);

  const systemPrompt = buildCombinedResponsePrompt(characters, context);
  responseClaude.setSystemPrompt(systemPrompt);

  const userMessage = buildCombinedResponseUserMessage(
    historyText,
    playerHandle,
    context,
  );

  try {
    const responseText = await responseClaude.sendMessage([
      { role: "user", content: userMessage },
    ]);
    return parseCombinedResponse(responseText, characters);
  } catch (err) {
    console.error("Combined response generation failed:", err);
    return new Map();
  }
}

// --- Format a message for history context ---

function formatForHistory(handle: string, text: string): string {
  return `<${handle}> ${text}`;
}

// --- Delay helpers ---

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function multilineDelay(): number {
  return (
    MULTILINE_DELAY_MIN_MS +
    Math.random() * (MULTILINE_DELAY_MAX_MS - MULTILINE_DELAY_MIN_MS)
  );
}

function responseStaggerDelay(): number {
  return (
    RESPONSE_STAGGER_MIN_MS +
    Math.random() * (RESPONSE_STAGGER_MAX_MS - RESPONSE_STAGGER_MIN_MS)
  );
}

// --- Timestamp formatting ---

export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// --- The hook ---

let nextMessageId = 1;

export function useChatService(playerHandle: string) {
  const [channels, setChannels] = useState<Channel[]>([
    {
      id: GROUP_CHANNEL_ID,
      type: "group",
      name: GROUP_CHANNEL_NAME,
      messages: [],
    },
  ]);
  const [activeChannelId, setActiveChannelId] = useState(GROUP_CHANNEL_ID);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState("");

  // Refs so callbacks always see latest state
  const channelsRef = useRef(channels);
  channelsRef.current = channels;
  const playerHandleRef = useRef(playerHandle);
  playerHandleRef.current = playerHandle;
  const isGeneratingRef = useRef(isGenerating);
  isGeneratingRef.current = isGenerating;
  const gameOverRef = useRef(gameOver);
  gameOverRef.current = gameOver;

  // Initialize users from characters
  useEffect(() => {
    const characters = getAllCharacters();
    const chatUsers = characters.map((char) => ({
      id: char.id,
      handle: char.handle,
    }));
    setUsers(chatUsers);
  }, []);

  // Add a single message to a channel
  const addMessageToChannel = useCallback(
    (channelId: string, handle: string, text: string, isSystem = false) => {
      const msg: ChatMessage = {
        id: nextMessageId++,
        handle,
        text,
        timestamp: Date.now(),
        isSystem,
      };

      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === channelId
            ? { ...ch, messages: [...ch.messages, msg] }
            : ch,
        ),
      );

      if (!isSystem) {
        const characters = getAllCharacters();
        const isCharacter = characters.some((c) => c.handle === handle);
        appendToHistory(
          channelId,
          isCharacter ? "assistant" : "user",
          formatForHistory(handle, text),
        );
      }

      return msg;
    },
    [],
  );

  // Add multiple messages with typing delay between them
  const addMultiLineMessages = useCallback(
    async (channelId: string, handle: string, lines: string[]) => {
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
          await delay(multilineDelay());
        }
        addMessageToChannel(channelId, handle, lines[i]);
      }
    },
    [addMessageToChannel],
  );

  // Handle game over state
  const triggerGameOver = useCallback(
    (kickedBy: string) => {
      setGameOver(true);
      const msg = `${kickedBy} has kicked you from ${GROUP_CHANNEL_NAME}. Game over.`;
      setGameOverMessage(msg);
      addMessageToChannel(
        GROUP_CHANNEL_ID,
        "system",
        `* ${kickedBy} sets mode: +b ${playerHandleRef.current}!*@* — You have been kicked from ${GROUP_CHANNEL_NAME}.`,
        true,
      );
    },
    [addMessageToChannel],
  );

  // Generate a group chat message from a random character (idle chatter)
  const generateGroupMessage = useCallback(async () => {
    // Skip if game over, handling a player message, or already generating
    if (gameOverRef.current || isGeneratingRef.current || isHandlingPlayerMessage) return;

    const characters = getAllCharacters();
    const speaker = pickCharacterToSpeak(characters);

    // If null, the consecutive speaker limit was hit — skip this interval
    if (!speaker) return;

    setIsGenerating(true);
    try {
      const lines = await generateCharacterMessage(
        speaker,
        GROUP_CHANNEL_ID,
      );
      if (lines.length > 0) {
        await addMultiLineMessages(GROUP_CHANNEL_ID, speaker.handle, lines);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [addMultiLineMessages]);

  // Group chat interval
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      timeoutId = setTimeout(async () => {
        await generateGroupMessage();
        if (!cancelled) scheduleNext();
      }, getNextInterval());
    };

    scheduleNext();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [generateGroupMessage]);

  // Send a player message
  const sendMessage = useCallback(
    async (text: string) => {
      if (gameOverRef.current) return;

      const handle = playerHandleRef.current;
      const channelId = channelsRef.current.find(
        (ch) => ch.id === activeChannelId,
      )
        ? activeChannelId
        : GROUP_CHANNEL_ID;

      addMessageToChannel(channelId, handle, text);

      const channel = channelsRef.current.find((ch) => ch.id === channelId);
      if (!channel) return;

      if (channel.type === "group") {
        // Suppress idle interval while we handle responses
        isHandlingPlayerMessage = true;
        setIsGenerating(true);

        try {
          // Step 1: Assess the player's message against all characters
          const characters = getAllCharacters();
          const { responders, gameOverHandle } = await assessPlayerMessage(
            text,
            GROUP_CHANNEL_ID,
            handle,
            "group",
            characters,
          );

          // Check for game over
          if (gameOverHandle) {
            triggerGameOver(gameOverHandle);
            return;
          }

          if (responders.length === 0) {
            return;
          }

          // Step 2: Generate combined responses
          await delay(responseStaggerDelay());

          const responses = await generateCombinedResponse(
            responders,
            GROUP_CHANNEL_ID,
            handle,
            "group",
          );

          // Step 3: Add messages to chat with stagger delays
          let isFirst = true;
          for (const responder of responders) {
            const lines = responses.get(responder.handle);
            if (!lines || lines.length === 0) continue;

            if (!isFirst) {
              await delay(responseStaggerDelay());
            }
            isFirst = false;

            await addMultiLineMessages(
              GROUP_CHANNEL_ID,
              responder.handle,
              lines,
            );

            // Update consecutive speaker tracking
            lastGroupSpeaker = responder.handle;
            consecutiveSpeakCount = 1;
          }
        } finally {
          setIsGenerating(false);
          // Mark burst activity and re-enable idle interval
          lastBurstTimestamp = Date.now();
          isHandlingPlayerMessage = false;
        }
      } else if (channel.type === "dm" && channel.characterId) {
        const character = getCharacterById(channel.characterId);
        if (!character) return;

        setIsGenerating(true);

        try {
          // Step 1: Assess the player's message for the DM character
          const { responders, gameOverHandle } = await assessPlayerMessage(
            text,
            channelId,
            handle,
            "dm",
            [character],
          );

          // Check for game over
          if (gameOverHandle) {
            triggerGameOver(gameOverHandle);
            return;
          }

          if (responders.length === 0) return;

          // Step 2: Generate response
          await delay(1500 + Math.random() * 2000);

          const responses = await generateCombinedResponse(
            responders,
            channelId,
            handle,
            "dm",
          );

          // Step 3: Add messages
          const lines = responses.get(character.handle);
          if (lines && lines.length > 0) {
            await addMultiLineMessages(channelId, character.handle, lines);
          }
        } finally {
          setIsGenerating(false);
        }
      }
    },
    [activeChannelId, addMessageToChannel, addMultiLineMessages, triggerGameOver],
  );

  // Start a DM with a character
  const startDM = useCallback(
    (characterId: string): { success: boolean; reason?: string } => {
      const character = getCharacterById(characterId);
      if (!character) return { success: false, reason: "Character not found" };

      if (!canDM(characterId)) {
        return {
          success: false,
          reason: `${character.handle} doesn't want to talk privately with you yet.`,
        };
      }

      const existingChannel = channelsRef.current.find(
        (ch) => ch.type === "dm" && ch.characterId === characterId,
      );
      if (existingChannel) {
        setActiveChannelId(existingChannel.id);
        return { success: true };
      }

      const dmChannel: Channel = {
        id: `dm-${character.handle}`,
        type: "dm",
        name: character.handle,
        characterId,
        messages: [],
      };

      setChannels((prev) => [...prev, dmChannel]);
      setActiveChannelId(dmChannel.id);
      return { success: true };
    },
    [],
  );

  const activeChannel =
    channels.find((ch) => ch.id === activeChannelId) ?? channels[0];

  return {
    channels,
    activeChannel,
    activeChannelId,
    setActiveChannel: setActiveChannelId,
    users,
    sendMessage,
    startDM,
    isGenerating,
    gameOver,
    gameOverMessage,
  };
}
