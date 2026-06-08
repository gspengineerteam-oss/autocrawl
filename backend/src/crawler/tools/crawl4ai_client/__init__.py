"""Crawl4AI integration: scrape, extract, find_pdfs.

Public surface:

    from .client import c4ai_scrape, c4ai_extract, c4ai_find_pdfs, c4ai_close
"""

from .client import c4ai_close, c4ai_extract, c4ai_find_pdfs, c4ai_scrape, c4ai_scrape_many

__all__ = [
    "c4ai_close",
    "c4ai_extract",
    "c4ai_find_pdfs",
    "c4ai_scrape",
    "c4ai_scrape_many",
]
