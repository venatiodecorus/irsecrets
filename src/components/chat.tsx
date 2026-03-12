import "./chat.css";
import { useState, useEffect, useRef } from "react";
import { useChatService, formatTimestamp } from "../services/chat";
import {
  getAllCharacters,
  getAllCharacterDebugInfo,
  type CharacterDebugInfo,
} from "../services/characters";

function Chat() {
  const [message, setMessage] = useState("");
  const [userNick, setUserNick] = useState("infil");
  const {
    channels,
    activeChannel,
    activeChannelId,
    setActiveChannel,
    users,
    sendMessage,
    startDM,
    isGenerating,
    gameOver,
    gameOverMessage,
  } = useChatService(userNick);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tabState = useRef<{
    prefix: string;
    matches: string[];
    index: number;
    wordStart: number;
  } | null>(null);
  const [debugInfo, setDebugInfo] = useState<CharacterDebugInfo[]>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeChannel.messages]);

  // Poll character debug info every second
  useEffect(() => {
    const update = () => setDebugInfo(getAllCharacterDebugInfo());
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    tabState.current = null;
    setMessage(event.target.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleSendMessage();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();

      const input = inputRef.current;
      if (!input) return;

      const cursorPos = input.selectionStart ?? message.length;

      if (tabState.current === null) {
        // First Tab press — find the word fragment before cursor
        const textBeforeCursor = message.slice(0, cursorPos);
        const lastSpaceIdx = textBeforeCursor.lastIndexOf(" ");
        const wordStart = lastSpaceIdx + 1;
        const prefix = textBeforeCursor.slice(wordStart);

        if (prefix.length === 0) return;

        const characters = getAllCharacters();
        const matches = characters
          .map((c) => c.handle)
          .filter((h) => h.toLowerCase().startsWith(prefix.toLowerCase()));

        if (matches.length === 0) return;

        tabState.current = { prefix, matches, index: 0, wordStart };

        const completed = matches[0] + " ";
        const newMessage =
          message.slice(0, wordStart) + completed + message.slice(cursorPos);
        const newCursorPos = wordStart + completed.length;

        setMessage(newMessage);
        setTimeout(
          () => input.setSelectionRange(newCursorPos, newCursorPos),
          0,
        );
      } else {
        // Subsequent Tab press — cycle to the next match
        const state = tabState.current;
        state.index = (state.index + 1) % state.matches.length;

        const completed = state.matches[state.index] + " ";
        // The previous completion occupies from wordStart to cursorPos
        const newMessage =
          message.slice(0, state.wordStart) +
          completed +
          message.slice(cursorPos);
        const newCursorPos = state.wordStart + completed.length;

        setMessage(newMessage);
        setTimeout(
          () => input.setSelectionRange(newCursorPos, newCursorPos),
          0,
        );
      }
    }
  };

  const handleSendMessage = () => {
    if (message.trim() === "") return;

    if (message.startsWith("/")) {
      handleCommand(message);
    } else {
      sendMessage(message);
    }

    setMessage("");
  };

  const handleCommand = (input: string) => {
    const parts = input.slice(1).split(" ");
    const command = parts[0]?.toLowerCase();

    switch (command) {
      case "nick": {
        const newNick = parts.slice(1).join(" ").trim();
        if (newNick) {
          setUserNick(newNick);
        }
        break;
      }
      case "msg": {
        const handle = parts[1]?.trim();
        if (!handle) break;
        const characters = getAllCharacters();
        const target = characters.find(
          (c) => c.handle.toLowerCase() === handle.toLowerCase(),
        );
        if (!target) break;

        const result = startDM(target.id);
        if (!result.success && result.reason) {
          console.log(result.reason);
        }
        break;
      }
      default:
        break;
    }
  };

  const handleUserClick = (userId: string) => {
    const result = startDM(userId);
    if (!result.success && result.reason) {
      console.log(result.reason);
    }
  };

  return (
    <>
      <div id="chat">
        <div className="channel-bar">
          {channels.map((channel) => (
            <button
              key={channel.id}
              className={`channel-tab ${channel.id === activeChannelId ? "active" : ""}`}
              onClick={() => setActiveChannel(channel.id)}
            >
              {channel.type === "group" ? channel.name : channel.name}
            </button>
          ))}
        </div>

        <div className="title-bar">
          <h1>{activeChannel.name}</h1>
          {isGenerating && <span className="typing-indicator">...</span>}
        </div>

        <div className="main-content">
          <div className="chat-messages">
            {activeChannel.messages.map((msg) => (
              <div
                key={msg.id}
                className={`message ${msg.isSystem ? "system-message" : ""}`}
              >
                <span className="timestamp">
                  {formatTimestamp(msg.timestamp)}
                </span>{" "}
                {msg.isSystem ? (
                  <span className="system-text">* {msg.text}</span>
                ) : (
                  <>
                    <span className="handle">&lt;{msg.handle}&gt;</span>{" "}
                    {msg.text}
                  </>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {activeChannel.type === "group" && (
            <div className="user-list">
              <div className="user-list-title">Users</div>
              <div className="user player-user">{userNick}</div>
              {users.map((user) => (
                <div
                  key={user.id}
                  className="user clickable-user"
                  onClick={() => handleUserClick(user.id)}
                  title={`Click to DM ${user.handle}`}
                >
                  {user.handle}
                </div>
              ))}
            </div>
          )}

          {activeChannel.type === "dm" && (
            <div className="user-list">
              <div className="user-list-title">DM</div>
              <div className="user player-user">{userNick}</div>
              <div className="user">{activeChannel.name}</div>
            </div>
          )}
        </div>

        <div className="input-section">
          {gameOver ? (
            <div className="game-over-message">{gameOverMessage}</div>
          ) : (
            <>
              <input
                ref={inputRef}
                type="text"
                className="message-input"
                placeholder={
                  activeChannel.type === "dm"
                    ? `Message ${activeChannel.name}...`
                    : "Type a message..."
                }
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
              />
              <button className="send-button" onClick={handleSendMessage}>
                Send
              </button>
            </>
          )}
        </div>
      </div>

      <div className="debug-panel">
        <div className="debug-title">Character State (debug)</div>
        <table className="debug-table">
          <thead>
            <tr>
              <th>handle</th>
              <th>trust</th>
              <th>tier</th>
              <th>mood</th>
              <th>irritation</th>
              <th>canDM</th>
            </tr>
          </thead>
          <tbody>
            {debugInfo.map((info) => (
              <tr key={info.handle}>
                <td>{info.handle}</td>
                <td>{info.trust}/10</td>
                <td>{info.trustTier}</td>
                <td>{info.mood}</td>
                <td>{info.irritation}/10</td>
                <td>{info.canDM ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default Chat;
