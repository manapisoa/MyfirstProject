import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import CodeEditor from './components/CodeEditor/CodeEditor';
import Chat from './components/Chat/Chat';
import RoomSelector from './components/RoomSelector/RoomSelector';
import { FaCode, FaUsers, FaSignOutAlt, FaUserCircle, FaSpinner } from 'react-icons/fa';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const App = () => {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [socket, setSocket] = useState(null);
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

  // Initialisation de la connexion WebSocket
  useEffect(() => {
    if (!isAuthenticated) return;

    const newSocket = io(API_URL, {
      auth: {
        token: user?.token
      }
    });

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      if (err.message === 'Authentication error') {
        logout();
      }
    });

    setSocket(newSocket);

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [isAuthenticated, user?.token, logout]);

  // Gestion des événements WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleCodeUpdate = (newCode) => {
      setCode(newCode);
    };

    const handleNewMessage = (message) => {
      setMessages((prev) => [...prev, message]);
    };

    const handleRoomData = (data) => {
      setCode(data.code || '');
      setMessages(data.messages || []);
      setUsers(data.users || []);
    };

    const handleUserJoined = (user) => {
      setUsers((prev) => [...prev, user]);
      setMessages((prev) => [
        ...prev,
        { user: 'Système', text: `${user} a rejoint la salle`, timestamp: new Date() },
      ]);
    };

    const handleUserLeft = (username) => {
      setUsers((prev) => prev.filter((user) => user !== username));
      setMessages((prev) => [
        ...prev,
        { user: 'Système', text: `${username} a quitté la salle`, timestamp: new Date() },
      ]);
    };

    socket.on('code_updated', handleCodeUpdate);
    socket.on('new_message', handleNewMessage);
    socket.on('room_data', handleRoomData);
    socket.on('user_joined', handleUserJoined);
    socket.on('user_left', handleUserLeft);

    return () => {
      socket.off('code_updated', handleCodeUpdate);
      socket.off('new_message', handleNewMessage);
      socket.off('room_data', handleRoomData);
      socket.off('user_joined', handleUserJoined);
      socket.off('user_left', handleUserLeft);
    };
  }, [socket]);

  const joinRoom = async (roomName, username) => {
    if (!socket || !isAuthenticated) return;

    setLoading(true);
    setError('');

    try {
      // Utiliser le token d'authentification pour rejoindre la salle
      socket.emit('join_room', { 
        room: roomName, 
        username: user.username || username,
        token: user.token
      }, (response) => {
        if (response?.error) {
          setError(response.error);
          if (response.code === 'AUTH_ERROR') {
            logout();
          }
        } else {
          setRoom(roomName);
          setCurrentUser(user.username || username);
          // Sauvegarder la salle dans le localStorage pour la récupérer après un rafraîchissement
          localStorage.setItem('currentRoom', roomName);
        }
      });
    } catch (err) {
      console.error('Error joining room:', err);
      setError('Une erreur est survenue lors de la connexion à la salle');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (socket) {
        socket.emit('leave_room');
        socket.disconnect();
      }
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const leaveRoom = () => {
    if (socket) {
      socket.emit('leave_room');
      localStorage.removeItem('currentRoom');
    }
    setRoom('');
    setMessages([]);
    setUsers([]);
    setCode('// Commencez à coder...\n// Votre code sera synchronisé en temps réel');
  };

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    if (socket) {
      socket.emit('code_update', { code: newCode, room });
    }
  };

  const handleSendMessage = (message) => {
    if (!socket || !message.trim()) return;

    const newMessage = {
      user: currentUser,
      text: message,
      timestamp: new Date(),
    };

    socket.emit('send_message', { 
      message: newMessage,
      room,
    });
  };

  // Récupérer la salle précédente après un rafraîchissement
  useEffect(() => {
    if (isAuthenticated && socket && !room) {
      const savedRoom = localStorage.getItem('currentRoom');
      if (savedRoom) {
        joinRoom(savedRoom, user?.username);
      }
    }
  }, [isAuthenticated, socket, user?.username]);

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
