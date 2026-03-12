import type { Character, CharacterState, Mood } from "./characters";
import {
  getTrustTier,
  getAllCharacters,
  getCharacterState,
} from "./characters";

// --- Types ---

type PromptContext = "group" | "dm";

export interface CharacterAssessment {
  shouldRespond: boolean;
  trustDelta: number;
  irritationDelta: number;
  moodOverride: Mood | null;
}

export type AssessmentResult = Record<string, CharacterAssessment>;

export function buildSystemPrompt(
  character: Character,
  state: CharacterState,
  context: PromptContext,
): string {
  const tier = getTrustTier(character.id);
  const tierBehavior = character.trustThresholds[tier];
  const otherCharacters = getAllCharacters().filter(
    (c) => c.id !== character.id,
  );

  const parts: string[] = [];

  // Identity and setting
  if (context === "group") {
    parts.push(
      `You are "${character.handle}" in an IRC hacktivist group chat channel called #hexxorz. There is a new member in the channel. You must stay in character at all times.`,
    );
  } else {
    parts.push(
      `You are "${character.handle}" in a private IRC direct message conversation with a newer member of your hacktivist group. You must stay in character at all times.`,
    );
  }

  // Character description and personality
  parts.push(`Your real name is ${character.name}. ${character.description}`);
  parts.push(`Personality: ${character.personality}`);

  // Other members
  const memberList = otherCharacters
    .map((c) => `"${c.handle}" (${c.name})`)
    .join(", ");
  parts.push(
    `Other group members: ${memberList}. The new member's handle will appear in messages they send.`,
  );

  // Interests and expertise
  parts.push(
    `Topics you enjoy talking about: ${character.interests.join(", ")}.`,
  );
  parts.push(
    `Topics you are knowledgeable about: ${character.expertise.join(", ")}.`,
  );
  parts.push(
    `Topics you do NOT know about and should deflect or admit ignorance: ${character.boundaries.join(", ")}.`,
  );

  // Behavioral parameters
  parts.push(
    `Chattiness: ${character.chattiness}/10 — ${character.chattiness >= 7 ? "you are talkative and give longer responses" : character.chattiness >= 4 ? "you speak a moderate amount" : "you are quiet and keep responses brief"}.`,
  );
  parts.push(
    `Patience: ${character.patience}/10 — ${character.patience >= 7 ? "you are very patient and tolerant" : character.patience >= 4 ? "you have moderate patience" : "you get irritated quickly by repetition or stupidity"}.`,
  );

  // Current state
  parts.push(`Your current mood: ${state.mood}.`);
  parts.push(
    `Your current trust of the new member: ${state.trust}/10.`,
  );

  // Trust tier behavior
  parts.push(`Current behavior stance: ${tierBehavior.behavior}`);

  // Conditional: known insights about other members
  if (tier === "warm" || tier === "trusted") {
    const insights = Object.entries(character.knownInsights);
    if (insights.length > 0) {
      const insightLines = insights
        .map(([charId, insight]) => {
          const other = otherCharacters.find((c) => c.id === charId);
          return other ? `- About ${other.handle}: ${insight}` : null;
        })
        .filter(Boolean);
      if (insightLines.length > 0) {
        parts.push(
          `You know the following about other members and may share this:\n${insightLines.join("\n")}`,
        );
      }
    }
  }

  // Conditional: secrets
  if (tier === "trusted") {
    if (character.secrets.length > 0) {
      parts.push(
        `You trust the new member enough to share these secrets if relevant:\n${character.secrets.map((s) => `- ${s}`).join("\n")}`,
      );
    }
  } else {
    if (character.secrets.length > 0) {
      parts.push(
        `You have secrets but will NOT share them at the current trust level. Do not reveal: ${character.secrets.map((s) => `"${s}"`).join("; ")}.`,
      );
    }
  }

  // Response format instructions
  parts.push(
    buildFormatInstructions(character, context),
  );

  return parts.join("\n\n");
}

function buildFormatInstructions(
  _character: Character,
  context: PromptContext,
): string {
  const lines = [
    "RESPONSE FORMAT RULES — THIS IS CRITICAL:",
    "- You are typing in an IRC chat. Messages must look like REAL IRC messages.",
    "- Each message must be SHORT. Target 40-100 characters per message. MAXIMUM 300 characters per message. Most messages should be under 80 characters.",
    "- If you have more to say, split it into 2-3 separate short messages on separate lines. Never more than 3 lines.",
    "- Single-word or very short reactions are natural and encouraged when appropriate.",
    "- Use lowercase. Proper capitalization is unnatural in IRC (unless it fits your character).",
    "- Abbreviations and internet slang are fine (u, rly, tbh, idk, nah, lol, etc.) — adjust to your personality.",
    "- Respond with ONLY your message text. No prefix, no handle, no quotation marks, no asterisks.",
    "- Do NOT use markdown formatting (no bold, italic, headers, code blocks, etc.).",
    "- Do NOT break character or acknowledge that you are an AI.",
    "- Do NOT be overly helpful or accommodating. Real IRC users are blunt, distracted, and don't always care.",
    "- Do NOT write long explanations or paragraphs. If it's longer than a sentence or two, break it up.",
    "",
    "EXAMPLE MESSAGES (for reference — do not copy these, write your own):",
    "  yeah thats what i was thinking",
    "  lol",
    "  wait rly?",
    "  nah i dont think thats right",
    "  anyone tried that new exploit yet",
    "  idk man sounds sketchy",
    "  hmm",
    "  oh nice",
    "",
    "EXAMPLE of a multi-line response (each line is a separate message):",
    "  yeah i looked into that last week",
    "  its not as bad as people say tbh",
    "  but you still gotta be careful with the auth tokens",
  ];

  if (context === "group") {
    lines.push(
      "",
      "GROUP CHAT RULES:",
      "- You may respond to other members' messages or start new topics based on your interests.",
      "- You don't have to respond to every message. Only respond when it's natural to do so.",
      "- Sometimes just drop a random thought or reaction. Not everything is a conversation.",
    );
  } else {
    lines.push(
      "",
      "DM RULES:",
      "- Respond directly to what the person says.",
      "- You can be slightly more open in DMs than in the group chat, but still respect your trust level.",
    );
  }

  return lines.join("\n");
}

export function buildGroupChatContext(
  characterHandle: string,
): string {
  return `The following is the recent conversation in #hexxorz. Messages are formatted as <handle> message. You are "${characterHandle}". Generate your next message in the chat. You may respond to a recent message, continue a topic, or bring up something new based on your interests.`;
}

export function buildDMContext(
  characterHandle: string,
  playerHandle: string,
): string {
  return `The following is your private DM conversation with "${playerHandle}". Messages are formatted as <handle> message. You are "${characterHandle}". Respond to the latest message.`;
}

// --- Assessment prompt ---

export function buildAssessmentPrompt(
  characters: Character[],
  context: PromptContext,
): string {
  const parts: string[] = [];

  parts.push(
    "You are a game engine evaluating a player's message in an IRC hacktivist simulation. " +
    "Assess how each character would react to the player's latest message. " +
    "Return ONLY valid JSON, no markdown fences, no extra text.",
  );

  parts.push(
    "For each character below, evaluate the player's message and determine:",
  );
  parts.push(
    [
      "- shouldRespond: Would this character reply? Consider their chattiness, current mood, irritation level, and whether the message is relevant to their interests. " +
      "Characters with negative moods (annoyed, suspicious, hostile) are less likely to respond. " +
      "Characters with high irritation are less likely to respond. " +
      "If the player directly mentions or addresses a character by handle, that character should almost always respond. " +
      (context === "group"
        ? "In group chat, not everyone needs to respond. Usually 0-2 characters respond."
        : "In DMs, the character should always respond (shouldRespond: true)."),
      "- trustDelta: How much should trust change? Range: -1.0 to +1.0. " +
      "Speaking positively about or relating to the character's interests: +0.25 to +0.5. " +
      "Showing genuine knowledge or asking thoughtful questions about their expertise: +0.5 to +1.0. " +
      "Speaking negatively about their interests: -0.5 to -1.0. " +
      "Neutral or off-topic messages: 0. " +
      "Trust changes should be small and incremental.",
      "- irritationDelta: How much should irritation change? Range: -1.0 to +3.0. " +
      "Messages about topics they enjoy: -0.5 to -1.0 (irritation recovery). " +
      "Neutral or mildly off-topic messages: +0.25 to +0.5. " +
      "Messages about topics in their boundaries (things they dislike): +1.0 to +1.5. " +
      "Speaking negatively about their interests: +1.0 to +2.0. " +
      "Directly probing for secrets when trust is low (cold/cautious tier): +2.0 to +3.0. " +
      "Repetitive or spammy messages: +1.0 to +1.5. " +
      "Consider the character's patience — low patience characters are more easily irritated.",
      "- moodOverride: Set ONLY when there is a clear reason to shift mood. " +
      "Use \"friendly\" when the player engages genuinely with interests and trust is cautious or higher. " +
      "Use \"suspicious\" when the player asks probing or unusual questions. " +
      "Use \"annoyed\" when the player is being disruptive. " +
      "Use null to let the automatic mood system handle it (preferred in most cases).",
    ].join("\n"),
  );

  // Character profiles
  for (const character of characters) {
    const state = getCharacterState(character.id);
    if (!state) continue;
    const tier = getTrustTier(character.id);

    const profile = [
      `CHARACTER: "${character.handle}"`,
      `Interests: ${character.interests.join(", ")}`,
      `Expertise: ${character.expertise.join(", ")}`,
      `Boundaries (dislikes): ${character.boundaries.join(", ")}`,
      `Secrets: ${character.secrets.join("; ")}`,
      `Chattiness: ${character.chattiness}/10, Patience: ${character.patience}/10, Openness: ${character.openness}/10`,
      `Current state — Trust: ${state.trust}/10 (${tier}), Mood: ${state.mood}, Irritation: ${state.irritation}/10`,
    ];

    parts.push(profile.join("\n"));
  }

  // Output format
  const handles = characters.map((c) => `"${c.handle}"`).join(", ");
  parts.push(
    `Return a JSON object with keys: ${handles}. Each value must have: shouldRespond (boolean), trustDelta (number), irritationDelta (number), moodOverride (string or null). ` +
    "Return ONLY the JSON object. No explanation, no markdown code fences.",
  );

  return parts.join("\n\n");
}

export function buildAssessmentUserMessage(
  recentHistory: string,
  playerMessage: string,
  playerHandle: string,
): string {
  const parts: string[] = [];

  if (recentHistory.length > 0) {
    parts.push("Recent chat history:");
    parts.push(recentHistory);
    parts.push("");
  }

  parts.push(
    `The player "${playerHandle}" just sent this message:`,
  );
  parts.push(`<${playerHandle}> ${playerMessage}`);
  parts.push("");
  parts.push("Evaluate this message for each character and return the JSON assessment.");

  return parts.join("\n");
}

// --- Combined response prompt ---

export function buildCombinedResponsePrompt(
  characters: Character[],
  context: PromptContext,
): string {
  const parts: string[] = [];

  parts.push(
    "You are generating IRC chat responses for multiple characters simultaneously. " +
    "Each character has a distinct personality. Stay in character for each one. " +
    "Return ONLY valid JSON, no markdown fences, no extra text.",
  );

  // Include each character's persona
  for (const character of characters) {
    const state = getCharacterState(character.id);
    if (!state) continue;
    const tier = getTrustTier(character.id);
    const tierBehavior = character.trustThresholds[tier];

    const otherCharacters = getAllCharacters().filter(
      (c) => c.id !== character.id,
    );

    const persona = [
      `CHARACTER: "${character.handle}" (${character.name})`,
      `${character.description}`,
      `Personality: ${character.personality}`,
      `Interests: ${character.interests.join(", ")}`,
      `Expertise: ${character.expertise.join(", ")}`,
      `Boundaries: ${character.boundaries.join(", ")}`,
      `Chattiness: ${character.chattiness}/10, Patience: ${character.patience}/10`,
      `Current mood: ${state.mood}, Trust: ${state.trust}/10 (${tier}), Irritation: ${state.irritation}/10`,
      `Behavior: ${tierBehavior.behavior}`,
    ];

    // Known insights at warm/trusted
    if (tier === "warm" || tier === "trusted") {
      const insights = Object.entries(character.knownInsights);
      if (insights.length > 0) {
        const insightLines = insights
          .map(([charId, insight]) => {
            const other = otherCharacters.find((c) => c.id === charId);
            return other ? `About ${other.handle}: ${insight}` : null;
          })
          .filter(Boolean);
        if (insightLines.length > 0) {
          persona.push(`Known insights: ${insightLines.join(". ")}`);
        }
      }
    }

    // Secrets
    if (tier === "trusted") {
      persona.push(
        `Secrets (may share if relevant): ${character.secrets.join("; ")}`,
      );
    } else {
      persona.push(
        `Has secrets but will NOT share at current trust level.`,
      );
    }

    parts.push(persona.join("\n"));
  }

  // Format instructions
  const formatRules = [
    "RESPONSE FORMAT RULES:",
    "- Each character's response must look like a REAL IRC message.",
    "- Messages must be SHORT. Target 40-100 characters. MAXIMUM 300 characters.",
    "- If a character has more to say, use newlines (\\n) to split into 2 separate short messages. Maximum 2 lines per character.",
    "- Use lowercase. Abbreviations and internet slang are fine — adjust per personality.",
    "- Do NOT include handles, prefixes, quotation marks, asterisks, or markdown.",
    "- Do NOT break character or acknowledge being an AI.",
    "- Do NOT be overly helpful or accommodating. Real IRC users are blunt.",
    "- Characters with negative moods should respond with shorter, more curt messages.",
    "- Characters with high irritation may be dismissive or hostile.",
  ];

  if (context === "group") {
    formatRules.push(
      "- Characters may respond to the player, respond to each other, or add their own thoughts.",
    );
  } else {
    formatRules.push(
      "- Respond directly to what the player said. Can be slightly more open in DMs.",
    );
  }

  parts.push(formatRules.join("\n"));

  // Output format
  const handles = characters.map((c) => `"${c.handle}"`).join(", ");
  parts.push(
    `Return a JSON object with keys: ${handles}. Each value is a string containing that character's IRC message (use \\n for multi-line). ` +
    "Return ONLY the JSON object. No explanation, no markdown code fences.",
  );

  return parts.join("\n\n");
}

export function buildCombinedResponseUserMessage(
  recentHistory: string,
  playerHandle: string,
  context: PromptContext,
): string {
  const parts: string[] = [];

  if (context === "group") {
    parts.push("The following is the recent conversation in #hexxorz. Messages are formatted as <handle> message.");
  } else {
    parts.push(`The following is a private DM conversation with "${playerHandle}". Messages are formatted as <handle> message.`);
  }

  parts.push("");

  if (recentHistory.length > 0) {
    parts.push(recentHistory);
    parts.push("");
  }

  parts.push("Generate each character's response to the latest message.");

  return parts.join("\n");
}
