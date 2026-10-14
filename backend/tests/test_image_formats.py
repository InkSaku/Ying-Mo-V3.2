from io import BytesIO

from PIL import Image
import pytest

from .conftest import auth, register, token_from


@pytest.mark.parametrize("fmt,filename,mime", [
    ("JPEG", "wechat-photo.JPG", "image/jpeg"),
    ("JPEG", "photo.jfif", "image/jpeg"),
    ("PNG", "photo.png", "image/png"),
    ("WEBP", "photo.webp", "image/webp"),
    ("HEIF", "photo.heif", "image/heic"),
    ("GIF", "photo.gif", "image/gif"),
    ("BMP", "photo.bmp", "image/bmp"),
    ("TIFF", "scan.tif", "image/tiff"),
    ("AVIF", "photo.avif", "image/avif"),
])
def test_upload_decodes_formats_and_preserves_original(client, fmt, filename, mime):
    token = token_from(register(client, "formatsowner"))
    source = BytesIO()
    Image.new("RGB", (96, 128), "#58705a").save(source, fmt)
    raw = source.getvalue()
    response = client.post(
        "/api/v1/uploads/images", headers=auth(token),
        data={"file": (BytesIO(raw), filename, "application/octet-stream")},
    )
    assert response.status_code == 201, response.get_json()
    media = response.get_json()["data"]
    assert media["mime_type"] == mime
    assert (media["width"], media["height"]) == (96, 128)
    displayed = client.get(media["read_path"], headers=auth(token))
    assert displayed.status_code == 200
    assert displayed.mimetype == "image/webp"
    assert Image.open(BytesIO(displayed.data)).size == (96, 128)
    original = client.get(media["original_download_path"], headers=auth(token))
    assert original.status_code == 200
    assert original.mimetype == mime
    assert original.data == raw


@pytest.mark.parametrize("fmt,filename", [("GIF", "animation.gif"), ("TIFF", "pages.tiff")])
def test_multiframe_upload_displays_first_frame_and_keeps_all_original_frames(client, fmt, filename):
    token = token_from(register(client, "framesowner"))
    first = Image.new("RGB", (32, 24), "red")
    second = Image.new("RGB", (32, 24), "blue")
    source = BytesIO()
    first.save(source, fmt, save_all=True, append_images=[second], duration=200)
    raw = source.getvalue()
    response = client.post(
        "/api/v1/uploads/images", headers=auth(token),
        data={"file": (BytesIO(raw), filename)},
    )
    assert response.status_code == 201, response.get_json()
    media = response.get_json()["data"]
    displayed = client.get(media["read_path"], headers=auth(token))
    decoded = Image.open(BytesIO(displayed.data))
    red, _, blue = decoded.convert("RGB").getpixel((10, 10))
    assert red > 200 and blue < 50
    original = client.get(media["original_download_path"], headers=auth(token))
    assert original.data == raw
    assert Image.open(BytesIO(original.data)).n_frames == 2


def test_transparent_gif_derivative_keeps_transparency(client):
    token = token_from(register(client, "transparentowner"))
    source = BytesIO()
    image = Image.new("P", (32, 24), 0)
    image.putpalette([0, 0, 0, 255, 0, 0] + [0] * 762)
    image.putpixel((10, 10), 1)
    image.save(source, "GIF", transparency=0)
    response = client.post(
        "/api/v1/uploads/images", headers=auth(token),
        data={"file": (BytesIO(source.getvalue()), "transparent.gif")},
    )
    assert response.status_code == 201
    displayed = client.get(response.get_json()["data"]["read_path"], headers=auth(token))
    decoded = Image.open(BytesIO(displayed.data)).convert("RGBA")
    assert decoded.getpixel((0, 0))[3] == 0
    assert decoded.getpixel((10, 10))[3] == 255


def test_upload_rejects_non_image_even_with_image_filename_and_mime(client):
    token = token_from(register(client, "invalidowner"))
    response = client.post(
        "/api/v1/uploads/images", headers=auth(token),
        data={"file": (BytesIO(b"not an image"), "photo.jpg", "image/jpeg")},
    )
    assert response.status_code == 422
    assert response.get_json()["error"]["message"] == "文件不是有效图片。"
