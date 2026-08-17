from io import BytesIO
from pathlib import Path, PurePosixPath
from botocore.config import Config

from flask import current_app


class LocalPrivateStorage:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key):
        path = (self.root / PurePosixPath(key)).resolve()
        if path != self.root and self.root not in path.parents:
            raise ValueError("invalid storage key")
        return path

    def put(self, key, content, content_type=None):
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def read(self, key):
        return self._path(key).read_bytes()

    def exists(self, key):
        return self._path(key).is_file()

    def delete(self, key):
        path = self._path(key)
        if path.is_file():
            path.unlink()
            return True
        return False


class S3PrivateStorage:
    def __init__(self, app):
        try:
            import boto3
        except ImportError as exc:
            raise RuntimeError("boto3 is required for MEDIA_STORAGE_BACKEND=s3") from exc
        self.bucket = app.config["S3_BUCKET"]
        self.prefix = app.config.get("S3_PREFIX", "yingmo-media").strip("/")
        self.client = boto3.client(
            "s3",
            endpoint_url=app.config.get("S3_ENDPOINT_URL") or None,
            region_name=app.config.get("S3_REGION") or None,
            aws_access_key_id=app.config.get("S3_ACCESS_KEY_ID") or None,
            aws_secret_access_key=app.config.get("S3_SECRET_ACCESS_KEY") or None,
            config=Config(
                s3={
                    "addressing_style": "virtual",
                }
            ),
        )

    def _key(self, key):
        normalized = str(PurePosixPath(key))
        if normalized.startswith("../") or normalized.startswith("/"):
            raise ValueError("invalid storage key")
        return f"{self.prefix}/{normalized}" if self.prefix else normalized

    def put(self, key, content, content_type=None):
        kwargs={"Bucket":self.bucket,"Key":self._key(key),"Body":content}
        if content_type: kwargs["ContentType"]=content_type
        self.client.put_object(**kwargs)

    def read(self, key):
        return self.client.get_object(Bucket=self.bucket,Key=self._key(key))["Body"].read()

    def exists(self, key):
        from botocore.exceptions import ClientError
        try:
            self.client.head_object(Bucket=self.bucket,Key=self._key(key)); return True
        except ClientError as error:
            if error.response.get("ResponseMetadata",{}).get("HTTPStatusCode")==404: return False
            raise

    def delete(self, key):
        self.client.delete_object(Bucket=self.bucket,Key=self._key(key)); return True


def init_storage(app):
    backend=app.config.get("MEDIA_STORAGE_BACKEND","local")
    if backend=="local":
        storage=LocalPrivateStorage(app.config["UPLOAD_ROOT"])
    elif backend=="s3":
        storage=S3PrivateStorage(app)
    else:
        raise RuntimeError("MEDIA_STORAGE_BACKEND must be local or s3")
    app.extensions["media_storage"]=storage


def get_storage():
    return current_app.extensions["media_storage"]
