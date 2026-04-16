from typing import Tuple

from config import AVAILABLE_MODELS
from schemas import CoverLetterRequest, ScoreJobRequest, GenerateResumeRequest, ParseResumeRequest, AnswerFormFieldsRequest

# --- Stop tokens by format ---

LLAMA_STOP_TOKENS = ["<|eot_id|>", "<|start_header_id|>", "<|end_of_text|>"]
CHATML_STOP_TOKENS = ["<|im_end|>", "<|endoftext|>"]


def get_stop_tokens(model_id: str) -> list:
    """Return the correct stop token list for the active model."""
    fmt = AVAILABLE_MODELS.get(model_id, {}).get("prompt_format", "llama3")
    return CHATML_STOP_TOKENS if fmt == "chatml" else LLAMA_STOP_TOKENS


# --- Format-specific prompt builders (internal, local models only) ---

def _build_llama3_prompt(system_msg: str, user_msg: str) -> str:
    return (
        f"<|begin_of_text|>"
        f"<|start_header_id|>system<|end_header_id|>\n\n{system_msg}<|eot_id|>"
        f"<|start_header_id|>user<|end_header_id|>\n\n{user_msg}<|eot_id|>"
        f"<|start_header_id|>assistant<|end_header_id|>\n\n"
    )


def _build_chatml_prompt(system_msg: str, user_msg: str) -> str:
    return (
        f"<|im_start|>system\n{system_msg}<|im_end|>\n"
        f"<|im_start|>user\n{user_msg}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )


# --- Public dispatcher (local models only) ---

def build_chat_prompt(system_msg: str, user_msg: str, model_id: str = "") -> str:
    """Build a chat prompt in the correct format for the given local model."""
    fmt = AVAILABLE_MODELS.get(model_id, {}).get("prompt_format", "llama3")
    if fmt == "chatml":
        return _build_chatml_prompt(system_msg, user_msg)
    return _build_llama3_prompt(system_msg, user_msg)


# ============================================================
# Provider-agnostic message builders
#
# Each returns (system_msg, user_msg) — no format tokens.
# Cloud providers use these directly.
# Local models wrap via build_chat_prompt() above.
# ============================================================

def build_score_job_messages(req: ScoreJobRequest, full_context: bool = False) -> Tuple[str, str]:
    """Build provider-agnostic messages for job scoring."""
    system_msg = (
        "You are an expert HR consultant evaluating job fit. "
        "Score how well a candidate matches a job on a scale of 1-10. "
        "Consider: skills match, experience level, location/remote fit, and salary alignment. "
        "Respond with ONLY a JSON object: {\"score\": <1-10>, \"reason\": \"<brief explanation>\"}"
    )

    user_parts = [f"Rate how well this candidate matches the {req.role} position at {req.company}."]

    if req.resume_text:
        text = req.resume_text if full_context else req.resume_text[:1500]
        user_parts.append(f"\n--- Candidate Resume ---\n{text}")

    if req.profile_summary:
        user_parts.append(f"\n--- Candidate Profile ---\n{req.profile_summary}")

    jd = req.job_description if full_context else req.job_description[:2000]
    user_parts.append(f"\n--- Job Description ---\n{jd}")
    user_parts.append("\nRespond with ONLY valid JSON: {\"score\": <1-10>, \"reason\": \"...\"}")

    return system_msg, "\n".join(user_parts)


def build_cover_letter_messages(req: CoverLetterRequest, full_context: bool = False) -> Tuple[str, str]:
    """Build provider-agnostic messages for cover letter generation."""
    style = getattr(req, "style", "classic") or "classic"

    if style == "modern":
        system_parts = [
            "You are an expert cover letter writer. Write concise, modern cover letters.",
            'Use a conversational-professional tone with a "Hi, I\'m [name]..." opener.',
            "Write a single concise paragraph that answers 'tell me about yourself' in relation to this role.",
            "Include relevant keywords from the job description naturally.",
            "Reference the company by name. Use optimistic, affirmative language.",
            "End with a confident call-to-action closing.",
        ]
    else:
        system_parts = [
            "You are an expert cover letter writer. Write professional, ATS-optimized cover letters.",
            "Include relevant keywords from the job description naturally.",
            "Reference the company by name and mention specific aspects of the role.",
            'Use a formal business tone with a "Dear Hiring Manager" salutation.',
            "Write 3-4 formal paragraphs emphasizing overlapping skills and experience.",
            "Use optimistic, affirmative language. End with a call-to-action closing.",
        ]

    if req.cover_letter_samples:
        if len(req.cover_letter_samples) == 1:
            system_parts.append(
                "Match the tone, style, and structure of the following root cover letter template "
                "provided by the candidate:"
            )
        else:
            system_parts.append(
                "Match the tone, style, and structure of the following sample cover letter(s). "
                "The first sample is the candidate's root template — prioritize its style above others:"
            )
        for i, sample in enumerate(req.cover_letter_samples[:3]):
            label = "Root Template" if i == 0 else f"Sample {i + 1}"
            text = sample if full_context else sample[:2000]
            system_parts.append(f"\n--- {label} ---\n{text}")

    if req.resume_text:
        text = req.resume_text if full_context else req.resume_text[:1500]
        system_parts.append(f"\n--- Candidate Resume ---\n{text}")

    user_parts = [
        f"Write a cover letter for {req.candidate_name} applying to the {req.role} position at {req.company}.",
    ]
    if req.location:
        user_parts.append(f"The job is located in {req.location}.")

    if req.experience_entries:
        user_parts.append("\n--- Candidate Experience (use to highlight relevant skills) ---")
        for entry in req.experience_entries[:5]:
            dates = f" ({entry.dates})" if entry.dates else ""
            skills = f" | Skills: {', '.join(entry.skills)}" if entry.skills else ""
            user_parts.append(f"- {entry.role} at {entry.company}{dates}{skills}")
            if entry.description:
                desc = entry.description if full_context else entry.description[:500]
                user_parts.append(f"  {desc}")

    if req.job_description:
        jd = req.job_description if full_context else req.job_description[:2000]
        user_parts.append(f"\nJob Description:\n{jd}")
        user_parts.append(
            "\nHighlight skills and experience from the candidate's background that directly match "
            "the job requirements. Use specific keywords from the job description where they genuinely apply."
        )

    user_parts.append("\nWrite only the cover letter text. Do not include any commentary or explanation.")
    user_msg = " ".join(user_parts) if not req.job_description else "\n".join(user_parts)

    return "\n".join(system_parts), user_msg


def build_resume_messages(req: GenerateResumeRequest, full_context: bool = False) -> Tuple[str, str]:
    """Build provider-agnostic messages for resume generation."""
    system_parts = [
        "You are an expert resume writer specializing in ATS-optimized, targeted resumes.",
        "Craft a professional resume tailored to the specific job, highlighting the most relevant experience.",
        "Use quantified achievements and action verbs. Match keywords from the job description naturally.",
        "Structure: Contact header (name only), Professional Summary, Experience (most relevant first), Skills.",
        "Keep it concise — ideally 1-2 pages worth of content.",
        "Do NOT fabricate experience. Only use what is provided in the candidate's experience entries.",
    ]

    if req.existing_resume_text:
        system_parts.append(
            "\nUse the following existing resume as a style and formatting reference:"
        )
        text = req.existing_resume_text if full_context else req.existing_resume_text[:2000]
        system_parts.append(f"\n--- Existing Resume ---\n{text}")

    user_parts = [
        f"Generate a tailored resume for {req.candidate_name} applying to the {req.role} position at {req.company}.",
    ]

    if req.job_description:
        jd = req.job_description if full_context else req.job_description[:2000]
        user_parts.append(f"\n--- Job Description ---\n{jd}")

    user_parts.append("\n--- Candidate Experience ---")
    for entry in req.experience_entries:
        dates = f" ({entry.dates})" if entry.dates else ""
        skills = f"\nSkills: {', '.join(entry.skills)}" if entry.skills else ""
        desc = entry.description if full_context else entry.description[:1500]
        user_parts.append(
            f"\n## {entry.role} at {entry.company}{dates}{skills}\n{desc}"
        )

    user_parts.append(
        "\nWrite only the resume content. No commentary, no explanations. "
        "Prioritize experience most relevant to the target role."
    )

    return "\n".join(system_parts), "\n".join(user_parts)


def build_parse_resume_messages(req: ParseResumeRequest) -> Tuple[str, str]:
    """Build provider-agnostic messages for resume parsing. No truncation needed — full text always."""
    system_msg = (
        "You are an expert resume parser. Extract ALL structured entries from the ENTIRE resume text.\n"
        "This includes: work experience, sabbaticals/career breaks, key projects, education, and publications.\n\n"
        "For each entry, extract: company name, role/title, start date (YYYY-MM), "
        "end date (YYYY-MM, or null if current — words like 'Present', 'Current', 'Ongoing' mean null), "
        "description, and a list of skills/technologies mentioned.\n\n"
        "How to map different resume sections into the schema:\n"
        "- Work experience: company = employer name, role = job title\n"
        "- Sabbatical/career break: company = 'Sabbatical', role = 'Career Break'\n"
        "- Key projects: company = project name, role = 'Project'\n"
        "- Education: company = university/school name, role = degree (e.g. 'B.S. Information'), use year dates\n"
        "- Publications: company = 'Publications', role = 'Author', each publication as a bullet in description\n\n"
        "IMPORTANT: For the description field, preserve the original bullet points exactly as written in the resume. "
        "Use a newline-separated list with '- ' prefix for each bullet. Do NOT summarize or combine bullets into prose. "
        "Copy each bullet point verbatim from the resume.\n\n"
        "Respond with ONLY a valid JSON array of objects. Each object must have these fields:\n"
        '{"company": "...", "role": "...", "start_date": "YYYY-MM", "end_date": "YYYY-MM or null", '
        '"description": "- bullet 1\\n- bullet 2\\n- bullet 3", "skills": ["..."]}\n\n'
        "CRITICAL: If the end date says 'Present', 'Current', 'Ongoing', or similar, set end_date to null — do NOT use the start_date or any date value.\n"
        "If dates are ambiguous (e.g. just a year), use YYYY-01 as the month. "
        "Parse the ENTIRE resume from top to bottom — do not stop early or skip sections.\n"
        "If no entries can be found, return an empty array []."
    )

    user_msg = f"Parse the following resume and extract ALL entries (experience, projects, education, publications):\n\n{req.resume_text}"

    return system_msg, user_msg


# ============================================================
# Legacy prompt builders (kept for backward compat, delegate to messages)
# ============================================================

def build_score_job_prompt(req: ScoreJobRequest, model_id: str = "") -> str:
    system_msg, user_msg = build_score_job_messages(req, full_context=False)
    return build_chat_prompt(system_msg, user_msg, model_id)


def build_cover_letter_prompt(req: CoverLetterRequest, model_id: str = "") -> str:
    system_msg, user_msg = build_cover_letter_messages(req, full_context=False)
    return build_chat_prompt(system_msg, user_msg, model_id)


def build_resume_prompt(req: GenerateResumeRequest, model_id: str = "") -> str:
    system_msg, user_msg = build_resume_messages(req, full_context=False)
    return build_chat_prompt(system_msg, user_msg, model_id)


def build_parse_resume_prompt(req: ParseResumeRequest, model_id: str = "") -> str:
    system_msg, user_msg = build_parse_resume_messages(req)
    return build_chat_prompt(system_msg, user_msg, model_id)


def build_answer_form_fields_messages(req: AnswerFormFieldsRequest, full_context: bool = False) -> Tuple[str, str]:
    """Build provider-agnostic messages for answering skipped form fields."""
    system_msg = (
        "You are an expert job application assistant. The candidate is applying for a job and "
        "some form fields could not be auto-filled. Using the candidate's profile and experience, "
        "suggest the best answer for each field.\n\n"
        "Rules:\n"
        "- For dropdown/select fields, you MUST pick one of the provided options exactly as written.\n"
        "- For text fields, write a concise, professional answer.\n"
        "- If a field asks about years of experience, calculate from the candidate's work history.\n"
        "- If you cannot confidently answer a field, set confidence to 'low'.\n"
        "- Do NOT fabricate information. Only use what is provided.\n\n"
        "Respond with ONLY a valid JSON array. Each object must have:\n"
        '{"label": "...", "suggested_value": "...", "confidence": "high|medium|low", "reasoning": "brief explanation"}'
    )

    user_parts = []

    if req.company or req.role:
        user_parts.append(f"The candidate is applying to: {req.role} at {req.company}")

    # Candidate profile
    if req.candidate_profile:
        user_parts.append("\n--- Candidate Profile ---")
        for key, val in req.candidate_profile.items():
            if val:
                user_parts.append(f"- {key}: {val}")

    # Experience
    if req.experience_entries:
        user_parts.append("\n--- Work Experience ---")
        for entry in req.experience_entries[:8]:
            dates = f" ({entry.dates})" if entry.dates else ""
            skills = f" | Skills: {', '.join(entry.skills)}" if entry.skills else ""
            user_parts.append(f"- {entry.role} at {entry.company}{dates}{skills}")
            if entry.description:
                desc = entry.description if full_context else entry.description[:500]
                user_parts.append(f"  {desc}")

    # Job description
    if req.job_description:
        jd = req.job_description if full_context else req.job_description[:1500]
        user_parts.append(f"\n--- Job Description ---\n{jd}")

    # Form fields to answer
    user_parts.append("\n--- Form Fields to Answer ---")
    for field in req.form_fields:
        line = f"- {field.label} (type: {field.type}, required: {field.required})"
        if field.options:
            line += f"\n  Options: {', '.join(field.options)}"
        user_parts.append(line)

    user_parts.append("\nRespond with ONLY a valid JSON array of answers.")

    return system_msg, "\n".join(user_parts)
