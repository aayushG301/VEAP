"""Input/output guardrails for the first-aid assistant."""
import re

INJECTION = re.compile(r"(ignore (all|any|previous|prior)|system prompt|you are now|disregard|jailbreak|reveal your)", re.I)
DIAGNOSIS = re.compile(r"\b(diagnose|what disease|prescribe|dosage for)\b", re.I)
DISCLAIMER = "First call your local emergency number. This is general first-aid guidance, not a diagnosis or a substitute for professional care."


def sanitize(text: str) -> tuple[str, list[str]]:
    flags = []
    text = re.sub(r"[^\w\s,.?!'\-/()%]", " ", text)[:500]
    if INJECTION.search(text):
        flags.append("prompt_injection_attempt")
        text = INJECTION.sub(" ", text)
    if DIAGNOSIS.search(text):
        flags.append("diagnosis_request")
    return text.strip(), flags
