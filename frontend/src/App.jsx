import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import CodeEditor from './components/CodeEditor/CodeEditor';
import Chat from './components/Chat/Chat';
import { getAuthToken } from './services/authService';
import RoomSelector from './components/RoomSelector/RoomSelector';
import { FaCode, FaUsers, FaSignOutAlt, FaUserCircle, FaSpinner } from 'react-icons/fa';
import webSocketService from './services/websocketService';
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

    const savedRoom = localStorage.getItem('currentRoom') || '1'; // Utiliser '1' comme salle par défaut
    let isMounted = true;
    
    const onOpen = () => {
      if (!isMounted) return;
      
      console.log('WebSocket connected');
      setError('');
      
      // Ne pas définir la salle ici, attendre la confirmation du serveur
      const joinMessage = {
        type: 'join_room',
        room: savedRoom,
        username: user.username
      };
      
      // Utiliser setTimeout pour s'assurer que le message est envoyé après l'établissement de la connexion
      setTimeout(() => {
        if (webSocketService.isConnected) {
          webSocketService.sendMessage(joinMessage);
        }
      }, 100);
    };

    const onClose = () => {
      console.log('WebSocket disconnected');
      if (room) {
        setError('Déconnecté du serveur. Tentative de reconnexion...');
      }
      // Réinitialiser l'état de la salle
      setRoom('');
      setUsers([]);
      setMessages([]);
    };

    const onError = (error) => {
      console.error('WebSocket error:', error);
      setError('Erreur de connexion au serveur');
    };

    // Configurer le gestionnaire de messages
    const removeMessageHandler = webSocketService.addMessageHandler((message) => {
      if (!isMounted) return;
      
      console.log('Message reçu:', message);
      
      if (message.type === 'chat_message') {
        setMessages(prev => [...prev, {
          id: message.id || Date.now(),
          content: message.content,
          sender: message.sender_username || message.username || 'Système',
          timestamp: message.timestamp || new Date().toISOString(),
          user: message.user || { username: message.username || 'Système' }
        }]);
      } else if (message.type === 'user_list') {
        // Mettre à jour la liste des utilisateurs connectés
        setUsers(message.users || []);
      } else if (message.type === 'room_joined') {
        // La salle a été rejointe avec succès
        setRoom(savedRoom);
        setError('');
      }
    });

    // Se connecter au WebSocket avec le token d'authentification
    const wsUrl = `${import.meta.env.VITE_WS_URL || 'ws://localhost:8000'}/ws/chat/group/${savedRoom}?token=${user.token}`;
    webSocketService.connect(wsUrl, {
      onOpen,
      onClose,
      onError
    });

    // Nettoyage lors du démontage du composant
    return () => {
      isMounted = false;
      removeMessageHandler();
      webSocketService.disconnect();
      setRoom('');
      setUsers([]);
      setMessages([]);
    };
  }, [isAuthenticated, user?.token, user?.username]);

  // Rejoindre une salle
  const joinRoom = (roomName, username) => {
    if (!username || !roomName) return;

    setLoading(true);
    setError('');

    // Sauvegarder la salle
    localStorage.setItem('currentRoom', roomName);
    
    // Se reconnecter avec la nouvelle salle
    if (webSocketService.isConnected) {
      // Envoyer un message de changement de salle
      webSocketService.sendMessage({
        type: 'join_room',
        room: roomName,
        username: username
      });
      
      // Mettre à jour l'état après un court délai
      setTimeout(() => {
        setRoom(roomName);
        setLoading(false);
      }, 100);
    } else {
      // Si pas connecté, la connexion sera gérée par l'effet principal
      setRoom(roomName);
      setLoading(false);
    }
  };
  const handleLogout = async () => {
    try {
      // Envoyer un message de départ si dans une salle et connecté
      if (room && webSocketService.isConnected) {
        try {
          await webSocketService.sendMessage({
            type: 'chat_message',
            content: `${currentUser} a quitté la salle`,
            username: currentUser,
            room: room
          });
          // Attendre un court instant pour s'assurer que le message est envoyé
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error('Erreur lors de l\'envoi du message de départ:', error);
          // Continuer même en cas d'erreur d'envoi du message
        }
      }
      
      // Déconnecter le WebSocket
      webSocketService.disconnect();
      
      // Réinitialiser l'état local
      setRoom('');
      setUsers([]);
      setMessages([]);
      
      // Effacer le stockage local
      localStorage.removeItem('currentRoom');
      
      // Déconnecter l'utilisateur et rediriger
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Erreur lors de la déconnexion:', err);
      // Forcer la déconnexion même en cas d'erreur
      webSocketService.disconnect();
      await logout();
      navigate('/login', { replace: true });
    }
  };

  const leaveRoom = () => {
    if (room && webSocketService.isConnected) {
      webSocketService.sendMessage({
        type: 'chat_message',
        content: `${currentUser} a quitté la salle`,
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
    if (room && webSocketService.isConnected) {
      webSocketService.sendMessage({
        type: 'code_update',
        room: room,
        code: newCode,
        username: currentUser
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

    // Vérifier l'authentification avant d'envoyer un message
    const token = getAuthToken();
    if (!token) {
      console.error('Aucun token d\'authentification trouvé, redirection vers la page de connexion');
      setError('Session expirée, veuillez vous reconnecter');
      // Forcer la déconnexion et rediriger vers la page de connexion
      handleLogout();
      return;
    }

    if (webSocketService.isConnected) {
      try {
        webSocketService.sendMessage(newMessage);
        console.log('Message envoyé avec succès:', newMessage);
      } catch (error) {
        console.error('Erreur lors de l\'envoi du message:', error);
        
        // Si c'est une erreur d'authentification, forcer la déconnexion
        if (error.message && error.message.includes('Non authentifié')) {
          setError('Session expirée, veuillez vous reconnecter');
          handleLogout();
          return;
        }
        
        // Mettre le message en attente en cas d'échec
        webSocketService.pendingMessages.push(newMessage);
        console.log('Message mis en attente après erreur. Total en attente:', webSocketService.pendingMessages.length);
      }
    } else {
      console.log('WebSocket non connecté, mise en attente du message...');
      
      // Stocker le message pour le renvoyer plus tard
      webSocketService.pendingMessages.push(newMessage);
      console.log('Message mis en attente. Total en attente:', webSocketService.pendingMessages.length);
      
      // Tenter de se reconnecter si ce n'est pas déjà fait
      if (webSocketService.reconnectAttempts < webSocketService.maxReconnectAttempts) {
        console.log('Tentative de reconnexion...');
        const savedRoom = localStorage.getItem('currentRoom');
        if (savedRoom && user?.username) {
          webSocketService.connect(savedRoom, {
            onOpen: () => {
              console.log('Reconnecté avec succès après une déconnexion');
              // Les messages en attente seront envoyés automatiquement par le service
              setError('');
            },
            onError: (error) => {
              console.error('Échec de la reconnexion:', error);
              if (error.message && error.message.includes('Non authentifié')) {
                setError('Session expirée, veuillez vous reconnecter');
                handleLogout();
              } else {
                setError('Impossible de se connecter au serveur. Réessayez plus tard.');
              }
            }
          }).catch(error => {
            console.error('Erreur lors de la tentative de connexion:', error);
            if (error.message && error.message.includes('Non authentifié')) {
              setError('Session expirée, veuillez vous reconnecter');
              handleLogout();
            }
          });
        }
      } else {
        setError('Impossible de se connecter au serveur. Veuillez rafraîchir la page.');
      }
    }
    
    // Mettre à jour l'interface utilisateur avec le nouveau message
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
  }, [isAuthenticated, room, user?.username, joinRoom]);

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
