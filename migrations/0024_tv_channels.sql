-- Rashtrix TV: whole YouTube channels as sources. A channel added to the vertical channel feeds
-- its Shorts, and one added to the horizontal channel feeds its long videos (both as playlists).
-- A channel added as a live source follows whatever that channel is broadcasting: the video id of
-- its current live is kept here, and is empty while the channel is not live.
ALTER TABLE tv_sources ADD COLUMN live_video TEXT NOT NULL DEFAULT '';
