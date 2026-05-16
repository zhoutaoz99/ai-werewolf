import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthRequestPayload } from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() payload: AuthRequestPayload) {
    return this.authService.register(payload ?? {});
  }

  @Post("login")
  login(@Body() payload: AuthRequestPayload) {
    return this.authService.login(payload ?? {});
  }

  @Get("me")
  me(@Headers("authorization") authorization: string | undefined) {
    const user = this.authService.getPublicAccountByToken(
      this.getBearerToken(authorization),
    );

    if (!user) {
      return {
        ok: false,
        error: "未登录或登录已过期",
      };
    }

    return {
      ok: true,
      user,
    };
  }

  @Post("logout")
  logout(@Headers("authorization") authorization: string | undefined) {
    return this.authService.logout(this.getBearerToken(authorization));
  }

  private getBearerToken(authorization: string | undefined) {
    const value = (authorization ?? "").trim();
    if (!value.toLowerCase().startsWith("bearer ")) {
      return "";
    }

    return value.slice(7).trim();
  }
}
