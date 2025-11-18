from typing import Dict, List, Optional, Any, Tuple, Set, Union, cast
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime
import json
from sqlalchemy.orm import Session
import asyncio
import logging

# Configuration du logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Importations des modèles et schémas
try:
    from . import models, schemas
except ImportError:
    import models
    import schemas

class ConnectionManager:
    """Gestionnaire des connexions WebSocket pour le chat en temps réel."""
    
    def __init__(self):
        # group_id -> {user_id: WebSocket}
        self.active_groups: Dict[int, Dict[int, WebSocket]] = {}
        # user_id -> {group_id: WebSocket}
        self.user_connections: Dict[int, Dict[int, WebSocket]] = {}
        # WebSocket -> (user_id, group_id)
        self.connection_info: Dict[WebSocket, Tuple[int, int]] = {}
        # Pour la rétrocompatibilité
        self.active_connections: Dict[int, Dict[int, WebSocket]] = {}
        # Messages en attente pour les utilisateurs déconnectés
        self.pending_messages: Dict[Tuple[int, int], List[Dict]] = {}
        # Verrou pour les opérations thread-safe
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: int, group_id: int, db: Optional[Session] = None) -> bool:
        """
        Établir une connexion WebSocket pour un utilisateur dans un groupe.
        
        Args:
            websocket: L'objet WebSocket du client
            user_id: ID de l'utilisateur qui se connecte
            group_id: ID du groupe de discussion
            db: Session SQLAlchemy optionnelle pour la validation
            
        Returns:
            bool: True si la connexion a réussi, False sinon
        """
        async with self._lock:
            try:
                # Accepter la connexion WebSocket
                await websocket.accept()
                logger.info(f"Nouvelle connexion - User: {user_id}, Groupe: {group_id}")
                
                # Validation du groupe si une session DB est fournie
                if db is not None:
                    group = db.query(models.ChatGroup).filter(models.ChatGroup.id == group_id).first()
                    if not group:
                        await websocket.close(code=4003, reason="Groupe introuvable")
                        return False
                
                # Initialiser les structures de données si nécessaire
                if group_id not in self.active_groups:
                    self.active_groups[group_id] = {}
                
                if user_id not in self.user_connections:
                    self.user_connections[user_id] = {}
                
                # Fermer toute connexion existante pour cet utilisateur dans ce groupe
                existing_ws = self.active_groups[group_id].get(user_id)
                if existing_ws and existing_ws != websocket:
                    try:
                        await existing_ws.close(code=4000, reason="Nouvelle connexion détectée")
                    except Exception as e:
                        logger.warning(f"Erreur lors de la fermeture d'une connexion existante: {e}")
                    
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
                
                # Notifier les autres utilisateurs du groupe
                await self.broadcast_group(
                    group_id,
                    {
                        "type": "user_connected",
                        "user_id": user_id,
                        "timestamp": datetime.utcnow().isoformat()
                    },
                    exclude_user_id=user_id
                )
                
                # Envoyer les messages en attente
                pending_key = (user_id, group_id)
                if pending_key in self.pending_messages and self.pending_messages[pending_key]:
                    logger.info(f"Envoi de {len(self.pending_messages[pending_key])} messages en attente")
                    for message in self.pending_messages[pending_key]:
                        try:
                            await websocket.send_json(message)
                        except Exception as e:
                            logger.error(f"Erreur d'envoi de message en attente: {e}")
                            continue
                    self.pending_messages[pending_key] = []
                
                return True
                
            except Exception as e:
                logger.error(f"Erreur lors de la connexion WebSocket: {e}")
                try:
                    await websocket.close(code=1011, reason=f"Erreur: {str(e)}")
                except:
                    pass
                return False

    async def disconnect(self, websocket: WebSocket, user_id: int, group_id: int) -> None:
        """
        Fermer une connexion WebSocket et nettoyer les références.
        
        Args:
            websocket: L'objet WebSocket à déconnecter
            user_id: ID de l'utilisateur
            group_id: ID du groupe
        """
        async with self._lock:
            try:
                logger.info(f"Déconnexion - User: {user_id}, Groupe: {group_id}")
                
                # Nettoyer les références
                if group_id in self.active_groups and user_id in self.active_groups[group_id]:
                    del self.active_groups[group_id][user_id]
                    if not self.active_groups[group_id]:
                        del self.active_groups[group_id]
                
                if user_id in self.user_connections and group_id in self.user_connections[user_id]:
                    del self.user_connections[user_id][group_id]
                    if not self.user_connections[user_id]:
                        del self.user_connections[user_id]
                
                if websocket in self.connection_info:
                    del self.connection_info[websocket]
                
                # Pour la rétrocompatibilité
                if group_id in self.active_connections and user_id in self.active_connections[group_id]:
                    del self.active_connections[group_id][user_id]
                    if not self.active_connections[group_id]:
                        del self.active_connections[group_id]
                
                # Notifier les autres utilisateurs du groupe
                if group_id in self.active_groups:  # Vérifier si le groupe existe encore
                    await self.broadcast_group(
                        group_id,
                        {
                            "type": "user_disconnected",
                            "user_id": user_id,
                            "timestamp": datetime.utcnow().isoformat()
                        }
                    )
                
                # Fermer la connexion WebSocket
                try:
                    await websocket.close()
                except Exception as e:
                    logger.warning(f"Erreur lors de la fermeture du WebSocket: {e}")
                
            except Exception as e:
                logger.error(f"Erreur lors de la déconnexion: {e}")
    
    async def send_personal_message(
        self, 
        message: Union[dict, schemas.WSEvent], 
        user_id: int, 
        group_id: int,
        store_if_offline: bool = True
    ) -> bool:
        """
        Envoyer un message à un utilisateur spécifique dans un groupe.
        
        Args:
            message: Le message à envoyer (peut être un dictionnaire ou un objet WSEvent)
            user_id: ID de l'utilisateur destinataire
            group_id: ID du groupe
            store_if_offline: Si True, stocke le message si l'utilisateur est déconnecté
            
        Returns:
            bool: True si le message a été envoyé, False sinon
        """
        try:
            # Convertir en dict si c'est un modèle Pydantic
            if hasattr(message, 'dict'):
                message_data = message.dict()
            else:
                message_data = dict(message)
            
            # Vérifier si l'utilisateur est en ligne dans ce groupe
            if (group_id in self.active_groups and 
                user_id in self.active_groups[group_id]):
                
                websocket = self.active_groups[group_id][user_id]
                try:
                    await websocket.send_json(message_data)
                    return True
                except Exception as e:
                    logger.error(f"Erreur d'envoi de message à {user_id}: {e}")
                    # La connexion est probablement morte, on la nettoie
                    await self.disconnect(websocket, user_id, group_id)
                    return False
            
            # Si l'utilisateur est hors ligne et qu'on doit stocker le message
            elif store_if_offline:
                pending_key = (user_id, group_id)
                if pending_key not in self.pending_messages:
                    self.pending_messages[pending_key] = []
                self.pending_messages[pending_key].append(message_data)
                logger.info(f"Message en attente pour l'utilisateur {user_id} dans le groupe {group_id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Erreur dans send_personal_message: {e}")
            return False
    
    async def broadcast_group(
        self, 
        group_id: int, 
        message: Union[dict, schemas.WSEvent],
        exclude_user_id: Optional[int] = None
    ) -> int:
        """
        Diffuser un message à tous les utilisateurs d'un groupe.
        
        Args:
            group_id: ID du groupe cible
            message: Message à diffuser (dict ou WSEvent)
            exclude_user_id: ID de l'utilisateur à exclure de la diffusion
            
        Returns:
            int: Nombre de destinataires ayant reçu le message
        """
        if group_id not in self.active_groups or not self.active_groups[group_id]:
            return 0
        
        # Convertir en dict si c'est un modèle Pydantic
        if hasattr(message, 'dict'):
            message_data = message.dict()
        else:
            message_data = dict(message)
        
        count = 0
        disconnected_users = []
        
        # Créer une copie des éléments pour éviter les problèmes de concurrence
        users = list(self.active_groups[group_id].items())
        
        for user_id, websocket in users:
            if user_id == exclude_user_id:
                continue
                
            try:
                await websocket.send_json(message_data)
                count += 1
            except Exception as e:
                logger.warning(f"Erreur de diffusion à l'utilisateur {user_id}: {e}")
                disconnected_users.append((user_id, websocket))
        
        # Nettoyer les connexions défaillantes
        for user_id, websocket in disconnected_users:
            await self.disconnect(websocket, user_id, group_id)
        
        return count
    
    def get_connected_users(
        self, 
        group_id: int, 
        db: Optional[Session] = None
    ) -> List[Dict[str, Any]]:
        """
        Récupérer la liste des utilisateurs connectés à un groupe.
        
        Args:
            group_id: ID du groupe
            db: Session SQLAlchemy optionnelle pour plus d'informations
            
        Returns:
            Liste des utilisateurs connectés avec leurs informations
        """
        if group_id not in self.active_groups:
            return []
        
        user_ids = list(self.active_groups[group_id].keys())
        
        # Si pas de session DB, retourner juste les IDs
        if db is None:
            return [{"id": uid} for uid in user_ids]
        
        # Sinon, récupérer plus d'informations depuis la base de données
        try:
            users = db.query(models.User).filter(
                models.User.id.in_(user_ids)
            ).all()
            
            return [
                {
                    "id": user.id,
                    "username": user.username,
                    "profile_photo": user.profile_photo,
                    "is_online": True
                }
                for user in users
            ]
            
        except Exception as e:
            logger.error(f"Erreur lors de la récupération des utilisateurs: {e}")
            return [{"id": uid} for uid in user_ids]
    
    def is_user_online(self, user_id: int, group_id: Optional[int] = None) -> bool:
        """
        Vérifier si un utilisateur est en ligne.
        
        Args:
            user_id: ID de l'utilisateur
            group_id: Optionnel, vérifie dans un groupe spécifique
            
        Returns:
            bool: True si l'utilisateur est en ligne
        """
        if group_id is not None:
            return (
                group_id in self.active_groups and 
                user_id in self.active_groups[group_id]
            )
        return user_id in self.user_connections
    
    async def disconnect_user(self, user_id: int, group_id: Optional[int] = None) -> int:
        """
        Déconnecter un utilisateur d'un groupe ou de tous les groupes.
        
        Args:
            user_id: ID de l'utilisateur à déconnecter
            group_id: Optionnel, ID du groupe spécifique
            
        Returns:
            int: Nombre de connexions fermées
        """
        count = 0
        
        if group_id is not None:
            # Déconnexion d'un groupe spécifique
            if group_id in self.active_groups and user_id in self.active_groups[group_id]:
                websocket = self.active_groups[group_id][user_id]
                await self.disconnect(websocket, user_id, group_id)
                count += 1
        else:
            # Déconnexion de tous les groupes
            if user_id in self.user_connections:
                for gid, websocket in list(self.user_connections[user_id].items()):
                    await self.disconnect(websocket, user_id, gid)
                    count += 1
        
        return count

# Global instance
manager = ConnectionManager()