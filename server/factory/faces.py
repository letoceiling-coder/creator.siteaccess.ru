"""Проверка лиц на изображениях (YuNet, OpenCV). Запускается в Python контейнера ComfyUI.

    python faces.py <каталог с изображениями> [сколько лиц нужно, по умолчанию 1] [каталог референсов]

Печатает JSON: для каждого файла — найдено ли лицо целиком (голова не обрезана краем кадра,
все пять опорных точек внутри, лицо не крошечное). Если передан каталог референсов (фото
пользователя), добавляется similarity — сходство лиц по SFace (косинус, 0..1): для каждого
референса берётся самое похожее лицо в кадре, итог — худший из референсов (для пары важны оба).
"""
import base64
import json
import os
import sys

import cv2

MODEL = os.environ.get(
    'YUNET_MODEL', '/data/ComfyUI/models/detection/face_detection_yunet_2023mar.onnx'
)
SFACE = os.environ.get(
    'SFACE_MODEL', '/data/ComfyUI/models/detection/face_recognition_sface_2021dec.onnx'
)


def judge(face, w, h):
    x, y, fw, fh = (float(v) for v in face[:4])
    points = [(float(face[4 + i * 2]), float(face[5 + i * 2])) for i in range(5)]
    score = float(face[14])
    # Голова выше рамки лица: нужен запас сверху примерно в треть высоты лица.
    headroom = y - fh * 0.35
    inside = x >= 0 and x + fw <= w and y + fh <= h and headroom >= 0
    points_inside = all(0 <= px < w and 0 <= py < h for px, py in points)
    big_enough = fh >= max(24, h * 0.035)
    ok = inside and points_inside and big_enough and score >= 0.7
    reason = (
        'ok'
        if ok
        else 'cropped'
        if not (inside and points_inside)
        else 'too_small'
        if not big_enough
        else 'low_score'
    )
    return ok, reason, score, fh / h


def detect(image, detector):
    h, w = image.shape[:2]
    detector.setInputSize((w, h))
    _, faces = detector.detect(image)
    return [] if faces is None else list(faces)


def features(image, faces, recognizer):
    return [recognizer.feature(recognizer.alignCrop(image, f)) for f in faces]


def reference_features(folder, detector, recognizer):
    """Одно (самое крупное) лицо с каждого фото пользователя."""
    refs = []
    for name in sorted(os.listdir(folder)):
        image = cv2.imread(os.path.join(folder, name))
        if image is None:
            continue
        faces = detect(image, detector)
        if not faces:
            continue
        main = max(faces, key=lambda f: f[2] * f[3])
        refs.append(recognizer.feature(recognizer.alignCrop(image, main)))
    return refs


def check(path, detector, need, recognizer=None, refs=None):
    image = cv2.imread(path)
    if image is None:
        return {'file': os.path.basename(path), 'ok': False, 'reason': 'unreadable'}
    h, w = image.shape[:2]
    detector.setInputSize((w, h))
    _, faces = detector.detect(image)
    if faces is None or len(faces) == 0:
        return {'file': os.path.basename(path), 'ok': False, 'reason': 'no_face', 'faces': 0, 'ok_faces': 0}
    judged = [judge(f, w, h) for f in faces]
    ok_faces = sum(1 for j in judged if j[0])
    # Причина — по самому крупному лицу, если подходящих лиц не хватает.
    main = max(range(len(faces)), key=lambda i: faces[i][2] * faces[i][3])
    _, reason, score, height = judged[main]
    ok = ok_faces >= need
    extra = {}
    if recognizer is not None and refs:
        feats = features(image, faces, recognizer)
        per_ref = [
            max(
                recognizer.match(r, f, cv2.FaceRecognizerSF_FR_COSINE) for f in feats
            )
            for r in refs
        ]
        extra['similarity'] = round(float(min(per_ref)), 3)
    return {
        **extra,
        'file': os.path.basename(path),
        'ok': ok,
        'reason': 'ok' if ok else (reason if reason != 'ok' else 'not_enough_faces'),
        'faces': int(len(faces)),
        'ok_faces': ok_faces,
        'score': round(score, 3),
        'face_height': round(height, 3),
    }


def crop_face(src, size=1024):
    """Крупный план лица с волосами (квадрат ~2.2 высоты лица) — отдельный референс для модели."""
    image = cv2.imread(src)
    if image is None:
        return False
    detector = cv2.FaceDetectorYN.create(MODEL, '', (320, 320), 0.7, 0.3, 50)
    faces = detect(image, detector)
    if len(faces) == 0:
        return False
    x, y, fw, fh = (float(v) for v in max(faces, key=lambda f: f[2] * f[3])[:4])
    h, w = image.shape[:2]
    side = min(max(fw, fh) * 2.2, w, h)
    cx, cy = x + fw / 2, y + fh / 2 - fh * 0.12
    left = int(min(max(cx - side / 2, 0), w - side))
    top = int(min(max(cy - side / 2, 0), h - side))
    face = image[top : top + int(side), left : left + int(side)]
    ok, png = cv2.imencode('.png', cv2.resize(face, (size, size), interpolation=cv2.INTER_LANCZOS4))
    # Каталог проверки принадлежит root, контейнер в него не пишет: картинка уходит через stdout.
    return base64.b64encode(png.tobytes()).decode() if ok else False


def main():
    if sys.argv[1] == '--crop':
        png = crop_face(sys.argv[2])
        print(json.dumps({'ok': bool(png), 'png': png or ''}))
        return
    folder = sys.argv[1]
    need = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    ref_dir = sys.argv[3] if len(sys.argv) > 3 else ''
    detector = cv2.FaceDetectorYN.create(MODEL, '', (320, 320), 0.7, 0.3, 50)
    recognizer = refs = None
    if ref_dir and os.path.exists(SFACE):
        recognizer = cv2.FaceRecognizerSF.create(SFACE, '')
        refs = reference_features(ref_dir, detector, recognizer)
    files = sorted(
        f for f in os.listdir(folder) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))
    )
    print(
        json.dumps(
            [check(os.path.join(folder, f), detector, need, recognizer, refs) for f in files]
        )
    )


if __name__ == '__main__':
    main()
