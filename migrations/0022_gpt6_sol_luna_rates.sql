-- Keep earlier model rates and saved estimates intact for historical observations.
-- Standard short-context text-token rates checked 2026-09-23.
INSERT INTO provider_cost_rates (model, version, input_usd_per_million, cached_usd_per_million, output_usd_per_million) VALUES
 ('gpt-6-sol', 'openai-standard-short-2026-09-23', 2, 0.2, 10),
 ('gpt-6-luna', 'openai-standard-short-2026-09-23', 0.1, 0.01, 0.5);
