class WebSocketService {
    constructor() {
        this.socket = null;
        this.messageHandlers = new Set();
        this.connectionUrl = 'ws://localhost:8000';
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000; // 3 seconds
    }

    connect(token, onOpen, onClose, onError) {
        if (this.socket) {
            return;
        }

        // Create WebSocket connection with authentication token
        this.socket = new WebSocket(`${this.connectionUrl}/ws/chat/group/1?token=${token}`);
        
        this.socket.onopen = (event) => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            if (onOpen) onOpen(event);
        };

        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.messageHandlers.forEach(handler => handler(message));
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        this.socket.onclose = (event) => {
            console.log('WebSocket disconnected');
            this.isConnected = false;
            this.socket = null;
            
            if (onClose) onClose(event);
            
            // Attempt to reconnect
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                setTimeout(() => this.connect(token, onOpen, onClose, onError), this.reconnectDelay);
            }
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            if (onError) onError(error);
        };
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
            this.isConnected = false;
        }
    }

    sendMessage(message) {
        if (this.socket && this.isConnected) {
            this.socket.send(JSON.stringify(message));
            return true;
        }
        console.error('Cannot send message: WebSocket is not connected');
        return false;
    }

    addMessageHandler(handler) {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }
}

export default new WebSocketService();
