import { useState } from "react";
import { Link } from "react-router-dom";
import { InkSketch } from "./InkSketch";

export function WelcomeLetter({ user, counts, onStartWriting, onDismiss }) {
  const [shareStatus, setShareStatus] = useState("");
  const name = user.nickname || user.username;
  const profileDone = Boolean(user.avatar_media_id || user.avatar_media || user.bio?.trim());
  const joinedCollection = (counts?.collections || 0) > 0;
  const inviteText = `我在映墨的用户名是 @${user.username}，记得把我加进我们的合集。`;

  const shareUsername = async () => {
    setShareStatus("");
    try {
      if (navigator.share) {
        await navigator.share({ text: inviteText });
        return;
      }
      await navigator.clipboard.writeText(inviteText);
      setShareStatus("已复制，发给邀请你的朋友就好。");
    } catch (error) {
      if (error?.name === "AbortError") return;
      setShareStatus(`复制没有成功，可以直接告诉朋友你的用户名：@${user.username}`);
    }
  };

  const steps = [
    {
      key: "profile",
      done: profileDone,
      title: "让朋友认出你",
      body: "设置头像、昵称和一句简介。",
      action: <Link className="welcome-letter-action" to="/me/settings">编辑资料</Link>,
    },
    {
      key: "collection",
      done: joinedCollection,
      title: "请朋友把你加进合集",
      body: <>合集由创建者添加成员。把你的用户名 <span className="welcome-letter-handle">@{user.username}</span> 发给邀请你的朋友。</>,
      action: <button className="welcome-letter-action" type="button" onClick={() => void shareUsername()}>发送用户名</button>,
    },
    {
      key: "write",
      done: false,
      title: "写下第一则随记",
      body: "默认只有你自己能看到；发布时选“所有映墨成员”，朋友们就能读到。",
      action: <button className="welcome-letter-action" type="button" onClick={onStartWriting}>开始写</button>,
    },
  ];

  return (
    <section className="welcome-letter" aria-labelledby="welcome-letter-title">
      <InkSketch variant="letter" className="welcome-letter-art" />
      <p className="welcome-letter-kicker">第一封信</p>
      <h2 id="welcome-letter-title">{name}，欢迎来到映墨。</h2>
      <p className="welcome-letter-lead">这里的内容只有受邀的朋友能看到。先做三件小事，这里很快就会热闹起来。</p>
      <ol className="welcome-letter-steps">
        {steps.map((step, index) => (
          <li key={step.key} className={step.done ? "is-done" : undefined}>
            <span className="welcome-letter-index tabular" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </div>
            {step.done ? <span className="welcome-letter-done">已完成</span> : step.action}
          </li>
        ))}
      </ol>
      {shareStatus ? <p className="welcome-letter-status" role="status">{shareStatus}</p> : null}
      {user.email_verified === false ? <p className="welcome-letter-note">邮箱还没有验证，找回密码时会用到。<Link to="/verify-email">去验证</Link></p> : null}
      <button className="text-button welcome-letter-dismiss" type="button" onClick={onDismiss}>以后再说</button>
    </section>
  );
}
