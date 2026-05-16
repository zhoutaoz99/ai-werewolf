"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./lib/auth-client";
import { useGameClient } from "./lib/game-client";
import { humanCount, statusLabel, winnerLabel } from "./lib/game-utils";

export default function Home() {
  const router = useRouter();
  const { user, pending: authPending, logout } = useAuth();
  const {
    connected,
    pending,
    error,
    rooms,
    playerName,
    roomCode,
    discussionMinutes,
    setPlayerName,
    setRoomCode,
    setDiscussionMinutes,
    setError,
    refreshRooms,
    createRoom,
    joinRoom,
  } = useGameClient();
  const lobbyDisabled = pending || authPending || !user;

  useEffect(() => {
    if (user) {
      setPlayerName(user.displayName);
    }
  }, [setPlayerName, user]);

  async function handleLogout() {
    await logout();
    setError("请先登录账号");
  }

  async function handleCreateRoom() {
    if (!user) {
      setError("请先登录账号");
      return;
    }

    const result = await createRoom();
    if (result.ok && result.room) {
      router.push(`/room/${result.room.id}`);
    }
  }

  async function handleJoinRoom(roomId?: string) {
    if (!user) {
      setError("请先登录账号");
      return;
    }

    const result = await joinRoom(roomId);
    if (result.ok && result.room) {
      router.push(`/room/${result.room.id}`);
    }
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">AI Werewolf MVP</p>
          <h1>AI 狼人杀</h1>
        </div>
        <div className="topbar-actions">
          {user && <div className="status account-status">{user.displayName}</div>}
          {user ? (
            <>
              <button
                className="compact-button"
                disabled={authPending}
                onClick={() => router.push("/profile")}
              >
                个人信息
              </button>
              <button
                className="compact-button"
                disabled={authPending}
                onClick={handleLogout}
              >
                退出
              </button>
            </>
          ) : (
            <button className="compact-button" onClick={() => router.push("/account")}>
              登录 / 注册
            </button>
          )}
          <div className={connected ? "status online" : "status offline"}>
            {connected ? "后端已连接" : "后端未连接"}
          </div>
        </div>
      </section>

      <section className="lobby-grid">
        <section className="panel lobby-card">
          <div>
            <p className="eyebrow">Lobby</p>
            <h2>创建或加入房间</h2>
          </div>

          <label className="field">
            <span>昵称</span>
            <input
              value={user?.displayName ?? playerName}
              disabled
              maxLength={16}
              placeholder="登录后使用账号昵称"
              onChange={() => undefined}
            />
          </label>

          {!user && (
            <button className="secondary" onClick={() => router.push("/account")}>
              先登录账号
            </button>
          )}

          <label className="field">
            <span>每轮发言时间（分钟）</span>
            <input
              type="number"
              min={1}
              step={1}
              value={discussionMinutes}
              onChange={(event) =>
                setDiscussionMinutes(Math.max(1, Number(event.target.value) || 1))
              }
            />
          </label>

          <button disabled={lobbyDisabled} onClick={handleCreateRoom}>
            创建房间
          </button>

          <label className="field">
            <span>房间号</span>
            <input
              value={roomCode}
              placeholder="例如 A1B2C3"
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            />
          </label>

          <button
            className="secondary"
            disabled={lobbyDisabled}
            onClick={() => handleJoinRoom()}
          >
            加入房间
          </button>

          {error && <p className="error">{error}</p>}
        </section>

        <section className="panel lobby-card">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Rooms</p>
              <h2>最近房间</h2>
            </div>
            <button
              className="compact-button"
              disabled={pending}
              onClick={() => void refreshRooms()}
            >
              刷新
            </button>
          </div>

          {rooms.length === 0 ? (
            <p className="muted-text">暂无可加入房间</p>
          ) : (
            <div className="room-list no-border">
              {[...rooms]
                .sort((a, b) => {
                  if (a.status === "finished" && b.status !== "finished") return 1;
                  if (a.status !== "finished" && b.status === "finished") return -1;
                  return 0;
                })
                .map((room) => (
                  <button
                    className="room-row"
                    key={room.id}
                    disabled={room.status !== "waiting" || lobbyDisabled}
                    onClick={() => handleJoinRoom(room.id)}
                  >
                    <span>{room.id}</span>
                    <small>
                      {statusLabel(room.status)}
                      {room.status === "finished" && room.winner && (
                        <> · {winnerLabel(room.winner)}</>
                      )}
                      {room.status !== "finished" && (
                        <> · {humanCount(room)}/{room.config.maxHumanPlayers} 真人</>
                      )}
                    </small>
                  </button>
                ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
