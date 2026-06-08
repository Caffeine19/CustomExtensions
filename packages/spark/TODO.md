# Todos

# Dependencies ✅

using context7 mcp to search this lib

- effect-ts ✅
- radash ✅
- dayjs ✅

## Spark cli ✅

- define errors using effect-ts ✅ (`src/types/errors.ts`)
  - include `SparkNotSetupError` with setup instructions ✅
  - include `SparkNotSetupError` with setup instructions ✅
    - Shows: "Launch Spark Desktop → Settings → AI Agents → Set Up CLI"
  - include `TriageNotAvailableError` for free plan limitations ✅
  - include `SparkCommandError` for generic CLI failures ✅
  - include `SparkParseError` for output parsing issues ✅

## Search emails ✅

- search inbox emails ✅ (`src/searchInbox.tsx`)
- group by accounts, support dropdown to filter by account ✅
- email item organize commands ✅
  - read ✅
  - unread ✅
  - delete ✅ (triage required)
  - mark as done ✅ (triage required)
  - mark as undone ✅ (triage required)
  - pin ✅
  - archive ✅ (triage required)
  - snooze ✅ (triage required)
  - open in spark desktop ✅ (`spark://email/{id}`)
  - copy email ID ✅
  - view thread ✅
- triage error handling with effect-ts ✅ (`TriageNotAvailableError`)

## View 2FA Codes

- support filter emails, extract 2fa codes
- no need to implement this time, will do it later, ignore it first

## Update package.json ✅

spark cli currently only support macos, not windows ✅
