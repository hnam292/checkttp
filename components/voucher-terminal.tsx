"use client";

import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck, Camera, CheckCircle2, ChevronRight, Clock3, Eye, EyeOff,
  History, ImagePlus, Keyboard, Loader2, LogOut, QrCode, RefreshCw,
  ScanLine, ShieldCheck, TicketCheck, TriangleAlert, UserRound,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogMedia, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Staff = { name?: string; email?: string; role?: string };
type Voucher = {
  voucher_id?: string; voucherId?: string; voucher_code?: string; voucherCode?: string;
  status?: string; discount?: string | number; discountRate?: string | number; difficulty?: string;
  issued_at?: string; issuedAt?: string; expires_at?: string; expiresAt?: string;
  redeemed_at?: string; redeemedAt?: string; redeemedBy?: string;
};
type ApiResult = { ok?: boolean; success?: boolean; error?: string; message?: string; data?: unknown; adminToken?: string; token?: string; name?: string; email?: string; role?: string; voucher?: Voucher };
type Recent = { code: string; time: string };
type ModelContext = {
  registerTool: (tool: {
    name: string; title: string; description: string; inputSchema: object;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    execute: (input: unknown) => Promise<unknown>;
  }, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

const TOKEN_KEY = "ttp-staff-session";
const EMAIL_KEY = "ttp-staff-email";

async function callApi(body: Record<string, unknown>): Promise<ApiResult> {
  const response = await fetch("/api/backend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Không thể kết nối máy chủ.");
  return result;
}

function isOk(result: ApiResult) {
  return result.ok === true || result.success === true;
}

function voucherFrom(result: ApiResult): Voucher | null {
  if (result.voucher) return result.voucher;
  const data = result.data as { voucher?: Voucher } | Voucher | undefined;
  if (!data) return null;
  if ("voucher" in data) return data.voucher || null;
  return data as Voucher;
}

type VoucherReference = {
  query: string;
  voucherId: string;
  token: string;
  source: "SIGNED_QR" | "FALLBACK_QR" | "MANUAL";
};

function parseQr(raw: string): VoucherReference {
  const value = raw.trim();
  try {
    const url = new URL(value);
    const voucherId = (url.searchParams.get("v") || "").trim();
    const token = (url.searchParams.get("t") || "").trim();
    if (voucherId) return { query: voucherId, voucherId, token, source: "SIGNED_QR" };
  } catch {
    // Continue with supported non-URL formats.
  }
  if (value.toUpperCase().startsWith("AHT-VOUCHER|")) {
    const parts = value.split("|");
    const code = String(parts[1] || "").trim().toUpperCase();
    return { query: code, voucherId: "", token: "", source: "FALLBACK_QR" };
  }
  const query = value.toUpperCase();
  return {
    query,
    voucherId: query.startsWith("VCH-") ? value : "",
    token: "",
    source: "MANUAL",
  };
}

function codeOf(voucher: Voucher | null) {
  return voucher?.voucher_code || voucher?.voucherCode || voucher?.voucher_id || voucher?.voucherId || "";
}

function statusMeta(status?: string) {
  const key = (status || "").toUpperCase();
  if (key === "ISSUED" || key === "ACTIVE") return { label: "Có thể sử dụng", className: "bg-emerald-50 text-emerald-700 border-emerald-200", usable: true };
  if (key === "REDEEMED" || key === "USED") return { label: "Đã sử dụng", className: "bg-slate-100 text-slate-600 border-slate-200", usable: false };
  if (key === "EXPIRED") return { label: "Đã hết hạn", className: "bg-amber-50 text-amber-700 border-amber-200", usable: false };
  if (key === "REVOKED" || key === "CANCELLED") return { label: "Đã thu hồi", className: "bg-rose-50 text-rose-700 border-rose-200", usable: false };
  return { label: status || "Chưa xác định", className: "bg-slate-100 text-slate-600 border-slate-200", usable: false };
}

export default function VoucherTerminal() {
  const [booting, setBooting] = useState(true);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [qrToken, setQrToken] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const remembered = localStorage.getItem(EMAIL_KEY) || "";
    const token = sessionStorage.getItem(TOKEN_KEY);
    setEmail(remembered);
    if (!token) return setBooting(false);
    callApi({ action: "getAdminProfile", adminToken: token })
      .then((r) => {
        if (!isOk(r)) throw new Error();
        const data = (r.data || r) as Staff;
        setStaff({ name: data.name, email: data.email || remembered, role: data.role });
      })
      .catch(() => sessionStorage.removeItem(TOKEN_KEY))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => () => { scannerRef.current?.stop().catch(() => undefined); }, []);

  useEffect(() => {
    if (!staff) return;
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(context.registerTool({
      name: "lookup_voucher",
      title: "Tra cứu voucher",
      description: "Tra cứu một mã voucher và hiển thị kết quả trong giao diện. Công cụ này không xác nhận sử dụng voucher.",
      inputSchema: {
        type: "object",
        properties: { code: { type: "string", description: "Mã voucher hoặc nội dung QR" } },
        required: ["code"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      async execute(input) {
        const code = typeof input === "object" && input && "code" in input ? String((input as { code: unknown }).code).trim() : "";
        if (!code) throw new Error("Mã voucher không được để trống.");
        await lookup(code);
        return { status: "lookup_completed", code };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [staff]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !pin.trim()) return toast.error("Vui lòng nhập email và mã PIN.");
    setBusy(true);
    try {
      const r = await callApi({ action: "loginAdmin", email: email.trim(), pin: pin.trim() });
      if (!isOk(r)) throw new Error(r.error || r.message || "Thông tin đăng nhập không đúng.");
      const data = (r.data || r) as ApiResult;
      const token = data.adminToken || data.token;
      if (!token) throw new Error("Không nhận được phiên đăng nhập.");
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(EMAIL_KEY, email.trim());
      setStaff({ name: data.name, email: data.email || email.trim(), role: data.role });
      setPin("");
      toast.success("Đăng nhập thành công");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể đăng nhập.");
    } finally { setBusy(false); }
  }

  async function logout() {
    await stopScanner();
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) callApi({ action: "logoutAdmin", adminToken: token }).catch(() => undefined);
    sessionStorage.removeItem(TOKEN_KEY);
    setStaff(null); setVoucher(null); setRecent([]);
  }

  async function stopScanner() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try { await scanner.stop(); } catch { /* already stopped */ }
      try { scanner.clear(); } catch { /* already cleared */ }
    }
    setScannerActive(false);
  }

  async function startScanner() {
    await stopScanner();
    setVoucher(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      setScannerActive(true);
      await scanner.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: (w, h) => ({ width: Math.min(280, w - 32), height: Math.min(280, h - 32) }) },
        async (decoded) => { await stopScanner(); await lookup(decoded); },
        () => undefined,
      );
    } catch {
      setScannerActive(false);
      toast.error("Không mở được camera. Hãy cấp quyền camera hoặc chọn ảnh QR.");
    }
  }

  async function scanFile(file?: File) {
    if (!file) return;
    await stopScanner();
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-file-reader");
      const decoded = await scanner.scanFile(file, true);
      scanner.clear();
      await lookup(decoded);
    } catch { toast.error("Không đọc được mã QR trong ảnh này."); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  async function lookup(raw: string) {
    const parsed = parseQr(raw);
    if (!parsed.query) return toast.error("Mã voucher không hợp lệ.");
    if (parsed.source === "SIGNED_QR" && !parsed.token) {
      return toast.error("QR voucher thiếu mã bảo mật. Vui lòng nhập mã voucher để tra cứu.");
    }
    setBusy(true); setVoucher(null); setQrToken(parsed.token);
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      const r = parsed.source === "SIGNED_QR"
        ? await callApi({
            action: "getVoucherStatus",
            voucherId: parsed.voucherId,
            token: parsed.token,
            deviceInfo: navigator.userAgent,
          })
        : await callApi({
            action: "lookupVoucher",
            adminToken: token,
            query: parsed.query,
          });
      if (!isOk(r)) throw new Error(r.error || r.message || "Không tìm thấy voucher.");
      const found = voucherFrom(r);
      if (!found) throw new Error("Không tìm thấy dữ liệu voucher.");
      setVoucher(found);
      navigator.vibrate?.(80);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tra cứu được voucher.");
    } finally { setBusy(false); setManualOpen(false); setManualCode(""); }
  }

  async function redeem() {
    if (!voucher) return;
    setBusy(true);
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      const r = await callApi({
        action: "redeemVoucher", adminToken: token,
        voucherId: voucher.voucher_id || voucher.voucherId,
        voucherCode: voucher.voucher_code || voucher.voucherCode,
        token: qrToken, redemptionPoint: "BUSINESS_LOUNGE",
        deviceInfo: navigator.userAgent,
      });
      if (!isOk(r)) throw new Error(r.error || r.message || "Không thể xác nhận voucher.");
      const code = codeOf(voucher);
      setRecent((items) => [{ code, time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) }, ...items].slice(0, 5));
      setVoucher({ ...voucher, status: "REDEEMED", redeemedAt: new Date().toISOString() });
      setConfirmOpen(false); setSuccessOpen(true);
      navigator.vibrate?.([100, 60, 100]);
    } catch (error) {
      setConfirmOpen(false);
      toast.error(error instanceof Error ? error.message : "Không thể xác nhận voucher.");
    } finally { setBusy(false); }
  }

  if (booting) return <div className="min-h-dvh grid place-items-center bg-[#f3f6fa]"><Loader2 className="size-8 animate-spin text-[#123877]" /></div>;

  if (!staff) return (
    <main className="login-shell min-h-dvh">
      <Toaster richColors position="top-center" />
      <section className="login-brand">
        <div className="brand-mark">AHT</div>
        <div>
          <p className="eyebrow text-cyan-200">NHÀ GA QUỐC TẾ ĐÀ NẴNG</p>
          <h1>Touch to Play<br /><span>Voucher Check</span></h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-blue-100/80">Cổng nghiệp vụ dành cho nhân viên tra cứu và xác nhận ưu đãi của hành khách.</p>
        </div>
        <div className="hidden lg:flex items-center gap-3 text-sm text-white/70"><ShieldCheck className="size-5 text-cyan-300" /> Kết nối an toàn với hệ thống vận hành</div>
      </section>
      <section className="login-panel">
        <form onSubmit={login} className="w-full max-w-md">
          <Badge className="mb-5 border-cyan-200 bg-cyan-50 text-cyan-700">STAFF ACCESS</Badge>
          <h2 className="text-3xl font-bold tracking-tight text-[#123877]">Đăng nhập nhân viên</h2>
          <p className="mt-2 text-sm text-slate-500">Sử dụng tài khoản đã được cấp trên hệ thống Admin.</p>
          <div className="mt-8 space-y-5">
            <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nhanvien@..." className="h-12" /></div>
            <div className="space-y-2"><Label htmlFor="pin">Mã PIN</Label><div className="relative"><Input id="pin" type={showPin ? "text" : "password"} inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Nhập mã PIN" className="h-12 pr-12 tracking-[.25em]" /><button type="button" aria-label={showPin ? "Ẩn PIN" : "Hiện PIN"} onClick={() => setShowPin(!showPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPin ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button></div></div>
          </div>
          <Button className="mt-7 h-12 w-full bg-[#123877] text-base hover:bg-[#0d2c61]" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <>Đăng nhập <ChevronRight /></>}</Button>
          <p className="mt-6 text-center text-xs leading-5 text-slate-400">Chỉ dành cho nhân sự được ủy quyền. Mọi thao tác xác nhận đều được ghi nhận.</p>
        </form>
      </section>
    </main>
  );

  const meta = statusMeta(voucher?.status);
  return (
    <main className="min-h-dvh bg-[#eef3f8] text-slate-900">
      <Toaster richColors position="top-center" />
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#123877] text-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-full bg-white text-xs font-black text-[#123877]">AHT</div><div><p className="text-sm font-bold leading-4">Touch to Play</p><p className="text-[11px] text-blue-200">Voucher Check</p></div></div>
          <div className="flex items-center gap-2"><div className="hidden text-right sm:block"><p className="text-xs font-semibold">{staff.name || staff.email}</p><p className="text-[10px] uppercase tracking-wide text-blue-200">{staff.role || "Staff"}</p></div><Button size="icon" variant="ghost" onClick={logout} className="text-white hover:bg-white/10 hover:text-white" aria-label="Đăng xuất"><LogOut /></Button></div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 p-4 lg:grid-cols-[1.45fr_.85fr] lg:p-6">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5 sm:flex sm:items-end sm:justify-between">
            <div><p className="eyebrow text-cyan-700">KIỂM TRA VOUCHER</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-[#123877]">Quét mã QR của hành khách</h1><p className="mt-1 text-sm text-slate-500">Đưa mã vào giữa khung, hệ thống sẽ tự động nhận diện.</p></div>
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 sm:mt-0"><span className="size-2 animate-pulse rounded-full bg-emerald-500" /> Hệ thống sẵn sàng</div>
          </div>

          <div className="p-4 sm:p-5">
            <div className="scanner-stage">
              <div id="qr-reader" className={scannerActive ? "h-full w-full" : "hidden"} />
              <div id="qr-file-reader" className="hidden" />
              {!scannerActive && !voucher && <div className="grid h-full place-items-center text-center"><div><div className="mx-auto grid size-20 place-items-center rounded-3xl bg-white/10"><ScanLine className="size-10 text-cyan-300" /></div><p className="mt-5 font-semibold text-white">Camera chưa được bật</p><p className="mt-1 text-sm text-blue-200">Nhấn “Mở camera” để bắt đầu quét</p></div></div>}
              {busy && <div className="absolute inset-0 z-20 grid place-items-center bg-[#071c3d]/80 text-white backdrop-blur-sm"><div className="text-center"><Loader2 className="mx-auto size-9 animate-spin text-cyan-300" /><p className="mt-3 text-sm">Đang kiểm tra voucher…</p></div></div>}
              {voucher && <div className="absolute inset-0 z-10 grid place-items-center bg-gradient-to-b from-[#0d2f67] to-[#071c3d] p-5"><TicketCheck className="size-14 text-cyan-300" /><p className="mt-3 text-sm font-medium text-white">Đã nhận diện voucher</p></div>}
              {scannerActive && <><span className="scan-corner tl" /><span className="scan-corner tr" /><span className="scan-corner bl" /><span className="scan-corner br" /></>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Button className="h-12 bg-[#123877] hover:bg-[#0d2c61]" onClick={scannerActive ? stopScanner : startScanner}>{scannerActive ? <><RefreshCw /> Dừng camera</> : <><Camera /> Mở camera</>}</Button>
              <Button variant="outline" className="h-12" onClick={() => fileRef.current?.click()}><ImagePlus /> Chọn ảnh QR</Button>
              <Button variant="outline" className="col-span-2 h-12 sm:col-span-1" onClick={() => setManualOpen(true)}><Keyboard /> Nhập mã</Button>
              <input ref={fileRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={(e) => scanFile(e.target.files?.[0])} />
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><p className="eyebrow text-slate-500">KẾT QUẢ</p><h2 className="mt-1 text-lg font-bold text-[#123877]">Thông tin voucher</h2></div><QrCode className="size-7 text-slate-300" /></div>
            {!voucher ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center"><TicketCheck className="mx-auto size-9 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-500">Chưa có voucher</p><p className="mt-1 text-xs text-slate-400">Quét QR hoặc nhập mã để tra cứu.</p></div> :
              <div className="mt-5">
                <Badge className={meta.className}>{meta.label}</Badge>
                <p className="mt-4 break-all font-mono text-xl font-black tracking-wide text-[#123877]">{codeOf(voucher)}</p>
                <dl className="mt-5 divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4 text-sm">
                  <div className="flex justify-between py-3"><dt className="text-slate-500">Giá trị ưu đãi</dt><dd className="font-bold text-slate-800">{voucher.discountRate || voucher.discount ? `${voucher.discountRate ?? voucher.discount}${String(voucher.discountRate ?? voucher.discount).includes("%") ? "" : "%"}` : "—"}</dd></div>
                  <div className="flex justify-between py-3"><dt className="text-slate-500">Cấp độ</dt><dd className="font-semibold capitalize">{voucher.difficulty || "—"}</dd></div>
                  <div className="flex justify-between gap-3 py-3"><dt className="text-slate-500">Hết hạn</dt><dd className="text-right font-semibold">{voucher.expiresAt || voucher.expires_at || "—"}</dd></div>
                </dl>
                <Button disabled={!meta.usable || busy} onClick={() => setConfirmOpen(true)} className="mt-5 h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700"><BadgeCheck /> Xác nhận sử dụng</Button>
                <Button variant="ghost" onClick={() => { setVoucher(null); setQrToken(""); }} className="mt-2 w-full text-slate-500">Quét voucher khác</Button>
              </div>}
          </section>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><History className="size-4 text-cyan-700" /><h2 className="text-sm font-bold text-[#123877]">Xác nhận gần đây</h2></div>
            {recent.length === 0 ? <p className="mt-4 text-xs text-slate-400">Chưa có lượt xác nhận trong phiên này.</p> : <ul className="mt-3 divide-y divide-slate-100">{recent.map((item) => <li key={item.code + item.time} className="flex items-center justify-between py-3"><span className="font-mono text-xs font-semibold">{item.code}</span><span className="flex items-center gap-1 text-xs text-slate-400"><Clock3 className="size-3" />{item.time}</span></li>)}</ul>}
          </section>
        </aside>
      </div>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md"><DialogHeader><DialogTitle className="text-[#123877]">Nhập mã voucher</DialogTitle><DialogDescription>Nhập mã in trên voucher khi không thể quét QR.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="manual">Mã voucher</Label><Input id="manual" autoFocus value={manualCode} onChange={(e) => setManualCode(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") lookup(manualCode); }} placeholder="Ví dụ: AHT-..." className="h-12 font-mono uppercase" /></div><DialogFooter><Button variant="outline" onClick={() => setManualOpen(false)}>Hủy</Button><Button className="bg-[#123877]" disabled={!manualCode.trim() || busy} onClick={() => lookup(manualCode)}>Tra cứu</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-3xl"><AlertDialogHeader><AlertDialogMedia className="bg-amber-50 text-amber-600"><TriangleAlert /></AlertDialogMedia><AlertDialogTitle>Xác nhận sử dụng voucher?</AlertDialogTitle><AlertDialogDescription>Voucher <strong className="text-slate-800">{codeOf(voucher)}</strong> sẽ được ghi nhận là đã sử dụng và không thể hoàn tác. Hãy đối chiếu với hành khách trước khi xác nhận.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Kiểm tra lại</AlertDialogCancel><AlertDialogAction onClick={redeem} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">{busy ? <Loader2 className="animate-spin" /> : "Xác nhận sử dụng"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent showCloseButton={false} className="rounded-3xl text-center sm:max-w-sm"><div className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-50"><CheckCircle2 className="size-11 text-emerald-600" /></div><DialogHeader className="text-center"><DialogTitle className="text-2xl text-[#123877]">Xác nhận thành công</DialogTitle><DialogDescription>Voucher đã được ghi nhận sử dụng trên hệ thống.</DialogDescription></DialogHeader><div className="rounded-2xl bg-slate-50 p-4 font-mono font-bold text-[#123877]">{codeOf(voucher)}</div><Button className="h-12 bg-[#123877]" onClick={() => { setSuccessOpen(false); setVoucher(null); setQrToken(""); startScanner(); }}>Quét voucher tiếp theo</Button></DialogContent>
      </Dialog>
    </main>
  );
}
