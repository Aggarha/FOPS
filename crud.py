from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import Release
from schemas import ReleaseCreate, ReleaseUpdate


def create_release(db: Session, release: ReleaseCreate) -> Release:
    db_release = Release(**release.model_dump())
    db.add(db_release)
    db.commit()
    db.refresh(db_release)
    return db_release


def get_all_releases(db: Session) -> list[Release]:
    return db.query(Release).order_by(Release.created_at.desc()).all()


def get_release_by_id(db: Session, release_id: int) -> Release | None:
    return db.query(Release).filter(Release.id == release_id).first()


def update_release(db: Session, release_id: int, release: ReleaseUpdate) -> Release | None:
    db_release = get_release_by_id(db, release_id)
    if not db_release:
        return None
    update_data = release.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_release, key, value)
    db.commit()
    db.refresh(db_release)
    return db_release


def delete_release(db: Session, release_id: int) -> bool:
    db_release = get_release_by_id(db, release_id)
    if not db_release:
        return False
    db.delete(db_release)
    db.commit()
    return True


def get_missing_data(db: Session) -> list[Release]:
    return db.query(Release).filter(
        or_(
            Release.artwork_link.is_(None),
            Release.artwork_link == "",
            Release.metadata_link.is_(None),
            Release.metadata_link == "",
            Release.lyrics_link.is_(None),
            Release.lyrics_link == "",
            Release.youtube_link.is_(None),
            Release.youtube_link == "",
        )
    ).order_by(Release.created_at.desc()).all()
