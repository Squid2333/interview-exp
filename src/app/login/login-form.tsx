"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LoaderCircle, LogIn } from "lucide-react";
import { login, logout } from "./actions";

export default function LoginForm({ configured, unauthorized }: { configured: boolean; unauthorized: boolean }) {
  const [state, action, pending] = useActionState(login, { error: null });
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return <>
    {!configured && <p className="login-message" role="alert">登录服务尚未配置。</p>}
    {unauthorized && <div className="login-message" role="alert"><p>此账号无权访问题库。</p><form action={logout}><button className="ghost-button">退出当前账号</button></form></div>}
    <form action={action} className="login-form">
      <label htmlFor="email">邮箱</label>
      <input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required maxLength={254} disabled={pending || !configured} />
      <label htmlFor="password">密码</label>
      <div className="password-field"><input id="password" name="password" type={visible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required maxLength={1024} disabled={pending || !configured} /><button type="button" className="icon-button" aria-label={visible ? "隐藏密码" : "显示密码"} title={visible ? "隐藏密码" : "显示密码"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
      {state.error && <p className="login-message" role="alert">{state.error}</p>}
      <button className="primary-button login-submit" disabled={pending || !configured}>{pending ? <LoaderCircle className="spin" size={17} /> : <LogIn size={17} />}{pending ? "正在登录..." : "登录"}</button>
    </form>
  </>;
}
