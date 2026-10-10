"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import type { CategoryInfo } from "@/lib/types";

type Change = { oldName: string; newName: string };
type Props = {
  onClose: () => void;
  onChange: (categories: CategoryInfo[], change?: Change) => void;
};

async function categoryRequest(method: string, body?: object): Promise<CategoryInfo[]> {
  const response = await fetch("/api/categories", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("登录已过期，请重新登录。");
  }
  const data = await response.json() as { categories?: CategoryInfo[]; error?: string };
  if (!response.ok || !data.categories) throw new Error(data.error || "分类操作失败，请稍后重试。");
  return data.categories;
}

export default function CategoryManager({ onClose, onChange }: Props) {
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    let active = true;
    categoryRequest("GET")
      .then((items) => { if (active) setCategories(items); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "加载分类失败。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function changeCategory(method: "POST" | "PATCH" | "DELETE", body: object, change?: Change) {
    setSaving(true); setError(null);
    try {
      const items = await categoryRequest(method, body);
      setCategories(items);
      onChange(items, change);
      if (method === "POST") setNewName("");
      if (method === "PATCH") setEditing(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "分类操作失败。");
    } finally {
      setSaving(false);
    }
  }

  function removeCategory(item: CategoryInfo) {
    const message = item.questionCount
      ? `删除“${item.name}”后，该分类下的 ${item.questionCount} 道题会移到“其他”。确定删除吗？`
      : `确定删除“${item.name}”分类吗？`;
    if (window.confirm(message)) void changeCategory("DELETE", { name: item.name }, { oldName: item.name, newName: "其他" });
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <div className="import-modal category-modal" role="dialog" aria-modal="true" aria-label="管理知识分类">
      <div className="category-modal-header"><div><h2>管理知识分类</h2><p>新增的分类可用于手动归类，也会参与以后导入题目的 AI 分类。</p></div><button className="icon-button" aria-label="关闭分类管理" onClick={onClose} disabled={saving}><X size={20} /></button></div>
      {error && <p className="category-error" role="alert">{error}</p>}
      <div className="category-manager-list">
        {loading ? <div className="category-loading"><LoaderCircle className="spin" size={18} />正在加载分类...</div> : categories.map((item) => <div className="category-manager-row" key={item.name}>
          {editing === item.name ? <form className="category-edit-form" onSubmit={(event) => { event.preventDefault(); void changeCategory("PATCH", { name: item.name, newName: editName }, { oldName: item.name, newName: editName.trim() }); }}>
            <input aria-label={`重命名 ${item.name}`} autoFocus maxLength={30} value={editName} onChange={(event) => setEditName(event.target.value)} disabled={saving} />
            <button type="submit" aria-label="保存分类名称" title="保存" disabled={saving || !editName.trim()}><Check size={17} /></button>
            <button type="button" aria-label="取消重命名" title="取消" onClick={() => setEditing(null)} disabled={saving}><X size={17} /></button>
          </form> : <><span className="category-manager-name">{item.name}</span><span className="category-manager-count">{item.questionCount} 道题</span>{item.name !== "其他" && <div className="category-manager-actions"><button aria-label={`重命名 ${item.name}`} title="重命名" onClick={() => { setEditing(item.name); setEditName(item.name); }} disabled={saving}><Pencil size={16} /></button><button aria-label={`删除 ${item.name}`} title="删除" onClick={() => removeCategory(item)} disabled={saving}><Trash2 size={16} /></button></div>}</>}
        </div>)}
      </div>
      <form className="category-add-form" onSubmit={(event) => { event.preventDefault(); void changeCategory("POST", { name: newName }); }}>
        <input aria-label="新分类名称" placeholder="输入新分类名称" maxLength={30} value={newName} onChange={(event) => setNewName(event.target.value)} disabled={saving} />
        <button className="small-primary" type="submit" disabled={saving || !newName.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}新增</button>
      </form>
      <p className="category-modal-hint">删除分类时，题目会移到“其他”，答案和笔记保留。“其他”不能改名或删除。</p>
    </div>
  </div>;
}
