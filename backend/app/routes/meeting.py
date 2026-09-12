from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_llm
from app.llm.ollama import LlmClient
from app.meeting.brief import MeetingBrief
from app.meeting.script import Script, generate_script

router = APIRouter(prefix="/api/meeting", tags=["meeting"])

@router.post("/script")
async def creer_script(
    brief: MeetingBrief, llm: LlmClient = Depends(get_llm)
) -> Script:
    try:
        return await generate_script(llm, brief)
    except ValueError as err:
        raise HTTPException(422, detail=str(err)) from err
    except RuntimeError as err:
        raise HTTPException(503, detail=str(err)) from err
