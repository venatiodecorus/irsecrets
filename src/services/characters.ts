export interface Character {
  id: string;
  name: string;
  description: string;
  interests: string[];
  trust: Record<string, number>;
  respect: Record<string, number>;
  chattiness: number; // 0-100, 0 is least chatty, 100 is most chatty
  personality: string; // brief description of the character's personality
  background: string; // brief history of the character
  goals: string[]; // list of goals the character is pursuing
  motivations: string[]; // list of motivations the character is pursuing
  fears: string[]; // list of fears the character is pursuing
  desires: string[]; // list of desires the character is pursuing
  beliefs: string[]; // list of beliefs the character is pursuing
  values: string[]; // list of values the character is pursuing
}

const characterModules = import.meta.glob<Character>("../characters/*.json", {
  eager: true,
  import: "default",
});

const characters: Character[] = Object.values(characterModules);

export const getCharacterById = (id: string): Character | undefined => {
  return characters.find((character) => character.id === id);
};

export const getAllCharacters = (): Character[] => {
  return characters;
};

export const updateCharacter = (
  id: string,
  updatedCharacter: Partial<Character>,
): Character | undefined => {
  const index = characters.findIndex((character) => character.id === id);
  if (index === -1) return undefined;

  characters[index] = { ...characters[index], ...updatedCharacter };
  return characters[index];
};

export const deleteCharacter = (id: string): boolean => {
  const index = characters.findIndex((character) => character.id === id);
  if (index === -1) return false;

  characters.splice(index, 1);
  return true;
};

export const createCharacter = (
  newCharacter: Omit<Character, "id">,
): Character => {
  const id = crypto.randomUUID();
  const character = { id, ...newCharacter };
  characters.push(character);
  return character;
};
