import { DefaultAvatar } from "./DefaultAvatar";
import { Link } from "react-router-dom";
import { ProtectedImage } from "./ProtectedImage";

export function MemberCard({ member }) {
  return (
    <article className="explore-member-card">
      <ProtectedImage
        media={member.avatar_media}
        alt={`${member.nickname}的头像`}
        className="explore-member-avatar"
        fallback={<DefaultAvatar className="explore-member-avatar" />}
      />
      <div>
        <h3><Link to={`/users/${member.username}`}>{member.nickname}</Link></h3>
        <p className="profile-handle">@{member.username}</p>
        {member.bio ? <p>{member.bio}</p> : <p className="muted">刚来到映墨，尚未填写简介。</p>}
        {member.region ? <span>所在地：{member.region}</span> : null}
      </div>
    </article>
  );
}
