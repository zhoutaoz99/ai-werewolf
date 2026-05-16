import { Injectable } from "@nestjs/common";
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import {
  AccountRecord,
  AuthenticatedAccount,
  AuthRequestPayload,
  AuthResult,
  PublicAccount,
} from "./auth.types";

const scrypt = promisify(scryptCallback);
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 72;
const MAX_DISPLAY_NAME_LENGTH = 16;

@Injectable()
export class AuthService {
  private readonly accountsByUsername = new Map<string, AccountRecord>();
  private readonly sessions = new Map<
    string,
    { userId: string; createdAt: string; lastSeenAt: string }
  >();

  async register(payload: AuthRequestPayload): Promise<AuthResult> {
    const username = this.normalizeUsername(payload.username);
    const password = payload.password ?? "";
    const displayName = this.normalizeDisplayName(payload.displayName) || username;

    const validationError = this.validateRegistration(username, password);
    if (validationError) {
      return this.fail(validationError);
    }

    if (this.accountsByUsername.has(username)) {
      return this.fail("账号已存在");
    }

    const now = new Date().toISOString();
    const salt = randomBytes(16).toString("hex");
    const account: AccountRecord = {
      id: randomUUID(),
      username,
      displayName,
      passwordSalt: salt,
      passwordHash: await this.hashPassword(password, salt),
      createdAt: now,
      updatedAt: now,
    };

    this.accountsByUsername.set(username, account);
    return this.issueSession(account);
  }

  async login(payload: AuthRequestPayload): Promise<AuthResult> {
    const username = this.normalizeUsername(payload.username);
    const password = payload.password ?? "";
    const account = this.accountsByUsername.get(username);

    if (!account || !(await this.verifyPassword(password, account))) {
      return this.fail("账号或密码错误");
    }

    return this.issueSession(account);
  }

  getAccountByToken(token: string | undefined): AuthenticatedAccount | null {
    const normalizedToken = this.normalizeToken(token);
    if (!normalizedToken) {
      return null;
    }

    const session = this.sessions.get(normalizedToken);
    if (!session) {
      return null;
    }

    const account = this.findAccountById(session.userId);
    if (!account) {
      this.sessions.delete(normalizedToken);
      return null;
    }

    session.lastSeenAt = new Date().toISOString();
    return {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
    };
  }

  getPublicAccountByToken(token: string | undefined): PublicAccount | null {
    const account = this.getAccountByToken(token);
    if (!account) {
      return null;
    }

    const record = this.findAccountById(account.id);
    return record ? this.toPublicAccount(record) : null;
  }

  logout(token: string | undefined) {
    const normalizedToken = this.normalizeToken(token);
    if (normalizedToken) {
      this.sessions.delete(normalizedToken);
    }

    return { ok: true };
  }

  private validateRegistration(username: string, password: string): string | null {
    if (!USERNAME_PATTERN.test(username)) {
      return "账号只能包含 3-20 位字母、数字或下划线";
    }

    if (
      password.length < MIN_PASSWORD_LENGTH ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      return "密码长度需为 6-72 位";
    }

    return null;
  }

  private async issueSession(account: AccountRecord): Promise<AuthResult> {
    const token = randomBytes(32).toString("hex");
    const now = new Date().toISOString();
    this.sessions.set(token, {
      userId: account.id,
      createdAt: now,
      lastSeenAt: now,
    });

    return {
      ok: true,
      token,
      user: this.toPublicAccount(account),
    };
  }

  private async hashPassword(password: string, salt: string) {
    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    return derivedKey.toString("hex");
  }

  private async verifyPassword(password: string, account: AccountRecord) {
    const hashedPassword = Buffer.from(
      await this.hashPassword(password, account.passwordSalt),
      "hex",
    );
    const storedPassword = Buffer.from(account.passwordHash, "hex");

    return (
      hashedPassword.length === storedPassword.length &&
      timingSafeEqual(hashedPassword, storedPassword)
    );
  }

  private findAccountById(accountId: string) {
    return Array.from(this.accountsByUsername.values()).find(
      (account) => account.id === accountId,
    );
  }

  private toPublicAccount(account: AccountRecord): PublicAccount {
    return {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      createdAt: account.createdAt,
    };
  }

  private normalizeUsername(username: string | undefined) {
    return (username ?? "").trim().toLowerCase();
  }

  private normalizeDisplayName(displayName: string | undefined) {
    return (displayName ?? "").trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  }

  private normalizeToken(token: string | undefined) {
    return (token ?? "").trim();
  }

  private fail(error: string): AuthResult {
    return {
      ok: false,
      error,
    };
  }
}
