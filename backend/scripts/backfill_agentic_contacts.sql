-- Backfill agentic-enriched vendors' structured contacts + address from
-- raw_extracts.agentic_email/phone/address. Idempotent — only writes
-- when target field is empty.
--
-- Usage:
--   docker compose exec autocrawl-db psql -U postgres -d autocrawl \
--       -f /backfill_agentic_contacts.sql
-- (or copy SQL inline as we do in dev)

UPDATE vendors
SET contacts = (
  SELECT jsonb_agg(elem) FROM (
    SELECT jsonb_build_object(
      'type', 'email',
      'value', raw_extracts->>'agentic_email',
      'label', NULL,
      'verified', NULL,
      'verification_score', NULL,
      'verification_signals', NULL
    ) AS elem
    WHERE raw_extracts->>'agentic_email' IS NOT NULL
      AND raw_extracts->>'agentic_email' <> ''
      AND raw_extracts->>'agentic_email' LIKE '%@%'
    UNION ALL
    SELECT jsonb_build_object(
      'type', 'phone',
      'value', raw_extracts->>'agentic_phone',
      'label', NULL,
      'verified', NULL,
      'verification_score', NULL,
      'verification_signals', NULL
    )
    WHERE raw_extracts->>'agentic_phone' IS NOT NULL
      AND raw_extracts->>'agentic_phone' <> ''
      AND raw_extracts->>'agentic_phone' NOT ILIKE '%not %'
      AND raw_extracts->>'agentic_phone' NOT ILIKE '%explicit%'
  ) sub
)
WHERE 'agentic_enrich' = ANY(SELECT jsonb_array_elements_text(source_tags))
  AND (contacts IS NULL OR contacts = '[]'::jsonb)
  AND (
    raw_extracts->>'agentic_email' IS NOT NULL
    OR raw_extracts->>'agentic_phone' IS NOT NULL
  );

UPDATE vendors
SET address = jsonb_build_object(
  'street', NULL,
  'city', NULL,
  'region', NULL,
  'country', raw_extracts->>'agentic_country_extracted',
  'postal_code', NULL,
  'raw', raw_extracts->>'agentic_address'
)
WHERE 'agentic_enrich' = ANY(SELECT jsonb_array_elements_text(source_tags))
  AND (address IS NULL OR address = '{}'::jsonb OR address->>'raw' IS NULL)
  AND raw_extracts->>'agentic_address' IS NOT NULL
  AND raw_extracts->>'agentic_address' <> ''
  AND raw_extracts->>'agentic_address' NOT ILIKE '%not %';
