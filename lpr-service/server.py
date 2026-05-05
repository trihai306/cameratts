"""
Vietnamese License Plate Recognition Service v2.0
Uses YOLOv8 for plate detection + PaddleOCR for Vietnamese text recognition.
Optimized for all Vietnamese plate formats: personal, commercial, government, military.
Supports both one-line (car) and two-line (motorcycle) plates.
Runs as a local FastAPI microservice spawned by Electron.
"""

import os
import sys

# Set cache directory BEFORE importing anything that downloads models
_script_dir = os.path.dirname(os.path.abspath(__file__))
_cache_dir = os.path.join(_script_dir, 'models')
os.makedirs(_cache_dir, exist_ok=True)
os.environ['XDG_CACHE_HOME'] = _cache_dir

# Disable CoreML/MPS (causes sandbox issues on macOS Electron)
os.environ['ORT_NO_COREML'] = '1'
os.environ['FLAGS_use_mps'] = '0'
os.environ['CUDA_VISIBLE_DEVICES'] = ''

import asyncio
import base64
import io
import logging
import time
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

from vn_plate_validator import format_plate, parse_vietnamese_plate, get_province_name

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [LPR] %(message)s')
logger = logging.getLogger(__name__)

# Global model instances
plate_detector = None
ocr_engine = None


# ============================================================
# Model Loading
# ============================================================

def load_plate_detector():
    """Load license plate detection model (open-image-models YOLOv9-t, trained for plates)."""
    global plate_detector
    if plate_detector is not None:
        return plate_detector

    logger.info("Loading plate detection model...")
    try:
        import pathlib
        import onnxruntime as ort

        # Force CPU-only to avoid CoreML dynamic shape errors on macOS
        _OriginalSession = ort.InferenceSession
        def _cpu_only_session(*args, **kwargs):
            kwargs['providers'] = ['CPUExecutionProvider']
            return _OriginalSession(*args, **kwargs)
        ort.InferenceSession = _cpu_only_session
        logger.info("Forced CPUExecutionProvider (CoreML disabled)")

        from open_image_models import LicensePlateDetector
        import open_image_models.detection.core.hub as hub_module

        # Use local cache directory
        hub_module.MODEL_CACHE_DIR = pathlib.Path(_cache_dir) / "open-image-models"

        plate_detector = LicensePlateDetector(
            detection_model="yolo-v9-s-608-license-plate-end2end"
        )
        logger.info("Loaded YOLOv9-s-608 plate detector (license plate specialized, high accuracy)")
        return plate_detector

    except Exception as e:
        logger.error(f"Failed to load plate detector: {e}")
        raise


def load_ocr_engine():
    """Load PaddleOCR with Vietnamese language support."""
    global ocr_engine
    if ocr_engine is not None:
        return ocr_engine

    logger.info("Loading PaddleOCR (Vietnamese)...")
    try:
        from paddleocr import PaddleOCR

        ocr_engine = PaddleOCR(
            lang='vi',
            use_doc_orientation_classify=False,   # Skip doc orientation (not needed for plates)
            use_doc_unwarping=False,              # Skip doc unwarping (not needed for plates)
            use_textline_orientation=False,        # Skip textline orientation
            text_detection_model_name='PP-OCRv5_server_det',   # Server model: highest accuracy
            text_recognition_model_name='PP-OCRv5_server_rec', # Server model: highest accuracy
            text_det_thresh=0.3,
            text_det_box_thresh=0.5,
            text_recognition_batch_size=6,
            text_det_unclip_ratio=1.5,
        )
        logger.info("PaddleOCR (Vietnamese) loaded successfully!")
        return ocr_engine

    except Exception as e:
        logger.error(f"Failed to load PaddleOCR: {e}")
        raise


# ============================================================
# Lifespan (replaces deprecated @app.on_event)
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load models on startup."""
    logger.info("LPR Service v2.0 starting (Vietnamese plate optimized)...")
    try:
        load_plate_detector()
        load_ocr_engine()
        logger.info("All models loaded successfully!")
    except Exception:
        logger.warning("Models will be loaded on first request")
    yield
    logger.info("LPR Service shutting down...")


app = FastAPI(title="TTS Camera LPR Service", version="2.0", lifespan=lifespan)

# Allow CORS - restrict to localhost only
app.add_middleware(
    CORSMiddleware,
    allow_origins=["null", "file://", "http://localhost", "http://127.0.0.1"],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


# ============================================================
# Request/Response Models
# ============================================================

class RecognizeRequest(BaseModel):
    image: str  # base64 encoded image (with or without data URI prefix)
    crop_region: Optional[dict] = None  # Optional { x, y, w, h } to crop before processing


class PlateResult(BaseModel):
    plate: str                          # Formatted plate text
    raw_ocr: str = ""                   # Raw OCR output before validation
    confidence: float                   # Detection confidence (0-100)
    ocr_confidence: float = 0.0         # OCR confidence (0-100)
    validation_score: float = 0.0       # Vietnamese format validation (0-1)
    bbox: Optional[list] = None         # [x1, y1, x2, y2]
    province: Optional[str] = None      # Province name
    plate_type: Optional[str] = None    # personal/commercial/government/military


class RecognizeResponse(BaseModel):
    success: bool
    plates: list[PlateResult]
    message: str = ""
    processing_time_ms: float = 0.0


# ============================================================
# Image Processing
# ============================================================

def decode_base64_image(image_data: str) -> np.ndarray:
    """Decode base64 image string to numpy array (RGB)."""
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    img_bytes = base64.b64decode(image_data)
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

    # Client already captures at 640px - only resize if somehow larger
    max_dim = 800
    w, h = img.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    return np.array(img)


def decode_binary_image(img_bytes: bytes) -> np.ndarray:
    """Decode raw binary image bytes (JPEG/PNG) to numpy array (RGB)."""
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

    max_dim = 800
    w, h = img.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    return np.array(img)


def run_recognition_pipeline(img_array: np.ndarray) -> dict:
    """Shared recognition pipeline for both HTTP and WebSocket."""
    start_time = time.time()

    detections = detect_plates_yolo(img_array)

    plates = []
    for det in detections:
        result = process_plate(img_array, det)
        if result:
            plates.append(result)

    plates.sort(key=lambda p: (p.validation_score, p.confidence), reverse=True)

    elapsed_ms = (time.time() - start_time) * 1000

    if plates:
        logger.info(
            f"Detected {len(plates)} plate(s) in {elapsed_ms:.0f}ms: "
            f"{[f'{p.plate} ({p.validation_score:.0%})' for p in plates]}"
        )

    return {
        "success": True,
        "plates": [p.model_dump() for p in plates],
        "message": f"Detected {len(plates)} plate(s)" if plates else "No plates detected",
        "processing_time_ms": round(elapsed_ms, 1),
    }


def crop_plate_region(img: np.ndarray, bbox: list) -> np.ndarray:
    """Crop a plate region from the image with padding."""
    h, w = img.shape[:2]
    x1, y1, x2, y2 = bbox

    # Add moderate padding (8%) - enough to not cut edge characters
    pad_x = int((x2 - x1) * 0.08)
    pad_y = int((y2 - y1) * 0.08)

    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(w, x2 + pad_x)
    y2 = min(h, y2 + pad_y)

    return img[y1:y2, x1:x2]


def preprocess_plate_image(plate_img: np.ndarray) -> np.ndarray:
    """Preprocess cropped plate image for better OCR accuracy."""
    import cv2
    from PIL import ImageFilter

    # Step 1: CLAHE adaptive contrast (works better than fixed contrast for varying light)
    lab = cv2.cvtColor(plate_img, cv2.COLOR_RGB2LAB)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 2))
    lab[:, :, 0] = clahe.apply(lab[:, :, 0])
    plate_img = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)

    pil_img = Image.fromarray(plate_img)

    # Step 2: Resize to standard height for OCR (maintain aspect ratio)
    target_h = 160  # Larger for two-line motorcycle plates
    w, h = pil_img.size
    if h > 0:
        scale = target_h / h
        new_w = max(int(w * scale), 1)
        pil_img = pil_img.resize((new_w, target_h), Image.LANCZOS)

    # Step 3: Unsharp mask (stronger than basic sharpen)
    pil_img = pil_img.filter(ImageFilter.UnsharpMask(radius=1, percent=150, threshold=3))

    return np.array(pil_img)


# ============================================================
# Detection + OCR Pipeline
# ============================================================

def detect_plates_yolo(img: np.ndarray) -> list[dict]:
    """Detect license plates using YOLO model."""
    detector = load_plate_detector()

    detections = detector.predict(img)
    plates = []
    for det in detections:
        bb = det.bounding_box
        plates.append({
            'bbox': [int(bb.x1), int(bb.y1), int(bb.x2), int(bb.y2)],
            'confidence': float(det.confidence)
        })
    return plates


def ocr_plate_region(plate_img: np.ndarray) -> list[dict]:
    """Run PaddleOCR on a cropped plate image. Returns list of text lines with confidence."""
    engine = load_ocr_engine()

    # Preprocess for better OCR
    processed = preprocess_plate_image(plate_img)

    # PaddleOCR v3.4+ returns OCRResult objects via .predict()
    results = engine.predict(processed)

    lines = []
    for ocr_result in results:
        d = dict(ocr_result)
        texts = d.get('rec_texts', [])
        scores = d.get('rec_scores', [])
        polys = d.get('dt_polys', [])

        for i, text in enumerate(texts):
            if not text or not text.strip():
                continue

            conf = float(scores[i]) if i < len(scores) else 0.0

            # Skip low-confidence OCR results (likely noise from surrounding area)
            if conf < 0.65:
                continue

            # Get y-coordinate for sorting (top to bottom for two-line plates)
            y_pos = 0
            if i < len(polys) and len(polys[i]) > 0:
                # dt_polys is list of polygon points, take min y
                try:
                    y_pos = float(min(p[1] for p in polys[i]))
                except (IndexError, TypeError):
                    y_pos = 0

            lines.append({
                'text': text.strip(),
                'confidence': conf,
                'y_position': y_pos
            })

    # Sort by y-position (top line first for two-line plates)
    lines.sort(key=lambda x: x['y_position'])
    return lines


def process_plate(img: np.ndarray, detection: dict) -> Optional[PlateResult]:
    """Process a single detected plate: crop, OCR, validate."""
    bbox = detection['bbox']
    det_confidence = detection['confidence']

    # Crop plate region
    plate_img = crop_plate_region(img, bbox)
    if plate_img.size == 0:
        return None

    # Run OCR
    ocr_lines = ocr_plate_region(plate_img)
    if not ocr_lines:
        return None

    # Combine all OCR text
    raw_texts = [line['text'] for line in ocr_lines]
    raw_combined = ' '.join(raw_texts)
    avg_ocr_conf = sum(line['confidence'] for line in ocr_lines) / len(ocr_lines) if ocr_lines else 0

    logger.info("OCR lines: %s", [(l['text'], round(l['confidence'], 2)) for l in ocr_lines])

    # Use Vietnamese plate validator to format and validate
    formatted_plate, validation_score = format_plate(raw_combined, raw_texts)

    if not formatted_plate or len(formatted_plate) < 5:
        return None

    # Filter out low-confidence validations (likely noise/garbage text)
    if validation_score < 0.5:
        logger.info("Low validation score (%.1f) for: %s - skipping", validation_score, formatted_plate)
        return None

    # Get province info from the formatted plate (not raw_combined to avoid mismatch)
    province_name = None
    plate_type = None
    parsed = parse_vietnamese_plate(formatted_plate.replace('-', '').replace('.', ''))
    if parsed:
        if parsed.get('province_code'):
            province_name = get_province_name(parsed['province_code'])
        plate_type = parsed.get('plate_type', 'personal')

    return PlateResult(
        plate=formatted_plate,
        raw_ocr=raw_combined,
        confidence=round(det_confidence * 100, 1),
        ocr_confidence=round(avg_ocr_conf * 100, 1),
        validation_score=validation_score,
        bbox=bbox,
        province=province_name,
        plate_type=plate_type,
    )


# ============================================================
# API Endpoints
# ============================================================

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": "2.0",
        "model_loaded": plate_detector is not None and ocr_engine is not None,
        "detector_loaded": plate_detector is not None,
        "ocr_loaded": ocr_engine is not None,
        "service": "TTS Camera LPR (Vietnamese Optimized)",
    }


@app.post("/recognize", response_model=RecognizeResponse)
async def recognize(req: RecognizeRequest):
    """Recognize Vietnamese license plates from a base64-encoded image (HTTP fallback)."""
    try:
        img_array = decode_base64_image(req.image)

        if req.crop_region:
            cr = req.crop_region
            x = int(cr.get('x', 0))
            y = int(cr.get('y', 0))
            w = int(cr.get('w', img_array.shape[1]))
            h = int(cr.get('h', img_array.shape[0]))
            img_array = img_array[y:y+h, x:x+w]

        result = run_recognition_pipeline(img_array)
        return RecognizeResponse(**result)

    except Exception as e:
        logger.error(f"Recognition error: {e}", exc_info=True)
        return RecognizeResponse(success=False, plates=[], message=str(e))


# ============================================================
# WebSocket Endpoint (low-latency, persistent connection)
# ============================================================

@app.websocket("/ws/recognize")
async def ws_recognize(websocket: WebSocket):
    """
    WebSocket endpoint for real-time plate recognition.
    Accepts binary JPEG frames, returns JSON results.
    Protocol:
      Client sends: binary bytes (JPEG image)
      Server sends: JSON { success, plates[], processing_time_ms }
    """
    await websocket.accept()
    logger.info("[WS] Client connected")

    # Track processing state to implement backpressure
    is_processing = False

    try:
        while True:
            # Receive binary frame
            data = await websocket.receive_bytes()

            # Backpressure: skip frame if still processing previous one
            if is_processing:
                continue

            is_processing = True
            try:
                # Run in thread pool to avoid blocking the event loop
                img_array = decode_binary_image(data)
                result = await asyncio.get_event_loop().run_in_executor(
                    None, run_recognition_pipeline, img_array
                )
                await websocket.send_json(result)
            except Exception as e:
                await websocket.send_json({
                    "success": False, "plates": [],
                    "message": str(e), "processing_time_ms": 0,
                })
            finally:
                is_processing = False

    except WebSocketDisconnect:
        logger.info("[WS] Client disconnected")
    except Exception as e:
        logger.error(f"[WS] Error: {e}")


# ============================================================
# Fallback: Direct OCR without detection (for pre-cropped plate images)
# ============================================================

class DirectOCRRequest(BaseModel):
    image: str  # base64 encoded cropped plate image


@app.post("/ocr-direct")
async def ocr_direct(req: DirectOCRRequest):
    """Run OCR directly on a pre-cropped plate image (no detection step)."""
    try:
        img_array = decode_base64_image(req.image)
        ocr_lines = ocr_plate_region(img_array)

        raw_texts = [line['text'] for line in ocr_lines]
        raw_combined = ' '.join(raw_texts)
        formatted, score = format_plate(raw_combined, raw_texts)

        return {
            "success": True,
            "plate": formatted,
            "raw_ocr": raw_combined,
            "lines": raw_texts,
            "validation_score": score,
        }
    except Exception as e:
        return {"success": False, "plate": "", "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
