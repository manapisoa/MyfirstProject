from typing import Dict, List, Optional, Any, Tuple, Union
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime
import json
from sqlalchemy.orm import Session

import models
import schemas

class ConnectionManager:
    def __init__(self):
        # group_id -> {user_id: WebSocket}
        self.active_groups: Dict[int, Dict[int, WebSocket]] = {}
        # user_id -> {group_id: WebSocket}
        self.user_connections: Dict[int, Dict[int, WebSocket]] = {}
        # WebSocket -> (user_id, group_id)
        self.connection_info: Dict[WebSocket, Tuple[int, int]] = {}
        # Pour la rétrocompatibilité
        self.active_connections: Dict[int, Dict[int, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int, group_id: int):
        """Établir une connexion WebSocket pour un utilisateur dans un groupe"""
        try:
            await websocket.accept()
        except Exception as e:
            print(f"Erreur lors de l'acceptation de la connexion: {e}")
            return
        
        # Initialiser les structures de données si nécessaire
        if group_id not in self.active_groups:
            self.active_groups[group_id] = {}
            
        if user_id not in self.user_connections:
            self.user_connections[user_id] = {}
        
        # Fermer toute connexion existante pour cet utilisateur dans ce groupe
        existing_ws = self.active_groups[group_id].get(user_id)
        if existing_ws:
            try:
                await existing_ws.close()
            except:
                pass
            
            # Nettoyer les anciennes références
            if existing_ws in self.connection_info:
                del self.connection_info[existing_ws]
        
        # Enregistrer la nouvelle connexion
        self.active_groups[group_id][user_id] = websocket
        self.user_connections[user_id][group_id] = websocket
        self.connection_info[websocket] = (user_id, group_id)
        
        # Pour la rétrocompatibilité
        if group_id not in self.active_connections:
            self.active_connections[group_id] = {}
        self.active_connections[group_id][user_id] = websocket
        return websocket

    async def disconnect(self, websocket: WebSocket, user_id: int, group_id: int):
        """Fermer une connexion WebSocket et nettoyer les références"""
        try:
            # Nettoyer les références dans active_groups
            if group_id in self.active_groups and user_id in self.active_groups[group_id]:
                del self.active_groups[group_id][user_id]
                
            # Nettoyer les références dans user_connections
            if user_id in self.user_connections and group_id in self.user_connections[user_id]:
                del self.user_connections[user_id][group_id]
                
            # Nettoyer la référence dans connection_info
            if websocket in self.connection_info:
                del self.connection_info[websocket]
                
            # Pour la rétrocompatibilité
            if group_id in self.active_connections and user_id in self.active_connections[group_id]:
                del self.active_connections[group_id][user_id]
                
            # Fermer la connexion WebSocket
            try:
                await websocket.close()
            except:
                pass
                
        except Exception as e:
            print(f"Erreur lors de la déconnexion: {e}")
    
    async def send_personal_message(self, message: Union[dict, schemas.WSEvent], user_id: int, group_id: int):
        """Envoyer un message à un utilisateur spécifique dans un groupe
        
        Args:
            message: Le message à envoyer (peut être un dictionnaire ou un objet WSEvent)
            user_id: ID de l'utilisateur destinataire
            group_id: ID du groupe
        """
        if group_id in self.active_groups and user_id in self.active_groups[group_id]:
            websocket = self.active_groups[group_id][user_id]
            try:
                if hasattr(message, 'dict'):
                    await websocket.send_json(message.dict())
                else:
                    await websocket.send_json(message)
            except Exception as e:
                print(f"Erreur d'envoi du message personnel à l'utilisateur {user_id}: {e}")
                await self.disconnect(websocket, user_id, group_id)

    async def broadcast_group(self, group_id: int, message: Dict[str, Any], exclude_user_id: int = None):
        """Diffuser un message à tous les utilisateurs d'un groupe"""
        if group_id in self.active_groups:
            for user_id, connection in list(self.active_groups[group_id].items()):
                if user_id == exclude_user_id:
                    continue
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"Erreur d'envoi à l'utilisateur {user_id}: {e}")
                    # Nettoyer la connexion en cas d'erreur
                    await self.disconnect(connection, user_id, group_id)
    
    # Alias pour la rétrocompatibilité
    broadcast = broadcast_group
    
    def get_connected_users(self, group_id: int, db: Session = None) -> List[Union[Dict[str, int], models.User]]:
        """Récupérer la liste des utilisateurs connectés à un groupe
        
        Args:
            group_id: ID du groupe
            db: Session SQLAlchemy optionnelle pour récupérer plus d'informations
            
        Returns:
            Liste des utilisateurs connectés (soit des dictionnaires avec l'ID, soit des objets User complets)
        """
        if group_id not in self.active_groups:
            return []
            
        if not db:
            # Si on n'a pas accès à la base de données, retourner juste les IDs
            return [{"id": uid} for uid in self.active_groups[group_id].keys()]
            
        # Si on a accès à la base de données, on peut récupérer plus d'informations
        from models import User
        
        user_ids = list(self.active_groups[group_id].keys())
        if not user_ids:
            return []
            
        users = db.query(User).filter(User.id.in_(user_ids)).all()
        return users

# Global instance
manager = ConnectionManager()