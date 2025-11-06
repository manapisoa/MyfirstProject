""
Point d'entrée principal de l'application.
Permet de lancer l'application avec: python -m myfirstproject
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        workers=1
    )
