const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Connecte un utilisateur
 * @param {string} email - L'email de l'utilisateur
 * @param {string} password - Le mot de passe
 * @returns {Promise<Object>} Les informations de l'utilisateur et le token
 */
export async function login(email, password) {
  try {
    console.log('Tentative de connexion avec email:', email);
    
    // Vérifier que l'email et le mot de passe sont fournis
    if (!email || !password) {
      throw new Error('Veuillez fournir un email et un mot de passe');
    }

    // Créer les données de formulaire pour l'authentification OAuth2
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);
    
    console.log('Envoi de la requête de connexion à:', `${API_URL}/login`);
    
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    console.log('Réponse de connexion - Statut:', response.status);
    
    // Essayer de récupérer les données de la réponse
    let responseData;
    try {
      responseData = await response.json();
      console.log('Données de réponse:', responseData);
    } catch (e) {
      console.error('Erreur lors de l\'analyse de la réponse JSON:', e);
      throw new Error('Erreur lors de la connexion au serveur');
    }

    if (!response.ok) {
      // Gestion des erreurs spécifiques
      if (response.status === 401) {
        throw new Error('Email ou mot de passe incorrect');
      } else if (response.status === 400) {
        throw new Error('Requête invalide. Vérifiez vos informations.');
      } else {
        throw new Error(responseData.detail || 'Échec de la connexion');
      }
    }

    // Vérifier que le token est présent dans la réponse
    if (!responseData.access_token) {
      console.error('Token d\'accès manquant dans la réponse:', responseData);
      throw new Error('Erreur lors de l\'authentification: token manquant');
    }

    // Récupérer les informations de l'utilisateur
    const userData = await getProfile(responseData.access_token);
    
    return {
      accessToken: responseData.access_token,
      user: {
        email: email,
        username: userData.username || email.split('@')[0],
        ...userData
      }
    };
  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    throw error;
  }
}

/**
 * Enregistre un nouvel utilisateur
 * @param {Object} userData - Les données de l'utilisateur
 * @param {string} userData.email - L'email de l'utilisateur
 * @param {string} userData.username - Le nom d'utilisateur
 * @param {string} userData.password - Le mot de passe
 * @returns {Promise<Object>} Les informations de l'utilisateur créé
 */
export async function register({ email, username, password, profile_photo = null, bio = null, gender = null }) {
  try {
    // Préparer le corps de la requête
    const requestBody = {
      email,
      username,
      password,
      ...(profile_photo && { profile_photo }),
      ...(bio && { bio }),
      ...(gender && { gender })
    };

    console.log('Envoi de la requête d\'inscription :', requestBody);

    // D'abord, envoyer une requête OPTIONS pour vérifier CORS
    const optionsResponse = await fetch(`${API_URL}/register`, {
      method: 'OPTIONS',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    console.log('Réponse OPTIONS:', optionsResponse.status, optionsResponse.statusText);

    // Ensuite, envoyer la requête POST
    const response = await fetch(`${API_URL}/register`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Registration response status:', response.status);
    
    let responseData;
    try {
      responseData = await response.json();
      console.log('Registration response data:', responseData);
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
      responseData = {};
    }

    if (!response.ok) {
      throw new Error(responseData.detail || responseData.message || "Échec de l'inscription");
    }

    return responseData;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
}

/**
 * Récupère le profil de l'utilisateur connecté
 * @param {string} token - Le token d'authentification
 * @returns {Promise<Object>} Les informations du profil utilisateur
 */
export async function getProfile(token) {
  try {
    if (!token) {
      console.error('Aucun token fourni pour la récupération du profil');
      throw new Error('Token d\'authentification manquant');
    }

    console.log('Récupération du profil utilisateur...');
    
    const response = await fetch(`${API_URL}/profile/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    console.log('Réponse de récupération du profil - Statut:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Erreur lors de la récupération du profil:', errorData);
      
      if (response.status === 401) {
        throw new Error('Session expirée. Veuillez vous reconnecter.');
      } else if (response.status === 404) {
        throw new Error('Profil utilisateur introuvable');
      } else {
        throw new Error(errorData.detail || 'Erreur lors de la récupération du profil');
      }
    }

    const userData = await response.json();
    console.log('Profil utilisateur récupéré avec succès:', userData);
    
    return userData;
  } catch (error) {
    console.error('Erreur dans getProfile:', error);
    throw error; // Propager l'erreur pour une gestion ultérieure
  }
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
  } catch (error) {
    console.error('Erreur lors de la vérification du token:', error);
    return true; // En cas d'erreur, on considère le token comme expiré/invalide
  }
}

/**
 * Récupère le token d'authentification depuis le stockage local
 * @returns {string|null} Le token JWT ou null s'il n'existe pas ou est expiré
 */
export function getAuthToken() {
  const token = localStorage.getItem('auth_token');
  return token && !isTokenExpired(token) ? token : null;
}
