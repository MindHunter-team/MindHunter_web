"""
High-Availability LLM Client
- Primary: OpenAI-compatible endpoint (qwen-max)
- Fallback: Anthropic-compatible endpoint
- Automatic retry with model switching on failure
"""
import os
import json
import logging
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "")
ANTHROPIC_BASE_URL = os.getenv("ANTHROPIC_BASE_URL", "")

logger = logging.getLogger("llm_client")


async def call_openai(system_prompt: str, user_prompt: str) -> str:
    """Call OpenAI-compatible endpoint."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=API_KEY, base_url=OPENAI_BASE_URL)

    response = await client.chat.completions.create(
        model="qwen-max",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        max_tokens=2048,
        response_format={"type": "json_object"},
        timeout=60.0,
    )
    return response.choices[0].message.content or ""


async def call_anthropic(system_prompt: str, user_prompt: str) -> str:
    """Call Anthropic-compatible endpoint."""
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=API_KEY, base_url=ANTHROPIC_BASE_URL)

    # Anthropic wants a JSON-only response, so we instruct accordingly
    full_prompt = f"{system_prompt}\n\nUser request:\n{user_prompt}\n\nRespond with valid JSON only, no markdown fences."

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        system=system_prompt,
        messages=[{"role": "user", "content": full_prompt}],
        timeout=60.0,
    )

    text = ""
    for block in response.content:
        if hasattr(block, "text"):
            text += block.text

    # Strip possible markdown code fences
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


async def call_llm(system_prompt: str, user_prompt: str) -> dict:
    """
    High-availability LLM call.
    Returns parsed JSON dict.
    Falls back from OpenAI → Anthropic on failure.
    """
    # --- Try OpenAI-compatible endpoint first ---
    try:
        logger.info("Calling OpenAI-compatible endpoint (qwen-max)...")
        raw = await call_openai(system_prompt, user_prompt)
        if raw:
            return json.loads(raw)
    except Exception as e:
        logger.warning(f"OpenAI call failed: {e}")
        logger.info("Switching to Anthropic endpoint...")

    # --- Fallback: Anthropic endpoint ---
    try:
        logger.info("Calling Anthropic-compatible endpoint...")
        raw = await call_anthropic(system_prompt, user_prompt)
        if raw:
            return json.loads(raw)
    except Exception as e:
        logger.error(f"Anthropic call also failed: {e}")

    # --- Both failed: return safe fallback ---
    logger.error("All LLM endpoints exhausted. Returning error placeholder.")
    return {
        "score": 0,
        "core_conclusion": "LLM call failed — all endpoints exhausted.",
        "evidence": "",
        "actionable_advice": "Please retry the review or check API connectivity.",
        "error": True,
    }
