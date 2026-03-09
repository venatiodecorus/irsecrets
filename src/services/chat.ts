import { useState, useEffect, useCallback, useRef } from "react";
import {
  getAllCharacters,
  getCharacterById,
  getCharacterState,
  canDM,
  type Character,
} from "./characters";
import {
  buildSystemPrompt,
  buildGroupChatContext,
  buildDMContext,
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

// Max tokens — keep very low for short IRC-style messages
const CHAT_MAX_TOKENS = 100;

// Consecutive speaker limit
const MAX_CONSECUTIVE_SPEAKS = 2;

// --- Claude client ---

const claude = new ClaudeService({ maxTokens: CHAT_MAX_TOKENS });

// --- Module-level state ---

const channelHistory = new Map<string, ClaudeMessage[]>();

// Track consecutive speakers for group chat
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
}

// --- Character selection ---

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

function pickRespondingCharacters(
  characters: Character[],
  speakerHandle: string,
  messageText: string,
): Character[] {
  const candidates = characters.filter((c) => c.handle !== speakerHandle);

  const scored = candidates.map((c) => {
    let score = c.chattiness + c.openness;
    // Boost if mentioned by handle
    if (messageText.toLowerCase().includes(c.handle.toLowerCase())) {
      score += 20;
    }
    // Add some randomness
    score += Math.random() * 5;
    return { character: c, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Pick 0-2 responders probabilistically
  // Chance of nobody responding at all
  const responders: Character[] = [];
  for (const { character, score } of scored) {
    const chance = Math.min(0.6, score / 30);
    if (Math.random() < chance) {
      responders.push(character);
      if (responders.length >= 2) break;
    }
  }

  return responders;
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

// --- Generate a message from a character ---

async function generateCharacterMessage(
  character: Character,
  channelId: string,
  context: "group" | "dm",
  playerHandle: string,
): Promise<string[]> {
  const state = getCharacterState(character.id);
  if (!state) return [];

  const systemPrompt = buildSystemPrompt(character, state, context);
  claude.setSystemPrompt(systemPrompt);

  const history = getHistory(channelId);

  const contextMessage =
    context === "group"
      ? buildGroupChatContext(character.handle)
      : buildDMContext(character.handle, playerHandle);

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
    const response = await claude.sendMessage(messages);
    return splitResponse(response);
  } catch (err) {
    console.error(`Failed to generate message for ${character.handle}:`, err);
    return [];
  }
}

// --- Format a message for history context ---

function formatForHistory(handle: string, text: string): string {
  return `<${handle}> ${text}`;
}

// --- Delay helper ---

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

  // Refs so callbacks always see latest state
  const channelsRef = useRef(channels);
  channelsRef.current = channels;
  const playerHandleRef = useRef(playerHandle);
  playerHandleRef.current = playerHandle;
  const isGeneratingRef = useRef(isGenerating);
  isGeneratingRef.current = isGenerating;

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

  // Generate a group chat message from a random character
  const generateGroupMessage = useCallback(async () => {
    // Skip if we're currently handling a player message or already generating
    if (isGeneratingRef.current || isHandlingPlayerMessage) return;

    const characters = getAllCharacters();
    const speaker = pickCharacterToSpeak(characters);

    // If null, the consecutive speaker limit was hit — skip this interval
    if (!speaker) return;

    setIsGenerating(true);
    try {
      const lines = await generateCharacterMessage(
        speaker,
        GROUP_CHANNEL_ID,
        "group",
        playerHandleRef.current,
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

        const characters = getAllCharacters();
        const responders = pickRespondingCharacters(characters, handle, text);

        for (const responder of responders) {
          // Stagger between different responders
          await delay(responseStaggerDelay());

          setIsGenerating(true);
          try {
            const lines = await generateCharacterMessage(
              responder,
              GROUP_CHANNEL_ID,
              "group",
              handle,
            );
            if (lines.length > 0) {
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
          }
        }

        // Mark burst activity and re-enable idle interval
        lastBurstTimestamp = Date.now();
        isHandlingPlayerMessage = false;
      } else if (channel.type === "dm" && channel.characterId) {
        const character = getCharacterById(channel.characterId);
        if (!character) return;

        // Small delay before DM response too
        await delay(1500 + Math.random() * 2000);

        setIsGenerating(true);
        try {
          const lines = await generateCharacterMessage(
            character,
            channelId,
            "dm",
            handle,
          );
          if (lines.length > 0) {
            await addMultiLineMessages(channelId, character.handle, lines);
          }
        } finally {
          setIsGenerating(false);
        }
      }
    },
    [activeChannelId, addMessageToChannel, addMultiLineMessages],
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
  };
}
