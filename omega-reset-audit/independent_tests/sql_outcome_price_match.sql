-- SQUAD G #2 — verify outcome prices come from REAL hedge_market_snapshots.
-- KEY: realized() t0 = the signals_ready EVENT time, NOT the outcome row created_at.
-- For request 0c0001 the signals_ready event is at 01:10:20.936195 (verified separately).
with params as (
  select 'binance'::text venue, 'BTCUSDT'::text symbol, timestamptz '2026-05-29 01:10:20.936195+00' t0
),
befores as (
  select (s.payload->>'mid_price')::float8 mid from hedge_market_snapshots s, params p
  where s.venue=p.venue and s.symbol=p.symbol and s.payload ? 'mid_price'
    and s.taken_at <= p.t0 and s.taken_at >= p.t0 - interval '60 seconds'
  order by s.taken_at desc limit 1
),
afters as (
  select (s.payload->>'mid_price')::float8 mid, s.taken_at from hedge_market_snapshots s, params p
  where s.venue=p.venue and s.symbol=p.symbol and s.payload ? 'mid_price'
    and s.taken_at > p.t0 and s.taken_at <= p.t0 + interval '300 seconds'
  order by s.taken_at desc limit 1
)
select (select mid from befores) recomputed_p0, (select mid from afters) recomputed_p1,
       73840.335 stored_p0, 73779.715 stored_p1;
-- RESULT: recomputed_p0=73840.335 recomputed_p1=73779.715 == stored. MATCH.
-- Prices ARE real Binance snapshots; only the request UUIDs (0c0001 etc.) are synthetic fixtures.
