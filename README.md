# Touch to Play Voucher Check

Website dành riêng cho nhân viên AHT đăng nhập, quét QR, tra cứu và xác nhận voucher Touch to Play.

Phiên bản 1.2:

- Sửa nút chọn ảnh QR để Android và iOS mở thư viện ảnh thay vì bị ép chụp ảnh mới.
- Tự nhận diện và ưu tiên camera sau trên iPhone/iPad.
- Bổ sung thuộc tính video nội tuyến cho Safari iOS và thông báo lỗi camera cụ thể.
- Cho phép chọn lại cùng một ảnh QR và cải thiện dọn dẹp camera sau khi quét.

Phiên bản 1.1:

- Xác thực QR chính thức bằng `voucherId + token`.
- Hỗ trợ QR dự phòng dạng `AHT-VOUCHER|CODE|EXPIRES_AT`.
- Gửi đúng trường `token` khi xác nhận sử dụng.
- Chuẩn hóa các trường dữ liệu camelCase từ Apps Script.

## Chạy trên máy tính

Yêu cầu Node.js 20 trở lên.

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Đưa lên GitHub

1. Tạo repository mới trên GitHub.
2. Giải nén toàn bộ nội dung gói mã nguồn này.
3. Upload các file vào thư mục gốc của repository.
4. Commit vào nhánh `main`.

Hoặc dùng Git:

```bash
git init
git add .
git commit -m "Initial Touch to Play voucher checker"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

## Triển khai bằng Vercel

1. Đăng nhập Vercel bằng GitHub.
2. Chọn **Add New → Project**.
3. Import repository vừa tạo.
4. Vercel sẽ tự nhận diện Next.js.
5. Nhấn **Deploy**.

Không cần khai báo biến môi trường ở phiên bản hiện tại. API trung gian nằm tại:

`app/api/backend/route.ts`

## Lưu ý

- Website triển khai phải dùng HTTPS để camera hoạt động.
- Tài khoản nhân viên vẫn được xác thực bởi backend Touch to Play.
- Không lưu email, PIN hoặc token đăng nhập trong mã nguồn.
- Voucher chỉ chuyển sang đã sử dụng sau khi nhân viên bấm xác nhận.
