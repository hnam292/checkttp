import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = "https://script.google.com/macros/s/AKfycbwx0Jw30PeNxw4rE4UALzTK6cLCCazzjA5liKe0RZsoCbu8xJ9zwbS_YC27iU4xQgm-/exec";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      cache: "no-store",
    });
    const text = await response.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: response.ok ? 200 : 502 });
    } catch {
      return NextResponse.json({ ok: false, error: "Phản hồi máy chủ không hợp lệ." }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Không thể kết nối hệ thống voucher." }, { status: 500 });
  }
}
