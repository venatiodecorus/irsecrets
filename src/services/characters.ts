export interface TrustThreshold {
  max: number;
  behavior: string;
}

export type TrustTier = "cold" | "cautious" | "warm" | "trusted";

export type Mood = "neutral" | "annoyed" | "suspicious" | "friendly" | "hostile";

export interface Character {
  id: string;
  name: string;
  handle: string;
  description: string;
  personality: string;

  interests: string[];
  expertise: string[];
  boundaries: string[];

  secrets: string[];
  knownInsights: Record<string, string>;

  chattiness: number;
  patience: number;
  openness: number;

  trustThresholds: Record<TrustTier, TrustThreshold>;

  initialTrust: number;
}

export interface CharacterState {
  trust: number;
  mood: Mood;
  irritation: number;
}

const characterModules = import.meta.glob<Character>("../characters/*.json", {
  eager: true,
  import: "default",
});

const characters: Character[] = Object.values(characterModules);

const stateMap = new Map<string, CharacterState>();

export function initializeState(): void {
  stateMap.clear();
  for (const character of characters) {
    stateMap.set(character.id, {
      trust: character.initialTrust,
      mood: "neutral",
      irritation: 0,
    });
  }
}

// Initialize on module load
initializeState();

export function getAllCharacters(): Character[] {
  return characters;
}

export function getCharacterById(id: string): Character | undefined {
  return characters.find((c) => c.id === id);
}

export function getCharacterByHandle(handle: string): Character | undefined {
  return characters.find((c) => c.handle === handle);
}

export function getCharacterState(id: string): CharacterState | undefined {
  return stateMap.get(id);
}

export function getTrustTier(id: string): TrustTier {
  const state = stateMap.get(id);
  if (!state) return "cold";

  const trust = state.trust;
  if (trust <= 2) return "cold";
  if (trust <= 5) return "cautious";
  if (trust <= 7) return "warm";
  return "trusted";
}

export function updateTrust(id: string, delta: number): number | undefined {
  const state = stateMap.get(id);
  if (!state) return undefined;

  state.trust = Math.max(0, Math.min(10, state.trust + delta));
  return state.trust;
}

export function updateMood(id: string, mood: Mood): void {
  const state = stateMap.get(id);
  if (!state) return;

  state.mood = mood;
}

export function updateIrritation(
  id: string,
  delta: number,
): number | undefined {
  const state = stateMap.get(id);
  if (!state) return undefined;

  state.irritation = Math.max(0, Math.min(10, state.irritation + delta));

  // Auto-update mood based on irritation thresholds
  if (state.irritation >= 9) {
    state.mood = "hostile";
  } else if (state.irritation >= 7) {
    state.mood = "annoyed";
  } else if (state.irritation >= 5) {
    state.mood = "suspicious";
  } else if (state.irritation < 4 && state.mood !== "friendly") {
    state.mood = "neutral";
  }

  return state.irritation;
}

export function canDM(id: string): boolean {
  const state = stateMap.get(id);
  if (!state) return false;
  return state.trust >= 3;
}

export interface CharacterDebugInfo {
  handle: string;
  trust: number;
  trustTier: TrustTier;
  mood: Mood;
  irritation: number;
  canDM: boolean;
}

export function getAllCharacterDebugInfo(): CharacterDebugInfo[] {
  return characters.map((c) => {
    const state = stateMap.get(c.id);
    return {
      handle: c.handle,
      trust: state?.trust ?? 0,
      trustTier: getTrustTier(c.id),
      mood: state?.mood ?? "neutral",
      irritation: state?.irritation ?? 0,
      canDM: canDM(c.id),
    };
  });
}
