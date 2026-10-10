import { NextRequest, NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/auth";
import { getCategories, OTHER_CATEGORY, validCategoryName } from "@/lib/categories";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  return NextResponse.json({ categories: await getCategories() });
}

export async function POST(request: NextRequest) {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : null;
  if (!validCategoryName(name)) return NextResponse.json({ error: "分类名称需为 1–30 个字符。" }, { status: 400 });
  try {
    await getDb().query("INSERT INTO categories (name) VALUES ($1)", [name]);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "分类已存在。" }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({ categories: await getCategories() }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { name?: unknown; newName?: unknown } | null;
  const name = body?.name;
  const newName = typeof body?.newName === "string" ? body.newName.trim() : null;
  if (!validCategoryName(name) || !validCategoryName(newName)) return NextResponse.json({ error: "分类名称需为 1–30 个字符。" }, { status: 400 });
  if (name === OTHER_CATEGORY || newName === OTHER_CATEGORY) return NextResponse.json({ error: "“其他”分类不可改名。" }, { status: 400 });
  try {
    const result = await getDb().query("UPDATE categories SET name=$2 WHERE name=$1 RETURNING name", [name, newName]);
    if (!result.rowCount) return NextResponse.json({ error: "分类不存在。" }, { status: 404 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "分类已存在。" }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({ categories: await getCategories() });
}

export async function DELETE(request: NextRequest) {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = body?.name;
  if (!validCategoryName(name)) return NextResponse.json({ error: "分类名称无效。" }, { status: 400 });
  if (name === OTHER_CATEGORY) return NextResponse.json({ error: "“其他”分类不可删除。" }, { status: 400 });
  const result = await getDb().query("DELETE FROM categories WHERE name=$1 RETURNING name", [name]);
  if (!result.rowCount) return NextResponse.json({ error: "分类不存在。" }, { status: 404 });
  return NextResponse.json({ categories: await getCategories() });
}
