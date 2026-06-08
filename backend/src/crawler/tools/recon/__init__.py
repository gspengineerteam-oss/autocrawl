"""Passive recon utilities for vendor enrichment.

These modules query free OSINT sources to enrich a vendor profile with
context that's hard to scrape from the vendor's own website:

- `crtsh`: Certificate Transparency logs reveal subdomains owned by the
  same entity (e.g. `cloud.vendor.com`, `partners.vendor.com`).
- `urlscan`: Public URL scan database returns recent screenshots, tech
  stack, and HTTP behaviour for a domain.

Each module is best-effort. If the API is down or rate-limited, we return
None and let the enricher continue with whatever we already have.
"""
