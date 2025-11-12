# LiveCode & Chat - Frontend

Application d'édition de code collaborative en temps réel avec chat intégré, construite avec React, Vite, Tailwind CSS et Socket.IO.

## Fonctionnalités

- Édition de code collaborative en temps réel
- Chat intégré avec messages instantanés
- Système de salles pour la collaboration
- Coloration syntaxique et thèmes pour l'éditeur de code
- Interface utilisateur moderne et réactive

## Technologies utilisées

- **Frontend**: React 18, Vite, Tailwind CSS
- **Éditeur de code**: Monaco Editor
- **Temps réel**: Socket.IO Client
- **Routing**: React Router
- **Icônes**: React Icons

## Prérequis

- Node.js (version 18 ou supérieure)
- npm ou yarn
- Backend FastAPI en cours d'exécution (par défaut sur http://localhost:8000)

## Installation

1. Cloner le dépôt
2. Installer les dépendances :

```bash
cd frontend
npm install
```

## Configuration

Créez un fichier `.env` à la racine du projet avec les variables d'environnement suivantes :

```env
VITE_API_URL=http://localhost:8000
```

## Démarrage en mode développement

```bash
npm run dev
```

L'application sera disponible à l'adresse [http://localhost:5173](http://localhost:5173)

## Structure du projet

```
src/
├── components/         # Composants React
│   ├── Chat/          # Composant de chat
│   ├── CodeEditor/    # Éditeur de code
│   └── RoomSelector/  # Sélecteur de salle
├── context/           # Contexte React
├── hooks/             # Hooks personnalisés
├── utils/             # Utilitaires
├── App.jsx            # Composant principal
└── main.jsx           # Point d'entrée de l'application
```

## Variables d'environnement

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| VITE_API_URL | URL de l'API backend | http://localhost:8000 |

## Scripts disponibles

- `npm run dev` - Lance le serveur de développement
- `npm run build` - Compile l'application pour la production
- `npm run preview` - Prévoyez l'application de production localement
- `npm run lint` - Exécute le linter

## Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus d'informations.
