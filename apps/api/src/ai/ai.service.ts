import { Injectable, Logger } from "@nestjs/common";
import {
  AiConfig,
  AiSpeechAction,
  AiVoteAction,
  GameContext,
} from "./ai.types";
import { loadPrompt, renderTemplate } from "./prompt-loader";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly config: AiConfig;

  constructor() {
    this.config = {
      baseURL: (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(
        /\/+$/,
        "",
      ),
      apiKey: process.env.AI_API_KEY ?? "",
      model: process.env.AI_MODEL ?? "gpt-4o-mini",
      temperature: Number(process.env.AI_TEMPERATURE) || 0.7,
      reasoningEffort: process.env.AI_REASONING_EFFORT ?? "high",
      timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 15000,
    };

    if (this.config.apiKey) {
      this.logger.log(
        `AI service configured: ${this.config.baseURL} model=${this.config.model}`,
      );
    } else {
      this.logger.warn(
        "AI_API_KEY not set, AI will skip speaking",
      );
    }
  }

  async generateSpeech(context: GameContext): Promise<AiSpeechAction> {
    if (!this.config.apiKey) {
      return { type: "skip" };
    }

    try {
      const systemPrompt = loadPrompt("system-speech.txt");
      const userPrompt = this.buildSpeechPrompt(context);
      this.logger.log(`[${context.myName}] Speech Prompt:\n${userPrompt}`);
      const result = await this.callModel(systemPrompt, userPrompt);
      this.logger.log(`[${context.myName}] Raw Response: ${result.slice(0, 500)}`);
      return this.parseSpeechResult(result, context);
    } catch (error) {
      this.logger.warn(
        `Speech generation failed: ${error instanceof Error ? error.message : error}`,
      );
      return { type: "skip" };
    }
  }

  async generateVote(
    context: GameContext,
    aiPlayerId: string,
  ): Promise<AiVoteAction | null> {
    if (!this.config.apiKey) {
      return null;
    }

    try {
      const systemPrompt = loadPrompt("system-vote.txt");
      const userPrompt = this.buildVotePrompt(context, aiPlayerId);
      this.logger.log(`[${context.myName}] Vote Prompt:\n${userPrompt}`);
      const result = await this.callModel(systemPrompt, userPrompt);
      this.logger.log(`[${context.myName}] Raw Vote Response: ${result.slice(0, 300)}`);
      return this.parseVoteResult(result, context);
    } catch (error) {
      this.logger.warn(
        `Vote generation failed: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  private buildSpeechPrompt(context: GameContext): string {
    const vars: Record<string, string> = {
      mySeatNo: String(context.mySeatNo),
      myName: context.myName,
      roundNo: String(context.roundNo),
      remainingSeconds: String(Math.ceil(context.remainingTimeMs / 1000)),
      alivePlayersList: context.alivePlayers
        .map((p) => `${p.seatNo}号位(ID:${p.id})`)
        .join("、"),
    };

    if (context.myLastSpeech) {
      vars.myLastSpeech = context.myLastSpeech;
    }

    if (context.recentMessages.length > 0) {
      vars.recentMessages = context.recentMessages
        .map((msg) => {
          const prefix = msg.isSelf ? "你" : msg.playerName;
          return `  ${prefix}：${msg.content}`;
        })
        .join("\n");
    }

    if (context.voteHistory.length > 0) {
      vars.voteHistory = context.voteHistory
        .map((round) => {
          const voteDesc = round.votes
            .map((v) => `${v.voterSeatNo}号→${v.targetSeatNo}号`)
            .join("、");
          const eliminated =
            round.eliminatedSeatNo != null
              ? ` → ${round.eliminatedSeatNo}号被淘汰`
              : ` → 平票，无人淘汰`;
          return `  第${round.roundNo}轮：${voteDesc}${eliminated}`;
        })
        .join("\n");
    }

    if (Object.keys(context.currentVoteCounts).length > 0) {
      vars.currentVoteInfo = Object.entries(context.currentVoteCounts)
        .map(([id, count]) => {
          const player = context.alivePlayers.find((p) => p.id === id);
          return `${player?.seatNo ?? id}号位:${count}票`;
        })
        .join("、");
    }

    return renderTemplate("user-speech-template.txt", vars);
  }

  private buildVotePrompt(
    context: GameContext,
    aiPlayerId: string,
  ): string {
    const targets = context.alivePlayers.filter((p) => p.id !== aiPlayerId);

    const vars: Record<string, string> = {
      mySeatNo: String(context.mySeatNo),
      myName: context.myName,
      roundNo: String(context.roundNo),
      voteTargets: targets
        .map((p) => `${p.seatNo}号位(ID:${p.id})`)
        .join("、"),
    };

    if (context.recentMessages.length > 0) {
      vars.recentMessages = context.recentMessages
        .map((msg) => {
          const prefix = msg.isSelf ? "你" : msg.playerName;
          return `  ${prefix}：${msg.content}`;
        })
        .join("\n");
    }

    if (context.voteHistory.length > 0) {
      vars.voteHistory = context.voteHistory
        .map((round) => {
          const voteDesc = round.votes
            .map((v) => `${v.voterSeatNo}号→${v.targetSeatNo}号`)
            .join("、");
          const eliminated =
            round.eliminatedSeatNo != null
              ? ` → ${round.eliminatedSeatNo}号被淘汰`
              : ` → 平票，无人淘汰`;
          return `  第${round.roundNo}轮：${voteDesc}${eliminated}`;
        })
        .join("\n");
    }

    if (Object.keys(context.currentVoteCounts).length > 0) {
      vars.currentVoteInfo = Object.entries(context.currentVoteCounts)
        .map(([id, count]) => {
          const player = context.alivePlayers.find((p) => p.id === id);
          return `${player?.seatNo ?? id}号位:${count}票`;
        })
        .join("、");
    }

    return renderTemplate("user-vote-template.txt", vars);
  }

  private async callModel(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const url = `${this.config.baseURL}/chat/completions`;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs,
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: this.config.temperature,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          thinking: { type: "enabled" },
          reasoning_effort: this.config.reasoningEffort,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `API returned ${response.status}: ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      return data.choices?.[0]?.message?.content ?? "";
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseSpeechResult(
    raw: string,
    context: GameContext,
  ): AiSpeechAction {
    const parsed = this.extractJson(raw);
    if (!parsed) {
      return { type: "skip" };
    }

    if (parsed.type === "skip") {
      return { type: "skip" };
    }

    if (parsed.type === "speak" && typeof parsed.content === "string") {
      const content = parsed.content.trim().slice(0, 240);
      if (content.length > 0) {
        return { type: "speak", content };
      }
    }

    return { type: "skip" };
  }

  private parseVoteResult(
    raw: string,
    context: GameContext,
  ): AiVoteAction | null {
    const parsed = this.extractJson(raw);
    if (!parsed) {
      return null;
    }

    if (
      parsed.type === "vote" &&
      typeof parsed.targetPlayerId === "string"
    ) {
      const isValidTarget = context.alivePlayers.some(
        (p) => p.id === parsed.targetPlayerId,
      );
      if (isValidTarget) {
        return {
          type: "vote",
          targetPlayerId: parsed.targetPlayerId,
          reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
        };
      }
    }

    return null;
  }

  private extractJson(text: string): Record<string, unknown> | null {
    // Try direct parse first
    try {
      return JSON.parse(text.trim());
    } catch {
      // Try extracting JSON from markdown code block
    }

    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // continue
      }
    }

    // Try finding JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // give up
      }
    }

    return null;
  }
}
