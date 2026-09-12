from pydantic import BaseModel, Field, field_validator


class MeetingBrief(BaseModel):
    prospect_name: str = Field(min_length=1, max_length=120)
    company: str = Field(min_length=1, max_length=160)
    role: str = Field(default="", max_length=160)
    stake: str = Field(min_length=1, max_length=2000)
    goal: str = Field(min_length=1, max_length=2000)
    expected_objections: list[str] = Field(default_factory=list)
    tone: str = Field(default="professionnel et direct", max_length=200)
    target_duration_min: int = Field(default=10, ge=1, le=60)

    @field_validator("role", "tone")
    @classmethod
    def _nettoyer(cls, v: str) -> str:
        return v.strip()

    @field_validator("prospect_name", "company", "stake", "goal")
    @classmethod
    def _non_vide(cls, v: str) -> str:
        nettoye = v.strip()
        if not nettoye:
            raise ValueError("Ce champ ne peut pas être vide.")
        return nettoye
