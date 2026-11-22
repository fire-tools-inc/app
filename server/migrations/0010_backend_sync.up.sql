-- Makes SQLite the source of truth for the app's settings, FIRE calculator,
-- asset allocation, cashflow and net worth data (GET/PATCH/PUT /state/{domain}).
--
-- * sync_meta.instance_id identifies this database so clients can tell a
--   restored or replaced database from the one they last synchronized with.
-- * sync_domains.revision is bumped by triggers on every write to a domain's
--   tables, including writes through the granular REST routes. Clients only
--   compare revisions for equality; one transaction may bump several times.
-- * position keeps the order of list items as the app shows them. Rows
--   created without a position (granular routes) sort after positioned rows,
--   in creation order.
CREATE TABLE sync_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT INTO sync_meta (key, value) VALUES ('instance_id', lower(hex(randomblob(16))));

CREATE TABLE sync_domains (
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain         TEXT    NOT NULL
        CHECK (domain IN ('settings','calculator','assetAllocation','expenseTracker','netWorth')),
    revision       INTEGER NOT NULL DEFAULT 0,
    initialized_at TEXT,
    updated_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, domain)
);

ALTER TABLE assets ADD COLUMN position INTEGER;
ALTER TABLE expense_entries ADD COLUMN position INTEGER;
ALTER TABLE income_entries ADD COLUMN position INTEGER;
ALTER TABLE category_budgets ADD COLUMN position INTEGER;
ALTER TABLE custom_categories ADD COLUMN position INTEGER;
ALTER TABLE category_overrides ADD COLUMN position INTEGER;
ALTER TABLE asset_holdings ADD COLUMN position INTEGER;
ALTER TABLE cash_entries ADD COLUMN position INTEGER;
ALTER TABLE pension_entries ADD COLUMN position INTEGER;
ALTER TABLE debt_entries ADD COLUMN position INTEGER;
ALTER TABLE tax_entries ADD COLUMN position INTEGER;
ALTER TABLE financial_operations ADD COLUMN position INTEGER;

-- FIRE variant inputs the calculator already uses.
ALTER TABLE calculator_inputs ADD COLUMN fire_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (fire_type IN ('standard','lean','barista','coast','fat'));
ALTER TABLE calculator_inputs ADD COLUMN lean_expense_multiplier REAL NOT NULL DEFAULT 0.7;
ALTER TABLE calculator_inputs ADD COLUMN fat_expense_multiplier REAL NOT NULL DEFAULT 2;
ALTER TABLE calculator_inputs ADD COLUMN barista_annual_income REAL NOT NULL DEFAULT 20000;
ALTER TABLE calculator_inputs ADD COLUMN coast_target_age INTEGER NOT NULL DEFAULT 65;

-- UI language; NULL keeps the client's own choice.
ALTER TABLE user_settings ADD COLUMN language TEXT
    CHECK (language IS NULL OR language IN ('en','it','fr','de','es'));

-- Asset class targets of the Asset Allocation page.
CREATE TABLE asset_class_targets (
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_class    TEXT    NOT NULL
        CHECK (asset_class IN ('STOCKS','BONDS','CASH','CRYPTO','REAL_ESTATE',
                               'COMMODITIES','VEHICLE','COLLECTIBLE','ART')),
    target_mode    TEXT    NOT NULL CHECK (target_mode IN ('PERCENTAGE','OFF','SET')),
    target_percent REAL,
    PRIMARY KEY (user_id, asset_class)
);

-- Revision triggers: one per table and write type.
CREATE TRIGGER sync_user_settings_insert AFTER INSERT ON user_settings BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'settings', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_user_settings_update AFTER UPDATE ON user_settings BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'settings', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_user_settings_delete AFTER DELETE ON user_settings BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'settings', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_calculator_inputs_insert AFTER INSERT ON calculator_inputs BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'calculator', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_calculator_inputs_update AFTER UPDATE ON calculator_inputs BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'calculator', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_calculator_inputs_delete AFTER DELETE ON calculator_inputs BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'calculator', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_assets_insert AFTER INSERT ON assets BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'assetAllocation', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_assets_update AFTER UPDATE ON assets BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'assetAllocation', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_assets_delete AFTER DELETE ON assets BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'assetAllocation', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_asset_class_targets_insert AFTER INSERT ON asset_class_targets BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'assetAllocation', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_asset_class_targets_update AFTER UPDATE ON asset_class_targets BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'assetAllocation', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_asset_class_targets_delete AFTER DELETE ON asset_class_targets BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'assetAllocation', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_tracker_config_insert AFTER INSERT ON expense_tracker_config BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_tracker_config_update AFTER UPDATE ON expense_tracker_config BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_tracker_config_delete AFTER DELETE ON expense_tracker_config BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_planning_insert AFTER INSERT ON expense_planning BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_planning_update AFTER UPDATE ON expense_planning BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_planning_delete AFTER DELETE ON expense_planning BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_years_insert AFTER INSERT ON expense_years BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_years_update AFTER UPDATE ON expense_years BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_years_delete AFTER DELETE ON expense_years BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_months_insert AFTER INSERT ON expense_months BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_months_update AFTER UPDATE ON expense_months BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_months_delete AFTER DELETE ON expense_months BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_entries_insert AFTER INSERT ON expense_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_entries_update AFTER UPDATE ON expense_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_expense_entries_delete AFTER DELETE ON expense_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_income_entries_insert AFTER INSERT ON income_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_income_entries_update AFTER UPDATE ON income_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_income_entries_delete AFTER DELETE ON income_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_category_budgets_insert AFTER INSERT ON category_budgets BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_category_budgets_update AFTER UPDATE ON category_budgets BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_category_budgets_delete AFTER DELETE ON category_budgets BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_custom_categories_insert AFTER INSERT ON custom_categories BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_custom_categories_update AFTER UPDATE ON custom_categories BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_custom_categories_delete AFTER DELETE ON custom_categories BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_category_overrides_insert AFTER INSERT ON category_overrides BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_category_overrides_update AFTER UPDATE ON category_overrides BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_category_overrides_delete AFTER DELETE ON category_overrides BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'expenseTracker', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_net_worth_config_insert AFTER INSERT ON net_worth_config BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_net_worth_config_update AFTER UPDATE ON net_worth_config BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_net_worth_config_delete AFTER DELETE ON net_worth_config BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_net_worth_years_insert AFTER INSERT ON net_worth_years BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_net_worth_years_update AFTER UPDATE ON net_worth_years BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_net_worth_years_delete AFTER DELETE ON net_worth_years BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_net_worth_months_insert AFTER INSERT ON net_worth_months BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_net_worth_months_update AFTER UPDATE ON net_worth_months BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_net_worth_months_delete AFTER DELETE ON net_worth_months BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_asset_holdings_insert AFTER INSERT ON asset_holdings BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_asset_holdings_update AFTER UPDATE ON asset_holdings BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_asset_holdings_delete AFTER DELETE ON asset_holdings BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_cash_entries_insert AFTER INSERT ON cash_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_cash_entries_update AFTER UPDATE ON cash_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_cash_entries_delete AFTER DELETE ON cash_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_pension_entries_insert AFTER INSERT ON pension_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_pension_entries_update AFTER UPDATE ON pension_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_pension_entries_delete AFTER DELETE ON pension_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_debt_entries_insert AFTER INSERT ON debt_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_debt_entries_update AFTER UPDATE ON debt_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_debt_entries_delete AFTER DELETE ON debt_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_tax_entries_insert AFTER INSERT ON tax_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_tax_entries_update AFTER UPDATE ON tax_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_tax_entries_delete AFTER DELETE ON tax_entries BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_financial_operations_insert AFTER INSERT ON financial_operations BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_financial_operations_update AFTER UPDATE ON financial_operations BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT NEW.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER sync_financial_operations_delete AFTER DELETE ON financial_operations BEGIN
    INSERT INTO sync_domains (user_id, domain, revision)
    SELECT OLD.user_id, 'netWorth', 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    ON CONFLICT (user_id, domain) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP;
END;
