"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-client";

export default function ProfilePage() {
  const router = useRouter();
  const { user, pending, error, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
  }, [user?.displayName]);

  async function handleUpdateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");

    const result = await updateProfile({
      displayName: displayName.trim() || undefined,
    });

    if (result.ok && result.user) {
      setDisplayName(result.user.displayName);
      setSuccessMessage("昵称已更新");
    }
  }

  return (
    <main className="shell profile-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Profile</p>
          <h1>个人信息</h1>
        </div>
        <div className="topbar-actions">
          <button className="compact-button" onClick={() => router.push("/")}>
            返回大厅
          </button>
        </div>
      </section>

      {!user ? (
        <section className="profile-layout">
          <div className="panel profile-card">
            <div>
              <p className="eyebrow">Account</p>
              <h2>需要登录</h2>
            </div>
            <p className="muted-text">登录后可以查看积分和修改游戏昵称。</p>
            <button onClick={() => router.push("/account")}>登录 / 注册</button>
          </div>
        </section>
      ) : (
        <section className="profile-layout">
          <div className="panel profile-card">
            <div>
              <p className="eyebrow">Overview</p>
              <h2>账号资料</h2>
            </div>

            <div className="profile-stats">
              <div>
                <span>游戏昵称</span>
                <strong>{user.displayName}</strong>
              </div>
              <div>
                <span>积分</span>
                <strong>{user.points}</strong>
              </div>
            </div>

            <div className="profile-info-list">
              <div>
                <span>账号</span>
                <strong>@{user.username}</strong>
              </div>
              <div>
                <span>注册时间</span>
                <strong>{formatDateTime(user.createdAt)}</strong>
              </div>
            </div>
          </div>

          <div className="panel profile-card">
            <div>
              <p className="eyebrow">Edit</p>
              <h2>修改昵称</h2>
            </div>

            <form className="auth-form" onSubmit={handleUpdateProfile}>
              <label className="field">
                <span>游戏昵称</span>
                <input
                  autoComplete="nickname"
                  value={displayName}
                  maxLength={16}
                  placeholder="留空则使用账号"
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
              <button disabled={pending} type="submit">
                保存昵称
              </button>
            </form>

            {successMessage && <p className="success">{successMessage}</p>}
            {error && <p className="error">{error}</p>}
          </div>
        </section>
      )}
    </main>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
