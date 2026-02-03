import "./chat.css";
import { useState, useEffect, useRef } from "react";
import { useChatService } from "../services/chat";

function Chat() {
  const [message, setMessage] = useState("");
  const { messages, users, addMessage } = useChatService();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [userNick, setUserNick] = useState("User1");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(event.target.value);
  };

  const handleSendMessage = () => {
    if (message.trim() === "") return;

    // Handle nick change command /nick <name>
    if (message.startsWith("/nick ")) {
      const newNick = message.slice(6).trim();
      setUserNick(newNick);
      addMessage("System", `Changed nick to ${newNick}`);
    } else {
      addMessage("You", message);
    }

    setMessage("");
  };

  return (
    <div id="chat">
      <div className="title-bar">
        <h1>#hexxorz</h1>
      </div>

      <div className="main-content">
        <div className="chat-messages">
          {messages.map((message) => (
            <div key={message.id} className="message">
              <span className="username">{message.username}:</span>{" "}
              {message.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="user-list">
          <div className="user-list-title">Users Online</div>
          <div className="user">{userNick}</div>
          {users.map((user) => (
            <div key={user.id} className="user">
              {user.username}
            </div>
          ))}
        </div>
      </div>

      <div className="input-section">
        <input
          type="text"
          className="message-input"
          placeholder="Type a message..."
          value={message}
          onChange={handleInputChange}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSendMessage();
            }
          }}
        />
        <button className="send-button" onClick={handleSendMessage}>
          Send
        </button>
      </div>
    </div>
  );
}

export default Chat;
