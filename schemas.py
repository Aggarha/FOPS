from datetime import datetime
from typing import Optional
from enum import Enum

from pydantic import BaseModel, Field


class ReleaseType(str, Enum):
    single = "single"
    album = "album"
    ep = "ep"
    concert = "concert"


class ReleaseStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    done = "done"


class ReleaseCreate(BaseModel):
    artist_name: str = Field(..., min_length=1)
    song_title: str = Field(..., min_length=1)
    release_type: ReleaseType
    upc: Optional[str] = None
    release_date: Optional[str] = None
    status: ReleaseStatus = ReleaseStatus.pending
    artwork_link: Optional[str] = None
    metadata_link: Optional[str] = None
    lyrics_link: Optional[str] = None
    youtube_link: Optional[str] = None


class ReleaseUpdate(BaseModel):
    artist_name: Optional[str] = None
    song_title: Optional[str] = None
    release_type: Optional[ReleaseType] = None
    upc: Optional[str] = None
    release_date: Optional[str] = None
    status: Optional[ReleaseStatus] = None
    artwork_link: Optional[str] = None
    metadata_link: Optional[str] = None
    lyrics_link: Optional[str] = None
    youtube_link: Optional[str] = None


class ReleaseResponse(BaseModel):
    id: int
    artist_name: str
    song_title: str
    release_type: str
    upc: Optional[str]
    release_date: Optional[str]
    status: str
    artwork_link: Optional[str]
    metadata_link: Optional[str]
    lyrics_link: Optional[str]
    youtube_link: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True
