import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import CodeEditor from './components/CodeEditor/CodeEditor';
import Chat from './components/Chat/Chat';
import RoomSelector from './components/RoomSelector/RoomSelector';
import { FaCode, FaUsers, FaSignOutAlt, FaUserCircle, FaSpinner } from 'react-icons/fa';
import websocketService from './services/websocketService';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const App = () => {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState('');
  const [room, setRoom] = useState('');
  const [code, setCode] = useState('// Commencez à coder...\n// Votre code sera synchronisé en temps réel');
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirection si non authentifié
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { state: { from: location }, replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, location]);

  // Initialisation de l'utilisateur courant
  useEffect(() => {
    if (user?.username) {
      setCurrentUser(user.username);
    }
  }, [user]);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message) => {
    if (message.type === 'code_update') {
      setCode(message.content);
    } else if (message.type === 'chat_message') {
      setMessages(prev => [...prev, message]);
    } else if (message.type === 'user_joined') {
      setUsers(prev => [...new Set([...prev, message.username])]);
    } else if (message.type === 'user_left') {
      setUsers(prev => prev.filter(user => user !== message.username));
    } else if (message.type === 'room_users') {
      setUsers(message.users);
    }
  }, []);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!isAuthenticated || !user?.token) return;

    const onOpen = () => {
      console.log('WebSocket connected');
      // Join the room when connected
      const savedRoom = localStorage.getItem('currentRoom');
      if (savedRoom) {
        websocketService.sendMessage({
          type: 'join_room',
          room: savedRoom,
          username: user?.username
        });
        setRoom(savedRoom);
      }
    };

    const onClose = () => {
      console.log('WebSocket disconnected');
      setRoom('');
      setUsers([]);
      setMessages([]);
    };

    const onError = (error) => {
      console.error('WebSocket error:', error);
      setError('Erreur de connexion au serveur');
    };

    // Connect to WebSocket
    websocketService.connect(user.token, onOpen, onClose, onError);
    const removeHandler = websocketService.addMessageHandler(handleWebSocketMessage);

    // Cleanup on unmount
    return () => {
      removeHandler();
      websocketService.disconnect();
    };
  }, [isAuthenticated, user?.token, user?.username, handleWebSocketMessage]);

  // Rejoindre une salle
  const joinRoom = (roomName, username) => {
    if (!username || !roomName) return;

    setLoading(true);
    setError('');

    // Send join room message via WebSocket
    websocketService.sendMessage({
      type: 'join_room',
      room: roomName,
      username: username
    });

    // Update local state
    setRoom(roomName);
    setCurrentUser(user?.username || username);
    
    // Save room to localStorage for page refresh
    localStorage.setItem('currentRoom', roomName);
    
    setLoading(false);
  };

  const handleLogout = async () => {
    try {
      // Send leave room message if in a room
      if (room) {
        websocketService.sendMessage({
          type: 'leave_room',
          room: room,
          username: currentUser
        });
      }
      
      // Disconnect WebSocket
      websocketService.disconnect();
      
      // Clear local state
      setRoom('');
      setUsers([]);
      setMessages([]);
      
      // Logout and redirect
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const leaveRoom = () => {
    if (room) {
      websocketService.sendMessage({
        type: 'leave_room',
        room: room,
        username: currentUser
      });
      localStorage.removeItem('currentRoom');
    }
    setRoom('');
    setMessages([]);
    setUsers([]);
    setCode('// Commencez à coder...\n// Votre code sera synchronisé en temps réel');
  };

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    if (room) {
      websocketService.sendMessage({
        type: 'code_update',
        room: room,
        code: newCode
      });
    }
  };

  const handleSendMessage = (message) => {
    if (!message.trim() || !room) return;

    const newMessage = {
      type: 'chat_message',
      room: room,
      user: currentUser,
      message: message.trim(),
      timestamp: new Date().toISOString()
    };

    websocketService.sendMessage(newMessage);
    setMessages(prev => [...prev, newMessage]);
  };

  // Récupérer la salle précédente après un rafraîchissement
  useEffect(() => {
    if (isAuthenticated && !room) {
      const savedRoom = localStorage.getItem('currentRoom');
      if (savedRoom && user?.username) {
        joinRoom(savedRoom, user.username);
      }
    }
  }, [isAuthenticated, room, user?.username]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <FaSpinner className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Chargement de l'application...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // La redirection est gérée par le useEffect
  }

  if (!room) {
    return <RoomSelector onJoinRoom={joinRoom} loading={loading} error={error} />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* En-tête */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <FaCode className="h-8 w-8 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">LiveCode & Chat</h1>
            <div className="ml-4 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              {room}
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-sm text-gray-600">
              <FaUsers className="mr-1" />
              <span>{users.length} connecté(s)</span>
            </div>
            <div className="flex items-center space-x-2">
              <FaUserCircle className="h-6 w-6 text-gray-500" />
              <span className="text-sm font-medium text-gray-700" title={user?.email}>
                {currentUser || user?.username || 'Utilisateur'}
              </span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={leaveRoom}
                className="flex items-center text-sm text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100"
                title="Quitter la salle"
              >
                <FaSignOutAlt className="mr-1" />
                <span className="hidden sm:inline">Quitter</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center text-sm text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50"
                title="Déconnexion"
              >
                <FaSignOutAlt className="mr-1" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Éditeur de code */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden h-[calc(100vh-180px)]">
              <CodeEditor 
                code={code} 
                onChange={handleCodeChange} 
                language="javascript"
              />
            </div>
          </div>
          
          {/* Chat */}
          <div className="lg:col-span-1">
            <Chat 
              messages={messages} 
              onSendMessage={handleSendMessage} 
              currentUser={currentUser}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
