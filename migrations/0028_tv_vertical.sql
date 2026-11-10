-- Whether a video is portrait (taller than wide), from YouTube's player size, so the horizontal
-- channel never plays a vertical video.
ALTER TABLE tv_items ADD COLUMN vertical INTEGER NOT NULL DEFAULT 0;
