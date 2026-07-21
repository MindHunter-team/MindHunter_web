# data_processor.py
import json
import time
from document_extractor import extract_document_to_text
from academic_api import (
    extract_metadata_via_qwen,
    query_semantic_scholar_api,
    evaluate_journal_level_via_qwen
)

def process_document(file_path: str) -> dict:
    """
    Core interface called by main controller.
    Input: document path (.pdf / .docx / .txt)
    Output: standard JSON data dict
    """
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Parsing document: {file_path}")

    # Step 1: Extract text (auto-detects PDF/DOCX/TXT)
    full_text, header_text = extract_document_to_text(file_path)
    
    # Step 2: QWEN metadata extraction
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Extracting metadata via QWEN...")
    qwen_meta = extract_metadata_via_qwen(header_text)
    
    paper_title = qwen_meta.get("title", "Unknown Title")
    authors = qwen_meta.get("authors", [])
    journal_candidate = qwen_meta.get("journal_candidate", "")
    
    # Step 3: Semantic Scholar API for citations
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Querying Semantic Scholar...")
    api_meta = query_semantic_scholar_api(paper_title)
    
    citations = 0
    final_journal = journal_candidate or "Unknown"
    
    if api_meta:
        citations = api_meta.get("citations", 0)
        if api_meta.get("venue") and api_meta.get("venue") != "Unknown Venue":
            final_journal = api_meta.get("venue")
        print(f"-> API match! Citations: {citations}, Venue: {final_journal}")
    else:
        print("-> API no match, using QWEN fallback data")
        
    # Step 4: QWEN journal level evaluation
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Evaluating journal level...")
    journal_level = evaluate_journal_level_via_qwen(final_journal)
    
    # Step 5: Package standard output
    output_data = {
        "paper_info": {
            "title": paper_title,
            "authors": authors
        },
        "metadata": {
            "journal": final_journal,
            "journal_level": journal_level,
            "citations": citations
        },
        "full_text": full_text
    }
    
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Data processing complete!")
    return output_data
