// Service that will be used by the chat component (chat.tsx), will handle
// generating messages from the characters defined in characters.ts on a
// certain interval.

import { useState, useEffect } from "react";
import { getAllCharacters } from "./characters";

export interface ChatMessage {
  id: number;
  username: string;
  text: string;
}

export interface ChatUser {
  id: string;
  username: string;
}

export const useChatService = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);

  useEffect(() => {
    // Initialize users from characters
    const characters = getAllCharacters();
    const chatUsers = characters.map((char) => ({
      id: char.id,
      username: char.name,
    }));
    setUsers(chatUsers);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const newMessage = generateMessage();
      setMessages((prevMessages) => [...prevMessages, newMessage]);
    }, 5000);

    return () => clearInterval(interval);
  }, [users]);

  const generateMessage = (): ChatMessage => {
    if (users.length === 0) {
      return {
        id: Date.now(),
        username: "System",
        text: "No users available",
      };
    }

    const randomUser = users[Math.floor(Math.random() * users.length)];
    const sampleMessages = [
      "Hello!",
      "How's everyone doing?",
      "Anyone around?",
      "What's new?",
      "Hey there!",
    ];
    const randomText =
      sampleMessages[Math.floor(Math.random() * sampleMessages.length)];

    return {
      id: Date.now(),
      username: randomUser.username,
      text: randomText,
    };
  };

  const addMessage = (username: string, text: string) => {
    const newMessage: ChatMessage = {
      id: Date.now(),
      username,
      text,
    };
    setMessages((prevMessages) => [...prevMessages, newMessage]);
  };

  return { messages, users, addMessage };
};
