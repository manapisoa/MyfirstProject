# Mon Projet FastAPI avec Docker

Ce projet est une application FastAPI conteneurisée avec Docker et PostgreSQL.

## Prérequis

- Docker (version 20.10.0 ou supérieure)
- Docker Compose (version 1.29.0 ou supérieure)

## Installation

1. Clonez le dépôt :
   ```bash
   git clone [URL_DU_DEPOT]
   cd myfirstproject
   ```

2. Copiez le fichier `.env.example` vers `.env` et modifiez les variables selon vos besoins :
   ```bash
   cp .env.example .env
   ```

## Démarrage de l'application

Pour démarrer l'application avec Docker Compose :

```bash
docker-compose up --build
```

L'application sera disponible à l'adresse : http://localhost:8000

## Accès aux services

- **API** : http://localhost:8000
- **Documentation interactive (Swagger UI)** : http://localhost:8000/docs
- **Documentation alternative (ReDoc)** : http://localhost:8000/redoc
- **Base de données PostgreSQL** :
  - Hôte : localhost
  - Port : 5432
  - Base de données : fastapi_db
  - Utilisateur : postgres
  - Mot de passe : postgres

## Commandes utiles

- **Arrêter les conteneurs** :
  ```bash
  docker-compose down
  ```

- **Voir les logs** :
  ```bash
  docker-compose logs -f
  ```

- **Accéder au conteneur de l'application** :
  ```bash
  docker-compose exec web bash
  ```

- **Exécuter les migrations Alembic** :
  ```bash
  docker-compose exec web alembic upgrade head
  ```

- **Créer une nouvelle migration** :
  ```bash
  docker-compose exec web alembic revision --autogenerate -m "Description des changements"
  ```

## Environnement de développement

- Le code source est monté dans le conteneur, donc les modifications sont reflétées immédiatement.
- Le serveur de développement Uvicorn recharge automatiquement l'application lors des changements de code.

## Déploiement en production

Pour le déploiement en production, assurez-vous de :
1. Modifier les variables d'environnement dans le fichier `.env`
2. Désactiver le mode debug : `DEBUG=False`
3. Configurer correctement les paramètres de sécurité (SECRET_KEY, etc.)
4. Configurer un reverse proxy comme Nginx
5. Mettre en place un certificat SSL avec Let's Encrypt

## Licence

[MIT](LICENSE)
