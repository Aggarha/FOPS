"""
FOPS Credits Formatter API Routes
Endpoints for parsing, formatting, and normalizing music credits
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.credits_formatter import (
    format_credits,
    normalize_role,
    transliterate_arabic,
)

router = APIRouter(prefix="/api/credits", tags=["Credits Formatter"])


# ===== REQUEST/RESPONSE MODELS =====
class CreditsFormatRequest(BaseModel):
    """Request body for formatting credits"""
    text: str
    language: Optional[str] = "auto"  # auto, en, ar


class RoleNormalizeRequest(BaseModel):
    """Request body for role normalization"""
    role: str
    language: Optional[str] = "auto"


class TransliterateRequest(BaseModel):
    """Request body for Arabic transliteration"""
    text: str


# ===== ENDPOINTS =====
@router.post("/format")
async def format_credits_endpoint(request: CreditsFormatRequest):
    """
    Format and parse credits text
    
    Returns structured credits with normalized roles, deduplication, and formatting
    
    Example input:
    ```
    Composition
    محمد فتشي
    منتظر الزايد
    
    Lyrics
    علي محمود
    ```
    """
    try:
        result = format_credits(request.text)
        return {
            "success": True,
            "status": result["status"],
            "data": result["data"],
            "formatted": result["formatted_text"],
        }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error formatting credits: {str(e)}"
        )


@router.post("/format/batch")
async def format_multiple_credits(texts: list[CreditsFormatRequest]):
    """
    Format multiple credit blocks at once
    
    Useful for processing multiple release credits together
    """
    try:
        results = []
        for request in texts:
            result = format_credits(request.text)
            results.append({
                "input": request.text[:100] + ("..." if len(request.text) > 100 else ""),
                "success": True,
                "data": result["data"],
            })
        
        return {
            "success": True,
            "count": len(results),
            "results": results,
        }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error formatting credits: {str(e)}"
        )


@router.post("/roles/normalize")
async def normalize_role_endpoint(request: RoleNormalizeRequest):
    """
    Normalize a role name
    
    Converts Arabic/English role names to standardized English format
    
    Example inputs:
    - "Composition" → "Composition"
    - "الحان" → "Composition"
    - "Sound Engineering" → "Sound Engineering"
    - "هندسة صوت" → "Sound Engineering"
    """
    try:
        result = normalize_role(request.role)
        return {
            "success": True,
            "input": result["input"],
            "normalized": result["normalized"],
            "arabic_original": result["arabic_original"],
            "is_arabic_input": result["is_arabic_input"],
        }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error normalizing role: {str(e)}"
        )


@router.post("/roles/normalize-batch")
async def normalize_multiple_roles(roles: list[str]):
    """
    Normalize multiple role names at once
    """
    try:
        results = []
        for role in roles:
            result = normalize_role(role)
            results.append(result)
        
        return {
            "success": True,
            "count": len(results),
            "results": results,
        }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error normalizing roles: {str(e)}"
        )


@router.post("/transliterate")
async def transliterate_endpoint(request: TransliterateRequest):
    """
    Transliterate Arabic text to English
    
    Example:
    - "محمد فتشي" → "Mohamed Fathy"
    - "هندسة صوت" → "Sound Engineering"
    """
    try:
        result = transliterate_arabic(request.text)
        return {
            "success": True,
            "input": result["input"],
            "output": result["output"],
            "is_arabic": result["is_arabic"],
        }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error transliterating text: {str(e)}"
        )


@router.post("/transliterate-batch")
async def transliterate_multiple(texts: list[str]):
    """
    Transliterate multiple text blocks at once
    """
    try:
        results = []
        for text in texts:
            result = transliterate_arabic(text)
            results.append(result)
        
        return {
            "success": True,
            "count": len(results),
            "results": results,
        }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error transliterating text: {str(e)}"
        )


@router.get("/health")
async def health_check():
    """Health check for credits formatter service"""
    return {
        "status": "healthy",
        "service": "credits_formatter",
        "features": [
            "credits_parsing",
            "role_normalization",
            "arabic_transliteration",
            "deduplication",
            "multi_language_support",
        ]
    }
