// Shared by the browser, upload endpoint, and image-processing worker.
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_UPLOAD_BODY_BYTES = MAX_PHOTO_BYTES + 1024 * 1024;
