-- Guest checkout: make userId and addressId nullable on Order
-- and add guest contact/address inline fields

ALTER TABLE "Order" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "addressId" DROP NOT NULL;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "guestName"         TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "guestEmail"        TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "guestPhone"        TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "guestAddressLine1" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "guestAddressLine2" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "guestCity"         TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "guestState"        TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "guestPincode"      TEXT;
