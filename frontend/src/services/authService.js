const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Connecte un utilisateur
 * @param {string} email - L'email de l'utilisateur
 * @param {string} password - Le mot de passe
 * @returns {Promise<Object>} Les informations de l'utilisateur et le token
 */
export async function login(email, password) {
  const formData = new URLSearchParams();
  formData.append('username', email);
  formData.append('password', password);
  
  const response = await fetch(`${API_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Échec de la connexion');
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    user: {
      email: email,
      username: email.split('@')[0], // Le backend devrait retourner le vrai nom d'utilisateur
    },
  };
}

/**
 * Enregistre un nouvel utilisateur
 * @param {Object} userData - Les données de l'utilisateur
 * @param {string} userData.email - L'email de l'utilisateur
 * @param {string} userData.username - Le nom d'utilisateur
 * @param {string} userData.password - Le mot de passe
 * @returns {Promise<Object>} Les informations de l'utilisateur créé
 */
export async function register({ email, username, password }) {
  const response = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      username,
      password,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Échec de l'inscription");
  }

  return await response.json();
}

/**
 * Récupère le profil de l'utilisateur connecté
 * @param {string} token - Le token d'authentification
 * @returns {Promise<Object>} Les informations du profil utilisateur
 */
export async function getProfile(token) {
  const response = await fetch(`${API_URL}/profile/me`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Erreur lors de la récupération du profil');
  }

  return await response.json();
}

/**
 * Décode un token JWT
 * @param {string} token - Le token JWT
 * @returns {Object} Le payload décodé
 */
export function decodeToken(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Erreur lors du décodage du token:', error);
    return null;
  }
}

/**
 * Vérifie si un token est expiré
 * @param {string} token - Le token JWT
 * @returns {boolean} True si le token est expiré, invalide ou manquant, false sinon
 */
export function isTokenExpired(token) {
  // Vérifie si le token est manquant ou vide
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return true;
  }

  try {
    const decoded = decodeToken(token);
    
    // Vérifie si le décodage a échoué ou si le token n'a pas de champ 'exp'
    if (!decoded || typeof decoded !== 'object' || !('exp' in decoded)) {
      return true;
    }
    
    const currentTime = Math.floor(Date.now() / 1000); // Temps actuel en secondes
    return decoded.exp < currentTime;
  } catch (err) {
    console.error('Erreur lors de la vérification du token:', err);
    return true; // En cas d'erreur, on considère le token comme expiré/invalide
  }
}
