-- Which preset configured the OpenAI-compatible model endpoint. NULL keeps
-- older configurations working; clients infer the preset from the base URL.
ALTER TABLE user_settings ADD COLUMN llm_provider TEXT
    CHECK (llm_provider IS NULL OR llm_provider IN ('local', 'openrouter', 'openai', 'gemini', 'anthropic', 'custom'));
