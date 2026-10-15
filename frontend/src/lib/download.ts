export const getDownloadName = (contentDisposition: string | null, fallback: string): string => {
  if (!contentDisposition) return fallback;
  const match = /filename\*=(?:UTF-8''|)([^;]+)|filename="?([^";]+)"?/i.exec(
    contentDisposition,
  );
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return fallback;
  const cleaned = raw.trim().replace(/^UTF-8''/i, "").replace(/^"+|"+$/g, "");
  try {
    return decodeURIComponent(cleaned);
  } catch {
    return cleaned;
  }
};

export const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
