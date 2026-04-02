import os
import socket
import traceback
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.time import utc_now
from app.models.models import Campaign, CampaignStatus, FacebookPage, Video, VideoStatus
from app.services.ai_generator import generate_caption
from app.services.fb_graph import create_post_comment, upload_video_to_facebook
from app.services.google_sheet_products import build_product_comment_messages, select_random_products_from_google_sheet
from app.services.observability import record_event, update_worker_heartbeat
from app.services.security import decrypt_secret
from app.worker.tasks import process_task_queue

scheduler = BackgroundScheduler()
WORKER_NAME = f"{settings.APP_ROLE}@{socket.gethostname()}"


def auto_post_job():
    db: Session = SessionLocal()
    update_worker_heartbeat(WORKER_NAME, app_role=settings.APP_ROLE, status="quét lịch đăng", db=db)
    try:
        now = utc_now()
        pages = db.query(FacebookPage).all()

        for page in pages:
            vid = (
                db.query(Video)
                .join(Campaign)
                .filter(
                    Campaign.target_page_id == page.page_id,
                    Campaign.status == CampaignStatus.active,
                    Campaign.auto_post.is_(True),
                    Video.status == VideoStatus.ready,
                    Video.publish_time <= now,
                )
                .order_by(Video.publish_time.asc())
                .first()
            )

            if not vid:
                continue



            update_worker_heartbeat(
                WORKER_NAME,
                app_role=settings.APP_ROLE,
                status="đang đăng video",
                current_task_type="auto_post",
                current_task_id=str(vid.id),
                details={"page_id": page.page_id, "video_id": str(vid.id)},
                db=db,
            )

            try:
                access_token = decrypt_secret(page.long_lived_access_token)
            except ValueError as exc:
                vid.status = VideoStatus.failed
                vid.last_error = str(exc)
                vid.retry_count = (vid.retry_count or 0) + 1
                db.commit()
                continue

            if not access_token:
                vid.status = VideoStatus.failed
                vid.last_error = "Trang Facebook chưa có mã truy cập hợp lệ."
                vid.retry_count = (vid.retry_count or 0) + 1
                db.commit()
                continue

            if not vid.ai_caption:
                try:
                    vid.ai_caption = generate_caption(vid.original_caption)
                    db.commit()
                except Exception as exc:
                    vid.status = VideoStatus.failed
                    vid.last_error = f"Không thể tạo chú thích AI: {exc}"
                    vid.retry_count = (vid.retry_count or 0) + 1
                    db.commit()
                    record_event(
                        "video",
                        "error",
                        "Tạo chú thích AI trước khi đăng thất bại.",
                        db=db,
                        details={"video_id": str(vid.id), "page_id": page.page_id, "error": str(exc)},
                    )
                    continue

            caption_to_publish = vid.ai_caption
            product_selection = None
            if vid.campaign and vid.campaign.product_sheet_url:
                try:
                    product_selection = select_random_products_from_google_sheet(vid.campaign.product_sheet_url)
                    record_event(
                        "campaign",
                        "info",
                        "Đã lấy sản phẩm từ Google Sheet để chuẩn bị bình luận dưới video.",
                        db=db,
                        details={
                            "campaign_id": str(vid.campaign_id),
                            "video_id": str(vid.id),
                            "selected_products": len(product_selection.items),
                            "sheet_title": product_selection.sheet_title,
                        },
                    )
                except Exception as exc:
                    vid.status = VideoStatus.failed
                    vid.last_error = f"Không thể lấy sản phẩm từ Google Sheet: {exc}"
                    vid.retry_count = (vid.retry_count or 0) + 1
                    db.commit()
                    record_event(
                        "campaign",
                        "error",
                        "Lấy sản phẩm từ Google Sheet thất bại trước khi đăng video.",
                        db=db,
                        details={"campaign_id": str(vid.campaign_id), "video_id": str(vid.id), "error": str(exc)},
                    )
                    continue

            res = upload_video_to_facebook(
                file_path=vid.file_path,
                caption=caption_to_publish,
                page_id=page.page_id,
                access_token=access_token,
            )

            if "id" in res:
                vid.fb_post_id = res["id"]
                vid.status = VideoStatus.posted
                vid.last_error = None
                if product_selection:
                    failed_comment_count = 0
                    for comment_index, comment_message in enumerate(build_product_comment_messages(product_selection.items), start=1):
                        comment_result = create_post_comment(vid.fb_post_id, comment_message, access_token)
                        if "id" in comment_result:
                            record_event(
                                "campaign",
                                "info",
                                "Đã đăng bình luận sản phẩm dưới video.",
                                db=db,
                                details={
                                    "campaign_id": str(vid.campaign_id),
                                    "video_id": str(vid.id),
                                    "fb_post_id": vid.fb_post_id,
                                    "comment_index": comment_index,
                                    "facebook_comment_id": comment_result.get("id"),
                                },
                            )
                        else:
                            failed_comment_count += 1
                            error_message = str(comment_result.get("error", comment_result))
                            record_event(
                                "campaign",
                                "warning",
                                "Đăng bình luận sản phẩm dưới video thất bại.",
                                db=db,
                                details={
                                    "campaign_id": str(vid.campaign_id),
                                    "video_id": str(vid.id),
                                    "fb_post_id": vid.fb_post_id,
                                    "comment_index": comment_index,
                                    "error": error_message,
                                },
                            )
                    if failed_comment_count:
                        vid.last_error = f"Đã đăng video nhưng có {failed_comment_count} bình luận sản phẩm thất bại."
                record_event(
                    "video",
                    "info",
                    "Đã đăng video thành công.",
                    db=db,
                    details={"video_id": str(vid.id), "page_id": page.page_id, "fb_post_id": vid.fb_post_id},
                )
                if vid.file_path and os.path.exists(vid.file_path):
                    try:
                        os.remove(vid.file_path)
                    except Exception as exc:
                        record_event(
                            "video",
                            "warning",
                            "Không thể xóa tệp tạm sau khi đăng.",
                            db=db,
                            details={"video_id": str(vid.id), "file_path": vid.file_path, "error": str(exc)},
                        )

                from app.services.telegram_bot import notify_telegram
                page_name = page.page_name or page.page_id
                camp_name = vid.campaign.name if vid.campaign else "Unknown"
                msg = f"✅ Đã đăng thành công video!\n<b>Fanpage:</b> {page_name}\n<b>Chiến dịch:</b> {camp_name}\n<b>FB Post ID:</b> {vid.fb_post_id}"
                notify_telegram(msg)

                next_vid = (
                    db.query(Video)
                    .filter(
                        Video.campaign_id == vid.campaign_id,
                        Video.status == VideoStatus.pending
                    )
                    .order_by(Video.publish_time.asc())
                    .first()
                )
                if next_vid:
                    from app.services.campaign_jobs import build_download_prefix
                    from app.services.ytdlp_crawler import download_video
                    next_vid.status = VideoStatus.downloading
                    db.commit()
                    
                    try:
                        out_path, _ = download_video(next_vid.source_video_url, build_download_prefix(next_vid.source_platform))
                        if out_path:
                            next_vid.file_path = out_path
                            next_vid.status = VideoStatus.ready
                            db.commit()
                            notify_telegram(f"⬇️ Tải thành công video tiếp theo chờ lịch: <code>{next_vid.original_id}</code>")
                        else:
                            next_vid.status = VideoStatus.failed
                            next_vid.last_error = "Tải video chuẩn bị thất bại."
                            next_vid.retry_count = (next_vid.retry_count or 0) + 1
                            db.commit()
                    except Exception as exc:
                        next_vid.status = VideoStatus.failed
                        next_vid.last_error = f"Lỗi phụ trợ tải video chuẩn bị: {exc}"
                        next_vid.retry_count = (next_vid.retry_count or 0) + 1
                        db.commit()
            else:
                vid.status = VideoStatus.failed
                vid.last_error = str(res.get("error", res))
                vid.retry_count = (vid.retry_count or 0) + 1
                record_event(
                    "video",
                    "error",
                    "Đăng video lên Facebook thất bại.",
                    db=db,
                    details={"video_id": str(vid.id), "page_id": page.page_id, "response": res},
                )

            db.commit()
    except Exception as exc:
        record_event(
            "worker",
            "error",
            "Tác vụ quét lịch đăng gặp lỗi.",
            db=db,
            details={"error": str(exc), "traceback": traceback.format_exc()},
        )
    finally:
        update_worker_heartbeat(WORKER_NAME, app_role=settings.APP_ROLE, status="idle", db=db)
        db.close()


def process_task_queue_job():
    processed = process_task_queue(WORKER_NAME)
    if processed:
        record_event(
            "queue",
            "info",
            "Đã xử lý xong một đợt tác vụ nền.",
            details={"worker_name": WORKER_NAME, "processed": processed},
        )


def heartbeat_job():
    update_worker_heartbeat(WORKER_NAME, app_role=settings.APP_ROLE, status="idle")


def start_scheduler():
    if not scheduler.get_job("auto_post_job"):
        scheduler.add_job(
            auto_post_job,
            "interval",
            id="auto_post_job",
            minutes=settings.SCHEDULER_INTERVAL_MINUTES,
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
    if not scheduler.get_job("process_task_queue_job"):
        scheduler.add_job(
            process_task_queue_job,
            "interval",
            id="process_task_queue_job",
            seconds=settings.TASK_QUEUE_POLL_SECONDS,
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
    if not scheduler.get_job("heartbeat_job"):
        scheduler.add_job(
            heartbeat_job,
            "interval",
            id="heartbeat_job",
            seconds=max(10, settings.TASK_QUEUE_POLL_SECONDS),
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
    if not scheduler.running:
        scheduler.start()
