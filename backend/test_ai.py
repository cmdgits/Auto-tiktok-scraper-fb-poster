import sys
import os

# Thư mục làm việc hiện tại sẽ là thư mục gốc của backend bên trong Docker (/app)
sys.path.insert(0, '.')

from app.core.config import settings
from app.services.runtime_settings import resolve_runtime_value
from app.services.ai_generator import generate_caption

db_key = resolve_runtime_value("GEMINI_API_KEY")
print(f"Trạng thái nạp khóa API (từ settings.env): {'THÀNH CÔNG' if settings.GEMINI_API_KEY else 'THẤT BẠI'}")
print(f"Trạng thái nạp khóa API (từ database): {'THÀNH CÔNG' if db_key else 'THẤT BẠI'}")

try:
    print("----- GỬI YÊU CẦU LÊN GEMINI -----")
    result = generate_caption("Hôm nay view triệu đô xịn quá nha anh em ơiii! nhớ ghé thử quán Chill nha! #tiktok #xuhuong #fyp #douyin #foryou")
    print("----- KẾT QUẢ TỪ AI -----")
    print(result)
    print("-------------------------")
except Exception as e:
    print(f"Đã xảy ra lỗi: {e}")
