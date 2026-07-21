# pdf_extractor.py
import re
import fitz  # PyMuPDF

def clean_extracted_text(text: str) -> str:
    """
    Clean extracted PDF text:
    1. Normalize line endings
    2. Remove extra spaces and blank lines
    3. Strip control characters
    """
    if not text:
        return ""
    
    text = text.replace('\r\n', '\n')
    text = re.sub(r'[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f-\xff]', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]{2,}', ' ', text)
    lines = [line.strip() for line in text.split('\n')]
    text = '\n'.join(lines)
    
    return text.strip()

def extract_pdf_to_text(pdf_path: str) -> tuple[str, str]:
    """
    Extract text from PDF file.
    Returns:
        full_text: cleaned full text
        header_text: first 2 pages text (for metadata extraction)
    """
    full_text_list = []
    header_text_list = []
    
    try:
        with fitz.open(pdf_path) as doc:
            for idx, page in enumerate(doc):
                page_text = page.get_text()
                full_text_list.append(page_text)
                
                if idx < 2:
                    header_text_list.append(page_text)
                    
        raw_full_text = "\n".join(full_text_list)
        raw_header_text = "\n".join(header_text_list)
        
        return clean_extracted_text(raw_full_text), clean_extracted_text(raw_header_text)
        
    except Exception as e:
        raise RuntimeError(f"PDF read/parse failed: {str(e)}")
