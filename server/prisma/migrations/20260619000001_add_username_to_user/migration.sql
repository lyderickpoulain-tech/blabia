-- BlabIA v4.0 - Évolution 2 : pseudos utilisateurs
ALTER TABLE "User" ADD COLUMN "username" TEXT DEFAULT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username") WHERE "username" IS NOT NULL;
