import { uploadProgressLabel } from "../lib/imageUpload";

export function UploadProgress({ state, onCancel, onRetry, compact = false }) {
  if (!state) return null;
  const failed = state.status === "error";
  const cancelled = state.status === "cancelled";
  return (
    <div className={`upload-progress ${compact ? "is-compact" : ""}`} role={failed ? "alert" : "status"}>
      <div>
        <strong>{failed ? "上传失败" : cancelled ? "上传已取消" : uploadProgressLabel(state)}</strong>
        {state.fileName ? <span title={state.fileName}>{state.fileName}</span> : null}
      </div>
      {!failed && !cancelled ? <progress max="100" value={Number.isInteger(state.percent) ? state.percent : undefined} /> : null}
      <div>
        {state.status === "uploading" || state.status === "optimizing" ? <button type="button" className="text-button" onClick={onCancel}>取消上传</button> : null}
        {(failed || cancelled) && onRetry ? <button type="button" className="text-button" onClick={onRetry}>重试</button> : null}
      </div>
    </div>
  );
}
