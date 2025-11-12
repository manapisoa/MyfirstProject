import React, { useState, useEffect, useRef } from 'react';
import { IoSend } from 'react-icons/io5';

const Chat = ({ messages = [], onSendMessage, currentUser = 'Utilisateur' }) => {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message);
      setMessage('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h3 className="text-lg font-medium text-gray-900">Chat</h3>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto chat-messages">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            Aucun message pour le moment
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div 
                key={index} 
                className={`flex ${msg.user === currentUser ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    msg.user === currentUser 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <div className="text-xs font-medium mb-1">
                    {msg.user === currentUser ? 'Vous' : msg.user}
                  </div>
                  <div className="break-words">{msg.text}</div>
                  <div className="text-xs opacity-75 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex space-x-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tapez votre message..."
            className="flex-1 input"
            autoComplete="off"
          />
          <button 
            type="submit" 
            className="btn btn-primary flex items-center justify-center px-4"
            disabled={!message.trim()}
          >
            <IoSend className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default Chat;
