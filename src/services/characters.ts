interface Character {
  id: string;
  name: string;
  description: string;
  interests: string[];
  trust: Record<string, number>;
  respect: Record<string, number>;
}

const characters: Character[] = [
  {
    id: "1",
    name: "Alice",
    description: "A young woman with a kind heart and a passion for adventure.",
    interests: ["exploring new places", "reading books", "playing video games"],
    trust: {
      "1": 5,
      "2": 3,
      "3": 4,
    },
    respect: {
      "1": 4,
      "2": 2,
      "3": 3,
    },
  },
  {
    id: "2",
    name: "Bob",
    description:
      "A middle-aged man with a dry sense of humor and a love for science.",
    interests: ["studying history", "watching movies", "playing sports"],
    trust: {
      "1": 3,
      "2": 5,
      "3": 4,
    },
    respect: {
      "1": 2,
      "2": 4,
      "3": 3,
    },
  },
  {
    id: "3",
    name: "Charlie",
    description: "An elderly woman with a warm smile and a love for nature.",
    interests: ["gardening", "cooking", "traveling"],
    trust: {
      "1": 4,
      "2": 3,
      "3": 5,
    },
    respect: {
      "1": 3,
      "2": 2,
      "3": 4,
    },
  },
];

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
