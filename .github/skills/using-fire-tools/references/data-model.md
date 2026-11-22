# Fire Tools data model for agents

Shapes match the app's TypeScript types in `src/types/`. Optional fields can be
omitted. Money is a JSON number; dates are `YYYY-MM-DD`.

## Common values

- Currencies: `EUR`, `USD`, `GBP`, `CHF`, `JPY`, `AUD`, `CAD`.
- Ids: any unique string. Mint `agent-<kind>-<uuid>` with
  `node scripts/fire-tools-api.mjs new-id <kind>` and reuse it for updates.

## Expense categories

Built-in ids, display names, the default Need/Want and typical descriptions.
Need/Want is decided per expense: the default is only a starting point (a
necessary train ticket is a Need, a weekend trip ticket is a Want).

| id | Name | Default | Typical descriptions |
| --- | --- | --- | --- |
| `HOUSING` | Housing | NEED | rent, mortgage, cleaning, home repairs, condominium fees |
| `UTILITIES` | Utilities & Bills | NEED | electricity, gas, water, internet, phone plan, heating |
| `GROCERIES` | Groceries | NEED | supermarket, market, weekly shop, grocery delivery |
| `DINING_OUT` | Dining Out | WANT | restaurant, lunch, dinner, coffee, takeaway, food delivery |
| `TRANSPORTATION` | Transportation | NEED | train, metro, bus, taxi, ride share, fuel, parking, tolls, bike repair |
| `HEALTHCARE` | Healthcare & Wellness | NEED | doctor, dentist, pharmacy, therapy, physiotherapy, optician |
| `PERSONAL_CARE` | Personal Care | WANT | barber, hairdresser, gym, cosmetics, toiletries, massage |
| `INSURANCE` | Insurance | NEED | health, car, home, life, liability or travel insurance |
| `DEBT_PAYMENTS` | Debt Payments | NEED | loan installments, credit card repayment, student loan |
| `EDUCATION` | Education | NEED | courses, tuition, textbooks, exams, certifications |
| `BUSINESS` | Business & Fees | NEED | bank and card fees, commissions, hosting, software licences, accountant |
| `SHOPPING` | Shopping | WANT | general online shopping, household items, home decor |
| `CLOTHING` | Clothing & Accessories | WANT | clothes, shoes, bags, accessories, fashion merchandise |
| `ELECTRONICS` | Electronics & Tech | WANT | laptop, phone, headphones, chargers, gadgets |
| `ENTERTAINMENT` | Entertainment | WANT | games, books, apps, one-off digital purchases |
| `LIFESTYLE_LEISURE` | Lifestyle & Leisure | WANT | cinema, theatre, museum, concerts, events, nights out |
| `MUSIC` | Music | NEED | instruments, lessons, studio time, sheet music |
| `COLLECTIBLES` | Hobbies & Collectibles | WANT | hobby supplies, collectibles, trading cards, models |
| `TRAVEL` | Travel & Holidays | WANT | flights, hotels, holiday rentals, trips |
| `SUBSCRIPTIONS` | Subscriptions | WANT | streaming, cloud storage, recurring memberships |
| `GIFTS_DONATIONS` | Gifts & Donations | WANT | presents, charity, crowdfunding |
| `OTHER` | Other | WANT | anything that fits nowhere else |
| `NO_CATEGORY` | No Category | WANT | not yet categorized; avoid when a better fit exists |

Before choosing, look at how this person already files similar descriptions
(`GET /expense-tracker/expenses?startDate=...` for a recent window) and follow
their habits over this table. Custom categories (`customCategories` in the
expense tracker state) are valid category ids too.

Income sources: `SALARY`, `FREELANCE`, `BUSINESS`, `INVESTMENTS`, `RENTAL`,
`PENSION`, `SOCIAL_SECURITY`, `BONUS`, `GIFT`, `OTHER`.

## Expense tracker records

| Record | Required | Optional |
| --- | --- | --- |
| Expense | `id`, `type: "expense"`, `date`, `amount` (>= 0), `description`, `category`, `expenseType` (`NEED`/`WANT`) | `currency`, `subCategory`, `isRecurring`, `unitAmount` and `quantity` together (amount = unitAmount x quantity) |
| Income | `id`, `type: "income"`, `date`, `amount` (>= 0), `description`, `source` | `currency`, `isRecurring` |
| Budget | `category`, `monthlyBudget` | `currency` |

Expense tracker config: `{ currency, currentYear, currentMonth }`.

## Asset allocation

Asset classes: `STOCKS`, `BONDS`, `CASH`, `CRYPTO`, `REAL_ESTATE`,
`COMMODITIES`, `VEHICLE`, `COLLECTIBLE`, `ART`.

Sub types by class (use `NONE` when unsure):

- Stocks and bonds: `ETF`, `SINGLE_STOCK`, `SINGLE_BOND`, `MONEY_ETF`, `REIT`, `PRIVATE_EQUITY`
- Cash: `SAVINGS_ACCOUNT`, `CHECKING_ACCOUNT`, `BROKERAGE_ACCOUNT`, `MONEY_ETF`
- Crypto: `COIN`
- Real estate: `PROPERTY`, `REIT`
- Commodities: `PHYSICAL_GOLD`, `GOLD_ETC`, `SILVER_ETC`, `OIL_ETC`, `NATURAL_GAS_ETC`, `COPPER_ETC`, `PLATINUM_ETC`, `PALLADIUM_ETC`, `AGRICULTURAL_ETC`, `COMMODITY_ETF`
- Vehicles: `CAR`, `MOTORCYCLE`, `BOAT`, `OTHER_VEHICLE`
- Collectibles: `WATCH`, `WINE`, `JEWELRY`, `SPORTS_MEMORABILIA`, `OTHER_COLLECTIBLE`
- Art: `PAINTING`, `SCULPTURE`, `DIGITAL_ART`, `OTHER_ART`

Asset: required `id`, `name`, `ticker` (may be `""`), `assetClass`,
`subAssetType`, `currentValue` (in the allocation currency), `targetMode`
(`PERCENTAGE`, `SET` or `OFF`). Optional `isin`, `shares`, `pricePerShare`,
`acquisitionPrice`, `originalCurrency`, `originalValue`, `targetPercent`,
`targetValue`, `institutionName`, `isPrimaryResidence`.

Targets per class: `{ "STOCKS": { "targetMode": "PERCENTAGE", "targetPercent": 70 }, ... }`.
Percentages across classes in `PERCENTAGE` mode should add up to 100.

## Net worth month

One snapshot per month with these lists (each record needs an `id`):

| List | Required | Enums |
| --- | --- | --- |
| `assets` | `ticker`, `name`, `shares`, `pricePerShare`, `currency`, `assetClass` | `STOCKS`, `BONDS`, `ETF`, `CRYPTO`, `REAL_ESTATE`, `PRIVATE_EQUITY`, `VEHICLE`, `COLLECTIBLE`, `ART`, `COMMODITIES`, `OTHER` |
| `cashEntries` | `accountName`, `accountType`, `balance`, `currency` | `SAVINGS`, `CHECKING`, `BROKERAGE`, `CREDIT_CARD`, `OTHER` |
| `pensions` | `name`, `currentValue`, `currency`, `pensionType` | `STATE`, `PRIVATE`, `EMPLOYER`, `OTHER` |
| `debts` | `name`, `debtType`, `currentBalance` (positive amount owed), `currency` | `CREDIT_CARD`, `PERSONAL_LOAN`, `STUDENT_LOAN`, `CAR_LOAN`, `MORTGAGE`, `OTHER` |
| `taxes` | `name`, `taxType`, `amount`, `currency`, `isPaid` | `INCOME_TAX`, `PROPERTY_TAX`, `CAPITAL_GAINS_TAX`, `OTHER` |
| `operations` | `date`, `type`, `description`, `amount`, `currency` | `PURCHASE`, `SALE`, `DIVIDEND`, `EXPENSE_REIMBURSEMENT`, `GIFT_RECEIVED`, `GIFT_GIVEN`, `TAX_PAID`, `CASH_TRANSFER`, `PENSION_CONTRIBUTION`, `PENSION_ADJUSTMENT`, `PRICE_UPDATE`, `OTHER` |

A holding's value is `shares x pricePerShare`; for a house or a car use
`shares: 1` and the value as the price. Month fields: `isFrozen` (closed
month), `monthNote`. Net worth config:
`{ defaultCurrency, currentYear, currentMonth, settings: { showPensionInNetWorth, includeUnrealizedGains, syncWithAssetAllocation? } }`.

## FIRE calculator inputs

All fields are required on `PUT /calculator/inputs`; read the current values first and
change only what the person told you.

| Field | Meaning |
| --- | --- |
| `initialSavings` | Current invested portfolio |
| `stocksPercent`, `bondsPercent`, `cashPercent` | Portfolio split, sums to 100 |
| `currentAnnualExpenses`, `fireAnnualExpenses` | Spending today and in retirement, per year |
| `annualLaborIncome`, `laborIncomeGrowthRate` | Yearly work income and its yearly growth in percent |
| `savingsRate` | Percent of income saved |
| `desiredWithdrawalRate`, `yearsOfExpenses` | Safe withdrawal rate in percent and the matching multiple (100 / rate) |
| `fireType` | `standard`, `lean`, `barista`, `coast` or `fat` |
| `leanExpenseMultiplier`, `fatExpenseMultiplier`, `baristaAnnualIncome`, `coastTargetAge` | Variant settings |
| `expectedStockReturn`, `expectedBondReturn`, `expectedCashReturn` | Expected yearly returns in percent, after inflation (cash is usually negative) |
| `yearOfBirth`, `retirementAge`, `maxAge` | Ages for the projection |
| `statePensionIncome`, `privatePensionIncome`, `otherIncome` | Yearly income in retirement |
| `stopWorkingAtFIRE` | Stop labor income once FIRE is reached |
| `useAssetAllocationValue`, `useExpenseTrackerExpenses`, `useExpenseTrackerIncome` | Take the portfolio, expenses or income from the other tools |

## Preferences (`PATCH /settings`)

`accountName`, `decimalSeparator` (`.` or `,`), `decimalPlaces`,
`currencySettings.defaultCurrency`, `country` (ISO 3166-1 alpha-2),
`language` (`en`, `it`, `fr`, `de`, `es`), `dateFormat` (`DD/MM/YYYY`,
`MM/DD/YYYY`, `YYYY-MM-DD`), `privacyMode`, `includePrimaryResidenceInFIRE`.
AI model settings and API keys are device-local and not exposed.
