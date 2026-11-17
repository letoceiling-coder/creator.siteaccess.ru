"""Проверка лиц на изображениях (YuNet, OpenCV). Запускается в Python контейнера ComfyUI.

    python faces.py <каталог с изображениями>

Печатает JSON: для каждого файла — найдено ли лицо целиком (голова не обрезана краем кадра,
все пять опорных точек внутри, лицо не крошечное).
"""
import json
import os
import sys

import cv2

MODEL = os.environ.get(
    'YUNET_MODEL', '/data/ComfyUI/models/detection/face_detection_yunet_2023mar.onnx'
)


def check(path, detector):
    image = cv2.imread(path)
    if image is None:
        return {'file': os.path.basename(path), 'ok': False, 'reason': 'unreadable'}
    h, w = image.shape[:2]
    detector.setInputSize((w, h))
    _, faces = detector.detect(image)
    if faces is None or len(faces) == 0:
        return {'file': os.path.basename(path), 'ok': False, 'reason': 'no_face', 'faces': 0}
    # Самое крупное лицо — главный герой кадра.
    face = max(faces, key=lambda f: f[2] * f[3])
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
    return {
        'file': os.path.basename(path),
        'ok': ok,
        'reason': reason,
        'faces': int(len(faces)),
        'score': round(score, 3),
        'face_height': round(fh / h, 3),
    }


def main():
    folder = sys.argv[1]
    detector = cv2.FaceDetectorYN.create(MODEL, '', (320, 320), 0.7, 0.3, 50)
    files = sorted(
        f for f in os.listdir(folder) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))
    )
    print(json.dumps([check(os.path.join(folder, f), detector) for f in files]))


if __name__ == '__main__':
    main()
