import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { login as loginService, register as registerService, getProfile, isTokenExpired } from '../services/authService';

const AuthContext = createContext(null);

// Clés pour le stockage local
const TOKEN_KEY = 'auth_token';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Vérifier si l'utilisateur est authentifié
  const isAuthenticated = useCallback(() => {
    if (!token) return false;
    return !isTokenExpired(token);
  }, [token]);

  // Charger l'utilisateur à partir du token
  const loadUser = useCallback(async () => {
    if (!token) return null;
    
    try {
      const userData = await getProfile(token);
      setUser(userData);
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
      return userData;
    } catch (err) {
      console.error('Erreur lors du chargement du profil:', err);
      logout();
      return null;
    }
  }, [token]);

  // Initialisation de l'authentification
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedUser = localStorage.getItem(USER_KEY);
        
        if (storedUser && token && isAuthenticated()) {
          setUser(JSON.parse(storedUser));
          // Rafraîchir les données utilisateur
          await loadUser();
        } else if (token && !isAuthenticated()) {
          // Token expiré, déconnexion
          logout();
        }
      } catch (err) {
        console.error('Erreur lors de l\'initialisation de l\'authentification:', err);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, [token, isAuthenticated, loadUser]);

  // Connexion
  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    
    try {
      const { accessToken, user } = await loginService(email, password);
      
      // Stocker le token et les données utilisateur
      localStorage.setItem(TOKEN_KEY, accessToken);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      
      setToken(accessToken);
      setUser(user);
      
      return user;
    } catch (err) {
      setError(err.message || 'Échec de la connexion');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Inscription
  const register = async (userData) => {
    setLoading(true);
    setError(null);
    
    try {
      const newUser = await registerService(userData);
      
      // Connecter automatiquement l'utilisateur après l'inscription
      if (newUser) {
        return await login(userData.email, userData.password);
      }
      
      return newUser;
    } catch (err) {
      setError(err.message || "Échec de l'inscription");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Déconnexion
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    navigate('/login');
  };

  const value = {
    user,
    token,
    isAuthenticated: isAuthenticated(),
    loading,
    error,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé à l\'intérieur d\'un AuthProvider');
  }
  return context;
};

export default AuthContext;
