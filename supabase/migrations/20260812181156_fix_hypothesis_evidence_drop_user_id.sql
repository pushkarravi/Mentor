/*
# Fix HypothesisEvidence schema mismatch

The previous Supabase MCP migration added a `userId` column to
`HypothesisEvidence` that does not exist in the Prisma schema or
the committed migration SQL. This removes it to bring the live
database into agreement with `schema.prisma` and the committed
migration at
`backend/prisma/migrations/20260812000000_m0_initial_schema/migration.sql`.

Ownership of a HypothesisEvidence row is derivable through its
Hypothesis/Evidence relations — both of which have userId — so
duplicating userId here is unnecessary and creates a schema drift
that prevents Prisma from working correctly.
*/

ALTER TABLE "HypothesisEvidence" DROP COLUMN IF EXISTS "userId";