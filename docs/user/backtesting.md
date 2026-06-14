# Portfolio backtest

Run **Portfolio Backtest** from the Tools menu to simulate the holdings saved in
the [Asset allocation manager](./asset-allocation.md).

The backtest reads current asset values, tickers and asset classes from Asset
Allocation. To change the simulated portfolio, edit the assets on the Asset
Allocation page first.

## Initial investment and final value

The **Initial investment** field is the amount you want to simulate through the
historical return series. By default, Fire Tools sets it to the current active
Asset Allocation value so the final value answers: "What would this portfolio
have become over the selected period?"

The **Final value** is the simulated ending value of that initial investment. If
you type `10000`, a result like `16032` means the simulated portfolio grew from
10,000 to 16,032 over the lookback window. It is not a separate live portfolio
balance.

## Metrics

The summary reports:

- CAGR
- Total return
- Annualized volatility
- Max drawdown
- Best and worst year
- Final value

The charts show growth over time and drawdown. The year-by-year table lists each
annual return, end value, drawdown and whether the year used market data,
fallback assumptions or a mix.

## Model and data

The model is **buy-and-hold** with no periodic rebalancing. If a holding has a
Yahoo Finance ticker with enough usable history, the backtest uses historical
market data. If history is missing, or the asset has no ticker, Fire Tools uses
deterministic per-asset-class assumptions so results remain reproducible.

Assumptions live in `src/utils/backtestCalculator.ts` and can be updated there
in one place.
