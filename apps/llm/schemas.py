from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    active_model: Optional[str] = None
    memory_usage: Dict[str, Any]


class ModelStatusInfo(BaseModel):
    id: str
    name: str
    size_gb: float
    downloaded: bool
    active: bool
    status: str               # idle | downloading | loading | ready | error | unavailable
    download_progress: float  # 0-100
    current_step: str
    error: Optional[str] = None
    provider: str = "local"   # "local" | "claude" | "copilot" | "codex"
    context_window: int = 4096
    cli: bool = False         # True for CLI-based models


class ModelsStatusResponse(BaseModel):
    models: List[ModelStatusInfo]
    current_model: Optional[str] = None


class SwitchModelRequest(BaseModel):
    model_id: str


class SwitchModelResponse(BaseModel):
    ok: bool
    model: str
    status: str  # "downloading" | "loading" | "ready"


class DeleteModelRequest(BaseModel):
    model_id: str


class DeleteModelResponse(BaseModel):
    ok: bool
    model_id: str
    message: str


class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: List[float]
    model: str
    dimensions: int


class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 512
    model_id: Optional[str] = None
    cli_path: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    generation_time_s: float


class ScoreJobRequest(BaseModel):
    job_description: str
    company: str
    role: str
    resume_text: str = ""
    profile_summary: str = ""
    model_id: Optional[str] = None
    cli_path: Optional[str] = None


class ScoreJobResponse(BaseModel):
    score: int
    reason: str
    generation_time_s: float


class ExperienceEntryInput(BaseModel):
    company: str
    role: str
    dates: str = ""
    description: str
    skills: List[str] = []


class CoverLetterRequest(BaseModel):
    company: str
    role: str
    job_description: str = ""
    location: str = ""
    candidate_name: str
    cover_letter_samples: List[str] = []
    resume_text: str = ""
    experience_entries: List[ExperienceEntryInput] = []
    style: str = "classic"  # "classic" | "modern"
    temperature: float = 0.7
    max_length: int = 1024
    model_id: Optional[str] = None
    cli_path: Optional[str] = None


class CoverLetterResponse(BaseModel):
    cover_letter: str
    model_info: Dict[str, Any]
    usage: Dict[str, Any]
    generation_time_s: float


class GenerateResumeRequest(BaseModel):
    company: str
    role: str
    job_description: str = ""
    experience_entries: List[ExperienceEntryInput]
    candidate_name: str
    existing_resume_text: str = ""
    temperature: float = 0.7
    max_length: int = 2048
    model_id: Optional[str] = None
    cli_path: Optional[str] = None


class GenerateResumeResponse(BaseModel):
    resume_text: str
    model_info: Dict[str, Any]
    usage: Dict[str, Any]
    generation_time_s: float


class FormFieldInput(BaseModel):
    label: str
    type: str = "text"  # text | select | textarea | radio | checkbox
    required: bool = True
    options: List[str] = []


class AnswerFormFieldsRequest(BaseModel):
    form_fields: List[FormFieldInput]
    candidate_profile: Dict[str, Any] = {}
    experience_entries: List[ExperienceEntryInput] = []
    job_description: str = ""
    company: str = ""
    role: str = ""
    temperature: float = 0.3
    max_tokens: int = 1024
    model_id: Optional[str] = None
    cli_path: Optional[str] = None


class FormFieldAnswer(BaseModel):
    label: str
    suggested_value: str
    confidence: str = "medium"  # high | medium | low
    reasoning: str = ""


class AnswerFormFieldsResponse(BaseModel):
    answers: List[FormFieldAnswer]
    generation_time_s: float


class ParseResumeRequest(BaseModel):
    resume_text: str
    temperature: float = 0.3
    max_tokens: int = 4096
    model_id: Optional[str] = None
    cli_path: Optional[str] = None


class ParsedExperienceEntry(BaseModel):
    company: str
    role: str
    start_date: str = ""
    end_date: Optional[str] = None
    description: str
    skills: List[str] = []


class ParseResumeResponse(BaseModel):
    entries: List[ParsedExperienceEntry]
    generation_time_s: float
