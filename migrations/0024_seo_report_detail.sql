-- Row-level keyword and backlink detail, collected separately from the aggregate
-- report. Existing reports keep NULL and remain explicitly "not collected".
ALTER TABLE seo_reports ADD COLUMN detail_json TEXT;
ALTER TABLE seo_reports ADD COLUMN detail_retrieved_at INTEGER;
