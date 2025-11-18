import React, { useState, useEffect } from 'react';
import { FaArrowRight, FaPlus, FaUsers, FaLock } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const RoomSelector = ({ onJoinRoom, loading = false }) => {
  const { user, isAuthenticated, login, register, error: authError } = useAuth();
  const navigate = useNavigate();
  
  const [roomName, setRoomName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  // Mettre à jour l'erreur si elle vient du contexte d'authentification
  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError]);

  // Mettre à jour le nom d'utilisateur si l'utilisateur est connecté
  useEffect(() => {
    if (user?.username) {
      setUsername(user.username);
      setEmail(user.email || '');
    }
  }, [user]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      if (isLogin) {
        // Connexion
        await login(email, password);
      } else {
        // Inscription
        await register({ email, username, password });
      }
    } catch (err) {
      setError(err.message || 'Une erreur est survenue lors de l\'authentification');
      console.error('Erreur d\'authentification:', err);
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    setError('');
    
    if (!isAuthenticated) {
      setError('Veuillez vous connecter d\'abord');
      return;
    }
    
    if ((!roomName && !joinCode) || !username.trim()) {
      setError('Veuillez remplir tous les champs requis');
      return;
    }
    
    // Si on rejoint avec un code, on utilise le code, sinon on utilise le nom de la salle
    const roomIdentifier = joinCode || roomName;
    onJoinRoom(roomIdentifier, username.trim(), isCreatingRoom, isPrivate);
  };
  
  const toggleAuthMode = () => {
    setIsLogin(!isLogin);
    setError('');
  };
  
  const toggleRoomMode = () => {
    setIsCreatingRoom(!isCreatingRoom);
    setRoomName('');
    setJoinCode('');
    setError('');
  };

  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-md">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isCreatingRoom ? 'Créer une salle' : 'Rejoindre une salle'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {isCreatingRoom 
              ? 'Créez une nouvelle salle de codage collaboratif'
              : 'Rejoignez une salle pour coder et discuter en temps réel'}
          </p>
        </div>

        {!isAuthenticated ? (
          // Formulaire de connexion/inscription
          <form className="mt-8 space-y-6" onSubmit={handleAuth}>
            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
                {error}
              </div>
            )}
            
            <div className="rounded-md shadow-sm space-y-4">
              {!isLogin && (
                <div>
                  <label htmlFor="username" className="sr-only">
                    Nom d'utilisateur
                  </label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                    placeholder="Nom d'utilisateur"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              )}
              
              <div>
                <label htmlFor="email" className="sr-only">
                  Adresse email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Adresse email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              
              <div>
                <label htmlFor="password" className="sr-only">
                  Mot de passe
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  required
                  minLength={6}
                  className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className={`group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                  loading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {loading ? 'Traitement...' : isLogin ? 'Se connecter' : 'Créer un compte'}
              </button>
            </div>
            
            <div className="text-center text-sm">
              <button
                type="button"
                onClick={toggleAuthMode}
                className="font-medium text-blue-600 hover:text-blue-500"
              >
                {isLogin 
                  ? "Vous n'avez pas de compte ? Inscrivez-vous"
                  : 'Déjà un compte ? Connectez-vous'}
                <br />
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-blue-600 hover:text-blue-500 text-sm mt-2"
                >
                  Mot de passe oublié ?
                </button>
              </button>
            </div>
          </form>
        ) : (
          // Formulaire de sélection de salle
          <form className="mt-8 space-y-6" onSubmit={handleJoinRoom}>
            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
                {error}
              </div>
            )}
            
            <div className="rounded-md shadow-sm space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Votre pseudo
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Votre pseudo"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              
              {isCreatingRoom ? (
                <>
                  <div>
                    <label htmlFor="roomName" className="block text-sm font-medium text-gray-700 mb-1">
                      Nom de la salle
                    </label>
                    <input
                      id="roomName"
                      name="roomName"
                      type="text"
                      required
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Nom de la salle"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                    />
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      id="isPrivate"
                      name="isPrivate"
                      type="checkbox"
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                    />
                    <label htmlFor="isPrivate" className="ml-2 block text-sm text-gray-700">
                      Salle privée
                    </label>
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="joinCode" className="block text-sm font-medium text-gray-700 mb-1">
                    Nom ou code d'accès de la salle
                  </label>
                  <input
                    id="joinCode"
                    name="joinCode"
                    type="text"
                    required
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Nom ou code d'accès"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || (!isCreatingRoom && !joinCode.trim()) || (isCreatingRoom && !roomName.trim())}
                className={`group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                  loading || (!isCreatingRoom && !joinCode.trim()) || (isCreatingRoom && !roomName.trim()) ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                  {isCreatingRoom ? (
                    <FaPlus className="h-5 w-5 text-blue-400 group-hover:text-blue-300" />
                  ) : (
                    <FaArrowRight className="h-5 w-5 text-blue-400 group-hover:text-blue-300" />
                  )}
                </span>
                {loading ? 'Chargement...' : isCreatingRoom ? 'Créer la salle' : 'Rejoindre la salle'}
              </button>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center">
                <button
                  type="button"
                  onClick={toggleRoomMode}
                  className="px-2 bg-white text-sm text-blue-600 hover:text-blue-500"
                >
                  {isCreatingRoom 
                    ? 'Rejoindre une salle existante' 
                    : 'Créer une nouvelle salle'}
                </button>
              </div>
            </div>
            
            {isPrivate && isCreatingRoom && (
              <div className="mt-4 p-3 bg-blue-50 rounded-md text-sm text-blue-700 flex items-start">
                <FaLock className="flex-shrink-0 h-4 w-4 mt-0.5 mr-2" />
                <div>
                  <p className="font-medium">Salle privée</p>
                  <p>Seuls les utilisateurs avec le code d'accès pourront rejoindre cette salle.</p>
                </div>
              </div>
            )}
            
            {!isCreatingRoom && (
              <div className="mt-4 p-3 bg-gray-50 rounded-md text-sm text-gray-600 flex items-start">
                <FaUsers className="flex-shrink-0 h-4 w-4 mt-0.5 mr-2" />
                <div>
                  <p className="font-medium">Comment rejoindre une salle ?</p>
                  <p>Entrez le nom de la salle si elle est publique, ou le code d'accès si elle est privée.</p>
                </div>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
};

export default RoomSelector;
