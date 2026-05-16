import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { GameModule } from "./game/game.module";

@Module({
  imports: [AuthModule, GameModule],
  controllers: [AppController],
})
export class AppModule {}
