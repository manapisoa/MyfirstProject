import { getAuthToken } from './authService';

class WebSocketService {
    constructor() {
        this.socket = null;
        this.messageHandlers = new Set();
        this.eventHandlers = new Map();
        this.connectionUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.currentRoom = null;
        this.token = null;
        this.pendingMessages = [];
    }

    /**
     * Se connecte au serveur WebSocket
     * @param {string} roomId - L'ID de la salle à rejoindre
     * @param {Object} callbacks - Les callbacks pour les événements
     * @param {Function} callbacks.onOpen - Appelé lorsque la connexion est établie
     * @param {Function} callbacks.onClose - Appelé lorsque la connexion est fermée
     * @param {Function} callbacks.onError - Appelé en cas d'erreur
     */
    async connect(roomId, { onOpen, onClose, onError } = {}) {
        // Nettoyer la connexion existante si nécessaire
        if (this.socket) {
            this.disconnect();
        }

        // Rafraîchir le token avant chaque tentative de connexion
        this.token = getAuthToken();
        if (!this.token) {
            const error = new Error('Non authentifié');
            console.error('Aucun token d\'authentification trouvé');
            if (onError) onError(error);
            throw error;
        }

        this.currentRoom = roomId;
        
        // Encoder le nom de la salle pour l'URL
        const encodedRoomId = encodeURIComponent(roomId);
        const wsUrl = `${this.connectionUrl}/ws/chat/group/${encodedRoomId}?token=${encodeURIComponent(this.token)}`;
        
        return new Promise((resolve, reject) => {
            try {
                this.socket = new WebSocket(wsUrl);
                
                this.socket.onopen = (event) => {
                    console.log('WebSocket connected to room:', roomId);
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000; // Reset reconnect delay
                    
                    // Envoyer les messages en attente
                    
                    if (onOpen) onOpen(event);
                    resolve(event);
                };

                this.socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        
                        // Appeler les gestionnaires de messages généraux
                        this.messageHandlers.forEach(handler => handler(data));
                        
                        // Appeler les gestionnaires d'événements spécifiques
                        if (data.event_type && this.eventHandlers.has(data.event_type)) {
                            this.eventHandlers.get(data.event_type).forEach(handler => handler(data));
                        }
                    } catch (error) {
                        console.error('Erreur lors du traitement du message WebSocket:', error);
                    }
                };

                this.socket.onclose = (event) => {
                    this.isConnected = false;
                    this.socket = null;
                    if (onClose) onClose(event);
                    
                    // Ne pas tenter de se reconnecter si c'est une déconnexion volontaire
                    if (event.code !== 1000) {
                        this.attemptReconnect(roomId, { onOpen, onClose, onError });
                    }
                };

                this.socket.onerror = (error) => {
                    console.error('Erreur WebSocket:', {
                        error,
                        url: wsUrl,
                        roomId: roomId,
                        hasToken: !!this.token,
                        tokenStart: this.token ? this.token.substring(0, 10) + '...' : 'none'
                    });
                    this.isConnected = false;
                    this.socket = null;
                    
                    // Si c'est une erreur d'authentification, ne pas essayer de se reconnecter
                    if (error && (error.message.includes('401') || error.message.includes('non autorisé'))) {
                        const authError = new Error('Erreur d\'authentification WebSocket: Veuillez vous reconnecter');
                        console.error(authError.message);
                        if (onError) onError(authError);
                        reject(authError);
                        return;
                    }
                    
                    if (onError) onError(error);
                    reject(error);
                };
                
            } catch (error) {
                console.error('Error creating WebSocket:', error);
                if (onError) onError(error);
                reject(error);
            }
        });
    }

    /**
     * Tente de se reconnecter avec un délai exponentiel
     * @param {string} roomId - L'ID de la salle à rejoindre
     * @param {Object} callbacks - Les callbacks pour les événements
     * @returns {Promise<boolean>} - True si la reconnexion a réussi, false sinon
     */
    async attemptReconnect(roomId, callbacks = {}) {
        // Vérifier à nouveau le token avant de tenter de se reconnecter
        this.token = getAuthToken();
        if (!this.token) {
            const error = new Error('Non authentifié - Veuillez vous reconnecter');
            console.error('Aucun token d\'authentification trouvé pour la reconnexion');
            if (callbacks.onError) callbacks.onError(error);
            return false;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            const error = new Error('Maximum de tentatives de reconnexion atteint');
            console.error(error.message);
            if (callbacks.onError) callbacks.onError(error);
            return false;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
        
        console.log(`Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts} dans ${delay}ms...`);
        
        try {
            await new Promise(resolve => setTimeout(resolve, delay));
            
            if (!this.isConnected) {
                try {
                    await this.connect(roomId, callbacks);
                    return true;
                } catch (error) {
                    console.error('Échec de la reconnexion:', error);
                    return false;
                }
            }
            return true;
        } catch (error) {
            console.error('Erreur lors de la tentative de reconnexion:', error);
            return false;
        }
    }

    /**
     * Déconnecte le WebSocket
     */
    disconnect() {
        if (this.socket) {
            this.socket.close(1000, 'Déconnexion utilisateur');
            this.socket = null;
        }
        this.isConnected = false;
        this.currentRoom = null;
        this.messageHandlers.clear();
        this.eventHandlers.clear();
        this.pendingMessages = [];
    }

    /**
     * Envoie un message via le WebSocket
     * @param {Object} message - Le message à envoyer
     * @param {string} message.event_type - Le type d'événement (optionnel)
     * @param {*} message.data - Les données du message
     * @returns {boolean} - True si le message a été envoyé, false sinon
     */
    sendMessage(message) {
        if (!this.isConnected || !this.socket) {
            console.warn('WebSocket non connecté, message mis en attente');
            this.pendingMessages.push(message);
            return false;
        }

        try {
            const messageStr = JSON.stringify({
                ...message,
                timestamp: new Date().toISOString(),
                room_id: this.currentRoom
            });
            
            this.socket.send(messageStr);
            return true;
        } catch (error) {
            console.error('Erreur lors de l\'envoi du message WebSocket:', error);
            return false;
        }
    }

    /**
     * Envoie un message de chat
     * @param {string} content - Le contenu du message
     * @param {string} [type='text'] - Le type de message (text, code, image, etc.)
     * @returns {boolean} - True si le message a été envoyé, false sinon
     */
    sendChatMessage(content, type = 'text') {
        return this.sendMessage({
            event_type: 'chat_message',
            content,
            message_type: type
        });
    }

    /**
     * Envoie un message de code
     * @param {string} code - Le code source
     * @param {string} language - Le langage de programmation
     * @param {string} [description=''] - Une description optionnelle
     * @returns {boolean} - True si le message a été envoyé, false sinon
     */
    sendCodeMessage(code, language, description = '') {
        return this.sendMessage({
            event_type: 'code_message',
            content: {
                code,
                language,
                description
            },
            message_type: 'code'
        });
    }

    /**
     * Envoie une commande au serveur
     * @param {string} command - La commande à exécuter
     * @param {Object} [data={}] - Les données supplémentaires
     * @returns {boolean} - True si la commande a été envoyée, false sinon
     */
    sendCommand(command, data = {}) {
        return this.sendMessage({
            event_type: 'command',
            command,
            ...data
        });
    }

    /**
     * Envoie les messages en attente
     */
    flushPendingMessages() {
        while (this.pendingMessages.length > 0) {
            const message = this.pendingMessages.shift();
            this.sendMessage(message);
        }
    }

    /**
     * Ajoute un gestionnaire de messages
     * @param {Function} handler - La fonction de gestion des messages
     * @returns {Function} - Une fonction pour supprimer ce gestionnaire
     */
    addMessageHandler(handler) {
        if (typeof handler !== 'function') {
            console.error('Le gestionnaire doit être une fonction');
            return () => {};
        }
        
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }

    /**
     * Ajoute un gestionnaire d'événements spécifique
     * @param {string} eventType - Le type d'événement à écouter
     * @param {Function} handler - La fonction de gestion de l'événement
     * @returns {Function} - Une fonction pour supprimer ce gestionnaire
     */
    on(eventType, handler) {
        if (typeof handler !== 'function') {
            console.error('Le gestionnaire doit être une fonction');
            return () => {};
        }
        
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, new Set());
        }
        
        const handlers = this.eventHandlers.get(eventType);
        handlers.add(handler);
        
        return () => handlers.delete(handler);
    }

    /**
     * Supprime tous les gestionnaires d'un type d'événement
     * @param {string} eventType - Le type d'événement
     */
    off(eventType) {
        this.eventHandlers.delete(eventType);
    }
}

// Exporte une instance unique du service WebSocket
export const webSocketService = new WebSocketService();

export default webSocketService;
