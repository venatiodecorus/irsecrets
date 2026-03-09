import type { Character, CharacterState } from "./characters";
import {
  getTrustTier,
  getAllCharacters,
} from "./characters";

type PromptContext = "group" | "dm";

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
