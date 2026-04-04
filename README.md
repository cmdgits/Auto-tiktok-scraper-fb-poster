# Social Tool

He thong quan tri fanpage Facebook theo mo hinh "mot dashboard de van hanh toan bo": lay video tu TikTok va YouTube Shorts, tao chien dich, xep lich dang Reels, sinh caption AI, tu dong phan hoi comment va inbox, theo doi worker/task queue, va quan ly cau hinh runtime ngay tren giao dien.

README nay mo ta trang thai hien tai cua repo.

## 1. Muc tieu du an

Social Tool duoc xay de giai quyet mot luong van hanh fanpage tuong doi day du:

- Tao campaign tu link TikTok hoac YouTube Shorts.
- Dong bo video tu nguon ve hang cho noi dung.
- Sap lich dang Facebook Reels theo campaign.
- Tao hoac chinh caption bang AI.
- Tu dong phan hoi comment Facebook.
- Tu dong phan hoi inbox Messenger theo ngu canh.
- Cho operator tiep quan cac cuoc hoi thoai can nguoi that.
- Giam sat worker, queue, health, log va cau hinh he thong tu mot dashboard duy nhat.

Day khong chi la tool dang bai. Day la mot stack van hanh fanpage gom content pipeline, queue/worker, AI pipeline va workspace cho operator.

## 2. Cong nghe su dung

- Backend: FastAPI
- Frontend: React 19 + Vite
- Database: PostgreSQL
- Queue nen: bang `task_queue` trong PostgreSQL
- Worker: tien trinh Python rieng
- Video ingestion: `yt-dlp` + `ffmpeg`
- Reverse proxy frontend: Nginx
- AI provider: Gemini va OpenAI
- Trien khai mac dinh: Docker Compose

## 3. Chuc nang chinh

- Dang nhap, quan ly user va phan quyen `admin` / `operator`.
- Tao campaign tu TikTok video, TikTok profile, TikTok shortlink, YouTube Shorts don, YouTube Shorts feed.
- Tu dong bo video nguon ve queue.
- Tu sap lich dang theo khoang cach phut giua cac video.
- Cho phep chinh lai moc bat dau campaign sau khi campaign da duoc tao.
- Khi nguoi dung nhap gio bat dau cu the, he thong se bam dung gio do cho video chua dang cua campaign.
- Worker tu tai video dau tien theo lich de san sang dang.
- Worker tu dang video dung han len fanpage Facebook.
- Sinh caption AI theo hai che do:
  - Co caption goc: viet lai nhe, giu sat y cu nhung cuon hon.
  - Khong co caption goc: tu tao caption tu ngu canh video/campaign.
- Cho phep chinh tay caption AI truc tiep trong dashboard.
- Tu dong phan hoi comment Facebook bang AI.
- Tu dong phan hoi inbox Messenger voi conversation memory.
- Handoff sang operator khi AI khong nen tra loi.
- Dashboard van hanh cho task queue, worker heartbeat, system events, health checks.
- Tu don cac worker mat ket noi khoi dashboard theo lich.
- Quan ly runtime config ngay tren dashboard va sinh lai `backend/runtime.env`.

## 4. Nguon noi dung ho tro

### TikTok

- Video don:
  - `https://www.tiktok.com/@creator/video/...`
- Profile:
  - `https://www.tiktok.com/@creator`
- Shortlink:
  - `https://vt.tiktok.com/...`
  - `https://vm.tiktok.com/...`

### YouTube Shorts

- Shorts don:
  - `https://www.youtube.com/shorts/...`
- Shorts feed:
  - `https://www.youtube.com/@creator/shorts`
  - `https://www.youtube.com/channel/.../shorts`
  - `https://www.youtube.com/user/.../shorts`
  - `https://www.youtube.com/c/.../shorts`

### Chua ho tro tot

- `https://www.youtube.com/watch?v=...`
- `https://youtu.be/...`
- Playlist YouTube thuong khong phai Shorts feed

## 5. Kien truc he thong

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

Nguyen tac van hanh:

- `backend` xu ly API, auth, webhook, serialize du lieu va quan tri he thong.
- `worker` xu ly job nen: sync campaign, tao caption, tra loi AI, auto-post, scheduler.
- `db` luu toan bo campaign, video, queue, user, log, conversation, runtime settings.
- `frontend` la dashboard van hanh production.

## 6. Thanh phan trong Docker Compose

Theo [docker-compose.yml](./docker-compose.yml):

- `db`
  - PostgreSQL 15
  - cong host: `5432`
- `backend`
  - FastAPI API
  - cong host: `8000`
- `worker`
  - tien trinh nen rieng
  - khong public port
- `frontend`
  - Nginx serve React build
  - cong host: `5173`
- `tunnel`
  - Cloudflare Tunnel
  - tuy chon

Dia chi mac dinh:

- Dashboard: `http://localhost:5173`
- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- Health nhanh: `http://localhost:8000/health`

## 7. Cau truc thu muc

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

## 8. Thanh phan backend quan trong

### API modules

- `backend/app/api/auth.py`
  - dang nhap, phien, doi mat khau
- `backend/app/api/users.py`
  - quan ly user
- `backend/app/api/campaigns.py`
  - campaign, video queue, caption, lich dang
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
  - chuan hoa loai nguon dau vao
- `backend/app/services/campaign_jobs.py`
  - logic sync campaign, lich video
- `backend/app/services/ai_generator.py`
  - caption AI, reply AI
- `backend/app/services/task_queue.py`
  - queue, retry, stale recovery
- `backend/app/services/observability.py`
  - system event, worker heartbeat, cleanup stale workers

### Worker

- `backend/app/worker/run.py`
  - tien trinh worker chinh
- `backend/app/worker/cron.py`
  - scheduler jobs
- `backend/app/worker/tasks.py`
  - xu ly task queue
- `backend/app/worker/healthcheck.py`
  - healthcheck cho container worker

## 9. Thanh phan frontend quan trong

- `frontend/src/App.jsx`
  - state lon nhat cua dashboard, request API, dieu phoi section
- `frontend/src/components/dashboard/CampaignSection.jsx`
  - quan tri campaign
- `frontend/src/components/dashboard/QueueSection.jsx`
  - hang cho video va caption
- `frontend/src/components/dashboard/MessagesSection.jsx`
  - workspace inbox AI / operator
- `frontend/src/components/dashboard/SecuritySection.jsx`
  - mat khau, user, reset password
- `frontend/src/components/dashboard/OperationsSection.jsx`
  - worker, queue, events, health

## 10. Chay nhanh bang Docker

Yeu cau:

- Docker Desktop
- Docker Compose

Chay stack chinh:

```bash
docker compose up -d --build db backend worker frontend
```

Neu muon chay them Cloudflare Tunnel:

```bash
docker compose up -d --build db backend worker frontend tunnel
```

Xem log:

```bash
docker compose logs -f backend worker frontend
```

Dung stack:

```bash
docker compose down
```

## 11. Tai khoan mac dinh

Sau khi khoi dong lan dau:

- username: `admin`
- password: `admin123`

Viec nen lam ngay:

- dang nhap dashboard
- doi mat khau admin
- kiem tra `Bao mat`
- cau hinh runtime can thiet

## 12. Runtime config va bien moi truong

### File env mau

- [`.env.example`](./.env.example)
- [`backend/runtime.env.example`](./backend/runtime.env.example)

### Runtime config co the quan ly tren dashboard

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

Dashboard luu gia tri vao database va sinh lai file:

- [`backend/runtime.env`](./backend/runtime.env)

### Bien nen giu o tang trien khai

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

## 13. Thiet lap lan dau sau khi chay stack

### Buoc 1: mo dashboard

- `http://localhost:5173`

### Buoc 2: dang nhap admin

- dung tai khoan mac dinh

### Buoc 3: doi mat khau admin

- vao khu `Bao mat`
- doi ngay mat khau mac dinh

### Buoc 4: cau hinh runtime

Toi thieu nen dien:

- `BASE_URL`
- `FB_VERIFY_TOKEN`
- `FB_APP_SECRET`
- it nhat mot AI key: `GEMINI_API_KEY` hoac `OPENAI_API_KEY`

### Buoc 5: ket noi fanpage

He thong ho tro hai cach:

- import nhieu page bang `User Access Token`
- them thu cong tung page bang `Page Access Token`

### Buoc 6: validate fanpage

Sau khi them page, nen:

- kiem tra token page
- subscribe page vao app
- kiem tra webhook nhan `feed` va `messages`

### Buoc 7: tao campaign dau tien

- dan link nguon
- chon fanpage dich
- chon khoang cach dang
- nhap gio bat dau neu muon co dinh
- tao campaign
- sync campaign

## 14. Luong tao campaign va dang video

Luong co ban:

1. Nguoi dung tao campaign voi URL nguon.
2. Backend chuan hoa loai nguon.
3. Worker sync campaign va lay metadata video tu `yt-dlp`.
4. Moi video duoc luu thanh ban ghi `Video`.
5. He thong xep `publish_time` theo `schedule_interval`.
6. Neu campaign co `schedule_start_at`, video chua dang se bam dung moc do.
7. Worker chuan bi video dau tien va doi sang `ready`.
8. Den gio, worker tu dang video len Facebook.
9. Sau khi dang xong, worker chuan bi video tiep theo.

Diem quan trong hien tai:

- Khi sua hoac luu lai lich bat dau campaign, he thong uu tien dung gio nguoi dung nhap.
- Worker co the tu chuan bi video `pending` dau tien khi den lich.
- Worker stale tu duoc don khoi dashboard ma khong can bam nut thu cong.

## 15. Quan ly lich dang

Trong dashboard:

- co the chinh `Ngay gio bat dau moi`
- co the khoi phuc ve moc hien co
- co the bo trong de quay ve mode khong co dinh gio bat dau

Hanh vi hien tai:

- Neu co `schedule_start_at`, campaign se bam moc do.
- Neu khong co `schedule_start_at`, he thong xep theo hang cho fanpage.
- Chinh lich chi ap dung cho cac video chua dang cua campaign.

## 16. Caption AI

Caption AI hien co hai che do chinh:

### Video co caption goc

- AI giu sat y caption goc
- chi rewrite nhe cho muot hon, co hook hon, hut xem hon
- khong doi sang chu de khac
- han che bia them fact khong co trong caption nguon

### Video khong co caption goc

- AI tu tao caption tu ngu canh video
- dung thong tin nhu:
  - ten campaign
  - platform
  - source kind
  - fanpage dich
  - original id
- muc tieu la tao caption hop kieu video ngan, tu nhien, co hook va CTA

### Caption AI trong he thong

- worker co the tu generate truoc khi dang
- nguoi dung co the bam generate lai tung video
- nguoi dung co the sua tay caption AI trong queue

## 17. Comment AI va Inbox AI

### Comment AI

Luong:

1. Facebook gui webhook comment.
2. Backend xac thuc request.
3. He thong luu `InteractionLog`.
4. Neu page bat auto-reply comment, backend day task vao queue.
5. Worker goi AI va reply qua Facebook Graph API.

### Inbox AI

Luong:

1. Facebook gui webhook message.
2. Backend luu `InboxMessageLog`.
3. He thong dung `InboxConversation`.
4. Neu hoi thoai duoc phep AI xu ly, backend tao task reply.
5. Worker tao phan hoi co ngu canh tu:
   - conversation summary
   - recent turns
   - customer facts
   - page prompt / knowledge
6. Neu AI yeu cau handoff, conversation chuyen sang `operator_active`.

## 18. Workspace cho operator

Phan `Tin nhan AI` tren dashboard ho tro:

- xem danh sach conversation
- loc theo trang thai
- xem timeline chat
- xem summary / intent / facts
- gan nguoi xu ly
- ghi chu noi bo
- tra loi thu cong ngay tren UI
- chuyen conversation sang `resolved`

Trang thai chinh:

- `ai_active`
- `operator_active`
- `resolved`

## 19. Fanpage va token

He thong hien ho tro mo hinh:

- mot app Meta
- nhieu fanpage
- moi fanpage co cau hinh automation rieng

Loai token:

- `User Access Token`
  - dung de discover/import nhieu page
  - refresh page token hang loat
- `Page Access Token`
  - dung de post video, comment, inbox, subscribe page

## 20. Worker, task queue va health

### Queue

Task nen duoc luu trong bang `task_queue`.

Trang thai:

- `queued`
- `processing`
- `completed`
- `failed`

### Worker heartbeat

Worker cap nhat heartbeat dinh ky vao bang `worker_heartbeats`.

Thong tin luu:

- `worker_name`
- `app_role`
- `status`
- `current_task_id`
- `current_task_type`
- `last_seen_at`

### Tu don worker mat ket noi

Hien tai:

- API van co nut don tay: `POST /system/workers/cleanup`
- ngoai ra scheduler da tu don stale worker theo chu ky
- worker stale se tu bien mat khoi dashboard sau khi qua han heartbeat

## 21. API chinh

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

### Webhooks va inbox workspace

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

Chi tiet schema xem tai:

- `http://localhost:8000/docs`

## 22. Chay local khong dung Docker

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

## 23. Build va kiem tra chat luong

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

## 24. Van hanh production nho voi Docker

Theo file compose hien tai:

- service deu co `restart: unless-stopped`
- co `healthcheck`
- co `init: true`
- co log rotation
- frontend chay Nginx production thay vi Vite dev server
- worker chay lenh:

```bash
alembic upgrade head && python -m app.worker.run
```

Khuyen nghi khi deploy:

- dat `JWT_SECRET` that
- dat `TOKEN_ENCRYPTION_SECRET` that
- dung domain HTTPS that cho `BASE_URL`
- theo doi `/system/health`
- theo doi log `backend` va `worker`

## 25. FAQ

### Clone moi nhung chua co `backend/runtime.env` thi sao?

Compose da fallback sang `backend/runtime.env.example`, nen stack van co the len duoc.

### Co bat buoc dung Cloudflare Tunnel khong?

Khong. Neu ban co san domain HTTPS va reverse proxy thi chi can `BASE_URL` public dung la duoc.

### Vi sao video khong dang dung gio?

Cac nguyen nhan thuong gap:

- worker chua chay
- video dau tien con `pending` nhung worker cu chua chuan bi
- fanpage/token loi
- truoc day campaign bi lech lich cu, can luu lai moc bat dau sau khi update code

### Vi sao comment hoac inbox khong vao he thong?

- `BASE_URL` chua public dung
- `FB_VERIFY_TOKEN` sai
- `FB_APP_SECRET` sai hoac thieu
- page chua subscribe vao app
- token page het han hoac sai loai

### Vi sao AI khong tra loi inbox?

- page chua bat message automation
- conversation dang `operator_active`
- worker khong online
- chua cau hinh AI key

### Vi sao generate caption truoc day bao loi khi video khong co caption goc?

Hien tai hanh vi nay da duoc mo lai. He thong se dung ngu canh video de tao caption moi thay vi chan.

## 26. Goi y quy trinh van hanh thuc te

Mot flow gon de dung hang ngay:

1. Kiem tra `Tong quan` va `Van hanh`.
2. Kiem tra worker online va queue khong bi fail nhieu.
3. Sync campaign moi hoac dong bo lai campaign cu.
4. Ra `Lich dang`, chinh caption AI neu can.
5. Theo doi `Tin nhan AI` de xu ly hoi thoai can operator.
6. Kiem tra `Bao mat` va user neu co nhan su moi.

## 27. Ghi chu cuoi

Repo nay dang di theo huong "tool van hanh thuc chien", nen nhieu hanh vi duoc toi uu truc tiep cho dashboard va workflow noi bo:

- uu tien van hanh bang UI
- worker tach rieng khoi API
- runtime config co the doi ngay trong dashboard
- queue va worker co quan sat trang thai ro rang

Neu can mo rong tiep, cac huong hop ly nhat la:

- them nhieu style caption theo loai noi dung
- them batch actions cho queue
- them analytics theo campaign/page
- them retry policy tinh hon cho Graph API va AI provider
