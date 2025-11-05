from typing import Generator
from sqlalchemy.orm import Session
import database

def get_db() -> Generator[Session, None, None]:
    """Dependency that provides a database session."""
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()
