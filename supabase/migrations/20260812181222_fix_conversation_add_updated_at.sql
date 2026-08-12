/*
# Fix Conversation table — add missing updatedAt column

The live database's Conversation table was created without the
`updatedAt` column that exists in the committed Prisma migration
SQL and schema.prisma. This adds it to bring the live database
into agreement.
*/

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;