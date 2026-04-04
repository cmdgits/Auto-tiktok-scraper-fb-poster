# Social Tool

Hệ thống quản trị fanpage Facebook theo mô hình "một dashboard để vận hành toàn bộ": lấy video từ TikTok và YouTube, tạo chiến dịch, xếp lịch đăng Reels, sinh caption AI, tự động phản hồi comment và inbox, theo dõi worker/task queue, và quản lý cấu hình runtime ngay trên giao diện.

README này mô tả trạng thái hiện tại của repo.

## 1. Mục tiêu dự án

Social Tool được xây để giải quyết một luồng vận hành fanpage tương đối đầy đủ:

- Tạo campaign từ link TikTok hoặc nhiều dạng nguồn YouTube.
- Đồng bộ video từ nguồn về hàng chờ nội dung.
- Sắp lịch đăng Facebook Reels theo campaign.
- Tạo hoặc chỉnh caption bằng AI.
- Tự động phản hồi comment Facebook.
- Tự động phản hồi inbox Messenger theo ngữ cảnh.
- Cho operator tiếp quản các cuộc hội thoại cần người thật.
- Giám sát worker, queue, health, log và cấu hình hệ thống từ một dashboard duy nhất.

Đây không chỉ là tool đăng bài. Đây là một stack vận hành fanpage gồm content pipeline, queue/worker, AI pipeline và workspace cho operator.

## 2. Công nghệ sử dụng

- Backend: FastAPI
- Frontend: React 19 + Vite
- Database: PostgreSQL
- Queue nền: bảng `task_queue` trong PostgreSQL
- Worker: tiến trình Python riêng
- Video ingestion: `yt-dlp` + `ffmpeg`
- Reverse proxy frontend: Nginx
- AI provider: Gemini và OpenAI
- Triển khai mặc định: Docker Compose

## 3. Chức năng chính

- Đăng nhập, quản lý user và phân quyền `admin` / `operator`.
- Tạo campaign từ TikTok video, TikTok profile, TikTok shortlink, YouTube video đơn, YouTube Shorts, playlist và feed/kênh YouTube.
- Tự đồng bộ video nguồn về queue.
- Tự sắp lịch đăng theo khoảng cách phút giữa các video.
- Cho phép chỉnh lại mốc bắt đầu campaign sau khi campaign đã được tạo.
- Khi người dùng nhập giờ bắt đầu cụ thể, hệ thống sẽ bám đúng giờ đó cho video chưa đăng của campaign.
- Worker tự tải video đầu tiên theo lịch để sẵn sàng đăng.
- Worker tự đăng video đúng hạn lên fanpage Facebook.
- Sinh caption AI theo hai chế độ:
  - Có caption gốc: viết lại nhẹ, giữ sát ý cũ nhưng cuốn hơn.
  - Không có caption gốc: tự tạo caption từ ngữ cảnh video/campaign.
- Cho phép chỉnh tay caption AI trực tiếp trong dashboard.
- Tự động phản hồi comment Facebook bằng AI.
- Tự động phản hồi inbox Messenger với conversation memory.
- Handoff sang operator khi AI không nên trả lời.
- Dashboard vận hành cho task queue, worker heartbeat, system events, health checks.
- Tự dọn các worker mất kết nối khỏi dashboard theo lịch.
- Quản lý runtime config ngay trên dashboard và sinh lại `backend/runtime.env`.

## 4. Nguồn nội dung hỗ trợ

### TikTok

- Video đơn:
  - `https://www.tiktok.com/@creator/video/...`
- Profile:
  - `https://www.tiktok.com/@creator`
- Shortlink:
  - `https://vt.tiktok.com/...`
  - `https://vm.tiktok.com/...`

### YouTube

- Video đơn:
  - `https://www.youtube.com/watch?v=...`
  - `https://youtu.be/...`
- Shorts đơn:
  - `https://www.youtube.com/shorts/...`
- Playlist:
  - `https://www.youtube.com/playlist?list=...`
- Kênh/feed:
  - `https://www.youtube.com/@creator`
  - `https://www.youtube.com/@creator/videos`
  - `https://www.youtube.com/@creator/shorts`
  - `https://www.youtube.com/channel/.../videos`
  - `https://www.youtube.com/user/.../videos`

## 5. Kiến trúc hệ thống

```text
Frontend Dashboard (React/Vite + Nginx)
            |
            v
      Backend API (FastAPI)
            |
            +--> PostgreSQL
            +--> Webhook Facebook
            +--> Runtime config / health / auth
            |
            v
      Task Queue trong DB
            |
            v
        Worker Python
            |
            +--> yt-dlp / ffmpeg
            +--> Gemini / OpenAI
            +--> Facebook Graph API
```

Nguyên tắc vận hành:

- `backend` xử lý API, auth, webhook, serialize dữ liệu và quản trị hệ thống.
- `worker` xử lý job nền: sync campaign, tạo caption, trả lời AI, auto-post, scheduler.
- `db` lưu toàn bộ campaign, video, queue, user, log, conversation, runtime settings.
- `frontend` là dashboard vận hành production.

## 6. Thành phần trong Docker Compose

Theo [docker-compose.yml](./docker-compose.yml):

- `db`
  - PostgreSQL 15
  - cổng host: `5432`
- `backend`
  - FastAPI API
  - cổng host: `8000`
- `worker`
  - tiến trình nền riêng
  - không public port
- `frontend`
  - Nginx serve React build
  - cổng host: `5173`
- `tunnel`
  - Cloudflare Tunnel
  - tùy chọn

Địa chỉ mặc định:

- Dashboard: `http://localhost:5173`
- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- Health nhanh: `http://localhost:8000/health`

## 7. Cấu trúc thư mục

```text
.
|-- backend/
|   |-- alembic/
|   |-- app/
|   |   |-- api/
|   |   |-- core/
|   |   |-- models/
|   |   |-- services/
|   |   `-- worker/
|   |-- tests/
|   |-- Dockerfile
|   |-- runtime.env
|   `-- runtime.env.example
|-- frontend/
|   |-- src/
|   |-- public/
|   |-- Dockerfile
|   `-- nginx.conf
|-- database/
|-- docs/
|-- videos_storage/
|-- .env.example
|-- docker-compose.yml
`-- README.md
```

## 8. Thành phần backend quan trọng

### API modules

- `backend/app/api/auth.py`
  - đăng nhập, phiên, đổi mật khẩu
- `backend/app/api/users.py`
  - quản lý user
- `backend/app/api/campaigns.py`
  - campaign, video queue, caption, lịch đăng
- `backend/app/api/facebook.py`
  - fanpage, import page, validate token, subscribe messages
- `backend/app/api/webhooks.py`
  - webhook Facebook, comment/inbox logs, conversation workspace
- `backend/app/api/system.py`
  - health, workers, tasks, events, runtime config

### Services

- `backend/app/services/ytdlp_crawler.py`
  - crawl metadata video
- `backend/app/services/source_resolver.py`
  - chuẩn hóa loại nguồn đầu vào
- `backend/app/services/campaign_jobs.py`
  - logic sync campaign, lịch video
- `backend/app/services/ai_generator.py`
  - caption AI, reply AI
- `backend/app/services/task_queue.py`
  - queue, retry, stale recovery
- `backend/app/services/observability.py`
  - system event, worker heartbeat, cleanup stale workers

### Worker

- `backend/app/worker/run.py`
  - tiến trình worker chính
- `backend/app/worker/cron.py`
  - scheduler jobs
- `backend/app/worker/tasks.py`
  - xử lý task queue
- `backend/app/worker/healthcheck.py`
  - healthcheck cho container worker

## 9. Thành phần frontend quan trọng

- `frontend/src/App.jsx`
  - state lớn nhất của dashboard, request API, điều phối section
- `frontend/src/components/dashboard/CampaignSection.jsx`
  - quản trị campaign
- `frontend/src/components/dashboard/QueueSection.jsx`
  - hàng chờ video và caption
- `frontend/src/components/dashboard/MessagesSection.jsx`
  - workspace inbox AI / operator
- `frontend/src/components/dashboard/SecuritySection.jsx`
  - mật khẩu, user, reset password
- `frontend/src/components/dashboard/OperationsSection.jsx`
  - worker, queue, events, health

## 10. Chạy nhanh bằng Docker

Yêu cầu:

- Docker Desktop
- Docker Compose

Chạy stack chính:

```bash
docker compose up -d --build db backend worker frontend
```

Nếu muốn chạy thêm Cloudflare Tunnel:

```bash
docker compose up -d --build db backend worker frontend tunnel
```

Xem log:

```bash
docker compose logs -f backend worker frontend
```

Dừng stack:

```bash
docker compose down
```

## 11. Tài khoản mặc định

Sau khi khởi động lần đầu:

- username: `admin`
- password: `admin123`

Việc nên làm ngay:

- đăng nhập dashboard
- đổi mật khẩu admin
- kiểm tra `Bảo mật`
- cấu hình runtime cần thiết

## 12. Runtime config và biến môi trường

### File env mẫu

- [`.env.example`](./.env.example)
- [`backend/runtime.env.example`](./backend/runtime.env.example)

### Runtime config có thể quản lý trên dashboard

- `BASE_URL`
- `FB_VERIFY_TOKEN`
- `FB_APP_SECRET`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `SERPAPI_API_KEY`
- `TREND_GEO`
- `TREND_SEARCH_ENDPOINT`
- `TREND_SEARCH_API_KEY`
- `TUNNEL_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `ADMIN_PASSWORD`

Dashboard lưu giá trị vào database và sinh lại file:

- [`backend/runtime.env`](./backend/runtime.env)

### Biến nên giữ ở tầng triển khai

- `DATABASE_URL`
- `JWT_SECRET`
- `TOKEN_ENCRYPTION_SECRET`
- `AUTH_TOKEN_EXPIRE_MINUTES`
- `DEFAULT_ADMIN_USERNAME`
- `DEFAULT_ADMIN_DISPLAY_NAME`
- `SCHEDULER_ENABLED`
- `BACKGROUND_JOBS_MODE`
- `APP_ROLE`
- `LOG_LEVEL`
- `TASK_LOCK_STALE_SECONDS`
- `WORKER_STALE_SECONDS`
- `HTTP_RETRY_ATTEMPTS`
- `HTTP_RETRY_BASE_SECONDS`
- `HTTP_RETRY_MAX_SECONDS`

## 13. Thiết lập lần đầu sau khi chạy stack

### Bước 1: mở dashboard

- `http://localhost:5173`

### Bước 2: đăng nhập admin

- dùng tài khoản mặc định

### Bước 3: đổi mật khẩu admin

- vào khu `Bảo mật`
- đổi ngay mật khẩu mặc định

### Bước 4: cấu hình runtime

Tối thiểu nên điền:

- `BASE_URL`
- `FB_VERIFY_TOKEN`
- `FB_APP_SECRET`
- ít nhất một AI key: `GEMINI_API_KEY` hoặc `OPENAI_API_KEY`

### Bước 5: kết nối fanpage

Hệ thống hỗ trợ hai cách:

- import nhiều page bằng `User Access Token`
- thêm thủ công từng page bằng `Page Access Token`

### Bước 6: validate fanpage

Sau khi thêm page, nên:

- kiểm tra token page
- subscribe page vào app
- kiểm tra webhook nhận `feed` và `messages`

### Bước 7: tạo campaign đầu tiên

- dán link nguồn
- chọn fanpage đích
- chọn khoảng cách đăng
- nhập giờ bắt đầu nếu muốn cố định
- tạo campaign
- sync campaign

## 14. Luồng tạo campaign và đăng video

Luồng cơ bản:

1. Người dùng tạo campaign với URL nguồn.
2. Backend chuẩn hóa loại nguồn.
3. Worker sync campaign và lấy metadata video từ `yt-dlp`.
4. Mỗi video được lưu thành bản ghi `Video`.
5. Hệ thống xếp `publish_time` theo `schedule_interval`.
6. Nếu campaign có `schedule_start_at`, video chưa đăng sẽ bám đúng mốc đó.
7. Worker chuẩn bị video đầu tiên và đổi sang `ready`.
8. Đến giờ, worker tự đăng video lên Facebook.
9. Sau khi đăng xong, worker chuẩn bị video tiếp theo.

Điểm quan trọng hiện tại:

- Khi sửa hoặc lưu lại lịch bắt đầu campaign, hệ thống ưu tiên đúng giờ người dùng nhập.
- Worker có thể tự chuẩn bị video `pending` đầu tiên khi đến lịch.
- Worker stale tự được dọn khỏi dashboard mà không cần bấm nút thủ công.

## 15. Quản lý lịch đăng

Trong dashboard:

- có thể chỉnh `Ngày giờ bắt đầu mới`
- có thể khôi phục về mốc hiện có
- có thể bỏ trống để quay về mode không cố định giờ bắt đầu

Hành vi hiện tại:

- Nếu có `schedule_start_at`, campaign sẽ bám mốc đó.
- Nếu không có `schedule_start_at`, hệ thống xếp theo hàng chờ fanpage.
- Chỉnh lịch chỉ áp dụng cho các video chưa đăng của campaign.

## 16. Caption AI

Caption AI hiện có hai chế độ chính:

### Video có caption gốc

- AI giữ sát ý caption gốc
- chỉ rewrite nhẹ cho mượt hơn, có hook hơn, hút xem hơn
- không đổi sang chủ đề khác
- hạn chế bịa thêm fact không có trong caption nguồn

### Video không có caption gốc

- AI tự tạo caption từ ngữ cảnh video
- dùng thông tin như:
  - tên campaign
  - platform
  - source kind
  - fanpage đích
  - original id
- mục tiêu là tạo caption hợp kiểu video ngắn, tự nhiên, có hook và CTA

### Caption AI trong hệ thống

- worker có thể tự generate trước khi đăng
- người dùng có thể bấm generate lại từng video
- người dùng có thể sửa tay caption AI trong queue

## 17. Comment AI và Inbox AI

### Comment AI

Luồng:

1. Facebook gửi webhook comment.
2. Backend xác thực request.
3. Hệ thống lưu `InteractionLog`.
4. Nếu page bật auto-reply comment, backend đẩy task vào queue.
5. Worker gọi AI và reply qua Facebook Graph API.

### Inbox AI

Luồng:

1. Facebook gửi webhook message.
2. Backend lưu `InboxMessageLog`.
3. Hệ thống dựng `InboxConversation`.
4. Nếu hội thoại được phép AI xử lý, backend tạo task reply.
5. Worker tạo phản hồi có ngữ cảnh từ:
   - conversation summary
   - recent turns
   - customer facts
   - page prompt / knowledge
6. Nếu AI yêu cầu handoff, conversation chuyển sang `operator_active`.

## 18. Workspace cho operator

Phần `Tin nhắn AI` trên dashboard hỗ trợ:

- xem danh sách conversation
- lọc theo trạng thái
- xem timeline chat
- xem summary / intent / facts
- gán người xử lý
- ghi chú nội bộ
- trả lời thủ công ngay trên UI
- chuyển conversation sang `resolved`

Trạng thái chính:

- `ai_active`
- `operator_active`
- `resolved`

## 19. Fanpage và token

Hệ thống hiện hỗ trợ mô hình:

- một app Meta
- nhiều fanpage
- mỗi fanpage có cấu hình automation riêng

Loại token:

- `User Access Token`
  - dùng để discover/import nhiều page
  - refresh page token hàng loạt
- `Page Access Token`
  - dùng để post video, comment, inbox, subscribe page

## 20. Worker, task queue và health

### Queue

Task nền được lưu trong bảng `task_queue`.

Trạng thái:

- `queued`
- `processing`
- `completed`
- `failed`

### Worker heartbeat

Worker cập nhật heartbeat định kỳ vào bảng `worker_heartbeats`.

Thông tin lưu:

- `worker_name`
- `app_role`
- `status`
- `current_task_id`
- `current_task_type`
- `last_seen_at`

### Tự dọn worker mất kết nối

Hiện tại:

- API vẫn có nút dọn tay: `POST /system/workers/cleanup`
- ngoài ra scheduler đã tự dọn stale worker theo chu kỳ
- worker stale sẽ tự biến mất khỏi dashboard sau khi quá hạn heartbeat

## 21. API chính

### Auth

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/change-password`

### Users

- `GET /users/`
- `POST /users/`
- `PATCH /users/{user_id}`
- `POST /users/{user_id}/reset-password`
- `DELETE /users/{user_id}`

### Facebook

- `GET /facebook/config`
- `POST /facebook/config`
- `POST /facebook/config/discover-pages`
- `POST /facebook/config/import-pages`
- `POST /facebook/config/refresh-pages`
- `GET /facebook/config/{page_id}/validate`
- `POST /facebook/config/{page_id}/subscribe-messages`
- `PATCH /facebook/config/{page_id}/automation`
- `DELETE /facebook/config/{page_id}`

### Campaigns

- `POST /campaigns/`
- `GET /campaigns/`
- `PATCH /campaigns/{campaign_id}/schedule`
- `POST /campaigns/{campaign_id}/sync`
- `POST /campaigns/{campaign_id}/pause`
- `POST /campaigns/{campaign_id}/resume`
- `DELETE /campaigns/{campaign_id}`
- `GET /campaigns/stats`
- `GET /campaigns/videos`
- `POST /campaigns/videos/{video_id}/priority`
- `PATCH /campaigns/videos/{video_id}/caption`
- `POST /campaigns/videos/{video_id}/generate-caption`
- `POST /campaigns/videos/{video_id}/retry`

### Webhooks và inbox workspace

- `GET /webhooks/fb`
- `POST /webhooks/fb`
- `GET /webhooks/logs`
- `GET /webhooks/messages`
- `GET /webhooks/conversations`
- `GET /webhooks/conversations/{conversation_id}`
- `PATCH /webhooks/conversations/{conversation_id}`
- `POST /webhooks/conversations/{conversation_id}/reply`
- `PATCH /webhooks/messages/{conversation_id}/handoff`

### System

- `GET /system/overview`
- `GET /system/health`
- `GET /system/runtime-config`
- `PUT /system/runtime-config`
- `POST /system/runtime-config/verify-tunnel-token`
- `POST /system/ai-preview`
- `GET /system/tasks`
- `GET /system/events`
- `GET /system/workers`
- `POST /system/workers/cleanup`

Chi tiết schema xem tại:

- `http://localhost:8000/docs`

## 22. Chạy local không dùng Docker

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Worker

```bash
cd backend
.venv\Scripts\activate
python -m app.worker.run
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

## 23. Build và kiểm tra chất lượng

### Backend

```bash
cd backend
python -m compileall app alembic
python -m pytest -q tests
```

### Frontend

```bash
cd frontend
npm run lint
npm run build
```

### Docker

```bash
docker compose config
docker compose up -d --build
```

## 24. Vận hành production nhỏ với Docker

Theo file compose hiện tại:

- service đều có `restart: unless-stopped`
- có `healthcheck`
- có `init: true`
- có log rotation
- frontend chạy Nginx production thay vì Vite dev server
- worker chạy lệnh:

```bash
alembic upgrade head && python -m app.worker.run
```

Khuyến nghị khi deploy:

- đặt `JWT_SECRET` thật
- đặt `TOKEN_ENCRYPTION_SECRET` thật
- dùng domain HTTPS thật cho `BASE_URL`
- theo dõi `/system/health`
- theo dõi log `backend` và `worker`

## 25. FAQ

### Clone mới nhưng chưa có `backend/runtime.env` thì sao?

Compose đã fallback sang `backend/runtime.env.example`, nên stack vẫn có thể lên được.

### Có bắt buộc dùng Cloudflare Tunnel không?

Không. Nếu bạn có sẵn domain HTTPS và reverse proxy thì chỉ cần `BASE_URL` public đúng là được.

### Vì sao video không đăng đúng giờ?

Các nguyên nhân thường gặp:

- worker chưa chạy
- video đầu tiên còn `pending` nhưng worker cũ chưa chuẩn bị
- fanpage/token lỗi
- trước đây campaign bị lệch lịch cũ, cần lưu lại mốc bắt đầu sau khi update code

### Vì sao comment hoặc inbox không vào hệ thống?

- `BASE_URL` chưa public đúng
- `FB_VERIFY_TOKEN` sai
- `FB_APP_SECRET` sai hoặc thiếu
- page chưa subscribe vào app
- token page hết hạn hoặc sai loại

### Vì sao AI không trả lời inbox?

- page chưa bật message automation
- conversation đang `operator_active`
- worker không online
- chưa cấu hình AI key

### Vì sao generate caption trước đây báo lỗi khi video không có caption gốc?

Hiện tại hành vi này đã được mở lại. Hệ thống sẽ dùng ngữ cảnh video để tạo caption mới thay vì chặn.

## 26. Gợi ý quy trình vận hành thực tế

Một flow gọn để dùng hằng ngày:

1. Kiểm tra `Tổng quan` và `Vận hành`.
2. Kiểm tra worker online và queue không bị fail nhiều.
3. Sync campaign mới hoặc đồng bộ lại campaign cũ.
4. Ra `Lịch đăng`, chỉnh caption AI nếu cần.
5. Theo dõi `Tin nhắn AI` để xử lý hội thoại cần operator.
6. Kiểm tra `Bảo mật` và user nếu có nhân sự mới.

## 27. Ghi chú cuối

Repo này đang đi theo hướng "tool vận hành thực chiến", nên nhiều hành vi được tối ưu trực tiếp cho dashboard và workflow nội bộ:

- ưu tiên vận hành bằng UI
- worker tách riêng khỏi API
- runtime config có thể đổi ngay trong dashboard
- queue và worker có quan sát trạng thái rõ ràng

Nếu cần mở rộng tiếp, các hướng hợp lý nhất là:

- thêm nhiều style caption theo loại nội dung
- thêm batch actions cho queue
- thêm analytics theo campaign/page
- thêm retry policy tinh hơn cho Graph API và AI provider
