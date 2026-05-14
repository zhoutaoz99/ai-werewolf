"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useGameClient } from "../../lib/game-client";
import type {
  PublicMessage,
  PublicVoteResult,
  RoomSnapshot,
} from "../../lib/game-types";
import {
  formatRemaining,
  getPlayerSeatNo,
  phaseLabel,
} from "../../lib/game-utils";

type TranscriptItem =
  | {
      type: "round";
      roundNo: number;
    }
  | {
      type: "message";
      message: PublicMessage;
    }
  | {
      type: "voteResult";
      roundNo: number;
      votes: PublicVoteResult[];
    };

export default function GamePage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId.toUpperCase();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const {
    connected,
    pending,
    error,
    getRoom,
    getPlayerId,
    sendChat,
    castVote,
  } = useGameClient();

  const [chatDraft, setChatDraft] = useState("");
  const [votedTarget, setVotedTarget] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const room = getRoom(roomId);
  const playerId = getPlayerId(roomId);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room?.messages.length, room?.voteResults.length]);

  useEffect(() => {
    if (room?.status === "waiting") {
      router.replace(`/room/${room.id}`);
    }
  }, [room?.id, room?.status, router]);

  useEffect(() => {
    if (room?.phase === "voting") {
      setVotedTarget(null);
    }
  }, [room?.currentRound, room?.phase]);

  const currentPlayer = useMemo(() => {
    if (!room || !playerId) {
      return null;
    }
    return room.players.find((player) => player.id === playerId) ?? null;
  }, [room, playerId]);

  if (!room) {
    return (
      <main className="immersive-page">
        <section className="missing-game">
          <p className="eyebrow">Game</p>
          <h1>正在连接对局</h1>
          <p>如果长时间没有进入，请从大厅重新加入房间。</p>
          <Link href="/">返回大厅</Link>
        </section>
      </main>
    );
  }

  const remainingMs = room.phaseEndsAt
    ? Math.max(0, new Date(room.phaseEndsAt).getTime() - now)
    : 0;
  const canSpeak =
    room.phase === "discussion" &&
    currentPlayer?.status === "alive" &&
    room.status === "playing";
  const canVote =
    room.phase === "voting" &&
    currentPlayer?.status === "alive" &&
    room.status === "playing" &&
    !votedTarget;
  const alivePlayers = room.players.filter((player) => player.status === "alive");
  const transcriptItems = buildTranscriptItems(room);

  async function handleSendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room) {
      return;
    }

    const content = chatDraft.trim();
    if (!content) {
      return;
    }

    const result = await sendChat(room.id, content);
    if (result.ok) {
      setChatDraft("");
    }
  }

  async function handleVote(targetPlayerId: string) {
    if (!room) {
      return;
    }

    const result = await castVote(room.id, targetPlayerId);
    if (result.ok) {
      setVotedTarget(targetPlayerId);
    }
  }

  return (
    <main className="immersive-page">
      <header className="game-topline">
        <div>
          <p className="eyebrow">Room {room.id}</p>
          <h1>{phaseLabel(room.phase)}</h1>
        </div>
        <div className="game-topline-meta">
          <span className={connected ? "status online" : "status offline"}>
            {connected ? "已连接" : "断开连接"}
          </span>
          <div className="round-meter">
            <span>
              第 {room.currentRound || 0}/{room.config.maxRounds} 轮
            </span>
            <strong>{formatRemaining(remainingMs)}</strong>
          </div>
        </div>
      </header>

      {room.status === "finished" && (
        <section className="game-result-banner">
          <h2>{room.winner === "human" ? "真人玩家获胜" : "人类玩家失败"}</h2>
          <p>
            {room.winner === "human"
              ? `真人玩家平分 ${room.config.rewardPool} 积分。`
              : "4 轮结束后仍有 AI 模拟玩家在场，本局挑战失败。"}
          </p>
          <Link href="/">返回大厅</Link>
        </section>
      )}

      <section className="game-stage">
        <aside className="immersive-panel player-dock">
          <div>
            <p className="eyebrow">Players</p>
            <h2>玩家</h2>
          </div>
          <div className="player-dock-list">
            {room.players.map((player) => (
              <div className="player-row" key={player.id}>
                <div>
                  <strong>#{player.seatNo}</strong>
                  {player.id === playerId && <span className="self">你</span>}
                </div>
                <div className="player-meta">
                  <span className={player.status === "alive" ? "alive" : "dead"}>
                    {player.status === "alive" ? "存活" : "出局"}
                  </span>
                  {player.revealedType && (
                    <span className="identity">
                      {player.revealedType === "ai" ? "AI" : "真人"}
                    </span>
                  )}
                  {!player.connected && player.status === "alive" && (
                    <span className="muted">离线</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="immersive-panel transcript">
          <div className="transcript-header">
            <div>
              <p className="eyebrow">Discussion</p>
              <h2>发言区</h2>
            </div>
            <span>{room.messages.length} 条</span>
          </div>

          <div className="transcript-messages">
            {transcriptItems.length === 0 ? (
              <p className="muted-text">等待第一轮开始</p>
            ) : (
              transcriptItems.map((item) =>
                item.type === "round" ? (
                  <div className="round-transition" key={`round-${item.roundNo}`}>
                    <span>第 {item.roundNo} 轮</span>
                    <strong>发言开始</strong>
                    <p>请根据编号玩家的发言、逻辑和投票倾向判断谁是 AI 模拟玩家。</p>
                  </div>
                ) : (
                  renderTranscriptItem(room, item)
                ),
              )
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="composer immersive-composer" onSubmit={handleSendChat}>
            <input
              value={chatDraft}
              maxLength={240}
              disabled={!canSpeak || pending}
              placeholder={canSpeak ? "输入发言，15 秒冷却" : "当前不可发言"}
              onChange={(event) => setChatDraft(event.target.value)}
            />
            <button disabled={!canSpeak || pending || !chatDraft.trim()}>发送</button>
          </form>
        </section>

        <aside className="immersive-panel action-dock">
          <div>
            <p className="eyebrow">Action</p>
            <h2>{room.phase === "voting" ? "投票" : "当前行动"}</h2>
          </div>

          {room.phase !== "voting" && room.status !== "finished" && (
            <div className="phase-hint">
              <strong>{phaseLabel(room.phase)}</strong>
              <p>观察发言逻辑、前后矛盾和跟票行为，投票阶段开始后选择怀疑对象。</p>
            </div>
          )}

          {room.phase === "voting" && (
            <div className="vote-options vertical">
              {alivePlayers
                .filter((player) => player.id !== playerId)
                .map((player) => (
                  <button
                    className={votedTarget === player.id ? "selected" : ""}
                    key={player.id}
                    disabled={!canVote || pending}
                    onClick={() => handleVote(player.id)}
                  >
                    <span>#{player.seatNo}</span>
                    <small>{room.voteCounts[player.id] ?? 0} 票</small>
                  </button>
                ))}
            </div>
          )}

          {room.status === "finished" && (
            <div className="phase-hint">
              <strong>身份已揭晓</strong>
              <p>可以查看左侧玩家身份和发言记录。</p>
            </div>
          )}

          {error && <p className="error">{error}</p>}
        </aside>
      </section>
    </main>
  );
}

function buildTranscriptItems(room: RoomSnapshot): TranscriptItem[] {
  const maxMessageRound = room.messages.reduce(
    (maxRound, message) => Math.max(maxRound, message.roundNo),
    0,
  );
  const maxVoteRound = room.voteResults.reduce(
    (maxRound, vote) => Math.max(maxRound, vote.roundNo),
    0,
  );
  const maxRound = Math.max(room.currentRound, maxMessageRound, maxVoteRound);
  const items: TranscriptItem[] = [];

  for (let roundNo = 1; roundNo <= maxRound; roundNo += 1) {
    items.push({
      type: "round",
      roundNo,
    });

    for (const message of room.messages) {
      if (message.roundNo === roundNo) {
        items.push({
          type: "message",
          message,
        });
      }
    }

    if (isVoteResultVisibleForRound(room, roundNo)) {
      items.push({
        type: "voteResult",
        roundNo,
        votes: room.voteResults
          .filter((vote) => vote.roundNo === roundNo)
          .sort(
            (first, second) =>
              getSortableSeatNo(room, first.voterPlayerId) -
              getSortableSeatNo(room, second.voterPlayerId),
          ),
      });
    }
  }

  return items;
}

function renderTranscriptItem(room: RoomSnapshot, item: Exclude<TranscriptItem, { type: "round" }>) {
  if (item.type === "voteResult") {
    return (
      <div className="vote-result-card" key={`vote-result-${item.roundNo}`}>
        <strong>第 {item.roundNo} 轮投票结果：</strong>
        <span>{formatVoteResultLine(room, item.votes)}</span>
      </div>
    );
  }

  return (
    <article className="message immersive-message" key={item.message.id}>
      <div>
        <strong>#{getPlayerSeatNo(room, item.message.playerId)}</strong>
        <span>第 {item.message.roundNo} 轮</span>
        {item.message.source && (
          <span>{item.message.source === "ai" ? "AI" : "真人"}</span>
        )}
      </div>
      <p>{item.message.content}</p>
    </article>
  );
}

function isVoteResultVisibleForRound(room: RoomSnapshot, roundNo: number) {
  if (room.status === "finished" || room.phase === "game_over") {
    return roundNo <= room.currentRound;
  }

  if (roundNo < room.currentRound) {
    return true;
  }

  return room.currentRound === roundNo && room.phase === "resolving";
}

function getSortableSeatNo(room: RoomSnapshot, playerId: string) {
  return room.players.find((player) => player.id === playerId)?.seatNo ?? 999;
}

function formatVoteResultLine(room: RoomSnapshot, votes: PublicVoteResult[]) {
  if (votes.length === 0) {
    return "无人完成投票";
  }

  return votes
    .map(
      (vote) =>
        `#${getPlayerSeatNo(room, vote.voterPlayerId)}->#${getPlayerSeatNo(
          room,
          vote.targetPlayerId,
        )}`,
    )
    .join("，");
}
