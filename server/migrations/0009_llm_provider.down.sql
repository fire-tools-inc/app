-- Removes the provider preset only; base URL, API key and model stay saved.
ALTER TABLE user_settings DROP COLUMN llm_provider;
