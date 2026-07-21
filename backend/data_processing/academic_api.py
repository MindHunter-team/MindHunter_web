# academic_api.py
import os
import json
import requests
from openai import OpenAI

def get_qwen_client():
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        raise ValueError("DASHSCOPE_API_KEY not found. Please set it in evaluation_agents/.env")
    
    return OpenAI(
        api_key=api_key,
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    )

def extract_metadata_via_qwen(header_text: str) -> dict:
    """Call QWEN to extract metadata from first 2 pages of PDF text."""
    client = get_qwen_client()
    
    system_prompt = (
        "You are an expert scientific literature metadata extractor. "
        "Analyze the text extracted from the first two pages of a paper and extract the: "
        "1. Paper Title ('title')\n"
        "2. List of Author Names ('authors', as a list of strings)\n"
        "3. Journal/Conference Name if mentioned ('journal_candidate')\n\n"
        "You must respond ONLY with a valid JSON object matching this structure:\n"
        "{\n"
        "  \"title\": \"string\",\n"
        "  \"authors\": [\"string\"],\n"
        "  \"journal_candidate\": \"string\"\n"
        "}"
    )
    
    user_prompt = f"Here is the text extracted from the header pages:\n\n{header_text[:4000]}"
    
    try:
        response = client.chat.completions.create(
            model="qwen-plus",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"}, 
            temperature=0.1  
        )
        
        result_json = json.loads(response.choices[0].message.content)
        return result_json
    except Exception as e:
        print(f"[Warning] QWEN metadata extraction failed: {str(e)}")
        return {"title": "Unknown Title", "authors": [], "journal_candidate": ""}

def evaluate_journal_level_via_qwen(journal_name: str) -> str:
    """Call QWEN to evaluate journal/conference academic tier."""
    if not journal_name or journal_name.lower() == "unknown":
        return "Unknown Level"
        
    client = get_qwen_client()
    
    system_prompt = (
        "You are an academic evaluation expert. Given a journal or conference name, "
        "determine its academic tier or rating commonly recognized in China, such as:\n"
        "- CCF Category (A, B, C) if it is in computer science.\n"
        "- SCI Quartile / Zone (Q1, Q2, Q3, Q4) / CAS Zone.\n"
        "- Core Journal for Chinese publications.\n"
        "Be extremely concise. Return ONLY the JSON object with the key 'level'."
    )
    
    user_prompt = f"Journal/Conference Name: {journal_name}"
    
    try:
        response = client.chat.completions.create(
            model="qwen-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        result = json.loads(response.choices[0].message.content)
        return result.get("level", "Unknown Level")
    except Exception as e:
        print(f"[Warning] QWEN journal level evaluation failed: {str(e)}")
        return "Unknown Level"

def query_semantic_scholar_api(title: str) -> dict:
    """Query Semantic Scholar API for citation count and venue."""
    base_url = "https://api.semanticscholar.org/graph/v1/paper/search"
    params = {
        "query": title,
        "limit": 1,
        "fields": "title,citationCount,venue,year"
    }
    
    headers = {
        "User-Agent": "ChallengeCup-AgentFlow/1.0"
    }
    
    try:
        response = requests.get(base_url, params=params, headers=headers, timeout=8)
        if response.status_code == 200:
            data = response.json()
            if data.get("total", 0) > 0 and len(data.get("data", [])) > 0:
                best_match = data["data"][0]
                return {
                    "matched_title": best_match.get("title"),
                    "citations": best_match.get("citationCount", 0),
                    "venue": best_match.get("venue") or "Unknown Venue",
                    "year": best_match.get("year")
                }
        print(f"[Warning] Semantic Scholar no match, Status: {response.status_code}")
    except Exception as e:
        print(f"[Warning] Semantic Scholar API error: {str(e)}")
        
    return {}
